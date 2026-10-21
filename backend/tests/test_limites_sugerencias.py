from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import EstadoSugerenciaActividad, SolicitudSugerenciaActividad
from app.models.usuario import Usuario
from app.services import limites_planes as lp
from app.services.activity_ai import get_activity_suggester

FECHA_DIA = date.today() + timedelta(days=10)


class _SugeridorQueFalla:
    async def sugerir(self, contexto):
        raise RuntimeError("Sin IA en los tests")


@pytest.fixture(autouse=True)
def sugeridor_falso():
    app.dependency_overrides[get_activity_suggester] = lambda: _SugeridorQueFalla()
    yield
    app.dependency_overrides.pop(get_activity_suggester, None)


@pytest.fixture()
def estados_sugerencias(db_session):
    db_session.add_all(
        EstadoSugerenciaActividad(Nombre=nombre)
        for nombre in ("pendiente", "aceptada", "descartada", "en_votacion")
    )
    db_session.commit()


@pytest.fixture()
def dias(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = FECHA_DIA - timedelta(days=1)
    viaje.FechaFin = FECHA_DIA + timedelta(days=3)
    lista = [
        DiaCronograma(IdViaje=viaje.IdViaje, Fecha=FECHA_DIA + timedelta(days=i), IndiceDia=i + 2)
        for i in range(2)
    ]
    db_session.add_all(lista)
    db_session.commit()
    for dia in lista:
        db_session.refresh(dia)
    return lista


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _solicitud(db, viaje, usuario, dia, *, estado="completada", fecha=None):
    db.add(
        SolicitudSugerenciaActividad(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdDiaCronograma=dia.IdDiaCronograma,
            HoraInicio=time(10, 0),
            HoraFin=time(13, 0),
            Estado=estado,
            FechaSolicitud=fecha or datetime.now(timezone.utc),
        )
    )
    db.commit()


def _participante(db, viaje, nombre, id_plan):
    usuario = Usuario(
        Nombre=nombre.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre,
        Email=f"{nombre}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
        IdPlan=id_plan,
    )
    db.add(usuario)
    db.flush()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=db.query(RolParticipante).filter_by(Nombre="participante").first().IdRolParticipante,
            IdEstadoParticipacion=db.query(EstadoParticipacion)
            .filter_by(Nombre="aceptado")
            .first()
            .IdEstadoParticipacion,
        )
    )
    db.commit()
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


def _url(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades"


def _payload(dia):
    return {
        "IdDiaCronograma": dia.IdDiaCronograma,
        "HoraInicio": "10:00",
        "HoraFin": "13:00",
        "ContinuarSinPreferencias": True,
    }


def test_solicitar_sugerencias_superando_limite_gratuito_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dias, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=1)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    response = client.post(_url(viaje), json=_payload(dias[0]), headers=auth_headers)

    assert response.status_code == 429
    assert response.headers["X-Error-Code"] == "SUGGESTION_LIMIT_REACHED"
    assert response.json()["detail"]["tipoLimite"] == "sugerencias_diarias"
    assert response.json()["detail"]["limite"] == 1


def test_participante_pro_en_viaje_de_admin_gratuito_usa_el_limite_gratuito(
    client, db_session, viaje_con_admin, usuario_activo, dias, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=1)
    _set_limites(db_session, PLAN_PRO, MaxSugerenciasDiarias=20)
    _, headers_pro = _participante(db_session, viaje, "viajeropro", PLAN_PRO)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    response = client.post(_url(viaje), json=_payload(dias[0]), headers=headers_pro)

    assert response.status_code == 429
    assert response.headers["X-Error-Code"] == "SUGGESTION_LIMIT_REACHED"


def test_participante_gratuito_en_viaje_de_admin_pro_usa_el_limite_pro(
    client, db_session, viaje_con_admin, usuario_activo, dias, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    usuario_activo.IdPlan = PLAN_PRO
    db_session.commit()
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=1)
    _set_limites(db_session, PLAN_PRO, MaxSugerenciasDiarias=20)
    _, headers_gratuito = _participante(db_session, viaje, "viajerogratis", PLAN_GRATUITO)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    response = client.post(_url(viaje), json=_payload(dias[0]), headers=headers_gratuito)

    assert response.headers.get("X-Error-Code") != "SUGGESTION_LIMIT_REACHED"
    assert response.status_code == 503


def test_las_solicitudes_de_otros_participantes_suman_al_mismo_cupo(
    client, db_session, viaje_con_admin, usuario_activo, dias, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    companero, headers_companero = _participante(db_session, viaje, "companero", PLAN_GRATUITO)
    _solicitud(db_session, viaje, usuario_activo, dias[0])
    _solicitud(db_session, viaje, companero, dias[1])

    response = client.post(_url(viaje), json=_payload(dias[0]), headers=headers_companero)

    assert response.status_code == 429


def test_las_solicitudes_fallidas_no_cuentan(db_session, viaje_con_admin, usuario_activo, dias):
    viaje, _ = viaje_con_admin
    _solicitud(db_session, viaje, usuario_activo, dias[0], estado="fallida")
    _solicitud(db_session, viaje, usuario_activo, dias[1], estado="sin_resultados")

    assert lp.contar_sugerencias_hoy(db_session, viaje.IdViaje) == 0


def test_las_solicitudes_de_ayer_no_cuentan(db_session, viaje_con_admin, usuario_activo, dias):
    viaje, _ = viaje_con_admin
    _solicitud(
        db_session, viaje, usuario_activo, dias[0],
        fecha=datetime.now(timezone.utc) - timedelta(days=2),
    )

    assert lp.contar_sugerencias_hoy(db_session, viaje.IdViaje) == 0


def test_el_contexto_informa_el_limite_y_el_uso_del_plan(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=3)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    response = client.get(f"{_url(viaje)}/contexto", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["LimiteDiario"] == 3
    assert body["SolicitudesRestantes"] == 2
    assert body["PuedeSolicitar"] is True


def test_el_contexto_con_limite_alcanzado_no_permite_solicitar(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=1)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    body = client.get(f"{_url(viaje)}/contexto", headers=auth_headers).json()

    assert body["SolicitudesRestantes"] == 0
    assert body["PuedeSolicitar"] is False


def test_el_contexto_con_limite_ilimitado(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=None)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    body = client.get(f"{_url(viaje)}/contexto", headers=auth_headers).json()

    assert body["LimiteDiario"] is None
    assert body["SolicitudesRestantes"] is None
    assert body["PuedeSolicitar"] is True


def test_completar_dias_libres_con_mas_franjas_que_solicitudes_restantes_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dias
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    _solicitud(db_session, viaje, usuario_activo, dias[0])

    response = client.post(
        f"{_url(viaje)}/completar-dias-libres",
        json={
            "Franjas": [
                {"IdDiaCronograma": dia.IdDiaCronograma, "HoraInicio": "09:00", "HoraFin": "13:00"}
                for dia in dias
            ],
            "ContinuarSinPreferencias": True,
        },
        headers=auth_headers,
    )

    assert response.status_code == 429
    detalle = response.json()["detail"]
    assert detalle["tipoLimite"] == "sugerencias_diarias"
    assert "Seleccionaste 2 franjas" in detalle["mensaje"]