from datetime import datetime, timedelta, date
import logging
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, status, Query
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from pydantic import ValidationError

from app.core.config import settings
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.dia_cronograma import DiaCronograma
from app.models.destino_viaje import DestinoViaje
from app.models.destino import Destino
from app.schemas.trip import TripCreate, TripRead, InvitationResponse, TripInvitationRead, DestinationRead
from app.services.mail import get_mail_service
from app.services.notifications.invitation_email_sender import (
    InvitationEmailPayload,
    InvitationEmailSender,
)

router = APIRouter()
logger = logging.getLogger(__name__)
GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"

@router.get("/invitations/pending", response_model=None)
def get_pending_invitations(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    
    # Retorna todas las invitaciones a viajes que el usuario autenticado tiene en estado 'invitado'.
    participaciones = db.scalars(
        select(ParticipanteViaje)
        .join(ParticipanteViaje.EstadoParticipacion)
        .where(
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            EstadoParticipacion.Nombre == "invitado"
        )
    ).all()

    return [
        TripInvitationRead(
            tripId=p.Viaje.IdViaje,
            title=p.Viaje.Titulo,
            destination=[
                DestinationRead(
                    id=rel.Destino.IdDestino,
                    name=rel.Destino.Nombre,
                    country=rel.Destino.Pais,
                    lat=rel.Destino.Lat,
                    lng=rel.Destino.Lng
                )
                for rel in p.Viaje.Destinos
            ],
            status=p.EstadoParticipacion.Nombre,
            role=p.RolParticipante.Nombre
        )
        for p in participaciones
    ]

@router.post("/invitations/{trip_id}/respond", status_code=status.HTTP_200_OK)
def respond_to_invitation(
    trip_id: int,
    payload: InvitationResponse,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    #Permite aceptar o rechazar una invitación a un viaje.
    decision = payload.decision 

    participacion = db.scalar(
        select(ParticipanteViaje)
        .where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario
        )
    )

    if not participacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="No se encontró una invitación para este viaje."
        )

    if participacion.EstadoParticipacion.Nombre != "invitado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta invitación ya fue respondida previamente."
        )

    nuevo_estado_nombre = "aceptado" if decision == "aceptar" else "rechazado"
    estado_maestro = db.scalar(
        select(EstadoParticipacion).where(EstadoParticipacion.Nombre == nuevo_estado_nombre)
    )
    
    if not estado_maestro:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Falta el estado maestro requerido para la respuesta"
        )

    ahora = datetime.now()
    participacion.IdEstadoParticipacion = estado_maestro.IdEstadoParticipacion
    participacion.FechaRespuesta = ahora
    
    if decision == "aceptar":
        participacion.FechaIncorporacion = ahora

    db.commit()

    administrador_viaje = participacion.Viaje.Administrador
    if administrador_viaje:
        logger.info(
            f"NOTIFICACIÓN AUTOMÁTICA -> Destinatario: {administrador_viaje.Email} | "
            f"El usuario {current_user.Nombre} {current_user.Apellido} ha "
            f"{decision.upper() + 'ADO'} la invitación al viaje '{participacion.Viaje.Titulo}'."
        )

    return {
        "status": "success",
        "message": f"Invitación {nuevo_estado_nombre} correctamente."
    }

@router.get("/search")
async def search_destinos(q: str = Query(..., min_length=2)):
    params = {
        "q": q,
        "access_token": settings.mapbox_access_token,
        "language": "es",
        "limit": 5,
        "types": "country,region,place"
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(GEOCODE_URL, params=params)
        response.raise_for_status()
        data = response.json() 
        print(f"Respuesta de Mapbox: {data}")  # Para depuración, puedes eliminarlo más tarde

    resultados = []

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])

        resultados.append({
            "name": props.get("name"),
            "country": props.get("context", {}).get("country", {}).get("name"),
            "lat": coords[1] if len(coords) == 2 else None,
            "lng": coords[0] if len(coords) == 2 else None,
        })

    return resultados


