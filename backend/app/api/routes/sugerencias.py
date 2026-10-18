import logging
import re
import time as reloj
from dataclasses import replace
from datetime import datetime, time, timedelta, timezone
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
    ContextoSugerenciasRead,
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
from app.services.activity_ai.processing import (
    ActividadDia,
    ReglasValidacion,
    buscar_lugares_google,
    distancia_km,
    filtrar_sugerencias,
    normalizar_id,
    validar_esquema,
)
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

SUGGESTION_NOT_FOUND = "SUGGESTION_NOT_FOUND"
SUGGESTION_NOT_PENDING = "SUGGESTION_NOT_PENDING"
SUGGESTION_IN_VOTING = "SUGGESTION_IN_VOTING"


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
    indicacion = sanitizar_texto((payload.Indicacion or "")[:300], nombres_prohibidos)[:300]

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

    max_resultados = max(1, min(settings.ai_suggestions_max_results, 5))
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
        return ResultadoSugerenciasRead(
            IdSolicitud=id_solicitud,
            Sugerencias=[],
            Mensaje=MENSAJE_SIN_OPCIONES,
            SolicitudesRestantes=_restantes(db, trip_id),
            LimiteDiario=limite,
        )

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

    return ResultadoSugerenciasRead(
        IdSolicitud=id_solicitud,
        Sugerencias=[_serializar(fila, "pendiente") for fila in filas],
        Mensaje=None,
        SolicitudesRestantes=_restantes(db, trip_id),
        LimiteDiario=limite,
    )


def _a_hora(minutos: int) -> time:
    return time(minutos // 60, minutos % 60)