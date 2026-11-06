"""US 136: conversión de las actividades con ícono de Vuelo o Traslado."""

import importlib.util
from datetime import date, time, timedelta
from pathlib import Path

import pytest

from app.models.actividad_itinerario import ActividadItinerario
from app.models.destino import Destino
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.tramo_traslado_viaje import (
    TIPO_TRAMO_ENTRE_DESTINOS,
    TIPO_TRAMO_IDA,
    TIPO_TRAMO_REGRESO,
    TramoTrasladoViaje,
)

INICIO = date(2026, 12, 1)


@pytest.fixture()
def migracion():
    archivo = Path(__file__).parents[1] / "alembic/versions/c136a1b2c3d4_traslados_viajes.py"
    spec = importlib.util.spec_from_file_location("traslados_viajes", archivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture()
def viaje(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = INICIO
    viaje.FechaFin = INICIO + timedelta(days=9)
    for indice in range(10):
        db_session.add(
            DiaCronograma(
                IdViaje=viaje.IdViaje, Fecha=INICIO + timedelta(days=indice), IndiceDia=indice + 1
            )
        )
    db_session.commit()
    return viaje


def _recorrido(db_session, viaje, *destinos):
    ids = []
    for orden, (nombre, noches, en_viaje) in enumerate(destinos):
        destino = Destino(Nombre=nombre, Pais="Argentina")
        db_session.add(destino)
        db_session.flush()
        ids.append(destino.IdDestino)
        db_session.add(
            DestinoViaje(
                IdViaje=viaje.IdViaje,
                IdDestino=destino.IdDestino,
                Orden=orden,
                Noches=noches,
                NochesEnViaje=en_viaje,
            )
        )
    db_session.commit()
    return ids


def _actividad(db_session, viaje, dia, icono, inicio=(10, 0), fin=(11, 0), **datos):
    fecha = INICIO + timedelta(days=dia)
    id_dia = (
        db_session.query(DiaCronograma)
        .filter_by(IdViaje=viaje.IdViaje, Fecha=fecha)
        .one()
        .IdDiaCronograma
    )
    actividad = ActividadItinerario(
        IdDiaCronograma=id_dia,
        Nombre=datos.pop("Nombre", "Vuelo AR1234"),
        HoraInicio=time(*inicio),
        HoraFin=time(*fin),
        Icono=icono,
        **datos,
    )
    db_session.add(actividad)
    db_session.commit()
    return actividad


def _convertir(db_session, migracion):
    migracion.convertir_actividades(db_session.connection())
    db_session.commit()
    db_session.expire_all()


def _tramo(db_session, actividad):
    return db_session.get(TramoTrasladoViaje, actividad.IdTramoTraslado)


RECORRIDO = (("Bariloche", 3, 0), ("Mendoza", 3, 1), ("Salta", 2, 0))


def test_vuelo_del_primer_dia_es_la_ida_y_conserva_la_llegada(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(db_session, viaje, 0, "plane", (9, 0), (11, 30))

    _convertir(db_session, migracion)

    assert _tramo(db_session, actividad).IdTipoTramoTraslado == TIPO_TRAMO_IDA
    assert actividad.Nombre == "Avión a Bariloche"
    assert (actividad.HoraInicio, actividad.HoraFin) == (time(11, 30), time(11, 30))
    assert actividad.Icono == "plane"


def test_auto_del_ultimo_dia_es_el_regreso_y_conserva_la_salida(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(
        db_session, viaje, 9, "car", (15, 0), (19, 0), Nombre="Volvemos en auto"
    )

    _convertir(db_session, migracion)

    assert _tramo(db_session, actividad).IdTipoTramoTraslado == TIPO_TRAMO_REGRESO
    assert actividad.Nombre == "Auto de regreso"
    assert (actividad.HoraInicio, actividad.HoraFin) == (time(15), time(15))


def test_dia_de_salida_es_el_tramo_entre_destinos_y_conserva_ambas_horas(
    db_session, viaje, migracion
):
    ids = _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(db_session, viaje, 6, "car", (8, 0), (20, 0))

    _convertir(db_session, migracion)

    tramo = _tramo(db_session, actividad)
    assert tramo.IdTipoTramoTraslado == TIPO_TRAMO_ENTRE_DESTINOS
    assert (tramo.IdDestinoOrigen, tramo.IdDestinoLlegada) == (ids[1], ids[2])
    assert actividad.Nombre == "Auto a Salta"
    assert (actividad.HoraInicio, actividad.HoraFin) == (time(8), time(20))


def test_varias_candidatas_convierte_la_primera_por_hora(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    tarde = _actividad(db_session, viaje, 3, "plane", (15, 0), (16, 0))
    temprano = _actividad(db_session, viaje, 3, "car", (9, 0), (10, 0))

    _convertir(db_session, migracion)

    assert temprano.IdTramoTraslado is not None
    assert tarde.IdTramoTraslado is None
    assert tarde.Icono == "location-dot"
    assert tarde.Nombre == "Vuelo AR1234"


def test_fuera_de_un_dia_de_traslado_pasa_a_otro(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(db_session, viaje, 1, "plane")

    _convertir(db_session, migracion)

    assert actividad.IdTramoTraslado is None
    assert actividad.Icono == "location-dot"


def test_sin_recorrido_armado_solo_hay_ida_y_regreso(db_session, viaje, migracion):
    _recorrido(db_session, viaje, ("Bariloche", None, 0), ("Mendoza", None, 0))
    ida = _actividad(db_session, viaje, 0, "plane")
    medio = _actividad(db_session, viaje, 3, "plane")
    regreso = _actividad(db_session, viaje, 9, "plane")

    _convertir(db_session, migracion)

    assert _tramo(db_session, ida).IdTipoTramoTraslado == TIPO_TRAMO_IDA
    assert _tramo(db_session, regreso).IdTipoTramoTraslado == TIPO_TRAMO_REGRESO
    assert medio.Icono == "location-dot"


def test_viaje_de_un_dia_asigna_ida_y_regreso(db_session, viaje, migracion):
    viaje.FechaFin = INICIO
    db_session.commit()
    _recorrido(db_session, viaje, ("Colonia", None, 0))
    primera = _actividad(db_session, viaje, 0, "car", (8, 0), (9, 0))
    segunda = _actividad(db_session, viaje, 0, "car", (18, 0), (19, 0))
    tercera = _actividad(db_session, viaje, 0, "car", (20, 0), (21, 0))

    _convertir(db_session, migracion)

    assert _tramo(db_session, primera).IdTipoTramoTraslado == TIPO_TRAMO_IDA
    assert _tramo(db_session, segunda).IdTipoTramoTraslado == TIPO_TRAMO_REGRESO
    assert tercera.Icono == "location-dot"


def test_el_nombre_original_pasa_a_las_notas_sin_pisar_la_descripcion(
    db_session, viaje, migracion
):
    _recorrido(db_session, viaje, *RECORRIDO)
    sin_notas = _actividad(db_session, viaje, 0, "plane")
    con_notas = _actividad(db_session, viaje, 9, "plane", Descripcion="Terminal A")

    _convertir(db_session, migracion)

    assert sin_notas.Descripcion == "Vuelo AR1234"
    assert con_notas.Descripcion == "Terminal A\nVuelo AR1234"


def test_si_el_nombre_ya_era_el_automatico_no_se_repite_en_notas(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(db_session, viaje, 0, "plane", Nombre="Avión a Bariloche")

    _convertir(db_session, migracion)

    assert actividad.Descripcion is None


def test_limpia_la_advertencia_de_horario(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    actividad = _actividad(
        db_session,
        viaje,
        0,
        "plane",
        TipoAdvertenciaHorario="cerrado",
        AdvertenciaHorario="El lugar está cerrado",
    )

    _convertir(db_session, migracion)

    assert actividad.TipoAdvertenciaHorario is None
    assert actividad.AdvertenciaHorario is None


def test_no_toca_las_demas_categorias_y_es_idempotente(db_session, viaje, migracion):
    _recorrido(db_session, viaje, *RECORRIDO)
    hotel = _actividad(db_session, viaje, 0, "building", Nombre="Check-in")
    vuelo = _actividad(db_session, viaje, 0, "plane")

    _convertir(db_session, migracion)
    nombre = vuelo.Nombre
    _convertir(db_session, migracion)

    assert hotel.Nombre == "Check-in"
    assert hotel.IdTramoTraslado is None
    assert vuelo.Nombre == nombre
    assert db_session.query(TramoTrasladoViaje).count() == 1


def test_el_vinculo_con_el_tramo_borra_en_cascada():
    """Anular el vínculo dejaría un traslado con fin <= inicio, que viola el CHECK."""
    (clave_foranea,) = ActividadItinerario.__table__.c.IdTramoTraslado.foreign_keys

    assert clave_foranea.ondelete == "CASCADE"
