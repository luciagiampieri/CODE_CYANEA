"""US XX - Detectar lugares y validar horarios de actividades.

Ningún test llama a servicios reales (Gemini / Google Places):
- Los tests del service y de los endpoints reemplazan las funciones externas
  (`extraer_nombre_lugar_con_gemini`, `buscar_lugar_por_nombre`,
  `buscar_lugar_en_destinos`, `obtener_detalles_lugar`) por fakes `async def`
  en el módulo donde se usan.
- Los tests de `extraer_nombre_lugar_con_gemini` y de las funciones de la API
  (New) de Google Places (`obtener_detalles_lugar`, `buscar_lugar_por_nombre`,
  `buscar_lugar_en_destinos`) usan `httpx.MockTransport`.
"""

import asyncio
import json
from datetime import date, time, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.api.routes import trips as trips_module
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_viaje import EstadoViaje
from app.models.lugar_interes import LugarInteres
from app.models.usuario import Usuario
from app.services import activity_analysis_service as servicio
from app.services import place_search as place_search_module
from app.services.activity_analysis_service import (
    analizar_horario_actividad,
    extraer_nombre_lugar_con_gemini,
    obtener_dia_semana,
    validar_intervalo_horario,
)

# 2026-12-07 es lunes (weekday 0; en Google Places el lunes es day=1).
LUNES = "2026-12-07"
MARTES = "2026-12-08"
DOMINGO = "2026-12-06"

NOMBRE_ACTIVIDAD = "Visita al Museo Nacional de Bellas Artes"
NOMBRE_LUGAR = "Museo Nacional de Bellas Artes"

# Destinos tal como los arma `trips._destinos_contexto` para el análisis.
DESTINOS = [
    {"name": "Buenos Aires", "country": "Argentina", "admin_area": None, "lat": -34.6037, "lng": -58.3816}
]

_ASYNC_CLIENT_REAL = httpx.AsyncClient


# ---------------------------------------------------------------------------
# Helpers y fakes
# ---------------------------------------------------------------------------


def _periodo(dia, abre, cierra, dia_cierre=None):
    """Un período de `opening_hours.periods` de Google (day: 0=domingo ... 6=sábado)."""
    return {
        "open": {"day": dia, "time": abre},
        "close": {"day": dia if dia_cierre is None else dia_cierre, "time": cierra},
    }


def _horarios(*periodos):
    return {"periods": list(periodos)}


def _horario_lunes():
    return _horarios(_periodo(1, "0900", "1800"))


def _dia_google(fecha):
    """Día de la semana en la convención de Google (0 = domingo)."""
    return (fecha.weekday() + 1) % 7


def _periodo_fechado(fecha, abre, cierra):
    """Período de `currentOpeningHours` (Places New): trae la fecha exacta y hour/minute."""
    marca = {"year": fecha.year, "month": fecha.month, "day": fecha.day}
    return {
        "open": {"day": _dia_google(fecha), "hour": int(abre[:2]), "minute": int(abre[2:]), "date": marca},
        "close": {"day": _dia_google(fecha), "hour": int(cierra[:2]), "minute": int(cierra[2:]), "date": marca},
    }


class ExternosFalsos:
    """Reemplaza las llamadas externas del análisis y registra cómo se usaron."""

    def __init__(self):
        self.nombre_inferido = NOMBRE_LUGAR
        self.place_id = "ChIJ-por-nombre"
        self.detalles = {"name": NOMBRE_LUGAR, "opening_hours": _horario_lunes()}
        self.error_en = None  # "gemini" | "busqueda" | "detalles"
        self.llamadas_gemini = []
        self.contextos_gemini = []
        self.llamadas_busqueda = []
        self.destinos_busqueda = []
        self.llamadas_detalles = []

    @property
    def sin_llamadas(self):
        return not (self.llamadas_gemini or self.llamadas_busqueda or self.llamadas_detalles)

    async def extraer_nombre(self, nombre_actividad, contexto_destino=None):
        self.llamadas_gemini.append(nombre_actividad)
        self.contextos_gemini.append(contexto_destino)
        if self.error_en == "gemini":
            raise RuntimeError("Gemini caído")
        return self.nombre_inferido

    async def buscar_lugar(self, query):
        """Búsqueda sin contexto: se usa cuando el análisis no recibe `destinos`."""
        self.llamadas_busqueda.append(query)
        if self.error_en == "busqueda":
            raise RuntimeError("Places caído")
        return self.place_id

    async def buscar_en_destinos(self, query, destinos, max_distance_km=150.0):
        """Búsqueda contextualizada: se usa cuando el análisis recibe `destinos`."""
        self.llamadas_busqueda.append(query)
        self.destinos_busqueda.append(destinos)
        if self.error_en == "busqueda":
            raise RuntimeError("Places caído")
        return self.place_id

    async def obtener_detalles(self, place_id):
        self.llamadas_detalles.append(place_id)
        if self.error_en == "detalles":
            raise RuntimeError("Places caído")
        return self.detalles


@pytest.fixture()
def externos(monkeypatch):
    falsos = ExternosFalsos()
    monkeypatch.setattr(servicio, "extraer_nombre_lugar_con_gemini", falsos.extraer_nombre)
    monkeypatch.setattr(servicio, "buscar_lugar_por_nombre", falsos.buscar_lugar)
    # Con `destinos` el service busca vía `place_search.buscar_lugar_en_destinos` (acceso por módulo).
    monkeypatch.setattr(place_search_module, "buscar_lugar_en_destinos", falsos.buscar_en_destinos)
    monkeypatch.setattr(servicio, "obtener_detalles_lugar", falsos.obtener_detalles)
    return falsos


@pytest.fixture(autouse=True)
def _aislar_efectos_del_endpoint(monkeypatch):
    """Los endpoints de actividades hacen broadcast, sincronizan la ruta y notifican:
    nada de eso es objeto de esta US, así que se neutraliza."""
    monkeypatch.setattr(trips_module.manager, "broadcast", AsyncMock())
    monkeypatch.setattr(trips_module, "_sincronizar_y_notificar_ruta", AsyncMock())
    monkeypatch.setattr(trips_module, "dispatch_trip_notification", AsyncMock())


def _parchear_httpx(monkeypatch, handler):
    """Hace que todo `httpx.AsyncClient(...)` use un transporte simulado."""

    def fabrica(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _ASYNC_CLIENT_REAL(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", fabrica)


def _analizar(db_session, **cambios):
    argumentos = dict(
        db=db_session,
        nombre_actividad=NOMBRE_ACTIVIDAD,
        fecha=LUNES,
        hora_inicio=time(10, 0),
        hora_fin=time(12, 0),
    )
    argumentos.update(cambios)
    return asyncio.run(analizar_horario_actividad(**argumentos))


@pytest.fixture()
def dia_cronograma(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 7), IndiceDia=1)  # lunes
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


@pytest.fixture()
def lugar_interes(db_session):
    lugar = LugarInteres(
        GooglePlaceId="ChIJ-manual",
        Nombre="Museo (ubicación manual)",
        Direccion="Av. Libertador 1473, Buenos Aires",
        Lat=-34.5886,
        Lng=-58.3925,
    )
    db_session.add(lugar)
    db_session.commit()
    db_session.refresh(lugar)
    return lugar


@pytest.fixture()
def actividad_existente(db_session, dia_cronograma):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia_cronograma.IdDiaCronograma,
        Nombre="Visita original",
        HoraInicio=time(10, 0),
        HoraFin=time(12, 0),
        Icono="location-dot",
    )
    db_session.add(actividad)
    db_session.commit()
    db_session.refresh(actividad)
    return actividad


