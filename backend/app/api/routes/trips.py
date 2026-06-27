from datetime import datetime, timedelta, date
import logging
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from pydantic import ValidationError

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
from app.schemas.trip import (
    TripAdminRead,
    TripCreate,
    TripDetailRead,
    TripExternalInvitationRead,
    TripInvitationRead,
    TripMutationResponse,
    TripParticipantRead,
    TripRead,
    TripParticipantUpsert,
    InvitationResponse,
)
from app.services.mail import get_mail_service
from app.services.notifications.invitation_email_sender import (
    InvitationEmailPayload,
    InvitationEmailSender,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_trip_with_relations(db: Session, trip_id: int) -> Viaje | None:
    return db.scalar(
        select(Viaje)
        .options(
            selectinload(Viaje.Administrador),
            selectinload(Viaje.EstadoViaje),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.Usuario),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.RolParticipante),
            selectinload(Viaje.Participantes).selectinload(ParticipanteViaje.EstadoParticipacion),
            selectinload(Viaje.Invitaciones).selectinload(InvitacionViaje.EstadoInvitacion),
        )
        .where(Viaje.IdViaje == trip_id)
    )


def _require_trip_access(viaje: Viaje | None, current_user: Usuario) -> Viaje:
    if viaje is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")

    puede_ver = (
        viaje.IdAdministrador == current_user.IdUsuario
        or any(part.IdUsuario == current_user.IdUsuario for part in viaje.Participantes)
    )
    if not puede_ver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver este viaje",
        )
    return viaje


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
        destination=viaje.Destino,
        description=viaje.Descripcion,
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
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
            destination=p.Viaje.Destino,
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



@router.get("", response_model=list[TripRead])
def list_trips(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[TripRead]:
    viajes = db.scalars(
        select(Viaje)
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
            destination=viaje.Destino,
            status=resolver_estado(viaje),
            currency=viaje.Moneda,
            startDate=viaje.FechaInicio,
            endDate=viaje.FechaFin,
        )
        for viaje in viajes
    ]


@router.get("/{trip_id}", response_model=TripDetailRead)
def get_trip_detail(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripDetailRead:
    viaje = _require_trip_access(_get_trip_with_relations(db, trip_id), current_user)
    return _build_trip_detail(viaje)


@router.post("/{trip_id}/participants", response_model=TripMutationResponse, status_code=status.HTTP_201_CREATED)
def add_trip_participant(
    trip_id: int,
    payload: TripParticipantUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = _require_trip_access(_get_trip_with_relations(db, trip_id), current_user)
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
                trip_destination=viaje.Destino,
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
    viaje = _require_trip_access(_get_trip_with_relations(db, trip_id), current_user)
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
    viaje = _require_trip_access(_get_trip_with_relations(db, trip_id), current_user)
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
        Destino=payload.destination,
        Descripcion=payload.description,
        FechaInicio=payload.startDate,
        FechaFin=payload.endDate,
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda=payload.currency.upper(),
        IdAdministrador=admin_user_id,
    )
    db.add(viaje)
    db.flush()

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
                trip_destination=viaje.Destino,
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

    return TripRead(
        id=viaje.IdViaje,
        title=viaje.Titulo,
        destination=viaje.Destino,
        status=viaje.EstadoViaje.Nombre,
        currency=viaje.Moneda,
        startDate=viaje.FechaInicio,
        endDate=viaje.FechaFin,
    )
