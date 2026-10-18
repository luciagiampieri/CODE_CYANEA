import logging
import re
import time as reloj
from dataclasses import replace
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.preferencia_planificacion import PreferenciaPlanificacion
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.models.usuario import Usuario
from app.schemas.sugerencia_actividad import (
    AceptacionSugerenciaRead,
    AceptarSugerenciaRequest,
    ActividadSuperpuestaRead,
    CompletarDiasLibresRequest,
    ContextoSugerenciasRead,
    FranjaLibreRead,
    FranjasLibresRead,
    ResultadoCompletarDiasLibresRead,
    ResultadoFranjaRead,
    ResultadoSugerenciasRead,
    SolicitudSugerenciasCreate,
    SugerenciaActividadRead,
)
from app.services.activity_ai import ActivitySuggester, SuggestionError, get_activity_suggester
from app.services.activity_ai.base import (
    AI_UNAVAILABLE,
    DAY_IN_PAST,
    DAY_NOT_FOUND,
    MENSAJE_NO_DISPONIBLE,
    MENSAJE_SIN_OPCIONES,
    NO_PREFERENCES,
    REQUEST_IN_PROGRESS,
    SLOT_FULL,
    SLOT_INVALID,
    SUGGESTION_LIMIT_REACHED,
)
from app.services.activity_ai.context import (
    MIN_DURACION_MINUTOS,
    calcular_huecos,
    combinar_preferencias,
    hhmm,
    minutos_de,
    nombres_a_ocultar,
    sanitizar_texto,
)
from app.services.activity_ai.franjas_libres import (
    DURACION_MINIMA_FRANJA_LIBRE_MINUTOS,
    FIN_VENTANA_MINUTOS,
    INICIO_VENTANA_MINUTOS,
    detectar_franjas_libres,
)
from app.services.activity_ai.processing import (
    ActividadDia,
    ReglasValidacion,
    buscar_lugares_google,
    distancia_km,
    filtrar_sugerencias,
    normalizar_id,
    validar_esquema,
)
from app.services.notifications import (
    NotificationType,
    TripNotificationEvent,
    dispatch_trip_notification,
)
from app.services.resolucion_votaciones import obtener_o_crear_lugar
from app.services.websocket_manager import manager
from app.services.trip_access import (
    get_trip_with_relations,
    is_trip_finished,
    require_trip_access,
    require_trip_edit_access,
    require_trip_not_finished,
)

logger = logging.getLogger(__name__)
router = APIRouter()

DURACION_MINIMA_FRANJA_MINUTOS = 60
DISTANCIAS_PERMITIDAS_KM = (5, 15, 30)
SEGUNDOS_SOLICITUD_ABANDONADA = 90
# Las solicitudes sin resultados no cuentan para el límite diario (como las fallidas).
ESTADOS_QUE_CUENTAN = ("en_proceso", "completada")

# Si después de filtrar quedan menos que esto, se reintenta una vez con la IA.
MIN_SUGERENCIAS_DESEADAS = 3

# Si el día no tiene actividades con lugar, se buscan en los días vecinos (±1, luego ±2).
DIAS_VECINOS_MAXIMOS = 2
MAX_DIRECCIONES_REFERENCIA = 5

NO_LOCATION_REFERENCE = "NO_LOCATION_REFERENCE"

ESTADOS_SUGERENCIA_VISIBLES = ("pendiente", "en_votacion")

ESTADO_PENDIENTE = "pendiente"
ESTADO_EN_VOTACION = "en_votacion"
ESTADO_DESCARTADA = "descartada"
ESTADO_ACEPTADA = "aceptada"

# US 92: cada franja libre recibe hasta tres sugerencias.
MAX_SUGERENCIAS_POR_FRANJA = 3
MENSAJE_ITINERARIO_COMPLETO = (
    "Tu itinerario se encuentra completo: no hay días ni franjas libres de al menos tres "
    "horas entre las 09:00 y las 22:00 en los próximos días del viaje."
)

SUGGESTION_NOT_FOUND = "SUGGESTION_NOT_FOUND"
SUGGESTION_NOT_PENDING = "SUGGESTION_NOT_PENDING"
SUGGESTION_IN_VOTING = "SUGGESTION_IN_VOTING"
SUGGESTION_ALREADY_ACCEPTED = "SUGGESTION_ALREADY_ACCEPTED"


# Formato del nombre de foto que devuelve Google Places (New): places/<id>/photos/<ref>.
PATRON_FOTO = re.compile(r"^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$")
URL_FOTO_GOOGLE = "https://places.googleapis.com/v1/{nombre}/media"

MENSAJE_SIN_PREFERENCIAS = (
    "Ningún participante configuró sus preferencias de planificación. Podés continuar y "
    "el asistente usará criterios generales."
)
MENSAJE_SIN_REFERENCIA = (
    "Tu viaje tiene varios destinos y no sabemos dónde van a estar ese día. Agregá al menos "
    "una actividad con lugar en ese día (o en uno cercano) y volvé a pedir sugerencias."
)


def _error(status_code: int, mensaje: str, codigo: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail=mensaje, headers={"X-Error-Code": codigo}
    )


def _zona_horaria():
    try:
        return ZoneInfo(settings.ai_suggestions_timezone)
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=-3))


def _participaciones_aceptadas(viaje) -> list:
    return [
        part
        for part in viaje.Participantes
        if part.EstadoParticipacion is not None and part.EstadoParticipacion.Nombre == "aceptado"
    ]


def _preferencias_del_grupo(db: Session, participaciones: list) -> list[PreferenciaPlanificacion]:
    if not participaciones:
        return []
    return list(
        db.scalars(
            select(PreferenciaPlanificacion)
            .options(
                selectinload(PreferenciaPlanificacion.Intereses),
                selectinload(PreferenciaPlanificacion.RitmoViaje),
            )
            .where(
                PreferenciaPlanificacion.IdParticipanteViaje.in_(
                    [p.IdParticipanteViaje for p in participaciones]
                )
            )
        ).all()
    )