def _payload(**cambios):
    base = {"nombre": NOMBRE_ACTIVIDAD, "horaInicio": "10:00:00", "horaFin": "12:00:00"}
    base.update(cambios)
    return base


def _crear(client, viaje, dia, headers, payload=None, **params):
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities",
        json=payload if payload is not None else _payload(),
        headers=headers,
        params=params,
    )


def _modificar(client, viaje, dia, actividad, headers, payload, **params):
    return client.put(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities/{actividad.IdActividad}",
        json=payload,
        headers=headers,
        params=params,
    )


def _cantidad_actividades(db_session, dia):
    return db_session.query(ActividadItinerario).filter_by(IdDiaCronograma=dia.IdDiaCronograma).count()


# ---------------------------------------------------------------------------
# validar_intervalo_horario / obtener_dia_semana (lógica pura)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("fecha,esperado", [(LUNES, 0), (MARTES, 1), (DOMINGO, 6)])
def test_obtener_dia_semana_devuelve_weekday_de_python(fecha, esperado):
    assert obtener_dia_semana(fecha) == esperado


@pytest.mark.parametrize("dia_google,dia_python", [(0, 6), (1, 0), (3, 2), (6, 5)])
def test_dia_de_google_se_mapea_al_dia_de_python(dia_google, dia_python):
    """Google usa 0=domingo; Python usa 0=lunes. Solo el día correcto aplica."""
    datos = _horarios(_periodo(dia_google, "0900", "1800"))

    en_su_dia = validar_intervalo_horario(time(10), time(12), dia_python, datos)
    en_otro_dia = validar_intervalo_horario(time(10), time(12), (dia_python + 1) % 7, datos)

    assert en_su_dia["incompatible"] is False
    assert en_otro_dia["incompatible"] is True


@pytest.mark.parametrize("datos", [None, {}, {"open_now": True}], ids=["none", "vacio", "sin_periods"])
def test_cp8_sin_informacion_confiable_no_se_asume_cerrado(datos):
    resultado = validar_intervalo_horario(time(10), time(12), 0, datos)

    assert resultado["verificado"] is False
    assert resultado["incompatible"] is False
    assert "No se dispone de información" in resultado["mensaje"]


@pytest.mark.parametrize(
    "inicio,fin",
    [(time(10), time(12)), (time(9), time(18)), (time(9), time(10)), (time(17), time(18))],
    ids=["interior", "borde_apertura_y_cierre", "borde_apertura", "borde_cierre"],
)
def test_cp4_horario_dentro_de_apertura_es_compatible(inicio, fin):
    resultado = validar_intervalo_horario(inicio, fin, 0, _horario_lunes())

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is False


@pytest.mark.parametrize(
    "inicio,fin",
    [(time(17), time(19)), (time(8), time(10)), (time(7), time(8)), (time(19), time(20))],
    ids=["termina_despues_del_cierre", "empieza_antes_de_abrir", "antes_de_abrir", "despues_de_cerrar"],
)
def test_cp5_horario_fuera_de_apertura_informa_los_horarios_y_sugiere_modificar(inicio, fin):
    resultado = validar_intervalo_horario(inicio, fin, 0, _horario_lunes())

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is True
    assert resultado["horarios_apertura"] == "09:00 - 18:00"
    assert "09:00 - 18:00" in resultado["mensaje"]
    assert "modificar" in resultado["mensaje"].lower()


def test_cp6_dia_sin_horarios_de_apertura_informa_el_cierre():
    # Solo abre los lunes; la actividad es un domingo (weekday 6).
    resultado = validar_intervalo_horario(time(10), time(12), 6, _horario_lunes())

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is True
    assert "no cuenta con horarios de apertura para este día" in resultado["mensaje"]


@pytest.mark.parametrize(
    "inicio,fin,incompatible",
    [
        (time(10), time(12), False),   # dentro de la franja de la mañana
        (time(17), time(19), False),   # dentro de la franja de la tarde
        (time(12), time(17), True),    # cruza el corte del mediodía
        (time(13), time(16), True),    # justo en el corte
    ],
    ids=["manana", "tarde", "cruza_el_corte", "en_el_corte"],
)
def test_franjas_partidas_del_mismo_dia(inicio, fin, incompatible):
    datos = _horarios(_periodo(1, "0900", "1300"), _periodo(1, "1600", "2000"))

    resultado = validar_intervalo_horario(inicio, fin, 0, datos)

    assert resultado["incompatible"] is incompatible
    if incompatible:
        assert resultado["horarios_apertura"] == "09:00 - 13:00, 16:00 - 20:00"


def test_periodo_sin_cierre_se_toma_como_abierto_todo_el_dia():
    """Google omite `close` cuando el lugar abre 24 horas."""
    datos = {"periods": [{"open": {"day": 1, "time": "0000"}}]}

    resultado = validar_intervalo_horario(time(8), time(23), 0, datos)

    assert resultado["incompatible"] is False


def test_cierre_pasada_la_medianoche_no_genera_advertencia_falsa():
    # Viernes (Google day=5) abre 20:00 y cierra el sábado (day=6) a las 02:00.
    datos = _horarios(_periodo(5, "2000", "0200", dia_cierre=6))

    resultado = validar_intervalo_horario(time(21), time(23), 4, datos)

    assert resultado["incompatible"] is False


def test_periods_vacio_no_se_asume_cerrado():
    resultado = validar_intervalo_horario(time(10), time(12), 0, {"periods": []})

    assert resultado["incompatible"] is False


def test_cierre_pasada_la_medianoche_cubre_la_madrugada_del_dia_siguiente():
    # Viernes 20:00 -> sábado 02:00: una actividad el sábado a las 00:30 cae dentro de la apertura.
    datos = _horarios(_periodo(5, "2000", "0200", dia_cierre=6))

    resultado = validar_intervalo_horario(time(0, 30), time(1, 30), 5, datos)

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is False


def test_formato_places_new_con_hour_y_minute():
    """Places API (New) informa la hora como {hour, minute} (y omite `minute` si es 0)."""
    datos = {
        "periods": [
            {"open": {"day": 1, "hour": 9}, "close": {"day": 1, "hour": 18, "minute": 30}},
        ]
    }

    dentro = validar_intervalo_horario(time(10), time(18, 30), 0, datos)
    fuera = validar_intervalo_horario(time(17), time(19), 0, datos)

    assert dentro["incompatible"] is False
    assert fuera["incompatible"] is True
    assert fuera["horarios_apertura"] == "09:00 - 18:30"


