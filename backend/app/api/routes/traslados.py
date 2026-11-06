"""Agendar traslados (US 136). Cualquier participante aceptado puede usar estas rutas.

La lectura viaja en `GET /trips/{trip_id}` y la baja reutiliza el `DELETE` de actividades.
Las rutas no pasan por el análisis de horarios ni el de entradas (criterio 19).
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.traslado import (
    ActividadSuperpuestaTrasladoRead,
    TrasladoCreate,
    TrasladoGuardadoRead,
    TrasladoOcultar,
    TrasladoUpdate,
    TrasladoDatos,
)
from app.schemas.trip import TripMutationResponse
from app.services import traslados
from app.services.administracion_viajes import bloquear_viaje
from app.services.notifications.dispatcher import TripNotificationEvent, dispatch_trip_notification
from app.services.notifications.service import NotificationType
from app.services.privacidad import nombre_para_otros
from app.services.trip_access import (
    get_trip_with_relations,
    require_trip_edit_access,
    require_trip_not_finished,
)
from app.services.websocket_manager import manager

router = APIRouter()


def _viaje_para_editar(db: Session, trip_id: int, usuario: Usuario) -> Viaje:
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), usuario)
    require_trip_not_finished(viaje, "el itinerario")
    bloquear_viaje(db, trip_id)
    return viaje


def _notas(payload: TrasladoDatos) -> str | None:
    return (payload.notas or "").strip() or None


def _dia_del_tramo(viaje: Viaje, estado: traslados.EstadoTramo) -> DiaCronograma:
    dia = next((d for d in viaje.Cronograma if d.Fecha == estado.fecha_dia), None)
    if dia is None:
        raise traslados.error_traslado(
            status.HTTP_409_CONFLICT,
            "El viaje todavía no tiene ese día en el itinerario.",
            traslados.TRANSFER_SEGMENT_NOT_AVAILABLE,
        )
    return dia


def _pedir_confirmacion(superpuestas: list[ActividadItinerario]) -> TrasladoGuardadoRead:
    return TrasladoGuardadoRead(
        guardado=False,
        requiereConfirmacion=True,
        superpuestas=[
            ActividadSuperpuestaTrasladoRead(
                idActividad=a.IdActividad,
                nombre=a.Nombre,
                horaInicio=a.HoraInicio.strftime("%H:%M"),
                horaFin=a.HoraFin.strftime("%H:%M"),
            )
            for a in superpuestas
        ],
        mensaje=traslados.mensaje_superposicion(superpuestas),
    )


async def _avisar(
    db: Session,
    viaje: Viaje,
    actividad: ActividadItinerario,
    usuario: Usuario,
    *,
    creado: bool,
) -> None:
    await manager.broadcast(viaje.IdViaje, {
        "tipo": "actividad_creada" if creado else "actividad_actualizada",
        "idDiaCronograma": actividad.IdDiaCronograma,
        "idActividad": actividad.IdActividad,
    })
    actor = nombre_para_otros(usuario) or usuario.NombreUsuario
    await dispatch_trip_notification(
        db,
        TripNotificationEvent(
            notification_type=(
                NotificationType.NUEVA_ACTIVIDAD if creado else NotificationType.CAMBIO_VIAJE
            ),
            tipo="actividad_creada" if creado else "actividad_actualizada",
            titulo=(
                f"Nueva actividad en {viaje.Titulo}"
                if creado
                else f"Actividad actualizada en {viaje.Titulo}"
            ),
            mensaje=(
                f"{actor} agendó {actividad.Nombre} en el itinerario."
                if creado
                else f"{actor} actualizó {actividad.Nombre} en el itinerario."
            ),
            id_viaje=viaje.IdViaje,
            id_usuario_actor=usuario.IdUsuario,
            data={
                "eventType": "activity_created" if creado else "activity_updated",
                "dayId": actividad.IdDiaCronograma,
                "activityId": actividad.IdActividad,
            },
        ),
    )


@router.post("/{trip_id}/traslados", response_model=TrasladoGuardadoRead)
async def agendar_traslado(
    trip_id: int,
    payload: TrasladoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TrasladoGuardadoRead:
    viaje = _viaje_para_editar(db, trip_id, current_user)
    estado = traslados.tramo_disponible(viaje, payload.tramo)
    medio = traslados.validar_medio(payload.medio)
    inicio, fin = traslados.resolver_horas(
        estado.tipo, payload.horaSalida, payload.horaLlegada, estado.mismo_dia
    )
    dia = _dia_del_tramo(viaje, estado)

    superpuestas = traslados.actividades_superpuestas(viaje, estado, inicio, fin)
    if superpuestas and not payload.confirmarSuperposicion:
        db.rollback()
        return _pedir_confirmacion(superpuestas)

    fila = traslados.fila_del_tramo(db, viaje, estado)
    fila.Oculto = False
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        IdTramoTraslado=fila.IdTramoTraslado,
        Nombre=traslados.nombre_traslado(medio, estado.tipo, estado.nombre_llegada),
        Descripcion=_notas(payload),
        HoraInicio=inicio,
        HoraFin=fin,
        Icono=medio,
    )
    db.add(actividad)
    db.commit()
    db.refresh(actividad)

    await _avisar(db, viaje, actividad, current_user, creado=True)
    return TrasladoGuardadoRead(
        guardado=True, idActividad=actividad.IdActividad, nombre=actividad.Nombre
    )


def _traslado_del_viaje(viaje: Viaje, id_actividad: int) -> traslados.EstadoTramo:
    estado = next(
        (
            e
            for e in traslados.estados_tramos(viaje)
            if e.actividad is not None and e.actividad.IdActividad == id_actividad
        ),
        None,
    )
    if estado is None:
        raise traslados.error_traslado(
            status.HTTP_404_NOT_FOUND,
            "El traslado no existe en este viaje.",
            traslados.TRANSFER_NOT_FOUND,
        )
    return estado


def _resolver_tramo_destino(
    viaje: Viaje, actual: traslados.EstadoTramo, payload: TrasladoUpdate
) -> traslados.EstadoTramo:
    """Tramo donde queda el traslado. Solo se reasigna el que ya no corresponde al
    recorrido, y ese no se puede guardar sin elegir uno vigente."""
    if actual.validez == traslados.NO_CORRESPONDE:
        if payload.tramo is None:
            raise traslados.error_traslado(
                status.HTTP_400_BAD_REQUEST,
                "Elegí el tramo del recorrido para este traslado.",
                traslados.TRANSFER_SEGMENT_REQUIRED,
            )
        return traslados.tramo_disponible(viaje, payload.tramo)
    if payload.tramo is not None and traslados.clave_de_ref(payload.tramo) != actual.clave:
        raise traslados.error_traslado(
            status.HTTP_409_CONFLICT,
            "Este traslado sigue correspondiendo a su tramo.",
            traslados.TRANSFER_SEGMENT_NOT_AVAILABLE,
        )
    return actual


def _reasignar(
    db: Session,
    viaje: Viaje,
    actual: traslados.EstadoTramo,
    nuevo: traslados.EstadoTramo,
) -> None:
    if nuevo.fila is not None:
        # Fila de la tarjeta oculta: la reemplaza la del traslado.
        viaje.TramosTraslados.remove(nuevo.fila)
        db.flush()
    actual.fila.IdTipoTramoTraslado = nuevo.tipo
    actual.fila.IdDestinoOrigen = nuevo.clave[1]
    actual.fila.IdDestinoLlegada = nuevo.clave[2]
    traslados.mover_de_dia(actual.actividad, _dia_del_tramo(viaje, nuevo))


@router.put("/{trip_id}/traslados/{activity_id}", response_model=TrasladoGuardadoRead)
async def editar_traslado(
    trip_id: int,
    activity_id: int,
    payload: TrasladoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TrasladoGuardadoRead:
    viaje = _viaje_para_editar(db, trip_id, current_user)
    actual = _traslado_del_viaje(viaje, activity_id)
    actividad = actual.actividad
    destino = _resolver_tramo_destino(viaje, actual, payload)
    medio = traslados.validar_medio(payload.medio)

    sin_fecha = destino.validez == traslados.SIN_FECHA
    inicio, fin = traslados.resolver_horas(
        destino.tipo,
        payload.horaSalida,
        payload.horaLlegada,
        destino.mismo_dia and not sin_fecha,
    )

    if not sin_fecha:
        superpuestas = traslados.actividades_superpuestas(viaje, destino, inicio, fin)
        if superpuestas and not payload.confirmarSuperposicion:
            db.rollback()
            return _pedir_confirmacion(superpuestas)

    if destino is not actual:
        _reasignar(db, viaje, actual, destino)

    actividad.Icono = medio
    actividad.Nombre = traslados.nombre_traslado(medio, destino.tipo, destino.nombre_llegada)
    actividad.Descripcion = _notas(payload)
    actividad.HoraInicio = inicio
    actividad.HoraFin = fin
    db.commit()
    db.refresh(actividad)

    await _avisar(db, viaje, actividad, current_user, creado=False)
    return TrasladoGuardadoRead(
        guardado=True, idActividad=actividad.IdActividad, nombre=actividad.Nombre
    )


@router.post("/{trip_id}/traslados/ocultar", response_model=TripMutationResponse)
async def ocultar_tramo(
    trip_id: int,
    payload: TrasladoOcultar,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripMutationResponse:
    viaje = _viaje_para_editar(db, trip_id, current_user)
    estado = traslados.tramo_disponible(viaje, payload.tramo)
    if payload.oculto:
        traslados.fila_del_tramo(db, viaje, estado).Oculto = True
    elif estado.fila is not None:
        # Sin traslado ni tarjeta oculta, el tramo no tiene nada para recordar.
        viaje.TramosTraslados.remove(estado.fila)
    db.commit()

    await manager.broadcast(trip_id, {"tipo": "traslados_actualizados"})
    return TripMutationResponse(
        message=(
            "La tarjeta del traslado quedó oculta."
            if payload.oculto
            else "La tarjeta del traslado volvió a mostrarse."
        )
    )