def _contar_solicitudes_hoy(db: Session, trip_id: int) -> int:
    zona = _zona_horaria()
    hoy = datetime.now(zona).date()
    desde = datetime(hoy.year, hoy.month, hoy.day, tzinfo=zona)
    hasta = desde + timedelta(days=1)
    return db.scalar(
        select(func.count())
        .select_from(SolicitudSugerenciaActividad)
        .where(
            SolicitudSugerenciaActividad.IdViaje == trip_id,
            SolicitudSugerenciaActividad.FechaSolicitud >= desde,
            SolicitudSugerenciaActividad.FechaSolicitud < hasta,
            SolicitudSugerenciaActividad.Estado.in_(ESTADOS_QUE_CUENTAN),
        )
    ) or 0


def _restantes(db: Session, trip_id: int) -> int:
    return max(settings.ai_suggestions_daily_limit - _contar_solicitudes_hoy(db, trip_id), 0)


def _actividades_con_lugar(db: Session, ids_dias: list[int]) -> list[ActividadItinerario]:
    if not ids_dias:
        return []
    return list(
        db.scalars(
            select(ActividadItinerario)
            .options(
                selectinload(ActividadItinerario.LugarInteres),
                selectinload(ActividadItinerario.LugarInteresViaje).selectinload(
                    LugarInteresViaje.LugarInteres
                ),
            )
            .where(ActividadItinerario.IdDiaCronograma.in_(ids_dias))
        ).all()
    )


def _lugar_de(actividad: ActividadItinerario):
    if actividad.LugarInteres is not None:
        return actividad.LugarInteres
    if actividad.LugarInteresViaje is not None:
        return actividad.LugarInteresViaje.LugarInteres
    return None


def _coordenadas_validas(lugar) -> bool:
    """Descarta lugares sin coordenadas o con (0, 0): el asistente del chat crea lugares
    "aproximados" así cuando no encuentra el lugar real, y romperían las distancias."""
    if lugar is None or lugar.Lat is None or lugar.Lng is None:
        return False
    return not (float(lugar.Lat) == 0.0 and float(lugar.Lng) == 0.0)


def _referencia_de_actividades(
    actividades: list[ActividadItinerario],
) -> tuple[list[tuple[float, float]], list[str]]:
    """Coordenadas y direcciones de los lugares de las actividades (sin repetir direcciones)."""
    puntos: list[tuple[float, float]] = []
    direcciones: list[str] = []
    for actividad in actividades:
        lugar = _lugar_de(actividad)
        if not _coordenadas_validas(lugar):
            continue
        puntos.append((float(lugar.Lat), float(lugar.Lng)))
        direccion = (lugar.Direccion or "").strip()
        if direccion and direccion not in direcciones:
            direcciones.append(direccion)
    return puntos, direcciones


def _referencia_dias_cercanos(
    viaje, dia: DiaCronograma, actividades_viaje: list[ActividadItinerario]
) -> tuple[list[tuple[float, float]], list[str]]:
    """Si el día está vacío, se asume que el grupo está cerca de donde estuvo (o va a estar)
    los días vecinos: primero ±1 día, después ±2."""
    por_dia: dict[int, list[ActividadItinerario]] = {}
    for actividad in actividades_viaje:
        por_dia.setdefault(actividad.IdDiaCronograma, []).append(actividad)

    for distancia in range(1, DIAS_VECINOS_MAXIMOS + 1):
        cercanos = [
            d for d in viaje.Cronograma if abs((d.Fecha - dia.Fecha).days) == distancia
        ]
        actividades = [a for d in cercanos for a in por_dia.get(d.IdDiaCronograma, [])]
        puntos, direcciones = _referencia_de_actividades(actividades)
        if puntos:
            return puntos, direcciones
    return [], []


def _estado_pendiente(db: Session) -> EstadoSugerenciaActividad:
    estado = db.scalar(
        select(EstadoSugerenciaActividad).where(EstadoSugerenciaActividad.Nombre == "pendiente")
    )
    if estado is None:
        logger.error("Falta el estado 'pendiente' en EstadosSugerenciasActividades (¿migración?)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El asistente no está configurado correctamente.",
        )
    return estado


def _estado_por_nombre(db: Session, nombre: str) -> EstadoSugerenciaActividad:
    estado = db.scalar(
        select(EstadoSugerenciaActividad).where(
            func.lower(EstadoSugerenciaActividad.Nombre) == nombre
        )
    )
    if estado is None:
        logger.error(
            "Falta el estado '%s' en EstadosSugerenciasActividades (¿migración?)", nombre
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El asistente no está configurado correctamente.",
        )
    return estado


def _serializar(sugerencia: SugerenciaActividad, estado: str | None = None) -> SugerenciaActividadRead:
    if estado is None:
        estado = sugerencia.Estado.Nombre if sugerencia.Estado is not None else "pendiente"
    solicitud = sugerencia.Solicitud
    franja_inicio = (
        solicitud.HoraInicio.strftime("%H:%M")
        if solicitud is not None and solicitud.HoraInicio is not None
        else None
    )
    franja_fin = (
        solicitud.HoraFin.strftime("%H:%M")
        if solicitud is not None and solicitud.HoraFin is not None
        else None
    )
    return SugerenciaActividadRead(
        IdSugerenciaActividad=sugerencia.IdSugerenciaActividad,
        IdSolicitud=sugerencia.IdSolicitudSugerenciaActividad,
        IdViaje=sugerencia.IdViaje,
        IdDiaCronograma=sugerencia.IdDiaCronograma,
        Estado=estado,
        Nombre=sugerencia.Nombre,
        Descripcion=sugerencia.Descripcion,
        HoraInicio=sugerencia.HoraInicio.strftime("%H:%M"),
        HoraFin=sugerencia.HoraFin.strftime("%H:%M"),
        GooglePlaceId=sugerencia.GooglePlaceId,
        LugarNombre=sugerencia.LugarNombre,
        LugarDireccion=sugerencia.LugarDireccion,
        Lat=sugerencia.Lat,
        Lng=sugerencia.Lng,
        SitioWebUrl=sugerencia.SitioWebUrl,
        TieneFoto=bool(sugerencia.FotoReferencia),
        CostoEstimadoARS=float(sugerencia.CostoEstimadoARS),
        Motivo=sugerencia.Motivo,
        FechaCreacion=sugerencia.FechaCreacion,
        FranjaInicio=franja_inicio,
        FranjaFin=franja_fin,
    )