def test_periodo_ilegible_no_se_asume_cerrado():
    datos = {"periods": [{"open": {"day": 1}, "close": {"day": 1, "time": "1800"}}]}

    resultado = validar_intervalo_horario(time(10), time(12), 0, datos)

    assert resultado["verificado"] is False
    assert resultado["incompatible"] is False


HOY = date(2026, 12, 7)


@pytest.mark.parametrize(
    "desfase,verificado",
    [(0, True), (6, True), (7, False), (-1, False)],
    ids=["hoy", "ultimo_dia_de_la_ventana", "fuera_de_la_ventana", "fecha_pasada"],
)
def test_horarios_actuales_solo_aplican_dentro_de_los_proximos_7_dias(desfase, verificado):
    """`currentOpeningHours` cubre 7 días desde hoy; fuera de esa ventana no se puede verificar."""
    fecha = HOY + timedelta(days=desfase)
    datos = _horarios(_periodo_fechado(fecha, "0900", "1800"))

    resultado = validar_intervalo_horario(time(10), time(12), fecha.weekday(), datos, fecha=fecha, hoy=HOY)

    assert resultado["verificado"] is verificado
    assert resultado["incompatible"] is False


def test_horario_especial_de_una_fecha_concreta_se_valida_con_su_fecha():
    # Ese día (feriado) cierra a las 14:00.
    datos = _horarios(_periodo_fechado(HOY, "1000", "1400"))

    resultado = validar_intervalo_horario(time(15), time(16), HOY.weekday(), datos, fecha=HOY, hoy=HOY)

    assert resultado["incompatible"] is True
    assert resultado["horarios_apertura"] == "10:00 - 14:00"


def test_fecha_sin_periodo_en_los_horarios_actuales_se_informa_como_cerrado():
    manana = HOY + timedelta(days=1)
    datos = _horarios(_periodo_fechado(manana, "1000", "1600"))

    resultado = validar_intervalo_horario(time(10), time(12), HOY.weekday(), datos, fecha=HOY, hoy=HOY)

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is True
    assert "no cuenta con horarios de apertura para este día" in resultado["mensaje"]


def test_horarios_regulares_aplican_a_cualquier_fecha():
    """Sin fechas en los períodos no rige la ventana de 7 días."""
    resultado = validar_intervalo_horario(
        time(10), time(12), 0, _horario_lunes(), fecha=date(2027, 6, 7), hoy=HOY
    )

    assert resultado["verificado"] is True
    assert resultado["incompatible"] is False


@pytest.mark.parametrize(
    "destinos,esperado",
    [
        (None, None),
        ([], None),
        ([{"name": "Orlando", "country": "Estados Unidos"}], "Orlando, Estados Unidos"),
        ([{"name": "Orlando"}], "Orlando"),
        (
            [{"name": "Orlando", "country": "Estados Unidos"}, {"name": "Miami", "country": "Estados Unidos"}],
            "Orlando, Estados Unidos / Miami, Estados Unidos",
        ),
        ([{"name": None, "country": None}, {"name": "Miami"}], "Miami"),
        ([{"lat": 1.0, "lng": 2.0}], None),
    ],
    ids=["none", "vacio", "nombre_y_pais", "solo_nombre", "varios_destinos", "ignora_destinos_sin_nombre", "sin_nombre_ni_pais"],
)
def test_contexto_destino_texto(destinos, esperado):
    assert servicio._contexto_destino_texto(destinos) == esperado


# ---------------------------------------------------------------------------
# analizar_horario_actividad (service con externos falsos)
# ---------------------------------------------------------------------------


def test_cp1_cp2_nombre_identificable_sin_ubicacion_busca_el_lugar(db_session, externos):
    resultado = _analizar(db_session, id_lugar_interes=None)

    assert externos.llamadas_gemini == [NOMBRE_ACTIVIDAD]
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]
    assert externos.llamadas_detalles == ["ChIJ-por-nombre"]
    assert resultado == {"advertencia": False}


def test_cp3_ubicacion_asociada_es_la_referencia_principal(db_session, externos, lugar_interes):
    _analizar(db_session, id_lugar_interes=lugar_interes.IdLugarInteres)

    assert externos.llamadas_gemini == []
    assert externos.llamadas_busqueda == []
    assert externos.llamadas_detalles == ["ChIJ-manual"]


def test_ubicacion_inexistente_cae_al_analisis_por_nombre(db_session, externos):
    _analizar(db_session, id_lugar_interes=9999)

    assert externos.llamadas_gemini == [NOMBRE_ACTIVIDAD]
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]
    assert externos.llamadas_detalles == ["ChIJ-por-nombre"]


def test_cp4_horario_dentro_de_apertura_no_advierte(db_session, externos):
    resultado = _analizar(db_session, hora_inicio=time(9, 0), hora_fin=time(18, 0))

    assert resultado == {"advertencia": False}


def test_cp5_horario_fuera_de_apertura_advierte_con_los_horarios(db_session, externos):
    resultado = _analizar(db_session, hora_inicio=time(17, 0), hora_fin=time(19, 0))

    assert resultado["advertencia"] is True
    assert resultado["horarios_apertura"] == "09:00 - 18:00"
    assert "09:00 - 18:00" in resultado["mensaje"]
    assert "modificar" in resultado["mensaje"].lower()


def test_cp6_dia_cerrado_advierte_que_no_hay_horarios_ese_dia(db_session, externos):
    resultado = _analizar(db_session, fecha=DOMINGO)

    assert resultado["advertencia"] is True
    assert "no cuenta con horarios de apertura para este día" in resultado["mensaje"]


@pytest.mark.parametrize(
    "fecha,advertencia",
    [(LUNES, False), (date(2026, 12, 7), False), (MARTES, True), (date(2026, 12, 8), True)],
    ids=["lunes_str", "lunes_date", "martes_str", "martes_date"],
)
def test_el_analisis_usa_el_dia_de_la_semana_de_la_fecha(db_session, externos, fecha, advertencia):
    """El lugar solo abre los lunes; la fecha puede llegar como str o como date."""
    resultado = _analizar(db_session, fecha=fecha)

    assert resultado["advertencia"] is advertencia


def test_cp7_nombre_sin_lugar_concreto_no_valida_horarios(db_session, externos):
    externos.nombre_inferido = None

    resultado = _analizar(db_session, nombre_actividad="Descansar en el hotel")

    assert resultado == {"advertencia": False}
    assert externos.llamadas_busqueda == []
    assert externos.llamadas_detalles == []


def test_lugar_no_encontrado_en_la_busqueda_no_valida_horarios(db_session, externos):
    externos.place_id = None

    resultado = _analizar(db_session)

    assert resultado == {"advertencia": False}
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]
    assert externos.llamadas_detalles == []


def test_cp8_sin_detalles_del_lugar_no_advierte_ni_avisa(db_session, externos):
    externos.detalles = None

    resultado = _analizar(db_session, hora_inicio=time(3, 0), hora_fin=time(4, 0))

    assert resultado == {"advertencia": False}


