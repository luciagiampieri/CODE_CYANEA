from calendar import monthrange
from datetime import datetime, timedelta, date
import logging
from secrets import token_urlsafe
from urllib import response

from fastapi import APIRouter, Depends, HTTPException, status, Query
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.api.deps import get_current_user
from app.api.routes.itinerary import manager
from app.db.session import get_db
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.dia_cronograma import DiaCronograma
from app.models.actividad_itinerario import ActividadItinerario
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.destino_viaje import DestinoViaje
from app.models.destino import Destino
from app.schemas.trip import (
    ActividadCreate,
    ActividadRead,
    TripAdminRead,
    TripCreate,
    TripDetailRead,
    TripExternalInvitationRead,
    TripInvitationRead,
    TripMutationResponse,
    TripParticipantRead,
    TripRead,
    TripParticipantUpsert,
    TripUpdate,
    TripUpdateResponse,
    InvitationResponse,
    DestinationRead,
)
from app.services.mail import get_mail_service
from app.services.notifications.invitation_email_sender import (
    InvitationEmailPayload,
    InvitationEmailSender,
)
from app.services.trip_access import get_trip_with_relations, require_trip_access


router = APIRouter()
logger = logging.getLogger(__name__)
GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"


def _add_one_month(fecha: date) -> date:
    """Suma un mes calendario a una fecha, ajustando meses de distinta longitud
    (ej. 31 de enero + 1 mes -> 28 o 29 de febrero)."""
    year = fecha.year + (1 if fecha.month == 12 else 0)
    month = 1 if fecha.month == 12 else fecha.month + 1
    day = min(fecha.day, monthrange(year, month)[1])
    return date(year, month, day)


def _require_trip_admin(viaje: Viaje, current_user: Usuario) -> None:
    if viaje.IdAdministrador != current_user.IdUsuario:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el administrador del viaje puede modificar participantes",
        )


def _build_trip_detail(viaje: Viaje) -> TripDetailRead:
    participantes_visibles = [
        participacion
        for participacion in viaje.Participantes
        if participacion.EstadoParticipacion.Nombre in {"aceptado", "invitado"}
    ]
    participantes_visibles.sort(
        key=lambda item: (
            item.RolParticipante.Nombre != "administrador",
            item.Usuario.Nombre.lower(),
            item.Usuario.Apellido.lower(),
        )
    )

    invitaciones_visibles = [
        invitacion
        for invitacion in viaje.Invitaciones
        if invitacion.EstadoInvitacion.Nombre == "pendiente"
    ]
    invitaciones_visibles.sort(key=lambda item: item.EmailInvitado.lower())

    return TripDetailRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destinations= [DestinationRead(
            id=rel.Destino.IdDestino,
            name=rel.Destino.Nombre,
            country=rel.Destino.Pais,
            lat=rel.Destino.Lat,
            lng=rel.Destino.Lng
        ) for rel in viaje.Destinos
        ],
        description=viaje.Descripcion,
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
        cronograma=list(viaje.Cronograma or []),
        admin=TripAdminRead(
            id=viaje.Administrador.IdUsuario,
            nombreCompleto=f"{viaje.Administrador.Nombre} {viaje.Administrador.Apellido}",
            nombreUsuario=viaje.Administrador.NombreUsuario,
            email=viaje.Administrador.Email,
            fotoUrl=viaje.Administrador.FotoUrl,
        ),
        participants=[
            TripParticipantRead(
                id=participacion.Usuario.IdUsuario,
                nombreCompleto=f"{participacion.Usuario.Nombre} {participacion.Usuario.Apellido}",
                nombreUsuario=participacion.Usuario.NombreUsuario,
                email=participacion.Usuario.Email,
                fotoUrl=participacion.Usuario.FotoUrl,
                role=participacion.RolParticipante.Nombre,
                status=participacion.EstadoParticipacion.Nombre,
            )
            for participacion in participantes_visibles
        ],
        participantUserIds=[participacion.Usuario.IdUsuario for participacion in participantes_visibles],
        externalInvitations=[
            TripExternalInvitationRead(
                email=invitacion.EmailInvitado,
                status=invitacion.EstadoInvitacion.Nombre,
                invitedAt=invitacion.FechaInvitacion,
                registeredUserId=invitacion.IdUsuarioRegistrado,
            )
            for invitacion in invitaciones_visibles
        ],
        invitedEmails=[invitacion.EmailInvitado for invitacion in invitaciones_visibles],
    )