def _cerrar_solicitud(
    db: Session, id_solicitud: int, estado: str, cantidad: int = 0, codigo: str | None = None
) -> None:
    db.execute(
        update(SolicitudSugerenciaActividad)
        .where(SolicitudSugerenciaActividad.IdSolicitudSugerenciaActividad == id_solicitud)
        .values(Estado=estado, CantidadSugerencias=cantidad, CodigoError=codigo, FechaFin=func.now())
    )
    db.commit()


def _elegir_destino(viaje, puntos: list[tuple[float, float]]) -> tuple[str, float | None, float | None]:
    """Destino de referencia: el más cercano a los puntos de referencia (actividades del día
    o de días vecinos); si no hay puntos, el primero del viaje."""
    destinos = [rel.Destino for rel in viaje.Destinos if rel.Destino is not None]
    if not destinos:
        return viaje.Titulo, None, None

    elegido = destinos[0]
    if puntos:
        lat_c = sum(p[0] for p in puntos) / len(puntos)
        lng_c = sum(p[1] for p in puntos) / len(puntos)
        con_coordenadas = [d for d in destinos if d.Lat is not None and d.Lng is not None]
        if con_coordenadas:
            elegido = min(con_coordenadas, key=lambda d: distancia_km(lat_c, lng_c, d.Lat, d.Lng))

    nombre = (elegido.Nombre or "").strip()
    pais = (getattr(elegido, "Pais", None) or "").strip()
    # Evita "España, España" cuando el destino es directamente el país.
    if pais and pais.lower() != nombre.lower():
        nombre = f"{nombre}, {pais}"
    return nombre or viaje.Titulo, elegido.Lat, elegido.Lng


def _segundos_restantes(inicio_total: float) -> float:
    return settings.ai_suggestions_total_timeout_seconds - (reloj.monotonic() - inicio_total)