@pytest.mark.parametrize(
    "detalles",
    [
        {"name": NOMBRE_LUGAR},
        {"name": NOMBRE_LUGAR, "opening_hours": {}},
        {"name": NOMBRE_LUGAR, "opening_hours": {"open_now": True}},
        {"name": NOMBRE_LUGAR, "current_opening_hours": {}},
        {
            "name": NOMBRE_LUGAR,
            "current_opening_hours": {},
            "opening_hours": {},
        },
        {"name": NOMBRE_LUGAR, "opening_hours": {"periods": [{"open": {"day": 1}}]}},
    ],
    ids=[
        "sin_opening_hours",
        "opening_hours_vacio",
        "sin_periods",
        "current_opening_hours_vacio",
        "ambos_vacios",
        "periodos_ilegibles",
    ],
)
def test_cp8_sin_informacion_de_horarios_no_advierte_cierre_pero_avisa(db_session, externos, detalles):
    """Sin horarios confiables no se asume cerrado: se registra y se informa un aviso."""
    externos.detalles = detalles

    resultado = _analizar(db_session, hora_inicio=time(3, 0), hora_fin=time(4, 0))

    assert resultado == {"advertencia": False, "aviso": servicio.MENSAJE_NO_VERIFICADO}


def test_ignorar_advertencia_no_consulta_ningun_servicio(db_session, externos):
    resultado = _analizar(db_session, hora_inicio=time(17), hora_fin=time(19), ignorar_advertencia=True)

    assert resultado == {"advertencia": False}
    assert externos.sin_llamadas


@pytest.mark.parametrize("componente", ["gemini", "busqueda", "detalles"])
def test_cp10_error_externo_permite_registrar_normalmente(db_session, externos, componente):
    externos.error_en = componente

    resultado = _analizar(db_session, hora_inicio=time(17), hora_fin=time(19))

    assert resultado == {"advertencia": False}


def test_con_destinos_contextualiza_gemini_y_busca_en_los_destinos(db_session, externos):
    resultado = _analizar(db_session, destinos=DESTINOS)

    assert externos.contextos_gemini == ["Buenos Aires, Argentina"]
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]
    assert externos.destinos_busqueda == [DESTINOS]
    assert externos.llamadas_detalles == ["ChIJ-por-nombre"]
    assert resultado == {"advertencia": False}


def test_sin_destinos_busca_el_lugar_sin_contexto(db_session, externos):
    _analizar(db_session, destinos=None)

    assert externos.contextos_gemini == [None]
    assert externos.destinos_busqueda == []
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]


def test_con_ubicacion_asociada_los_destinos_no_se_usan(db_session, externos, lugar_interes):
    _analizar(db_session, id_lugar_interes=lugar_interes.IdLugarInteres, destinos=DESTINOS)

    assert externos.llamadas_gemini == []
    assert externos.llamadas_busqueda == []
    assert externos.llamadas_detalles == ["ChIJ-manual"]


def test_fecha_invalida_no_consulta_ningun_servicio(db_session, externos):
    resultado = _analizar(db_session, fecha="07/12/2026")

    assert resultado == {"advertencia": False}
    assert externos.sin_llamadas


def test_horario_especial_de_la_fecha_tiene_prioridad_sobre_el_regular(db_session, externos):
    fecha = date.today() + timedelta(days=2)  # dentro de la ventana de 7 días de `currentOpeningHours`
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(_periodo_fechado(fecha, "1000", "1400")),
        "opening_hours": _horarios(_periodo(_dia_google(fecha), "0900", "1800")),
    }

    resultado = _analizar(db_session, fecha=fecha, hora_inicio=time(15), hora_fin=time(16))

    assert resultado["advertencia"] is True
    assert resultado["horarios_apertura"] == "10:00 - 14:00"
    assert resultado["nombre_lugar"] == NOMBRE_LUGAR


def test_horario_especial_fuera_de_la_ventana_cae_a_los_horarios_regulares(db_session, externos):
    fecha = date.today() + timedelta(days=30)
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(_periodo_fechado(fecha, "1000", "1400")),
        "opening_hours": _horarios(_periodo(_dia_google(fecha), "0900", "1800")),
    }

    compatible = _analizar(db_session, fecha=fecha, hora_inicio=time(15), hora_fin=time(16))
    incompatible = _analizar(db_session, fecha=fecha, hora_inicio=time(19), hora_fin=time(20))

    assert compatible == {"advertencia": False}
    assert incompatible["advertencia"] is True
    assert incompatible["horarios_apertura"] == "09:00 - 18:00"


def test_horario_especial_fuera_de_la_ventana_sin_regulares_avisa(db_session, externos):
    fecha = date.today() + timedelta(days=30)
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(_periodo_fechado(fecha, "1000", "1400")),
    }

    resultado = _analizar(db_session, fecha=fecha, hora_inicio=time(15), hora_fin=time(16))

    assert resultado == {"advertencia": False, "aviso": servicio.MENSAJE_NO_VERIFICADO}


# ---------------------------------------------------------------------------
# extraer_nombre_lugar_con_gemini (REST simulado)
# ---------------------------------------------------------------------------


def _respuesta_gemini(payload):
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


@pytest.fixture()
def gemini_configurado(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "clave-de-prueba")
    monkeypatch.setattr(settings, "ai_receipt_model", "gemini-2.5-flash")


def test_gemini_sin_api_key_no_llama_al_servicio(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200)

    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(extraer_nombre_lugar_con_gemini(NOMBRE_ACTIVIDAD)) is None
    assert pedidos == []


def test_gemini_detecta_lugar_concreto_y_arma_el_pedido(monkeypatch, gemini_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(
            200, json=_respuesta_gemini({"es_lugar_concreto": True, "nombre_lugar": "Café Tortoni"})
        )

    _parchear_httpx(monkeypatch, handler)

    resultado = asyncio.run(extraer_nombre_lugar_con_gemini("Merienda en el Café Tortoni"))

    assert resultado == "Café Tortoni"
    pedido = pedidos[0]
    assert "models/gemini-2.5-flash:generateContent" in str(pedido.url)
    assert pedido.headers["x-goog-api-key"] == "clave-de-prueba"
    cuerpo = json.loads(pedido.content)
    assert "Merienda en el Café Tortoni" in cuerpo["contents"][0]["parts"][0]["text"]
    assert cuerpo["generationConfig"]["responseMimeType"] == "application/json"
    assert cuerpo["generationConfig"]["temperature"] == 0


def test_gemini_actividad_sin_lugar_concreto_devuelve_none(monkeypatch, gemini_configurado):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(
            200, json=_respuesta_gemini({"es_lugar_concreto": False, "nombre_lugar": None})
        ),
    )

    assert asyncio.run(extraer_nombre_lugar_con_gemini("Descansar en el hotel")) is None


def _prompt_enviado(pedido):
    return json.loads(pedido.content)["contents"][0]["parts"][0]["text"]