@router.get("/invitations/pending", response_model=None)
def get_pending_invitations(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    
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
            destinations=[
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

    vistos = set()
    resultados = []

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])

        name = props.get("name") or props.get("full_address")
        
        context = props.get("context", {})
        country = None
        if isinstance(context, dict):
            country = context.get("country", {}).get("name")
        
        if not country:
            country = props.get("place_formatted", "").split(",")[-1].strip()

        name = name or "Lugar desconocido"
        country = country or "País desconocido"

        clave_unica = (name, country)

        if clave_unica in vistos:
            continue

        vistos.add(clave_unica)

        resultados.append({
            "name": name,
            "country": country,
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
            cronograma=[],
            participantUserIds=[],
            participants=[],
            invitedEmails=[],
        )
        for viaje in viajes
    ]


@router.get("/{trip_id}", response_model=TripDetailRead)
def get_trip_detail(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripDetailRead:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    return _build_trip_detail(viaje)


@router.put("/{trip_id}", response_model=TripUpdateResponse)
def update_trip(
    trip_id: int,
    payload: TripUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripUpdateResponse:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    _require_trip_admin(viaje, current_user)

    limite_edicion = _add_one_month(viaje.FechaFin)
    if date.today() > limite_edicion:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El plazo para editar la información general de este viaje ha vencido",
        )


    viaje_ya_comenzo = viaje.FechaInicio <= date.today()

    if viaje_ya_comenzo:
        if payload.startDate != viaje.FechaInicio:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se puede modificar la fecha de inicio de un viaje que ya comenzó",
            )
    else:
        if payload.startDate < date.today():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La fecha de inicio debe ser igual o posterior a la fecha actual",
            )


    dias_afectados = [
        dia for dia in viaje.Cronograma
        if dia.Fecha < payload.startDate or dia.Fecha > payload.endDate
    ]
    dias_con_actividades = [dia for dia in dias_afectados if dia.Actividades]
    if dias_con_actividades:
        fechas_conflicto = ", ".join(dia.Fecha.isoformat() for dia in dias_con_actividades)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede modificar el rango de fechas: hay actividades cargadas "
                f"en días que quedarían fuera del nuevo rango ({fechas_conflicto}). "
                "Eliminá esas actividades antes de achicar las fechas del viaje."
            ),
        )

    viaje.Titulo = payload.title.strip()
    viaje.Descripcion = payload.description.strip() if payload.description else None
    viaje.FechaInicio = payload.startDate
    viaje.FechaFin = payload.endDate

    destinos_actuales_por_clave = {
        (rel.Destino.Nombre, rel.Destino.Pais): rel for rel in viaje.Destinos
    }
    claves_nuevas = {(d.name, d.country) for d in payload.destinations}

    for clave, rel in list(destinos_actuales_por_clave.items()):
        if clave not in claves_nuevas:
            db.delete(rel)

    for destino_data in payload.destinations:
        clave = (destino_data.name, destino_data.country)
        if clave in destinos_actuales_por_clave:
            continue

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
                Lng=destino_data.lng,
            )
            db.add(destino)
            db.flush()

        db.add(DestinoViaje(IdViaje=viaje.IdViaje, IdDestino=destino.IdDestino))

    db.flush()

    for dia in dias_afectados:
        db.delete(dia)
    db.flush()

    fechas_existentes = {
        dia.Fecha
        for dia in viaje.Cronograma
        if payload.startDate <= dia.Fecha <= payload.endDate
    }
    fecha_actual = payload.startDate
    while fecha_actual <= payload.endDate:
        if fecha_actual not in fechas_existentes:
            db.add(DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha_actual, IndiceDia=1))
        fecha_actual += timedelta(days=1)
    db.flush()

    dias_ordenados = db.scalars(
        select(DiaCronograma)
        .where(DiaCronograma.IdViaje == viaje.IdViaje)
        .order_by(DiaCronograma.Fecha)
    ).all()
    for indice, dia in enumerate(dias_ordenados, start=1):
        dia.IndiceDia = indice

    db.commit()

    viaje_actualizado = get_trip_with_relations(db, trip_id)
    return TripUpdateResponse(
        message="Los cambios se guardaron correctamente.",
        trip=_build_trip_detail(viaje_actualizado),
    )


