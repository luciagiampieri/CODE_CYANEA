import logging
import re
import time as reloj
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
ESTADOS_QUE_CUENTAN = ("en_proceso", "completada", "sin_resultados")  

# Formato del nombre de foto que devuelve Google Places (New): places/<id>/photos/<ref>.
PATRON_FOTO = re.compile(r"^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$")
URL_FOTO_GOOGLE = "https://places.googleapis.com/v1/{nombre}/media"

MENSAJE_SIN_PREFERENCIAS = (
    "Ningún participante configuró sus preferencias de planificación. Podés continuar y "
    "el asistente usará criterios generales."
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


def _serializar(sugerencia: SugerenciaActividad, estado: str = "pendiente") -> SugerenciaActividadRead:
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


def _elegir_destino(viaje, puntos_dia: list[tuple[float, float]]) -> tuple[str, float | None, float | None]:
    """Destino de referencia: el más cercano a las actividades del día; si el día está vacío,
    el primero del viaje."""
    destinos = [rel.Destino for rel in viaje.Destinos if rel.Destino is not None]
    if not destinos:
        return viaje.Titulo, None, None

    elegido = destinos[0]
    if puntos_dia:
        lat_c = sum(p[0] for p in puntos_dia) / len(puntos_dia)
        lng_c = sum(p[1] for p in puntos_dia) / len(puntos_dia)
        con_coordenadas = [d for d in destinos if d.Lat is not None and d.Lng is not None]
        if con_coordenadas:
            elegido = min(con_coordenadas, key=lambda d: distancia_km(lat_c, lng_c, d.Lat, d.Lng))

    nombre = f"{elegido.Nombre}, {elegido.Pais}" if getattr(elegido, "Pais", None) else elegido.Nombre
    return nombre, elegido.Lat, elegido.Lng


@router.get(
    "/{trip_id}/sugerencias-actividades",
    response_model=list[SugerenciaActividadRead],
)
def listar_sugerencias_pendientes(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    filas = db.scalars(
        select(SugerenciaActividad)
        .join(SugerenciaActividad.Estado)
        .where(
            SugerenciaActividad.IdViaje == trip_id,
            EstadoSugerenciaActividad.Nombre == "pendiente",
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


    limite = settings.ai_suggestions_daily_limit
    if _contar_solicitudes_hoy(db, trip_id) >= limite:
        raise _error(
            429,
            f"Se alcanzó el límite de {limite} solicitudes de sugerencias por día para este "
            "viaje. Podés intentar mañana o crear las actividades manualmente.",
            SUGGESTION_LIMIT_REACHED,
        )

    nombres_prohibidos = nombres_a_ocultar(p.Usuario for p in viaje.Participantes)
    grupo = combinar_preferencias(preferencias, nombres_prohibidos)
    indicacion = sanitizar_texto((payload.Indicacion or "")[:300], nombres_prohibidos)[:300]

    puntos_dia: list[tuple[float, float]] = []
    existentes_ia = []
    existentes_reglas: list[ActividadDia] = []
    for actividad in actividades_dia:
        lugar = _lugar_de(actividad)
        inicio_a, fin_a = minutos_de(actividad.HoraInicio), minutos_de(actividad.HoraFin)
        if lugar is not None:
            puntos_dia.append((lugar.Lat, lugar.Lng))
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

    destino_nombre, destino_lat, destino_lng = _elegir_destino(viaje, puntos_dia)
    puntos_referencia = puntos_dia or (
        [(destino_lat, destino_lng)] if destino_lat is not None and destino_lng is not None else []
    )
    centro_busqueda = puntos_referencia[0] if puntos_referencia else None

    excluidos = {
        normalizar_id(lugar.GooglePlaceId)
        for lugar in (_lugar_de(a) for a in actividades_viaje)
        if lugar is not None
    }
    pendientes_previas = db.scalars(
        select(SugerenciaActividad.GooglePlaceId)
        .join(SugerenciaActividad.Estado)
        .where(
            SugerenciaActividad.IdViaje == trip_id,
            EstadoSugerenciaActividad.Nombre == "pendiente",
        )
    ).all()
    excluidos |= {normalizar_id(pid) for pid in pendientes_previas}

    max_resultados = max(1, min(settings.ai_suggestions_max_results, 5))
    contexto_ia = {
        "destino": destino_nombre,
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
        "indicacion_para_esta_busqueda": indicacion or None,
        "distancia_maxima_km": settings.ai_suggestions_max_distance_km,
        "moneda": "ARS",
    }
    reglas = ReglasValidacion(
        franja_inicio=franja_inicio,
        franja_fin=franja_fin,
        actividades=existentes_reglas,
        place_ids_excluidos=excluidos,
        presupuesto_maximo=grupo["presupuesto_promedio"],
        puntos_referencia=puntos_referencia,
        max_km=settings.ai_suggestions_max_distance_km,
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

    try:
        crudo = await suggester.sugerir(contexto_ia)
        respuesta = validar_esquema(crudo)
        segundos = max(3.0, settings.ai_suggestions_total_timeout_seconds - (reloj.monotonic() - inicio_total))
        validas = await filtrar_sugerencias(respuesta, reglas, buscar_lugares_google, segundos)
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

    estado = _estado_pendiente(db)
    filas = [
        SugerenciaActividad(
            IdSolicitudSugerenciaActividad=id_solicitud,
            IdViaje=trip_id,
            IdDiaCronograma=id_dia,
            IdEstadoSugerenciaActividad=estado.IdEstadoSugerenciaActividad,
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
        Sugerencias=[_serializar(fila) for fila in filas],
        Mensaje=None,
        SolicitudesRestantes=_restantes(db, trip_id),
        LimiteDiario=limite,
    )


def _a_hora(minutos: int) -> time:
    return time(minutos // 60, minutos % 60)