def test_gemini_incluye_el_destino_del_viaje_en_el_prompt(monkeypatch, gemini_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(
            200, json=_respuesta_gemini({"es_lugar_concreto": True, "nombre_lugar": "Animal Kingdom"})
        )

    _parchear_httpx(monkeypatch, handler)

    resultado = asyncio.run(extraer_nombre_lugar_con_gemini("Día en Animal Kingdom", "Orlando, Estados Unidos"))

    assert resultado == "Animal Kingdom"
    assert "Orlando, Estados Unidos" in _prompt_enviado(pedidos[0])


def test_gemini_sin_destino_no_agrega_contexto_al_prompt(monkeypatch, gemini_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json=_respuesta_gemini({"es_lugar_concreto": False, "nombre_lugar": None}))

    _parchear_httpx(monkeypatch, handler)

    asyncio.run(extraer_nombre_lugar_con_gemini("Merienda en el Café Tortoni"))

    assert "El viaje tiene como destino" not in _prompt_enviado(pedidos[0])


@pytest.mark.parametrize(
    "nombre_lugar,esperado",
    [("  Café Tortoni  ", "Café Tortoni"), ("   ", None), (None, None), (123, None)],
    ids=["recorta_espacios", "solo_espacios", "nulo", "no_texto"],
)
def test_gemini_normaliza_el_nombre_del_lugar(monkeypatch, gemini_configurado, nombre_lugar, esperado):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(
            200, json=_respuesta_gemini({"es_lugar_concreto": True, "nombre_lugar": nombre_lugar})
        ),
    )

    assert asyncio.run(extraer_nombre_lugar_con_gemini(NOMBRE_ACTIVIDAD)) == esperado


def _timeout(request):
    raise httpx.ReadTimeout("demora", request=request)


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: httpx.Response(500, json={"error": {"message": "falla"}}),
        lambda request: httpx.Response(429, json={"error": {"message": "cuota"}}),
        lambda request: httpx.Response(200, json={"candidates": []}),
        lambda request: httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "no es json"}]}}]}
        ),
        lambda request: httpx.Response(200, json=_respuesta_gemini(["no", "es", "un", "objeto"])),
        _timeout,
    ],
    ids=["http_500", "http_429", "sin_candidatos", "texto_no_json", "json_no_objeto", "timeout"],
)
def test_gemini_ante_fallas_devuelve_none_sin_propagar(monkeypatch, gemini_configurado, handler):
    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(extraer_nombre_lugar_con_gemini(NOMBRE_ACTIVIDAD)) is None


# ---------------------------------------------------------------------------
# Google Places API (New): obtener_detalles_lugar / buscar_lugar_por_nombre / buscar_lugar_en_destinos
# ---------------------------------------------------------------------------


@pytest.fixture()
def places_configurado(monkeypatch):
    """Fija la API key de Places y descarta el cliente HTTP global que cachea `_get_client`
    (si no, `obtener_detalles_lugar` reutilizaría un cliente creado antes del transporte simulado)."""
    monkeypatch.setattr(settings, "google_maps_api_key", "clave-places")
    monkeypatch.setattr(place_search_module, "_client", None)


@pytest.fixture()
def places_sin_api_key(monkeypatch):
    monkeypatch.setattr(settings, "google_maps_api_key", None)
    monkeypatch.setattr(place_search_module, "_client", None)


def test_obtener_detalles_lugar_devuelve_el_nombre_y_los_horarios(monkeypatch, places_configurado):
    pedidos = []
    actuales = _horarios(_periodo(1, "1000", "1600"))

    def handler(request):
        pedidos.append(request)
        return httpx.Response(
            200,
            json={
                "id": "ChIJ-123",
                "displayName": {"text": "Museo", "languageCode": "es"},
                "currentOpeningHours": actuales,
                "regularOpeningHours": _horario_lunes(),
            },
        )

    _parchear_httpx(monkeypatch, handler)

    resultado = asyncio.run(place_search_module.obtener_detalles_lugar("ChIJ-123"))

    assert resultado == {
        "name": "Museo",
        "current_opening_hours": actuales,
        "opening_hours": _horario_lunes(),
    }
    pedido = pedidos[0]
    assert pedido.method == "GET"
    assert pedido.url.path == "/v1/places/ChIJ-123"
    assert pedido.headers["x-goog-api-key"] == "clave-places"
    campos = pedido.headers["x-goog-fieldmask"]
    assert "currentOpeningHours" in campos
    assert "regularOpeningHours" in campos
    assert dict(pedido.url.params)["languageCode"] == "es"


def test_obtener_detalles_lugar_acepta_el_place_id_con_prefijo_google(monkeypatch, places_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json={"id": "ChIJ-123"})

    _parchear_httpx(monkeypatch, handler)

    asyncio.run(place_search_module.obtener_detalles_lugar("google:ChIJ-123"))

    assert pedidos[0].url.path == "/v1/places/ChIJ-123"


def test_obtener_detalles_lugar_sin_horarios_devuelve_none_en_los_horarios(monkeypatch, places_configurado):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(200, json={"id": "ChIJ-123", "displayName": {"text": "Museo"}}),
    )

    resultado = asyncio.run(place_search_module.obtener_detalles_lugar("ChIJ-123"))

    assert resultado == {"name": "Museo", "current_opening_hours": None, "opening_hours": None}


@pytest.mark.parametrize("status_http", [403, 404, 500])
def test_obtener_detalles_lugar_con_error_http_devuelve_none(monkeypatch, places_configurado, status_http):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(status_http, json={"error": {"message": "falla"}}),
    )

    assert asyncio.run(place_search_module.obtener_detalles_lugar("ChIJ-123")) is None


def test_obtener_detalles_lugar_ante_error_de_red_devuelve_none(monkeypatch, places_configurado):
    def handler(request):
        raise httpx.ConnectError("sin red", request=request)

    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(place_search_module.obtener_detalles_lugar("ChIJ-123")) is None


def test_obtener_detalles_lugar_sin_api_key_no_llama_al_servicio(monkeypatch, places_sin_api_key):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json={})

    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(place_search_module.obtener_detalles_lugar("ChIJ-123")) is None
    assert pedidos == []


def test_buscar_lugar_por_nombre_devuelve_el_place_id_del_primer_resultado(monkeypatch, places_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(
            200,
            json={"places": [{"id": "ChIJ-primero", "displayName": {"text": "Museo"}}, {"id": "ChIJ-segundo"}]},
        )

    _parchear_httpx(monkeypatch, handler)

    resultado = asyncio.run(place_search_module.buscar_lugar_por_nombre(f"  {NOMBRE_LUGAR}  "))

    assert resultado == "google:ChIJ-primero"
    pedido = pedidos[0]
    assert pedido.method == "POST"
    assert str(pedido.url) == place_search_module.GOOGLE_PLACES_TEXT_SEARCH_URL
    assert pedido.headers["x-goog-api-key"] == "clave-places"
    assert "places.id" in pedido.headers["x-goog-fieldmask"]
    assert json.loads(pedido.content) == {"textQuery": NOMBRE_LUGAR, "languageCode": "es", "maxResultCount": 1}


@pytest.mark.parametrize(
    "cuerpo",
    [{"places": []}, {}, {"places": [{"displayName": {"text": "Sin id"}}]}],
    ids=["sin_resultados", "respuesta_vacia", "resultado_sin_id"],
)
def test_buscar_lugar_por_nombre_sin_resultados_devuelve_none(monkeypatch, places_configurado, cuerpo):
    _parchear_httpx(monkeypatch, lambda request: httpx.Response(200, json=cuerpo))

    assert asyncio.run(place_search_module.buscar_lugar_por_nombre("Lugar inexistente")) is None


@pytest.mark.parametrize("status_http", [403, 500])
def test_buscar_lugar_por_nombre_con_error_http_devuelve_none(monkeypatch, places_configurado, status_http):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(status_http, json={"error": {"message": "falla"}}),
    )

    assert asyncio.run(place_search_module.buscar_lugar_por_nombre(NOMBRE_LUGAR)) is None