@router.get(
    "/{trip_id}/sugerencias-actividades",
    response_model=list[SugerenciaActividadRead],
)
def listar_sugerencias_pendientes(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Sugerencias visibles del viaje: pendientes y en votación"""
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    filas = db.scalars(
        select(SugerenciaActividad)
        .join(SugerenciaActividad.Estado)
        .options(
            selectinload(SugerenciaActividad.Estado),
            selectinload(SugerenciaActividad.Solicitud),
        )
        .where(
            SugerenciaActividad.IdViaje == trip_id,
            EstadoSugerenciaActividad.Nombre.in_(ESTADOS_SUGERENCIA_VISIBLES),
        )
        .order_by(SugerenciaActividad.IdDiaCronograma, SugerenciaActividad.HoraInicio)
    ).all()
    return [_serializar(fila) for fila in filas]


@router.get(
    "/{trip_id}/sugerencias-actividades/contexto",
    response_model=ContextoSugerenciasRead,
)
def obtener_contexto_sugerencias(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    aceptadas = _participaciones_aceptadas(viaje)
    preferencias = _preferencias_del_grupo(db, aceptadas)
    mia = next((p for p in aceptadas if p.IdUsuario == current_user.IdUsuario), None)
    ids_con_prefs = {p.IdParticipanteViaje for p in preferencias}
    restantes = _restantes(db, trip_id)

    return ContextoSugerenciasRead(
        PuedeSolicitar=mia is not None and not is_trip_finished(viaje) and restantes > 0,
        LimiteDiario=settings.ai_suggestions_daily_limit,
        SolicitudesRestantes=restantes,
        ParticipantesTotal=len(aceptadas),
        ParticipantesConPreferencias=len(preferencias),
        MisPreferenciasConfiguradas=mia is not None and mia.IdParticipanteViaje in ids_con_prefs,
    )


@router.get("/{trip_id}/sugerencias-actividades/{sugerencia_id}/foto")
async def obtener_foto_sugerencia(
    trip_id: int,
    sugerencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Foto del lugar sugerido, servida por proxy propio: la API key de Google no sale del backend."""
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    referencia = db.scalar(
        select(SugerenciaActividad.FotoReferencia).where(
            SugerenciaActividad.IdSugerenciaActividad == sugerencia_id,
            SugerenciaActividad.IdViaje == trip_id,
        )
    )
    if not referencia or not PATRON_FOTO.match(referencia) or not settings.google_maps_api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no disponible")

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            respuesta = await client.get(
                URL_FOTO_GOOGLE.format(nombre=referencia),
                params={"maxWidthPx": 800},
                headers={"X-Goog-Api-Key": settings.google_maps_api_key},
            )
    except httpx.HTTPError as error:
        logger.warning("No se pudo descargar la foto de la sugerencia %s: %s", sugerencia_id, error)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Foto no disponible")

    tipo = respuesta.headers.get("content-type", "")
    if respuesta.status_code != 200 or not tipo.startswith("image/"):
        logger.warning("Google respondió %s al pedir la foto de la sugerencia %s", respuesta.status_code, sugerencia_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no disponible")

    return Response(
        content=respuesta.content,
        media_type=tipo,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post(
    "/{trip_id}/sugerencias-actividades/{sugerencia_id}/descartar",
    response_model=SugerenciaActividadRead,
)
def descartar_sugerencia(
    trip_id: int,
    sugerencia_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Descarta una sugerencia pendiente. No consume el límite diario de solicitudes."""
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "las sugerencias de actividades")

    sugerencia = db.scalar(
        select(SugerenciaActividad)
        .options(
            selectinload(SugerenciaActividad.Estado),
            selectinload(SugerenciaActividad.Solicitud),
        )
        .where(
            SugerenciaActividad.IdSugerenciaActividad == sugerencia_id,
            SugerenciaActividad.IdViaje == trip_id,
        )
        .with_for_update()
    )
    if sugerencia is None:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "La sugerencia no existe o no pertenece a este viaje.",
            SUGGESTION_NOT_FOUND,
        )

    estado_actual = (sugerencia.Estado.Nombre if sugerencia.Estado else "").strip().lower()
    if estado_actual == ESTADO_EN_VOTACION:
        raise _error(
            status.HTTP_409_CONFLICT,
            "Esta sugerencia está en votación: no se puede descartar hasta que la votación "
            "termine o se cancele.",
            SUGGESTION_IN_VOTING,
        )
    if estado_actual != ESTADO_PENDIENTE:
        raise _error(
            status.HTTP_409_CONFLICT,
            "Solo se pueden descartar sugerencias en estado \"Pendiente\".",
            SUGGESTION_NOT_PENDING,
        )

    descartada = _estado_por_nombre(db, ESTADO_DESCARTADA)
    sugerencia.IdEstadoSugerenciaActividad = descartada.IdEstadoSugerenciaActividad
    db.commit()
    db.refresh(sugerencia)
    return _serializar(sugerencia, ESTADO_DESCARTADA)


@router.post(
    "/{trip_id}/sugerencias-actividades",
    response_model=ResultadoSugerenciasRead,
)
async def solicitar_sugerencias(
    trip_id: int,
    payload: SolicitudSugerenciasCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    suggester: ActivitySuggester = Depends(get_activity_suggester),
):
    inicio_total = reloj.monotonic()

    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "las sugerencias de actividades")

    hora_inicio = payload.HoraInicio.replace(second=0, microsecond=0, tzinfo=None)
    hora_fin = payload.HoraFin.replace(second=0, microsecond=0, tzinfo=None)
    franja_inicio, franja_fin = minutos_de(hora_inicio), minutos_de(hora_fin)
    if franja_fin <= franja_inicio:
        raise _error(400, "La hora de fin debe ser posterior a la hora de inicio.", SLOT_INVALID)
    if franja_fin - franja_inicio < DURACION_MINIMA_FRANJA_MINUTOS:
        raise _error(400, "La franja horaria debe durar al menos una hora.", SLOT_INVALID)

    if payload.DistanciaMaximaKm is not None and payload.DistanciaMaximaKm not in DISTANCIAS_PERMITIDAS_KM:
        raise _error(400, "La distancia de búsqueda seleccionada no es válida.", SLOT_INVALID)
    # Distancia elegida por el usuario en el sheet (5, 15 o 30 km); si no llega, la de configuración.
    max_km = float(payload.DistanciaMaximaKm or settings.ai_suggestions_max_distance_km)

    dia: DiaCronograma | None = next(
        (d for d in viaje.Cronograma if d.IdDiaCronograma == payload.IdDiaCronograma), None
    )
    if dia is None:
        raise _error(404, "El día seleccionado no pertenece a este viaje.", DAY_NOT_FOUND)
    hoy_local = datetime.now(_zona_horaria()).date()
    if dia.Fecha < hoy_local:
        raise _error(400, "No se pueden pedir sugerencias para un día que ya pasó.", DAY_IN_PAST)

    aceptadas = _participaciones_aceptadas(viaje)
    preferencias = _preferencias_del_grupo(db, aceptadas)
    if not preferencias and not payload.ContinuarSinPreferencias:
        raise _error(409, MENSAJE_SIN_PREFERENCIAS, NO_PREFERENCES)

    max_resultados = max(1, min(settings.ai_suggestions_max_results, 5))
    id_solicitud, filas = await _generar_sugerencias_franja(
        db,
        viaje,
        current_user,
        suggester,
        dia,
        hora_inicio,
        hora_fin,
        preferencias,
        indicacion=payload.Indicacion,
        max_km=max_km,
        max_resultados=max_resultados,
        inicio_total=inicio_total,
    )
    return ResultadoSugerenciasRead(
        IdSolicitud=id_solicitud,
        Sugerencias=[_serializar(fila, ESTADO_PENDIENTE) for fila in filas],
        Mensaje=None if filas else MENSAJE_SIN_OPCIONES,
        SolicitudesRestantes=_restantes(db, trip_id),
        LimiteDiario=settings.ai_suggestions_daily_limit,
    )


async def _generar_sugerencias_franja(
    db: Session,
    viaje,
    current_user: Usuario,
    suggester: ActivitySuggester,
    dia: DiaCronograma,
    hora_inicio: time,
    hora_fin: time,
    preferencias: list[PreferenciaPlanificacion],
    *,
    indicacion: str | None,
    max_km: float,
    max_resultados: int,
    inicio_total: float,
) -> tuple[int, list[SugerenciaActividad]]:
    """Genera y guarda las sugerencias de una franja: crea la solicitud (cuenta para el
    límite diario), llama a la IA y valida los lugares. Lo usan la solicitud puntual
    (US 87) y completar días libres (US 92), así ambas aplican las mismas reglas.

    Devuelve el id de la solicitud y las sugerencias guardadas (vacío si no quedó
    ninguna válida). Los errores se informan con HTTPException."""
    trip_id = viaje.IdViaje
    franja_inicio, franja_fin = minutos_de(hora_inicio), minutos_de(hora_fin)

    actividades_viaje = _actividades_con_lugar(db, [d.IdDiaCronograma for d in viaje.Cronograma])
    actividades_dia = [a for a in actividades_viaje if a.IdDiaCronograma == dia.IdDiaCronograma]
    ocupados = [(minutos_de(a.HoraInicio), minutos_de(a.HoraFin)) for a in actividades_dia]

    huecos = calcular_huecos(franja_inicio, franja_fin, ocupados)
    if not huecos:
        raise _error(
            409,
            "La franja ya está ocupada por otras actividades. Elegí otra franja horaria.",
            SLOT_FULL,
        )

    # ¿Dónde va a estar el grupo ese día? Primero las actividades del propio día; si no hay,
    # las de los días vecinos; si tampoco, el destino del viaje.
    puntos_referencia, direcciones_referencia = _referencia_de_actividades(actividades_dia)
    origen_referencia = "actividades del día"
    if not puntos_referencia:
        puntos_referencia, direcciones_referencia = _referencia_dias_cercanos(
            viaje, dia, actividades_viaje
        )
        origen_referencia = "actividades de días cercanos"

    destinos_viaje = [rel.Destino for rel in viaje.Destinos if rel.Destino is not None]
    if not puntos_referencia and len(destinos_viaje) > 1:
        # Con varios destinos y sin ninguna actividad cerca no hay forma de saber en cuál
        # está el grupo: se avisa antes de crear la solicitud (no descuenta del límite).
        raise _error(409, MENSAJE_SIN_REFERENCIA, NO_LOCATION_REFERENCE)

    limite = settings.ai_suggestions_daily_limit
    if _contar_solicitudes_hoy(db, trip_id) >= limite:
        raise _error(
            429,
            f"Se alcanzó el límite de {limite} solicitudes de sugerencias por día para este "
            "viaje. Podés intentar mañana o crear las actividades manualmente.",
            SUGGESTION_LIMIT_REACHED,
        )

    # Se valida antes de llamar a la IA: si falta el dato maestro no se gasta una
    # llamada ni queda una solicitud trabada "en_proceso".
    estado_pendiente = _estado_pendiente(db)

    nombres_prohibidos = nombres_a_ocultar(p.Usuario for p in viaje.Participantes)
    grupo = combinar_preferencias(preferencias, nombres_prohibidos)
    indicacion = sanitizar_texto((indicacion or "")[:300], nombres_prohibidos)[:300]

    existentes_ia = []
    existentes_reglas: list[ActividadDia] = []
    for actividad in actividades_dia:
        lugar = _lugar_de(actividad)
        inicio_a, fin_a = minutos_de(actividad.HoraInicio), minutos_de(actividad.HoraFin)
        existentes_reglas.append(
            ActividadDia(
                nombre=actividad.Nombre,
                inicio=inicio_a,
                fin=fin_a,
                place_id=lugar.GooglePlaceId if lugar else None,
                lat=lugar.Lat if lugar else None,
                lng=lugar.Lng if lugar else None,
            )
        )
        existentes_ia.append(
            {
                "nombre": sanitizar_texto(actividad.Nombre, nombres_prohibidos),
                "inicio": hhmm(inicio_a),
                "fin": hhmm(fin_a),
                "lugar": sanitizar_texto(lugar.Nombre, nombres_prohibidos) if lugar else None,
            }
        )

    destino_nombre, destino_lat, destino_lng = _elegir_destino(viaje, puntos_referencia)
    if not puntos_referencia:
        origen_referencia = "destino del viaje"
        if destino_lat is not None and destino_lng is not None:
            puntos_referencia = [(destino_lat, destino_lng)]
    centro_busqueda = puntos_referencia[0] if puntos_referencia else None

    excluidos = {
        normalizar_id(lugar.GooglePlaceId)
        for lugar in (_lugar_de(a) for a in actividades_viaje)
        if lugar is not None
    }
    # No repetir lugares ya sugeridos que siguen pendientes o están en votación.
    previas_visibles = db.scalars(
        select(SugerenciaActividad.GooglePlaceId)
        .join(SugerenciaActividad.Estado)
        .where(
            SugerenciaActividad.IdViaje == trip_id,
            EstadoSugerenciaActividad.Nombre.in_(ESTADOS_SUGERENCIA_VISIBLES),
        )
    ).all()
    excluidos |= {normalizar_id(pid) for pid in previas_visibles}

    # No repetir lugares de sugerencias descartadas para esta franja: mismo día y horario
    descartadas_franja = db.execute(
        select(SugerenciaActividad.GooglePlaceId, SugerenciaActividad.LugarNombre)
        .join(SugerenciaActividad.Estado)
        .where(
            SugerenciaActividad.IdViaje == trip_id,
            SugerenciaActividad.IdDiaCronograma == dia.IdDiaCronograma,
            EstadoSugerenciaActividad.Nombre == ESTADO_DESCARTADA,
            SugerenciaActividad.HoraInicio < hora_fin,
            SugerenciaActividad.HoraFin > hora_inicio,
        )
    ).all()
    excluidos |= {normalizar_id(fila.GooglePlaceId) for fila in descartadas_franja}
    lugares_descartados = list(
        dict.fromkeys(fila.LugarNombre for fila in descartadas_franja if fila.LugarNombre)
    )

    contexto_ia = {
        "destino": destino_nombre,
        "zona_de_referencia": {
            "origen": origen_referencia,
            "direcciones": [
                sanitizar_texto(d, nombres_prohibidos)
                for d in direcciones_referencia[:MAX_DIRECCIONES_REFERENCIA]
            ],
        },
        "fecha": dia.Fecha.isoformat(),
        "franja": {"inicio": hhmm(franja_inicio), "fin": hhmm(franja_fin)},
        "huecos_libres": [f"{hhmm(i)}-{hhmm(f)}" for i, f in huecos],
        "actividades_existentes": existentes_ia,
        "preferencias_del_grupo": {
            "participantes_con_preferencias": len(preferencias),
            "intereses_por_popularidad": grupo["intereses"],
            "ritmo": grupo["ritmo"],
            "presupuesto_diario_promedio_ars": (
                float(grupo["presupuesto_promedio"]) if grupo["presupuesto_promedio"] else None
            ),
            "consideraciones_adicionales": grupo["consideraciones"],
        },
        "cantidad_maxima": max_resultados,
        # Se piden el doble de candidatas porque varias se descartan en las validaciones.
        "cantidad_candidatas": max_resultados * 2,
        "lugares_a_evitar": lugares_descartados,
        "indicacion_para_esta_busqueda": indicacion or None,
        "distancia_maxima_km": max_km,
        "moneda": "ARS",
    }
    reglas = ReglasValidacion(
        franja_inicio=franja_inicio,
        franja_fin=franja_fin,
        actividades=existentes_reglas,
        place_ids_excluidos=excluidos,
        presupuesto_maximo=grupo["presupuesto_promedio"],
        puntos_referencia=puntos_referencia,
        max_km=max_km,
        max_resultados=max_resultados,
        destino_nombre=destino_nombre,
        centro_busqueda=centro_busqueda,
    )
    id_dia = dia.IdDiaCronograma
    id_usuario = current_user.IdUsuario

    db.execute(
        update(SolicitudSugerenciaActividad)
        .where(
            SolicitudSugerenciaActividad.IdViaje == trip_id,
            SolicitudSugerenciaActividad.Estado == "en_proceso",
            SolicitudSugerenciaActividad.FechaSolicitud
            < datetime.now(timezone.utc) - timedelta(seconds=SEGUNDOS_SOLICITUD_ABANDONADA),
        )
        .values(Estado="fallida", CodigoError="ABANDONADA", FechaFin=func.now())
    )
    solicitud = SolicitudSugerenciaActividad(
        IdViaje=trip_id,
        IdUsuario=id_usuario,
        IdDiaCronograma=id_dia,
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        Estado="en_proceso",
    )
    db.add(solicitud)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _error(
            409,
            "Ya hay una solicitud de sugerencias en curso para este día. Esperá unos segundos.",
            REQUEST_IN_PROGRESS,
        )
    id_solicitud = solicitud.IdSolicitudSugerenciaActividad

    logger.info(
        "Solicitud de sugerencias %s: destino=%r referencia=%s (%s puntos) centro=%s "
        "max_km=%s presupuesto=%s huecos=%s",
        id_solicitud,
        destino_nombre,
        origen_referencia,
        len(puntos_referencia),
        centro_busqueda,
        max_km,
        grupo["presupuesto_promedio"],
        contexto_ia["huecos_libres"],
    )

    try:
        crudo = await suggester.sugerir(contexto_ia)
        respuesta = validar_esquema(crudo)
        segundos = max(3.0, _segundos_restantes(inicio_total))
        validas = await filtrar_sugerencias(respuesta, reglas, buscar_lugares_google, segundos)

        # Reintento: solo si quedaron pocas y hay tiempo para otra llamada completa (RNF-34).
        if (
            len(validas) < MIN_SUGERENCIAS_DESEADAS
            and _segundos_restantes(inicio_total) > settings.ai_suggestions_timeout_seconds + 3
        ):
            logger.info(
                "Solicitud %s: solo %s sugerencias válidas, se reintenta una vez",
                id_solicitud,
                len(validas),
            )
            contexto_retry = {
                **contexto_ia,
                "lugares_a_evitar": lugares_descartados
                + [s.lugar_nombre for s in respuesta.sugerencias],
            }
            reglas_retry = replace(
                reglas,
                place_ids_excluidos=reglas.place_ids_excluidos
                | {normalizar_id(s.place_id) for s in validas},
                max_resultados=max_resultados - len(validas),
            )
            try:
                crudo_retry = await suggester.sugerir(contexto_retry)
                respuesta_retry = validar_esquema(crudo_retry)
                segundos_retry = max(3.0, _segundos_restantes(inicio_total))
                validas += await filtrar_sugerencias(
                    respuesta_retry, reglas_retry, buscar_lugares_google, segundos_retry
                )
            except SuggestionError as error:
                # Si falla el reintento, se devuelve lo que ya se tenía.
                logger.warning(
                    "Solicitud %s: falló el reintento de sugerencias (%s)", id_solicitud, error.code
                )
    except SuggestionError as error:
        _cerrar_solicitud(db, id_solicitud, "fallida", codigo=error.code)
        raise _error(error.status_code, error.message, error.code)
    except Exception:
        logger.exception("Error inesperado al generar sugerencias de actividades")
        _cerrar_solicitud(db, id_solicitud, "fallida", codigo=AI_UNAVAILABLE)
        raise _error(503, MENSAJE_NO_DISPONIBLE, AI_UNAVAILABLE)

    if not validas:
        _cerrar_solicitud(db, id_solicitud, "sin_resultados")
        return id_solicitud, []

    filas = [
        SugerenciaActividad(
            IdSolicitudSugerenciaActividad=id_solicitud,
            IdViaje=trip_id,
            IdDiaCronograma=id_dia,
            IdEstadoSugerenciaActividad=estado_pendiente.IdEstadoSugerenciaActividad,
            Nombre=s.nombre,
            Descripcion=s.descripcion,
            HoraInicio=_a_hora(s.inicio),
            HoraFin=_a_hora(s.fin),
            GooglePlaceId=s.place_id,
            LugarNombre=s.lugar_nombre,
            LugarDireccion=s.direccion,
            Lat=s.lat,
            Lng=s.lng,
            SitioWebUrl=s.sitio_web,
            FotoReferencia=s.foto_ref,
            CostoEstimadoARS=s.costo,
            Motivo=s.motivo,
        )
        for s in validas
    ]
    db.add_all(filas)
    db.flush()
    db.execute(
        update(SolicitudSugerenciaActividad)
        .where(SolicitudSugerenciaActividad.IdSolicitudSugerenciaActividad == id_solicitud)
        .values(Estado="completada", CantidadSugerencias=len(filas), FechaFin=func.now())
    )
    db.commit()
    for fila in filas:
        db.refresh(fila)
    return id_solicitud, filas


def _a_hora(minutos: int) -> time:
    return time(minutos // 60, minutos % 60)

# --- US 88: aceptar una sugerencia ----------------------------------------------


def _sugerencia_del_viaje(db: Session, trip_id: int, sugerencia_id: int) -> SugerenciaActividad:
    sugerencia = db.scalar(
        select(SugerenciaActividad)
        .options(
            selectinload(SugerenciaActividad.Estado),
            selectinload(SugerenciaActividad.Solicitud),
        )
        .where(
            SugerenciaActividad.IdSugerenciaActividad == sugerencia_id,
            SugerenciaActividad.IdViaje == trip_id,
        )
        .with_for_update()
    )
    if sugerencia is None:
        raise _error(
            status.HTTP_404_NOT_FOUND,
            "La sugerencia no existe o no pertenece a este viaje.",
            SUGGESTION_NOT_FOUND,
        )
    return sugerencia


def _validar_aceptable(sugerencia: SugerenciaActividad) -> None:
    estado_actual = (sugerencia.Estado.Nombre if sugerencia.Estado else "").strip().lower()
    if estado_actual == ESTADO_PENDIENTE:
        return
    if estado_actual == ESTADO_ACEPTADA:
        raise _error(
            status.HTTP_409_CONFLICT,
            "Esta sugerencia ya fue aceptada y no puede volver a aceptarse.",
            SUGGESTION_ALREADY_ACCEPTED,
        )
    if estado_actual == ESTADO_EN_VOTACION:
        raise _error(
            status.HTTP_409_CONFLICT,
            "Esta sugerencia está en votación: el grupo decide si se incorpora al itinerario.",
            SUGGESTION_IN_VOTING,
        )
    raise _error(
        status.HTTP_409_CONFLICT,
        "Solo se pueden aceptar sugerencias en estado \"Pendiente\".",
        SUGGESTION_NOT_PENDING,
    )


@router.post(
    "/{trip_id}/sugerencias-actividades/{sugerencia_id}/aceptar",
    response_model=AceptacionSugerenciaRead,
)
async def aceptar_sugerencia(
    trip_id: int,
    sugerencia_id: int,
    payload: AceptarSugerenciaRequest | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Incorpora una sugerencia pendiente al itinerario (US 88).

    La actividad se crea solo con la confirmación explícita del usuario (RNF-31): esta
    llamada es esa confirmación. Si el horario se superpone con otras actividades y el
    usuario todavía no lo confirmó, no se crea nada y se devuelven las superpuestas."""
    payload = payload or AceptarSugerenciaRequest()
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "el itinerario")

    sugerencia = _sugerencia_del_viaje(db, trip_id, sugerencia_id)
    _validar_aceptable(sugerencia)

    hora_inicio = (payload.HoraInicio or sugerencia.HoraInicio).replace(
        second=0, microsecond=0, tzinfo=None
    )
    hora_fin = (payload.HoraFin or sugerencia.HoraFin).replace(second=0, microsecond=0, tzinfo=None)
    if hora_fin <= hora_inicio:
        raise _error(400, "La hora de fin debe ser posterior a la hora de inicio.", SLOT_INVALID)

    dia = db.get(DiaCronograma, sugerencia.IdDiaCronograma)
    if dia is None or dia.IdViaje != trip_id:
        raise _error(404, "El día de la sugerencia ya no forma parte del viaje.", DAY_NOT_FOUND)

    superpuestas = [
        actividad
        for actividad in db.scalars(
            select(ActividadItinerario)
            .where(ActividadItinerario.IdDiaCronograma == dia.IdDiaCronograma)
            .order_by(ActividadItinerario.HoraInicio)
        ).all()
        if actividad.HoraInicio < hora_fin and hora_inicio < actividad.HoraFin
    ]
    if superpuestas and not payload.ConfirmarSuperposicion:
        db.rollback()  # libera el bloqueo de la sugerencia: no se modificó nada
        nombres = ", ".join(f"«{a.Nombre}»" for a in superpuestas)
        return AceptacionSugerenciaRead(
            Aceptada=False,
            RequiereConfirmacion=True,
            Superpuestas=[
                ActividadSuperpuestaRead(
                    IdActividad=a.IdActividad,
                    Nombre=a.Nombre,
                    HoraInicio=a.HoraInicio.strftime("%H:%M"),
                    HoraFin=a.HoraFin.strftime("%H:%M"),
                )
                for a in superpuestas
            ],
            Mensaje=(
                f"El horario {hora_inicio:%H:%M}–{hora_fin:%H:%M} se superpone con "
                f"{nombres}. ¿Querés agregar la actividad igual?"
            ),
        )

    lugar = obtener_o_crear_lugar(db, sugerencia)
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        IdLugarInteres=lugar.IdLugarInteres if lugar is not None else None,
        Nombre=sugerencia.Nombre[:150],
        Descripcion=sugerencia.Descripcion or None,
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        Icono="location-dot",
    )
    db.add(actividad)
    aceptada = _estado_por_nombre(db, ESTADO_ACEPTADA)
    sugerencia.IdEstadoSugerenciaActividad = aceptada.IdEstadoSugerenciaActividad
    db.commit()
    db.refresh(actividad)
    db.refresh(sugerencia)

    respuesta = AceptacionSugerenciaRead(
        Aceptada=True,
        Mensaje=(
            f"Se agregó «{actividad.Nombre}» al itinerario de "
            f"{hora_inicio:%H:%M} a {hora_fin:%H:%M}."
        ),
        IdActividad=actividad.IdActividad,
        Sugerencia=_serializar(sugerencia, ESTADO_ACEPTADA),
    )
    await _avisar_actividad_aceptada(db, viaje, dia, actividad, current_user)
    return respuesta


async def _avisar_actividad_aceptada(
    db: Session, viaje, dia: DiaCronograma, actividad: ActividadItinerario, usuario: Usuario
) -> None:
    """Tiempo real, ruta del día y notificación al grupo. Ninguno bloquea la aceptación."""
    from app.api.routes.trips import (
        _actor_display_name,
        _build_actividad_read,
        _sincronizar_y_notificar_ruta,
    )

    trip_id = viaje.IdViaje
    titulo_viaje = viaje.Titulo
    try:
        await manager.broadcast(
            trip_id,
            {
                "tipo": "actividad_creada",
                "idDiaCronograma": dia.IdDiaCronograma,
                "actividad": _build_actividad_read(actividad).model_dump(by_alias=True),
            },
        )
        await manager.broadcast(trip_id, {"tipo": "sugerencias_actualizadas"})
        await _sincronizar_y_notificar_ruta(db, dia, trip_id)
    except Exception:
        logger.exception("No se pudo avisar en tiempo real la sugerencia aceptada")

    try:
        # El dispatcher central respeta consentimiento y preferencias de cada participante.
        await dispatch_trip_notification(
            db,
            TripNotificationEvent(
                notification_type=NotificationType.NUEVA_ACTIVIDAD,
                tipo="sugerencia_aceptada",
                titulo=f"Nueva actividad en {titulo_viaje}"[:150],
                mensaje=(
                    f"{_actor_display_name(usuario)} agregó {actividad.Nombre} al itinerario "
                    "desde las sugerencias del asistente."
                ),
                id_viaje=trip_id,
                id_usuario_actor=usuario.IdUsuario,
                data={
                    "eventType": "activity_created",
                    "dayId": dia.IdDiaCronograma,
                    "activityId": actividad.IdActividad,
                },
            ),
        )
    except Exception:
        logger.exception("No se pudo notificar la sugerencia aceptada")


# --- US 92: completar días libres -----------------------------------------------


def _franjas_libres(db: Session, viaje) -> list:
    ids_dias = [d.IdDiaCronograma for d in viaje.Cronograma]
    actividades_por_dia: dict[int, list[ActividadItinerario]] = {}
    if ids_dias:
        for actividad in db.scalars(
            select(ActividadItinerario).where(ActividadItinerario.IdDiaCronograma.in_(ids_dias))
        ).all():
            actividades_por_dia.setdefault(actividad.IdDiaCronograma, []).append(actividad)
    hoy = datetime.now(_zona_horaria()).date()
    return detectar_franjas_libres(viaje.Cronograma, actividades_por_dia, hoy)


def _max_sugerencias_por_franja() -> int:
    return max(1, min(settings.ai_suggestions_max_results, MAX_SUGERENCIAS_POR_FRANJA))


@router.get(
    "/{trip_id}/sugerencias-actividades/franjas-libres",
    response_model=FranjasLibresRead,
)
def obtener_franjas_libres(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Días sin actividades y franjas libres de al menos tres horas (09:00 a 22:00) de
    los días posteriores a hoy. Solo para participantes actuales de viajes en curso."""
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "las sugerencias de actividades")

    franjas = _franjas_libres(db, viaje)
    return FranjasLibresRead(
        Franjas=[
            FranjaLibreRead(
                IdDiaCronograma=f.id_dia,
                Fecha=f.fecha,
                IndiceDia=f.indice_dia,
                HoraInicio=hhmm(f.inicio),
                HoraFin=hhmm(f.fin),
                DiaCompleto=f.dia_completo,
            )
            for f in franjas
        ],
        ItinerarioCompleto=not franjas,
        Mensaje=None if franjas else MENSAJE_ITINERARIO_COMPLETO,
        SolicitudesRestantes=_restantes(db, trip_id),
        LimiteDiario=settings.ai_suggestions_daily_limit,
        MaxSugerenciasPorFranja=_max_sugerencias_por_franja(),
    )


@router.post(
    "/{trip_id}/sugerencias-actividades/completar-dias-libres",
    response_model=ResultadoCompletarDiasLibresRead,
)
async def completar_dias_libres(
    trip_id: int,
    payload: CompletarDiasLibresRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    suggester: ActivitySuggester = Depends(get_activity_suggester),
):
    """Genera hasta tres sugerencias por cada franja libre seleccionada (US 92).

    Cada franja es una solicitud dentro del límite diario del viaje (RNF-36): si se
    eligen más franjas que solicitudes disponibles no se genera ninguna. Un error en
    una franja (por ejemplo, la ocuparon mientras tanto) no cancela las demás."""
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "las sugerencias de actividades")

    if not payload.Franjas:
        raise _error(400, "Seleccioná al menos una franja libre para completar.", SLOT_INVALID)
    if payload.DistanciaMaximaKm is not None and payload.DistanciaMaximaKm not in DISTANCIAS_PERMITIDAS_KM:
        raise _error(400, "La distancia de búsqueda seleccionada no es válida.", SLOT_INVALID)
    max_km = float(payload.DistanciaMaximaKm or settings.ai_suggestions_max_distance_km)

    hoy = datetime.now(_zona_horaria()).date()
    dias = {d.IdDiaCronograma: d for d in viaje.Cronograma}
    # (IdDiaCronograma, Fecha, inicio, fin): se guardan los valores y no los objetos,
    # porque cada franja hace commit y expira los objetos de la sesión.
    franjas: list[tuple[int, date, time, time]] = []
    for franja in payload.Franjas:
        dia = dias.get(franja.IdDiaCronograma)
        if dia is None:
            raise _error(404, "Uno de los días seleccionados no pertenece a este viaje.", DAY_NOT_FOUND)
        if dia.Fecha <= hoy:
            raise _error(
                400,
                "Solo se pueden completar días posteriores a la fecha actual.",
                DAY_IN_PAST,
            )
        inicio = franja.HoraInicio.replace(second=0, microsecond=0, tzinfo=None)
        fin = franja.HoraFin.replace(second=0, microsecond=0, tzinfo=None)
        inicio_min, fin_min = minutos_de(inicio), minutos_de(fin)
        if (
            fin_min - inicio_min < DURACION_MINIMA_FRANJA_LIBRE_MINUTOS
            or inicio_min < INICIO_VENTANA_MINUTOS
            or fin_min > FIN_VENTANA_MINUTOS
        ):
            raise _error(
                400,
                "Cada franja debe durar al menos tres horas entre las 09:00 y las 22:00.",
                SLOT_INVALID,
            )
        clave = (dia.IdDiaCronograma, dia.Fecha, inicio, fin)
        if clave in franjas:
            raise _error(400, "Seleccionaste la misma franja más de una vez.", SLOT_INVALID)
        franjas.append(clave)

    limite = settings.ai_suggestions_daily_limit
    restantes = _restantes(db, trip_id)
    if len(franjas) > restantes:
        disponibles = (
            f"solo queda {restantes} solicitud disponible"
            if restantes == 1
            else f"solo quedan {restantes} solicitudes disponibles"
        )
        raise _error(
            429,
            f"Seleccionaste {len(franjas)} franjas, pero hoy {disponibles} de las {limite} "
            "diarias del viaje. Cada franja cuenta como una solicitud: elegí menos franjas o "
            "intentá mañana.",
            SUGGESTION_LIMIT_REACHED,
        )

    aceptadas = _participaciones_aceptadas(viaje)
    preferencias = _preferencias_del_grupo(db, aceptadas)
    if not preferencias and not payload.ContinuarSinPreferencias:
        raise _error(409, MENSAJE_SIN_PREFERENCIAS, NO_PREFERENCES)

    max_resultados = _max_sugerencias_por_franja()
    resultados: list[ResultadoFranjaRead] = []
    hubo_sugerencias = False
    for id_dia, fecha, inicio, fin in franjas:
        base = {
            "IdDiaCronograma": id_dia,
            "Fecha": fecha,
            "HoraInicio": inicio.strftime("%H:%M"),
            "HoraFin": fin.strftime("%H:%M"),
        }
        try:
            # Cada franja es una solicitud propia, con su propio tiempo máximo (RNF-34).
            _, filas = await _generar_sugerencias_franja(
                db,
                viaje,
                current_user,
                suggester,
                db.get(DiaCronograma, id_dia),
                inicio,
                fin,
                preferencias,
                indicacion=None,
                max_km=max_km,
                max_resultados=max_resultados,
                inicio_total=reloj.monotonic(),
            )
        except HTTPException as error:
            resultados.append(
                ResultadoFranjaRead(
                    **base,
                    Mensaje=str(error.detail),
                    CodigoError=(error.headers or {}).get("X-Error-Code"),
                )
            )
            continue
        hubo_sugerencias = hubo_sugerencias or bool(filas)
        resultados.append(
            ResultadoFranjaRead(
                **base,
                Sugerencias=[_serializar(fila, ESTADO_PENDIENTE) for fila in filas],
                Mensaje=None if filas else MENSAJE_SIN_OPCIONES,
            )
        )

    if hubo_sugerencias:
        try:
            await manager.broadcast(trip_id, {"tipo": "sugerencias_actualizadas"})
        except Exception:
            logger.exception("No se pudo avisar en tiempo real las sugerencias generadas")

    return ResultadoCompletarDiasLibresRead(
        Resultados=resultados,
        SolicitudesRestantes=_restantes(db, trip_id),
        LimiteDiario=limite,
    )