@router.get("", response_model=list[TripRead])
def list_trips(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[TripRead]:
    viajes = db.scalars(
        select(Viaje)
        .options(
            selectinload(Viaje.Destinos).selectinload(DestinoViaje.Destino)
        )
        .join(ParticipanteViaje, ParticipanteViaje.IdViaje == Viaje.IdViaje)
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .join(EstadoParticipacion, EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion)
        .where(
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            EstadoViaje.Nombre.in_(["activo", "finalizado"]),
            EstadoParticipacion.Nombre == "aceptado"
        )
        .order_by(Viaje.FechaCreacion.desc())
    ).all()

    hoy = date.today()

    def resolver_estado(viaje: Viaje) -> str:
        if viaje.FechaFin and viaje.FechaFin < hoy:
            return "finalizado"
        return viaje.EstadoViaje.Nombre

    return [
        TripRead(
            id=viaje.IdViaje,
            title=viaje.Titulo,
            destinations=[
                DestinationRead(
                    id=rel.Destino.IdDestino,
                    name=rel.Destino.Nombre,
                    country=rel.Destino.Pais,
                    lat=rel.Destino.Lat,
                    lng=rel.Destino.Lng
                )
                for rel in viaje.Destinos
            ],
            status=resolver_estado(viaje),
            currency=viaje.Moneda,
            startDate=viaje.FechaInicio,
            endDate=viaje.FechaFin,
            # 👇 Inicializamos vacíos para el listado general
            participantUserIds=[],
            participants=[],
            invitedEmails=[]
        )
        for viaje in viajes
    ]

@router.get("/{trip_id}", response_model=TripRead)
def get_trip_detail(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # Buscar el viaje
    viaje = db.scalar(select(Viaje).where(Viaje.IdViaje == trip_id))
    if not viaje:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")
        
    # 1. Obtener participantes con estado 'aceptado' (o todos los activos)
    # Esto depende de cómo tengas declaradas las relaciones en tu modelo Viaje
    participantes_rel = db.scalars(
        select(ParticipanteViaje)
        .where(ParticipanteViaje.IdViaje == trip_id)
    ).all()

    participants_list = []
    participant_ids = []
    for p in participantes_rel:
        # Asegúrate de traer solo los que aceptaron (o el creador que ya está aceptado)
        if p.EstadoParticipacion.Nombre == "aceptado":
            participant_ids.append(p.IdUsuario)
            participants_list.append({
                "id": p.Usuario.IdUsuario,
                "nombreUsuario": p.Usuario.NombreUsuario,
                "nombreCompleto": f"{p.Usuario.Nombre} {p.Usuario.Apellido}",
                "email": p.Usuario.Email,
                "fotoUrl": getattr(p.Usuario, "FotoUrl", "") # Evita romper si no existe
            })

    # 2. Obtener las invitaciones pendientes por Email
    invitaciones_rel = db.scalars(
        select(InvitacionViaje)
        .where(InvitacionViaje.IdViaje == trip_id, InvitacionViaje.EstadoInvitacion.Nombre == "pendiente")
    ).all()
    invited_emails = [i.EmailInvitado for i in invitaciones_rel]

    return TripRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destinations=[
            DestinationRead(
                id=rel.Destino.IdDestino,
                name=rel.Destino.Nombre,
                country=rel.Destino.Pais,
                lat=rel.Destino.Lat,
                lng=rel.Destino.Lng
            )
            for rel in viaje.Destinos
        ],
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
        # 👇 Pasamos los datos al frontend
        participantUserIds=participant_ids,
        participants=participants_list,
        invitedEmails=invited_emails
    )


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripRead:

    administrador = current_user
    admin_user_id = current_user.IdUsuario

    participantes_ids = set(payload.participantUserIds) - {admin_user_id}
    if participantes_ids:
        participantes = db.scalars(
            select(Usuario).where(
                Usuario.IdUsuario.in_(participantes_ids), Usuario.Activo.is_(True)
            )
        ).all()
        if len(participantes) != len(participantes_ids):
            raise HTTPException(
                status_code=400, detail="Hay participantes inexistentes o inactivos"
            )

    emails_invitados = set(payload.invitedEmails)
    if emails_invitados:
        usuarios_existentes = db.scalars(
            select(Usuario).where(Usuario.Email.in_(emails_invitados))
        ).all()
        usuarios_por_email = {u.Email.lower(): u for u in usuarios_existentes}

        usuarios_inactivos = [u.Email for u in usuarios_existentes if not u.Activo]
        if usuarios_inactivos:
            raise HTTPException(
                status_code=400,
                detail="Hay invitaciones dirigidas a usuarios registrados inactivos",
            )

        for email in list(emails_invitados):
            usuario_existente = usuarios_por_email.get(email)
            if usuario_existente is None:
                continue
            if usuario_existente.IdUsuario != admin_user_id:
                participantes_ids.add(usuario_existente.IdUsuario)
            emails_invitados.discard(email)

    if administrador.Email.lower() in emails_invitados:
        emails_invitados.discard(administrador.Email.lower())

    participantes_ids = sorted(participantes_ids)

    estado_activo = db.scalar(
        select(EstadoViaje).where(EstadoViaje.Nombre == "activo", EstadoViaje.Activo.is_(True))
    )
    rol_admin = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "administrador", RolParticipante.Activo.is_(True)
        )
    )
    rol_participante = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "participante", RolParticipante.Activo.is_(True)
        )
    )
    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado", EstadoParticipacion.Activo.is_(True)
        )
    )
    estado_invitado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "invitado", EstadoParticipacion.Activo.is_(True)
        )
    )
    estado_invitacion_pendiente = db.scalar(
        select(EstadoInvitacion).where(
            EstadoInvitacion.Nombre == "pendiente", EstadoInvitacion.Activo.is_(True)
        )
    )

    if not all(
        [
            estado_activo,
            rol_admin,
            rol_participante,
            estado_aceptado,
            estado_invitado,
            estado_invitacion_pendiente,
        ]
    ):
        raise HTTPException(status_code=500, detail="Faltan datos maestros requeridos")

    viaje = Viaje(
        Titulo=payload.title,
        Descripcion=payload.description,
        FechaInicio=payload.startDate,
        FechaFin=payload.endDate,
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda=payload.currency.upper(),
        IdAdministrador=admin_user_id,
    )
    db.add(viaje)
    db.flush()

    for destino_data in payload.destinations:
        destino = db.scalar(
            select(Destino).where(
                Destino.Nombre == destino_data.name,
                Destino.Pais == destino_data.country,
            )
        )

        if destino is None:
            destino = Destino(
                Nombre=destino_data.name,
                Pais=destino_data.country,
                Lat=destino_data.lat,
                Lng=destino_data.lng
            )
            db.add(destino)
            db.flush()
        
        db.add(
            DestinoViaje(
                IdViaje=viaje.IdViaje,
                IdDestino=destino.IdDestino
            )
        )
    db.flush()

    fecha_actual = viaje.FechaInicio
    indice_dia = 1
    
    while fecha_actual <= viaje.FechaFin:
        db.add(
            DiaCronograma(
                IdViaje=viaje.IdViaje,
                Fecha=fecha_actual,
                IndiceDia=indice_dia
            )
        )
        fecha_actual += timedelta(days=1)
        indice_dia += 1

    ahora = datetime.now()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=admin_user_id,
            IdRolParticipante=rol_admin.IdRolParticipante,
            IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
            FechaInvitacion=ahora,
            FechaRespuesta=ahora,
            FechaIncorporacion=ahora,
            InvitadoPor=admin_user_id,
        )
    )

    for participante_id in participantes_ids:
        db.add(
            ParticipanteViaje(
                IdViaje=viaje.IdViaje,
                IdUsuario=participante_id,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=admin_user_id,
            )
        )

    vencimiento = ahora + timedelta(days=7)
    invitaciones_email: list[InvitationEmailPayload] = []
    for email_invitado in sorted(emails_invitados):
        token_invitacion = token_urlsafe(32)
        db.add(
            InvitacionViaje(
                IdViaje=viaje.IdViaje,
                EmailInvitado=email_invitado,
                NombreInvitado=None,
                TokenInvitacion=token_invitacion,
                FechaVencimiento=vencimiento,
                IdEstadoInvitacion=estado_invitacion_pendiente.IdEstadoInvitacion,
                InvitadoPor=admin_user_id,
            )
        )

        invitaciones_email.append(
            InvitationEmailPayload(
                to_email=email_invitado,
                trip_title=viaje.Titulo,
                trip_destination="-".join(
                    f"{rel.Destino.Nombre}, {rel.Destino.Pais}" for rel in viaje.Destinos
                ),
                inviter_name=f"{administrador.Nombre} {administrador.Apellido}",
                invitation_token=token_invitacion,
                expiration_at=vencimiento,
            )
        )

    db.commit()
    db.refresh(viaje)

    invitation_sender = InvitationEmailSender(get_mail_service())
    for invitacion in invitaciones_email:
        try:
            invitation_sender.send(invitacion)
        except Exception:
            logger.exception(
                "No se pudo enviar el correo de invitacion",
                extra={"email": invitacion.to_email, "trip_id": viaje.IdViaje},
            )

    admin_data = {
        "id": administrador.IdUsuario,
        "nombreUsuario": administrador.NombreUsuario,
        "nombreCompleto": f"{administrador.Nombre} {administrador.Apellido}",
        "email": administrador.Email,
        "fotoUrl": getattr(administrador, "FotoUrl", "")
    }

    return TripRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destinations=[
            DestinationRead(
                id=rel.Destino.IdDestino,
                name=rel.Destino.Nombre,
                country=rel.Destino.Pais,
                lat=rel.Destino.Lat,
                lng=rel.Destino.Lng
            )
            for rel in viaje.Destinos
        ],
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
        # 👇 Pasamos los datos iniciales para que el front no se rompa al crear
        participantUserIds=[admin_user_id] + participantes_ids,
        participants=[admin_data],  # Los demás todavía están como 'invitados', no 'aceptados'
        invitedEmails=list(emails_invitados)
    )