def test_buscar_lugar_por_nombre_ante_error_de_red_devuelve_none(monkeypatch, places_configurado):
    def handler(request):
        raise httpx.ConnectError("sin red", request=request)

    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(place_search_module.buscar_lugar_por_nombre(NOMBRE_LUGAR)) is None


def test_buscar_lugar_por_nombre_sin_api_key_no_llama_al_servicio(monkeypatch, places_sin_api_key):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json={"places": [{"id": "ChIJ-123"}]})

    _parchear_httpx(monkeypatch, handler)

    assert asyncio.run(place_search_module.buscar_lugar_por_nombre(NOMBRE_LUGAR)) is None
    assert pedidos == []


def test_buscar_lugar_por_nombre_prioriza_la_zona_indicada(monkeypatch, places_configurado):
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json={"places": [{"id": "ChIJ-cerca"}]})

    _parchear_httpx(monkeypatch, handler)

    asyncio.run(
        place_search_module.buscar_lugar_por_nombre(NOMBRE_LUGAR, lat=-34.6, lng=-58.4, radius_meters=80000.0)
    )

    circulo = json.loads(pedidos[0].content)["locationBias"]["circle"]
    assert circulo["center"] == {"latitude": -34.6, "longitude": -58.4}
    assert circulo["radius"] == 50000.0  # Google admite como máximo 50 km


@pytest.mark.parametrize(
    "ubicacion_resultado,max_km,esperado",
    [
        ({"latitude": -34.61, "longitude": -58.38}, 150.0, "google:ChIJ-x"),  # a menos de 1 km
        ({"latitude": -31.42, "longitude": -64.19}, 150.0, None),  # Córdoba: ~650 km de Buenos Aires
        ({"latitude": -31.42, "longitude": -64.19}, 1000.0, "google:ChIJ-x"),
    ],
    ids=["cercano", "lejano_se_descarta", "lejano_dentro_del_limite"],
)
def test_buscar_lugar_por_nombre_descarta_resultados_fuera_de_la_distancia_maxima(
    monkeypatch, places_configurado, ubicacion_resultado, max_km, esperado
):
    _parchear_httpx(
        monkeypatch,
        lambda request: httpx.Response(200, json={"places": [{"id": "ChIJ-x", "location": ubicacion_resultado}]}),
    )

    resultado = asyncio.run(
        place_search_module.buscar_lugar_por_nombre(
            NOMBRE_LUGAR, lat=-34.6037, lng=-58.3816, max_distance_km=max_km
        )
    )

    assert resultado == esperado


@pytest.mark.parametrize(
    "llamar",
    [
        lambda: place_search_module.obtener_detalles_lugar("ChIJ-123"),
        lambda: place_search_module.buscar_lugar_por_nombre(NOMBRE_LUGAR),
    ],
    ids=["obtener_detalles_lugar", "buscar_lugar_por_nombre"],
)
def test_places_usa_la_google_maps_api_key_de_settings(monkeypatch, llamar):
    monkeypatch.setattr(settings, "google_maps_api_key", "clave-maps")
    monkeypatch.setattr(place_search_module, "_client", None)
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json={"places": []})

    _parchear_httpx(monkeypatch, handler)

    asyncio.run(llamar())

    assert len(pedidos) == 1
    assert pedidos[0].headers["x-goog-api-key"] == "clave-maps"


DESTINO_BA = {"name": "Buenos Aires", "country": "Argentina", "admin_area": None, "lat": -34.6037, "lng": -58.3816}
DESTINO_CBA = {"name": "Córdoba", "country": "Argentina", "admin_area": "Córdoba", "lat": -31.4201, "lng": -64.1888}


@pytest.fixture()
def busquedas_por_nombre(monkeypatch):
    """Reemplaza `buscar_lugar_por_nombre` y registra (query, lat, lng, max_distance_km).
    `resultados` se consume en orden; cuando se agota devuelve None."""

    class Falsa:
        def __init__(self):
            self.llamadas = []
            self.resultados = []

        async def __call__(self, query, lat=None, lng=None, radius_meters=50000.0, max_distance_km=None):
            self.llamadas.append((query, lat, lng, max_distance_km))
            return self.resultados.pop(0) if self.resultados else None

    falsa = Falsa()
    monkeypatch.setattr(place_search_module, "buscar_lugar_por_nombre", falsa)
    return falsa


def test_buscar_lugar_en_destinos_prueba_cada_destino_hasta_encontrar_el_lugar(busquedas_por_nombre):
    busquedas_por_nombre.resultados = [None, "google:ChIJ-cba"]

    resultado = asyncio.run(
        place_search_module.buscar_lugar_en_destinos(NOMBRE_LUGAR, [DESTINO_BA, DESTINO_CBA])
    )

    assert resultado == "google:ChIJ-cba"
    assert busquedas_por_nombre.llamadas == [
        (NOMBRE_LUGAR, -34.6037, -58.3816, 150.0),
        (NOMBRE_LUGAR, -31.4201, -64.1888, 150.0),
    ]


def test_buscar_lugar_en_destinos_corta_en_el_primer_resultado(busquedas_por_nombre):
    busquedas_por_nombre.resultados = ["google:ChIJ-ba", "google:ChIJ-cba"]

    resultado = asyncio.run(
        place_search_module.buscar_lugar_en_destinos(NOMBRE_LUGAR, [DESTINO_BA, DESTINO_CBA])
    )

    assert resultado == "google:ChIJ-ba"
    assert len(busquedas_por_nombre.llamadas) == 1


def test_buscar_lugar_en_destinos_sin_resultados_devuelve_none(busquedas_por_nombre):
    resultado = asyncio.run(
        place_search_module.buscar_lugar_en_destinos(NOMBRE_LUGAR, [DESTINO_BA, DESTINO_CBA])
    )

    assert resultado is None
    assert len(busquedas_por_nombre.llamadas) == 2


def test_buscar_lugar_en_destinos_respeta_la_distancia_maxima_indicada(busquedas_por_nombre):
    asyncio.run(place_search_module.buscar_lugar_en_destinos(NOMBRE_LUGAR, [DESTINO_BA], max_distance_km=30.0))

    assert busquedas_por_nombre.llamadas == [(NOMBRE_LUGAR, -34.6037, -58.3816, 30.0)]


