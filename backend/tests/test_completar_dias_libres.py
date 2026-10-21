"""US 92: completar días libres del itinerario mediante IA.

Los casos de prueba de la US se mapean como CP1 a CP8. La IA y Google Places se
reemplazan por dobles de prueba: nunca se llama a servicios reales.
"""

from datetime import date, time, timedelta
from types import SimpleNamespace

import pytest

from app.api.routes import sugerencias as rutas_sugerencias
from app.main import app
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_viaje import EstadoViaje
from app.models.plan import PLAN_GRATUITO, Plan
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.services.activity_ai import get_activity_suggester
from app.services.activity_ai.franjas_libres import detectar_franjas_libres, tramos_libres
from app.services.activity_ai.processing import LugarEncontrado

HOY = date(2026, 10, 18)


def _dia(id_dia, fecha, indice=1):
    return SimpleNamespace(IdDiaCronograma=id_dia, Fecha=fecha, IndiceDia=indice)


def _act(inicio, fin):
    return SimpleNamespace(HoraInicio=time(*inicio), HoraFin=time(*fin))


def _limite_diario(db, valor):
    """US 118: el límite diario sale del plan del administrador (gratuito en estos tests)."""
    db.get(Plan, PLAN_GRATUITO).MaxSugerenciasDiarias = valor
    db.commit()


# --- Detección (funciones puras) ------------------------------------------------


def test_cp1_dias_sin_actividades_se_listan_como_dias_libres_completos():
    dias = [_dia(1, HOY + timedelta(days=1), 1), _dia(2, HOY + timedelta(days=2), 2)]

    franjas = detectar_franjas_libres(dias, {}, HOY)

    assert [(f.id_dia, f.inicio, f.fin, f.dia_completo) for f in franjas] == [
        (1, 9 * 60, 22 * 60, True),
        (2, 9 * 60, 22 * 60, True),
    ]


def test_cp2_detecta_una_franja_libre_de_cuatro_horas():
    dias = [_dia(1, HOY + timedelta(days=1))]
    actividades = {1: [_act((9, 0), (13, 0)), _act((17, 0), (22, 0))]}

    franjas = detectar_franjas_libres(dias, actividades, HOY)

    assert len(franjas) == 1
    assert (franjas[0].inicio, franjas[0].fin) == (13 * 60, 17 * 60)
    assert franjas[0].duracion == 240
    assert franjas[0].dia_completo is False


def test_cp3_no_detecta_como_libre_una_franja_de_dos_horas():
    dias = [_dia(1, HOY + timedelta(days=1))]
    actividades = {1: [_act((9, 0), (14, 0)), _act((16, 0), (22, 0))]}

    assert detectar_franjas_libres(dias, actividades, HOY) == []


def test_franja_de_exactamente_tres_horas_si_es_libre():
    assert tramos_libres([(9 * 60, 12 * 60), (15 * 60, 22 * 60)]) == [(12 * 60, 15 * 60)]


def test_cp4_no_considera_dias_anteriores_ni_el_dia_actual():
    dias = [
        _dia(1, HOY - timedelta(days=1)),
        _dia(2, HOY),
        _dia(3, HOY + timedelta(days=1)),
    ]

    franjas = detectar_franjas_libres(dias, {}, HOY)

    assert [f.id_dia for f in franjas] == [3]


def test_actividades_fuera_de_la_ventana_se_recortan_y_superpuestas_se_unen():
    # 07:00-10:00 ocupa hasta las 10; 12:00-15:00 y 14:00-18:00 forman un bloque.
    ocupados = [(7 * 60, 10 * 60), (12 * 60, 15 * 60), (14 * 60, 18 * 60), (22 * 60, 23 * 60)]

    assert tramos_libres(ocupados) == [(18 * 60, 22 * 60)]