@router.delete("/{trip_id}", response_model=TripMutationResponse)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = get_trip_with_relations(db, trip_id)
    if viaje is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Viaje no encontrado"
        )

    require_trip_access(viaje, current_user)

    nuevo_estado = db.scalar(
        select(EstadoViaje).where(
            EstadoViaje.Nombre == "cancelado", 
            EstadoViaje.Activo.is_(True)
        )
    )
    
    if not nuevo_estado:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta el estado maestro 'cancelado' en la base de datos."
        )

    viaje.IdEstadoViaje = nuevo_estado.IdEstadoViaje
    db.commit()

    return TripMutationResponse(message="El viaje ha sido eliminado correctamente.")


@router.post(
    "/{trip_id}/days/{day_id}/activities",
    response_model=ActividadRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_activity(
    trip_id: int,
    day_id: int,
    payload: ActividadCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ActividadRead:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)

    dia = db.scalar(
        select(DiaCronograma).where(
            DiaCronograma.IdDiaCronograma == day_id,
            DiaCronograma.IdViaje == viaje.IdViaje,
        )
    )
    if dia is None:
        raise HTTPException(status_code=404, detail="El día del cronograma no existe en este viaje.")

    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre=payload.nombre.strip(),
        Descripcion=payload.descripcion.strip() if payload.descripcion else None,
        HoraInicio=payload.horaInicio,
        HoraFin=payload.horaFin,
        Icono=payload.icono,
    )
    db.add(actividad)
    db.commit()
    db.refresh(actividad)

    resultado = ActividadRead.model_validate(actividad)

    # Avisamos a todos los conectados al itinerario de este viaje (menos a
    # quien lo acaba de crear, que ya lo ve por la respuesta REST normal).
    await manager.broadcast(trip_id, {
        "tipo": "actividad_creada",
        "idDiaCronograma": dia.IdDiaCronograma,
        "actividad": resultado.model_dump(by_alias=True),
    })

    return resultado


@router.post("/{trip_id}/participants", response_model=TripMutationResponse, status_code=status.HTTP_201_CREATED)
def add_trip_participant(
    trip_id: int,
    payload: TripParticipantUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    _require_trip_admin(viaje, current_user)

    rol_participante = db.scalar(
        select(RolParticipante).where(
            RolParticipante.Nombre == "participante",
            RolParticipante.Activo.is_(True),
        )
    )
    estado_invitado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "invitado",
            EstadoParticipacion.Activo.is_(True),
        )
    )
    estado_invitacion_pendiente = db.scalar(
        select(EstadoInvitacion).where(
            EstadoInvitacion.Nombre == "pendiente",
            EstadoInvitacion.Activo.is_(True),
        )
    )
    if not all([rol_participante, estado_invitado, estado_invitacion_pendiente]):
        raise HTTPException(status_code=500, detail="Faltan datos maestros requeridos")

    if payload.userId is not None:
        if payload.userId == viaje.IdAdministrador:
            raise HTTPException(status_code=400, detail="El administrador ya forma parte del viaje")

        usuario = db.get(Usuario, payload.userId)
        if usuario is None or not usuario.Activo:
            raise HTTPException(status_code=404, detail="Usuario inexistente o inactivo")

        existente = db.scalar(
            select(ParticipanteViaje).where(
                ParticipanteViaje.IdViaje == trip_id,
                ParticipanteViaje.IdUsuario == payload.userId,
            )
        )
        if existente is not None:
            raise HTTPException(status_code=409, detail="El usuario ya está agregado al viaje")

        invitacion_externa = db.scalar(
            select(InvitacionViaje).where(
                InvitacionViaje.IdViaje == trip_id,
                InvitacionViaje.EmailInvitado == usuario.Email.lower(),
                InvitacionViaje.IdEstadoInvitacion == estado_invitacion_pendiente.IdEstadoInvitacion,
            )
        )
        if invitacion_externa is not None:
            db.delete(invitacion_externa)

        db.add(
            ParticipanteViaje(
                IdViaje=trip_id,
                IdUsuario=usuario.IdUsuario,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=current_user.IdUsuario,
            )
        )
        db.commit()
        return TripMutationResponse(message="Participante agregado correctamente")

    email = payload.email
    if email is None:
        raise HTTPException(status_code=400, detail="Debes enviar userId o email")

    if email == viaje.Administrador.Email.lower():
        raise HTTPException(status_code=400, detail="No puedes invitar al administrador del viaje")

    usuario_existente = db.scalar(select(Usuario).where(Usuario.Email == email))
    if usuario_existente is not None:
        if not usuario_existente.Activo:
            raise HTTPException(status_code=400, detail="El usuario registrado está inactivo")

        existente = db.scalar(
            select(ParticipanteViaje).where(
                ParticipanteViaje.IdViaje == trip_id,
                ParticipanteViaje.IdUsuario == usuario_existente.IdUsuario,
            )
        )
        if existente is not None:
            raise HTTPException(status_code=409, detail="El usuario ya está agregado al viaje")

        db.add(
            ParticipanteViaje(
                IdViaje=trip_id,
                IdUsuario=usuario_existente.IdUsuario,
                IdRolParticipante=rol_participante.IdRolParticipante,
                IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
                InvitadoPor=current_user.IdUsuario,
            )
        )
        db.commit()
        return TripMutationResponse(message="Participante registrado agregado correctamente")

    invitacion_existente = db.scalar(
        select(InvitacionViaje).where(
            InvitacionViaje.IdViaje == trip_id,
            InvitacionViaje.EmailInvitado == email,
            InvitacionViaje.IdEstadoInvitacion == estado_invitacion_pendiente.IdEstadoInvitacion,
        )
    )
    if invitacion_existente is not None:
        raise HTTPException(status_code=409, detail="Ese correo ya tiene una invitación pendiente")

    ahora = datetime.now()
    vencimiento = ahora + timedelta(days=7)
    token_invitacion = token_urlsafe(32)
    db.add(
        InvitacionViaje(
            IdViaje=trip_id,
            EmailInvitado=email,
            NombreInvitado=None,
            TokenInvitacion=token_invitacion,
            FechaVencimiento=vencimiento,
            IdEstadoInvitacion=estado_invitacion_pendiente.IdEstadoInvitacion,
            InvitadoPor=current_user.IdUsuario,
        )
    )
    db.commit()

    invitation_sender = InvitationEmailSender(get_mail_service())
    try:
        invitation_sender.send(
            InvitationEmailPayload(
                to_email=email,
                trip_title=viaje.Titulo,
                trip_destination= ", ".join(f"{d.Destino.Nombre}, {d.Destino.Pais}" for d in viaje.Destinos),
                inviter_name=f"{current_user.Nombre} {current_user.Apellido}",
                invitation_token=token_invitacion,
                expiration_at=vencimiento,
            )
        )
    except Exception:
        logger.exception(
            "No se pudo enviar el correo de invitacion",
            extra={"email": email, "trip_id": viaje.IdViaje},
        )

    return TripMutationResponse(message="Invitación externa creada correctamente")


