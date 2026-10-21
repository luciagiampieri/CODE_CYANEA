from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.limites_planes import validar_viajes_activos_destinatario
from app.services.trip_access import require_trip_not_finished


def bloquear_viaje(db: Session, id_viaje: int) -> Viaje:
    """Transferir, abandonar y expulsar serializan sus cambios sobre el viaje."""
    viaje = db.scalar(
        select(Viaje)
        .where(Viaje.IdViaje == id_viaje)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if viaje is None:
        raise HTTPException(404, "Viaje no encontrado")
    return viaje


def cambiar_administrador(
    db: Session, viaje: Viaje, anterior: ParticipanteViaje, nuevo: ParticipanteViaje
) -> None:
    """Actualiza ambas fuentes del rol; el llamador controla la transacción y la salida."""
    roles = {
        rol.Nombre: rol.IdRolParticipante
        for rol in db.scalars(
            select(RolParticipante).where(
                RolParticipante.Nombre.in_(["administrador", "participante"]),
                RolParticipante.Activo.is_(True),
            )
        )
    }
    if "administrador" not in roles or "participante" not in roles:
        raise HTTPException(500, "Faltan los roles maestros de participantes del viaje.")
    viaje.IdAdministrador = nuevo.IdUsuario
    nuevo.IdRolParticipante = roles["administrador"]
    anterior.IdRolParticipante = roles["participante"]
    viaje.FechaActualizacion = datetime.now(timezone.utc)


def transferir_administracion(
    db: Session, id_viaje: int, usuario: Usuario, id_nuevo_administrador: int
) -> tuple[Viaje, Usuario]:
    viaje = bloquear_viaje(db, id_viaje)
    if viaje.IdAdministrador != usuario.IdUsuario:
        raise HTTPException(403, "Solo el administrador actual puede transferir la administración.")
    require_trip_not_finished(viaje, "la administración del viaje")
    if viaje.EstadoViaje.Nombre != "activo" or not viaje.EstadoViaje.Activo:
        raise HTTPException(409, "Solo se puede transferir la administración de un viaje activo.")
    if id_nuevo_administrador == usuario.IdUsuario:
        raise HTTPException(400, "Debés seleccionar a otro participante como administrador.")

    participantes = {
        p.IdUsuario: p
        for p in db.scalars(
            select(ParticipanteViaje)
            .join(ParticipanteViaje.EstadoParticipacion)
            .where(
                ParticipanteViaje.IdViaje == id_viaje,
                ParticipanteViaje.IdUsuario.in_([usuario.IdUsuario, id_nuevo_administrador]),
                EstadoParticipacion.Nombre == "aceptado",
                EstadoParticipacion.Activo.is_(True),
            )
            .execution_options(populate_existing=True)
        )
    }
    anterior = participantes.get(usuario.IdUsuario)
    nuevo = participantes.get(id_nuevo_administrador)
    if anterior is None:
        raise HTTPException(403, "Debés tener una participación aceptada en este viaje.")
    if nuevo is None:
        raise HTTPException(400, "El destinatario debe ser un participante aceptado de este viaje.")
    destinatario = db.scalar(
        select(Usuario)
        .where(Usuario.IdUsuario == id_nuevo_administrador)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if destinatario is None or not destinatario.Activo or destinatario.FechaBaja is not None:
        raise HTTPException(400, "El destinatario debe tener una cuenta activa.")
    validar_viajes_activos_destinatario(db, destinatario)
    cambiar_administrador(db, viaje, anterior, nuevo)
    db.commit()
    return viaje, destinatario