def test_varias_franjas_en_un_mismo_dia():
    dias = [_dia(1, HOY + timedelta(days=1))]
    actividades = {1: [_act((12, 30), (14, 0))]}

    franjas = detectar_franjas_libres(dias, actividades, HOY)

    assert [(f.inicio, f.fin) for f in franjas] == [(9 * 60, 12 * 60 + 30), (14 * 60, 22 * 60)]


# --- Endpoints ------------------------------------------------------------------


MANANA = date.today() + timedelta(days=1)


class _SugeridorFalso:
    """Devuelve cuatro candidatas dentro de la franja pedida (se esperan hasta tres)."""

    def __init__(self):
        self.contextos = []

    async def sugerir(self, contexto):
        self.contextos.append(contexto)
        inicio = contexto["franja"]["inicio"]
        h = int(inicio[:2])
        n = len(self.contextos)
        return {
            "sugerencias": [
                {
                    "nombre": f"Actividad {n}-{i}",
                    "descripcion": "Descripción",
                    "hora_inicio": f"{h:02d}:00",
                    "hora_fin": f"{h + 2:02d}:00",
                    "lugar_nombre": f"Lugar {n}-{i}",
                    "costo_estimado_ars": 0,
                    "motivo": "Motivo",
                }
                for i in range(1, 5)
            ]
        }


async def _buscador_falso(consulta, centro, radio):
    nombre = consulta.split(",")[0]
    return [
        LugarEncontrado(
            place_id=f"google:{nombre.replace(' ', '-')}",
            nombre=nombre,
            direccion=f"Calle {nombre} 123",
            lat=-34.6,
            lng=-58.4,
        )
    ]


@pytest.fixture()
def sugeridor(monkeypatch):
    falso = _SugeridorFalso()
    app.dependency_overrides[get_activity_suggester] = lambda: falso
    monkeypatch.setattr(rutas_sugerencias, "buscar_lugares_google", _buscador_falso)
    yield falso
    app.dependency_overrides.pop(get_activity_suggester, None)


@pytest.fixture()
def estados_sugerencias(db_session):
    db_session.add_all(
        EstadoSugerenciaActividad(Nombre=n)
        for n in ("pendiente", "aceptada", "descartada", "en_votacion")
    )
    db_session.commit()


@pytest.fixture()
def dias(db_session, viaje_con_admin):
    """Ayer, mañana (libre), pasado mañana (ocupado salvo 13 a 17) y el día siguiente (sin huecos)."""
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = date.today() - timedelta(days=1)
    viaje.FechaFin = date.today() + timedelta(days=3)
    fechas = [date.today() - timedelta(days=1)] + [date.today() + timedelta(days=i) for i in (1, 2, 3)]
    filas = [
        DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha, IndiceDia=indice)
        for indice, fecha in enumerate(fechas, start=1)
    ]
    db_session.add_all(filas)
    db_session.flush()
    _, manana, pasado, completo = filas
    for dia, inicio, fin in (
        (pasado, time(9, 0), time(13, 0)),
        (pasado, time(17, 0), time(22, 0)),
        (completo, time(9, 0), time(14, 0)),
        (completo, time(16, 0), time(22, 0)),
    ):
        db_session.add(
            ActividadItinerario(
                IdDiaCronograma=dia.IdDiaCronograma,
                Nombre=f"Ocupado {inicio:%H}",
                HoraInicio=inicio,
                HoraFin=fin,
                Icono="location-dot",
            )
        )
    db_session.commit()
    return {"ayer": filas[0], "manana": manana, "pasado": pasado, "completo": completo}


def _url(viaje, sufijo):
    return f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades/{sufijo}"