@router.delete("/{trip_id}/participants/{user_id}", response_model=TripMutationResponse)
def remove_trip_participant(
    trip_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    _require_trip_admin(viaje, current_user)

    if user_id == viaje.IdAdministrador:
        raise HTTPException(status_code=400, detail="No se puede quitar al administrador del viaje")

    participacion = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == user_id,
        )
    )
    if participacion is None:
        raise HTTPException(status_code=404, detail="Participante no encontrado en este viaje")

    db.delete(participacion)
    db.commit()
    return TripMutationResponse(message="Participante eliminado correctamente")


@router.delete("/{trip_id}/external-invitations", response_model=TripMutationResponse)
def remove_trip_external_invitation(
    trip_id: int,
    payload: TripParticipantUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    _require_trip_admin(viaje, current_user)

    if not payload.email:
        raise HTTPException(status_code=400, detail="Debes enviar el email de la invitación externa")

    invitacion = db.scalar(
        select(InvitacionViaje).where(
            InvitacionViaje.IdViaje == trip_id,
            InvitacionViaje.EmailInvitado == payload.email,
        )
    )
    if invitacion is None:
        raise HTTPException(status_code=404, detail="Invitación externa no encontrada")

    db.delete(invitacion)
    db.commit()
    return TripMutationResponse(message="Invitación externa eliminada correctamente")


@router.post("", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripRead:
    # El administrador siempre es el usuario autenticado
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

    if viaje.FechaInicio and viaje.FechaFin:
        fecha_actual = viaje.FechaInicio
        indice_dia = 1
        while fecha_actual <= viaje.FechaFin:
            db.add(
                DiaCronograma(
                    IdViaje=viaje.IdViaje,
                    Fecha=fecha_actual,
                    IndiceDia=indice_dia,
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
        "fotoUrl": getattr(administrador, "FotoUrl", None),
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
        cronograma=[],
        participantUserIds=[admin_user_id] + participantes_ids,

        participants=[admin_data],
        invitedEmails=list(emails_invitados),
    )