@pytest.mark.parametrize(
    "destinos",
    [None, [], [{"name": "Lugar sin coordenadas", "country": "Argentina"}]],
    ids=["sin_destinos", "lista_vacia", "destino_sin_coordenadas"],
)
def test_buscar_lugar_en_destinos_sin_ubicacion_conocida_busca_sin_sesgo(
    busquedas_por_nombre, places_sin_api_key, destinos
):
    busquedas_por_nombre.resultados = ["google:ChIJ-libre"]

    resultado = asyncio.run(place_search_module.buscar_lugar_en_destinos(NOMBRE_LUGAR, destinos))

    assert resultado == "google:ChIJ-libre"
    assert busquedas_por_nombre.llamadas == [(NOMBRE_LUGAR, None, None, None)]


# ---------------------------------------------------------------------------
# Endpoint: crear actividad
# ---------------------------------------------------------------------------


def test_create_actividad_sin_ubicacion_detecta_el_lugar_y_registra_sin_advertencia(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    """CP1, CP2 y CP4 de punta a punta: nombre identificable, horario compatible."""
    viaje, _ = viaje_con_admin

    response = _crear(client, viaje, dia_cronograma, auth_headers)

    assert response.status_code == 201
    body = response.json()
    assert "advertencia" not in body
    assert body["Nombre"] == NOMBRE_ACTIVIDAD
    assert externos.llamadas_gemini == [NOMBRE_ACTIVIDAD]
    assert externos.llamadas_busqueda == [NOMBRE_LUGAR]
    assert externos.llamadas_detalles == ["ChIJ-por-nombre"]
    assert _cantidad_actividades(db_session, dia_cronograma) == 1


def test_create_actividad_con_ubicacion_asociada_usa_su_place_id(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, lugar_interes, externos
):
    """CP3 de punta a punta: la ubicación manual es la referencia principal."""
    viaje, _ = viaje_con_admin

    response = _crear(
        client, viaje, dia_cronograma, auth_headers, _payload(idLugarInteres=lugar_interes.IdLugarInteres)
    )

    assert response.status_code == 201
    assert response.json()["IdLugarInteres"] == lugar_interes.IdLugarInteres
    assert externos.llamadas_gemini == []
    assert externos.llamadas_busqueda == []
    assert externos.llamadas_detalles == ["ChIJ-manual"]
    assert _cantidad_actividades(db_session, dia_cronograma) == 1


def test_cp5_create_fuera_de_horario_devuelve_advertencia_y_no_guarda_hasta_confirmar(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = _crear(
        client, viaje, dia_cronograma, auth_headers, _payload(horaInicio="17:00:00", horaFin="19:00:00")
    )

    assert response.status_code in (200, 201)
    body = response.json()
    assert body["advertencia"] is True
    assert body["horariosApertura"] == "09:00 - 18:00"
    assert "modificar" in body["mensaje"].lower()
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


def test_cp9_create_con_ignorar_advertencia_guarda_la_actividad_sin_analizar(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = _crear(
        client,
        viaje,
        dia_cronograma,
        auth_headers,
        _payload(horaInicio="17:00:00", horaFin="19:00:00"),
        ignorar_advertencia="true",
    )

    assert response.status_code == 201
    assert response.json()["Nombre"] == NOMBRE_ACTIVIDAD
    assert externos.sin_llamadas
    assert _cantidad_actividades(db_session, dia_cronograma) == 1


@pytest.mark.parametrize("componente", ["gemini", "busqueda", "detalles"])
def test_cp10_create_con_error_externo_registra_normalmente(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos, componente
):
    viaje, _ = viaje_con_admin
    externos.error_en = componente

    response = _crear(
        client, viaje, dia_cronograma, auth_headers, _payload(horaInicio="17:00:00", horaFin="19:00:00")
    )

    assert response.status_code == 201
    assert "advertencia" not in response.json()
    assert _cantidad_actividades(db_session, dia_cronograma) == 1


def test_create_con_ubicacion_inexistente_responde_404_y_no_guarda(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = _crear(client, viaje, dia_cronograma, auth_headers, _payload(idLugarInteres=9999))

    assert response.status_code == 404
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


def test_create_con_horario_invalido_responde_422_sin_analizar(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = _crear(
        client, viaje, dia_cronograma, auth_headers, _payload(horaInicio="12:00:00", horaFin="10:00:00")
    )

    assert response.status_code == 422
    assert externos.sin_llamadas
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


def test_create_en_dia_inexistente_responde_404_sin_analizar(
    client, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/9999/activities",
        json=_payload(),
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert externos.sin_llamadas


def test_create_por_usuario_ajeno_al_viaje_responde_403_sin_analizar(
    client, db_session, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin
    ajeno = Usuario(
        Nombre="Ajeno",
        Apellido="Test",
        NombreUsuario="ajeno_horarios",
        Email="ajeno_horarios@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(ajeno)
    db_session.commit()
    db_session.refresh(ajeno)
    headers = {"Authorization": f"Bearer {create_access_token({'sub': ajeno.Email, 'user_id': ajeno.IdUsuario})}"}

    response = _crear(client, viaje, dia_cronograma, headers)

    assert response.status_code == 403
    assert externos.sin_llamadas
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


def test_create_en_viaje_finalizado_responde_409_sin_analizar(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin
    estado_finalizado = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first()
    viaje.IdEstadoViaje = estado_finalizado.IdEstadoViaje
    db_session.commit()

    response = _crear(client, viaje, dia_cronograma, auth_headers)

    assert response.status_code == 409
    assert externos.sin_llamadas
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


# ---------------------------------------------------------------------------
# Endpoint: modificar actividad
# ---------------------------------------------------------------------------


def test_update_actividad_con_horario_compatible_modifica_sin_advertencia(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos
):
    viaje, _ = viaje_con_admin

    response = _modificar(
        client,
        viaje,
        dia_cronograma,
        actividad_existente,
        auth_headers,
        _payload(nombre="Visita al Museo Nacional de Bellas Artes (tarde)", horaInicio="14:00:00", horaFin="16:00:00"),
    )

    assert response.status_code == 200
    assert "advertencia" not in response.json()
    assert externos.llamadas_gemini == ["Visita al Museo Nacional de Bellas Artes (tarde)"]
    db_session.refresh(actividad_existente)
    assert actividad_existente.Nombre == "Visita al Museo Nacional de Bellas Artes (tarde)"
    assert actividad_existente.HoraInicio == time(14, 0)


def test_cp5_update_fuera_de_horario_devuelve_advertencia_y_no_modifica(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos
):
    viaje, _ = viaje_con_admin

    response = _modificar(
        client,
        viaje,
        dia_cronograma,
        actividad_existente,
        auth_headers,
        _payload(nombre="Cambio de horario", horaInicio="17:00:00", horaFin="19:00:00"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["advertencia"] is True
    assert body["horariosApertura"] == "09:00 - 18:00"
    db_session.refresh(actividad_existente)
    assert actividad_existente.Nombre == "Visita original"
    assert actividad_existente.HoraInicio == time(10, 0)


def test_cp9_update_con_ignorar_advertencia_modifica_sin_analizar(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos
):
    viaje, _ = viaje_con_admin

    response = _modificar(
        client,
        viaje,
        dia_cronograma,
        actividad_existente,
        auth_headers,
        _payload(nombre="Cambio de horario", horaInicio="17:00:00", horaFin="19:00:00"),
        ignorar_advertencia="true",
    )

    assert response.status_code == 200
    assert externos.sin_llamadas
    db_session.refresh(actividad_existente)
    assert actividad_existente.Nombre == "Cambio de horario"
    assert actividad_existente.HoraInicio == time(17, 0)
    assert actividad_existente.HoraFin == time(19, 0)


@pytest.mark.parametrize("componente", ["gemini", "busqueda", "detalles"])
def test_cp10_update_con_error_externo_modifica_normalmente(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos, componente
):
    viaje, _ = viaje_con_admin
    externos.error_en = componente

    response = _modificar(
        client,
        viaje,
        dia_cronograma,
        actividad_existente,
        auth_headers,
        _payload(nombre="Cambio con error externo", horaInicio="17:00:00", horaFin="19:00:00"),
    )

    assert response.status_code == 200
    assert "advertencia" not in response.json()
    db_session.refresh(actividad_existente)
    assert actividad_existente.Nombre == "Cambio con error externo"


def test_current_opening_hours_tiene_prioridad_sobre_opening_hours(
    db_session, externos
):
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(
            _periodo(1, "1000", "1600")
        ),
        "opening_hours": _horarios(
            _periodo(1, "0900", "1800")
        ),
    }

    resultado = _analizar(
        db_session,
        hora_inicio=time(17, 0),
        hora_fin=time(17, 30),
    )

    assert resultado["advertencia"] is True
    assert resultado["horarios_apertura"] == "10:00 - 16:00"


def test_current_opening_hours_vacio_usa_opening_hours_como_respaldo(
    db_session, externos
):
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": {},
        "opening_hours": _horarios(
            _periodo(1, "0900", "1800")
        ),
    }

    resultado = _analizar(
        db_session,
        hora_inicio=time(17, 0),
        hora_fin=time(18, 0),
    )

    assert resultado["advertencia"] is False


def test_current_y_opening_hours_sin_informacion_no_advierten_pero_avisan(
    db_session, externos
):
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": {},
        "opening_hours": {},
    }

    resultado = _analizar(
        db_session,
        hora_inicio=time(17, 0),
        hora_fin=time(19, 0),
    )

    assert resultado == {"advertencia": False, "aviso": servicio.MENSAJE_NO_VERIFICADO}


def test_current_opening_hours_permite_horario_fuera_del_horario_habitual(
    db_session, externos
):
    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(
            _periodo(1, "0900", "2000")
        ),
        "opening_hours": _horarios(
            _periodo(1, "0900", "1800")
        ),
    }

    resultado = _analizar(
        db_session,
        hora_inicio=time(19, 0),
        hora_fin=time(19, 30),
    )

    assert resultado["advertencia"] is False


def test_create_usa_current_opening_hours_para_validar(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    dia_cronograma,
    externos,
):
    viaje, _ = viaje_con_admin

    externos.detalles = {
        "name": NOMBRE_LUGAR,
        "current_opening_hours": _horarios(
            _periodo(1, "1000", "1600")
        ),
        "opening_hours": _horarios(
            _periodo(1, "0900", "1800")
        ),
    }

    response = _crear(
        client,
        viaje,
        dia_cronograma,
        auth_headers,
        _payload(
            horaInicio="17:00:00",
            horaFin="17:30:00",
        ),
    )

    assert response.status_code in (200, 201)

    body = response.json()

    assert body["advertencia"] is True
    assert body["horariosApertura"] == "10:00 - 16:00"
    assert _cantidad_actividades(db_session, dia_cronograma) == 0


# ---------------------------------------------------------------------------
# Endpoints: aviso de horario no verificable y destinos del viaje
# ---------------------------------------------------------------------------


def test_create_con_horario_compatible_no_devuelve_aviso(
    client, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    viaje, _ = viaje_con_admin

    response = _crear(client, viaje, dia_cronograma, auth_headers)

    assert response.status_code == 201
    assert response.json()["AvisoHorario"] is None


def test_create_con_horarios_no_verificables_registra_con_aviso(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, externos
):
    """Sin información de horarios no se bloquea: se guarda y se informa un aviso."""
    viaje, _ = viaje_con_admin
    externos.detalles = {"name": NOMBRE_LUGAR}

    response = _crear(client, viaje, dia_cronograma, auth_headers)

    assert response.status_code == 201
    body = response.json()
    assert "advertencia" not in body
    assert body["AvisoHorario"] == servicio.MENSAJE_NO_VERIFICADO
    assert _cantidad_actividades(db_session, dia_cronograma) == 1


def test_update_con_horarios_no_verificables_modifica_con_aviso(
    client, db_session, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos
):
    viaje, _ = viaje_con_admin
    externos.detalles = {"name": NOMBRE_LUGAR}

    response = _modificar(
        client,
        viaje,
        dia_cronograma,
        actividad_existente,
        auth_headers,
        _payload(nombre="Cambio sin horarios", horaInicio="14:00:00", horaFin="16:00:00"),
    )

    assert response.status_code == 200
    body = response.json()
    assert "advertencia" not in body
    assert body["AvisoHorario"] == servicio.MENSAJE_NO_VERIFICADO
    db_session.refresh(actividad_existente)
    assert actividad_existente.Nombre == "Cambio sin horarios"


def test_create_pasa_los_destinos_del_viaje_al_analisis(
    client, auth_headers, viaje_con_admin, dia_cronograma, externos, monkeypatch
):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(trips_module, "_destinos_contexto", lambda _viaje: DESTINOS)

    response = _crear(client, viaje, dia_cronograma, auth_headers)

    assert response.status_code == 201
    assert externos.contextos_gemini == ["Buenos Aires, Argentina"]
    assert externos.destinos_busqueda == [DESTINOS]


def test_update_pasa_los_destinos_del_viaje_al_analisis(
    client, auth_headers, viaje_con_admin, dia_cronograma, actividad_existente, externos, monkeypatch
):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(trips_module, "_destinos_contexto", lambda _viaje: DESTINOS)

    response = _modificar(
        client, viaje, dia_cronograma, actividad_existente, auth_headers, _payload(nombre="Con destinos")
    )

    assert response.status_code == 200
    assert externos.contextos_gemini == ["Buenos Aires, Argentina"]
    assert externos.destinos_busqueda == [DESTINOS]


def test_destinos_contexto_arma_nombre_pais_provincia_y_coordenadas():
    viaje = SimpleNamespace(
        Destinos=[
            SimpleNamespace(
                Destino=SimpleNamespace(
                    Nombre="Orlando", Pais="Estados Unidos", ProvinciaEstado="Florida", Lat=28.54, Lng=-81.38
                )
            ),
            SimpleNamespace(Destino=None),
        ]
    )

    assert trips_module._destinos_contexto(viaje) == [
        {"name": "Orlando", "country": "Estados Unidos", "admin_area": "Florida", "lat": 28.54, "lng": -81.38}
    ]


def test_destinos_contexto_sin_destinos_devuelve_lista_vacia():
    assert trips_module._destinos_contexto(SimpleNamespace(Destinos=None)) == []