def test_cp1_cp2_endpoint_lista_dias_y_franjas_libres(
    client, auth_headers, viaje_con_admin, dias
):
    viaje, _ = viaje_con_admin

    respuesta = client.get(_url(viaje, "franjas-libres"), headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["ItinerarioCompleto"] is False
    assert cuerpo["MaxSugerenciasPorFranja"] == 3
    franjas = [
        (f["IdDiaCronograma"], f["HoraInicio"], f["HoraFin"], f["DiaCompleto"])
        for f in cuerpo["Franjas"]
    ]
    # Ayer no se considera y el último día solo tiene un hueco de dos horas.
    assert franjas == [
        (dias["manana"].IdDiaCronograma, "09:00", "22:00", True),
        (dias["pasado"].IdDiaCronograma, "13:00", "17:00", False),
    ]


def test_cp5_itinerario_sin_franjas_libres_informa_que_esta_completo(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=MANANA, IndiceDia=1)
    db_session.add(dia)
    db_session.flush()
    db_session.add(
        ActividadItinerario(
            IdDiaCronograma=dia.IdDiaCronograma,
            Nombre="Excursión de día completo",
            HoraInicio=time(8, 0),
            HoraFin=time(21, 0),
            Icono="location-dot",
        )
    )
    db_session.commit()

    respuesta = client.get(_url(viaje, "franjas-libres"), headers=auth_headers)

    cuerpo = respuesta.json()
    assert cuerpo["Franjas"] == []
    assert cuerpo["ItinerarioCompleto"] is True
    assert "itinerario se encuentra completo" in cuerpo["Mensaje"]


def test_cp6_completar_dos_franjas_genera_hasta_tres_sugerencias_agrupadas_por_dia(
    client, db_session, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [
                {"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"},
                {"IdDiaCronograma": dias["pasado"].IdDiaCronograma, "HoraInicio": "13:00", "HoraFin": "17:00"},
            ],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    resultados = respuesta.json()["Resultados"]
    assert [r["IdDiaCronograma"] for r in resultados] == [
        dias["manana"].IdDiaCronograma,
        dias["pasado"].IdDiaCronograma,
    ]
    for resultado in resultados:
        assert resultado["CodigoError"] is None
        assert len(resultado["Sugerencias"]) == 3
        assert {s["Estado"] for s in resultado["Sugerencias"]} == {"pendiente"}
        assert {s["IdDiaCronograma"] for s in resultado["Sugerencias"]} == {resultado["IdDiaCronograma"]}

    # Cada franja es una solicitud propia y se pide como máximo 3 sugerencias a la IA.
    assert len(sugeridor.contextos) == 2
    assert {c["cantidad_maxima"] for c in sugeridor.contextos} == {3}
    assert db_session.query(SolicitudSugerenciaActividad).count() == 2
    assert db_session.query(SugerenciaActividad).count() == 6


def test_las_sugerencias_generadas_quedan_pendientes_y_visibles(
    client, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin
    client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [{"IdDiaCronograma": dias["pasado"].IdDiaCronograma, "HoraInicio": "13:00", "HoraFin": "17:00"}],
        },
        headers=auth_headers,
    )

    listado = client.get(f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades", headers=auth_headers)

    assert len(listado.json()) == 3
    assert {s["Estado"] for s in listado.json()} == {"pendiente"}


def test_cp7_mas_franjas_que_solicitudes_disponibles_falla_sin_generar_nada(
    client, db_session, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin
    _limite_diario(db_session, 1)

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [
                {"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"},
                {"IdDiaCronograma": dias["pasado"].IdDiaCronograma, "HoraInicio": "13:00", "HoraFin": "17:00"},
            ],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 429
    assert respuesta.headers["X-Error-Code"] == "SUGGESTION_LIMIT_REACHED"
    assert "Seleccionaste 2 franjas" in respuesta.json()["detail"]["mensaje"]
    assert sugeridor.contextos == []
    assert db_session.query(SolicitudSugerenciaActividad).count() == 0


def test_cada_franja_descuenta_una_solicitud_del_limite_diario(
    client, db_session, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin
    _limite_diario(db_session, 5)

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [
                {"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"},
                {"IdDiaCronograma": dias["pasado"].IdDiaCronograma, "HoraInicio": "13:00", "HoraFin": "17:00"},
            ],
        },
        headers=auth_headers,
    )

    assert respuesta.json()["SolicitudesRestantes"] == 3
    franjas = client.get(_url(viaje, "franjas-libres"), headers=auth_headers).json()
    assert franjas["SolicitudesRestantes"] == 3


@pytest.mark.parametrize("sufijo", ["franjas-libres", "completar-dias-libres"])
def test_cp8_viaje_finalizado_falla(
    client, db_session, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor, sufijo
):
    viaje, _ = viaje_con_admin
    finalizado = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first()
    viaje.IdEstadoViaje = finalizado.IdEstadoViaje
    db_session.commit()

    if sufijo == "franjas-libres":
        respuesta = client.get(_url(viaje, sufijo), headers=auth_headers)
    else:
        respuesta = client.post(
            _url(viaje, sufijo),
            json={
                "ContinuarSinPreferencias": True,
                "Franjas": [{"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"}],
            },
            headers=auth_headers,
        )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_FINISHED"
    assert sugeridor.contextos == []


def test_no_se_pueden_completar_dias_pasados(
    client, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [{"IdDiaCronograma": dias["ayer"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"}],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "DAY_IN_PAST"


@pytest.mark.parametrize(
    ("inicio", "fin"),
    [("13:00", "15:00"), ("08:00", "12:00"), ("19:00", "23:00")],
)
def test_franjas_fuera_de_ventana_o_menores_a_tres_horas_se_rechazan(
    client, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor, inicio, fin
):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [{"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": inicio, "HoraFin": fin}],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "SLOT_INVALID"


def test_sin_franjas_seleccionadas_falla(client, auth_headers, viaje_con_admin, dias):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje, "completar-dias-libres"), json={"Franjas": []}, headers=auth_headers)

    assert respuesta.status_code == 400


def test_sin_preferencias_pide_confirmacion_como_la_solicitud_individual(
    client, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "Franjas": [{"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"}],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "NO_PREFERENCES"
    assert sugeridor.contextos == []


def test_una_franja_ocupada_mientras_tanto_no_cancela_las_demas(
    client, db_session, auth_headers, viaje_con_admin, dias, estados_sugerencias, sugeridor
):
    viaje, _ = viaje_con_admin
    # Alguien ocupó toda la franja de pasado mañana después de listar las franjas.
    db_session.add(
        ActividadItinerario(
            IdDiaCronograma=dias["pasado"].IdDiaCronograma,
            Nombre="Nueva actividad",
            HoraInicio=time(13, 0),
            HoraFin=time(17, 0),
            Icono="location-dot",
        )
    )
    db_session.commit()

    respuesta = client.post(
        _url(viaje, "completar-dias-libres"),
        json={
            "ContinuarSinPreferencias": True,
            "Franjas": [
                {"IdDiaCronograma": dias["pasado"].IdDiaCronograma, "HoraInicio": "13:00", "HoraFin": "17:00"},
                {"IdDiaCronograma": dias["manana"].IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "22:00"},
            ],
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    ocupada, libre = respuesta.json()["Resultados"]
    assert ocupada["CodigoError"] == "SLOT_FULL"
    assert ocupada["Sugerencias"] == []
    assert len(libre["Sugerencias"]) == 3


def test_solo_participantes_actuales_pueden_ver_franjas(
    client, db_session, viaje_con_admin, dias
):
    from app.core.security import create_access_token, hash_password
    from app.models.usuario import Usuario

    viaje, _ = viaje_con_admin
    ajeno = Usuario(
        Nombre="Ajeno",
        Apellido="Test",
        NombreUsuario="ajeno",
        Email="ajeno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(ajeno)
    db_session.commit()
    token = create_access_token({"sub": ajeno.Email, "user_id": ajeno.IdUsuario})

    respuesta = client.get(
        _url(viaje, "franjas-libres"), headers={"Authorization": f"Bearer {token}"}
    )

    assert respuesta.status_code in (403, 404)