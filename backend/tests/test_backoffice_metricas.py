from datetime import date, datetime, timedelta, timezone

import pytest

from app.core.security import create_access_token, hash_password
from app.models.estado_viaje import EstadoViaje
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.solicitud_ia import SolicitudIA
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import registro_ia
from app.services.backoffice import metricas_service

URL = "/api/v1/backoffice/metricas"
LOGIN = "/api/v1/backoffice/auth/login"
PASS = "Segura123!"
METRICAS = {
    "usuariosRegistrados", "usuariosActivos", "viajesCreados", "viajesActivos",
    "suscripcionesProActivas", "ingresos", "solicitudesIA",
}


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


def _hace(dias: int) -> date:
    return metricas_service.hoy_ar() - timedelta(days=dias)


def _utc(fecha: date) -> datetime:
    return datetime(fecha.year, fecha.month, fecha.day, 15, tzinfo=timezone.utc)


def _rango(desde: date, hasta: date) -> dict:
    return {"desde": desde.isoformat(), "hasta": hasta.isoformat()}


def _crear_usuario(db_session, email, rol=ROL_VIAJERO, **campos):
    datos = {
        "Email": email,
        "Nombre": "Nombre",
        "Apellido": "Apellido",
        "NombreUsuario": email.split("@")[0],
        "HashedPassword": hash_password(PASS),
        "Activo": True,
        "EmailConfirmado": True,
        "IdRolSistema": rol,
    }
    datos.update(campos)
    usuario = Usuario(**datos)
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _crear_viaje(db_session, dueno, estado, creado):
    id_estado = db_session.query(EstadoViaje).filter_by(Nombre=estado).one().IdEstadoViaje
    viaje = Viaje(
        Titulo="Viaje",
        FechaInicio=date(2027, 1, 1),
        FechaFin=date(2027, 1, 5),
        IdEstadoViaje=id_estado,
        Moneda="ARS",
        IdAdministrador=dueno.IdUsuario,
        FechaCreacion=creado,
    )
    db_session.add(viaje)
    db_session.commit()
    return viaje


@pytest.fixture
def headers_admin(client, db_session):
    _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)
    token = client.post(
        LOGIN, json={"email": "admin@cyanea.test", "password": PASS}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_visualiza_dashboard_con_ultimos_30_dias(client, headers_admin):
    r = client.get(URL, headers=headers_admin)
    assert r.status_code == 200
    datos = r.json()
    assert datos["hasta"] == _hace(0).isoformat()
    assert datos["desde"] == _hace(29).isoformat()
    assert METRICAS <= set(datos)
    assert len(datos["evolucion"]["puntos"]) == 30


def test_viajero_no_puede_ver_el_dashboard(client, db_session):
    viajero = _crear_usuario(db_session, "viajero@cyanea.test")
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    r = client.get(URL, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_sin_token_no_puede_ver_el_dashboard(client):
    assert client.get(URL).status_code == 401


def test_usuarios_registrados_coincide_con_la_base(client, db_session, headers_admin):
    _crear_usuario(db_session, "a@cyanea.test")
    _crear_usuario(db_session, "b@cyanea.test")
    _crear_usuario(db_session, "baja@cyanea.test", FechaBaja=datetime.now(timezone.utc))
    _crear_usuario(db_session, "admin2@cyanea.test", ROL_ADMIN_SISTEMA)

    esperado = db_session.query(Usuario).filter(
        Usuario.IdRolSistema != ROL_ADMIN_SISTEMA,
        Usuario.FechaBaja.is_(None),
    ).count()

    r = client.get(URL, headers=headers_admin)
    assert r.json()["usuariosRegistrados"]["valor"] == esperado == 2


def test_usuarios_activos_en_los_ultimos_30_dias(client, db_session, headers_admin):
    ahora = datetime.now(timezone.utc)
    _crear_usuario(db_session, "activo@cyanea.test", UltimoAcceso=ahora - timedelta(days=5))
    _crear_usuario(db_session, "inactivo@cyanea.test", UltimoAcceso=ahora - timedelta(days=40))
    _crear_usuario(db_session, "nunca@cyanea.test")
    r = client.get(URL, headers=headers_admin)
    assert r.json()["usuariosActivos"]["valor"] == 1


def test_filtrar_por_rango_recalcula_las_metricas(client, db_session, master_data, headers_admin):
    dueno = _crear_usuario(db_session, "dueno@cyanea.test")
    _crear_viaje(db_session, dueno, "activo", _utc(_hace(5)))
    _crear_viaje(db_session, dueno, "finalizado", _utc(_hace(60)))
    _crear_viaje(db_session, dueno, "activo", _utc(_hace(61)))

    ultimos = client.get(URL, headers=headers_admin).json()
    anteriores = client.get(URL, params=_rango(_hace(70), _hace(50)), headers=headers_admin).json()

    assert ultimos["viajesCreados"]["valor"] == 1
    assert anteriores["viajesCreados"]["valor"] == 2
    assert ultimos["viajesActivos"]["valor"] == anteriores["viajesActivos"]["valor"] == 2


def test_evolucion_agrupa_registros_por_dia(client, db_session, headers_admin):
    _crear_usuario(db_session, "a@cyanea.test", FechaAlta=_utc(_hace(2)))
    _crear_usuario(db_session, "b@cyanea.test", FechaAlta=_utc(_hace(2)))
    _crear_usuario(db_session, "c@cyanea.test", FechaAlta=_utc(_hace(1)))

    serie = client.get(URL, headers=headers_admin).json()["evolucion"]
    puntos = {p["fecha"]: p for p in serie["puntos"]}

    assert serie["agrupacion"] == "dia"
    assert puntos[_hace(2).isoformat()]["usuarios"] == 2
    assert puntos[_hace(1).isoformat()]["usuarios"] == 1


def test_rango_largo_se_agrupa_por_mes(client, headers_admin):
    r = client.get(URL, params=_rango(_hace(200), _hace(0)), headers=headers_admin)
    assert r.json()["evolucion"]["agrupacion"] == "mes"


@pytest.mark.parametrize(
    "dias_desde, dias_hasta, mensaje",
    [
        (5, 10, "anterior a la fecha de inicio"),
        (5, -1, "posterior a hoy"),
        (400, 0, "superar un año"),
    ],
)
def test_rango_de_fechas_invalido(client, headers_admin, dias_desde, dias_hasta, mensaje):
    r = client.get(URL, params=_rango(_hace(dias_desde), _hace(dias_hasta)), headers=headers_admin)
    assert r.status_code == 422
    assert mensaje in r.json()["detail"]


def test_rango_sin_datos_devuelve_ceros(client, headers_admin):
    datos = client.get(URL, params=_rango(_hace(100), _hace(90)), headers=headers_admin).json()
    assert datos["viajesCreados"]["valor"] == 0
    assert datos["solicitudesIA"]["valor"] == 0
    assert all(p["usuarios"] == 0 and p["viajes"] == 0 for p in datos["evolucion"]["puntos"])


def test_error_en_una_metrica_no_impide_las_demas(client, db_session, headers_admin, monkeypatch):
    _crear_usuario(db_session, "a@cyanea.test")

    def falla(*args):
        raise RuntimeError("falla simulada")

    monkeypatch.setattr(metricas_service, "_viajes_creados", falla)
    r = client.get(URL, headers=headers_admin)

    assert r.status_code == 200
    assert r.json()["viajesCreados"] == {
        "valor": None,
        "error": metricas_service.MENSAJE_ERROR_METRICA,
    }
    assert r.json()["usuariosRegistrados"] == {"valor": 1, "error": None}


def test_suscripciones_e_ingresos_no_disponibles(client, headers_admin):
    datos = client.get(URL, headers=headers_admin).json()
    for clave in ("suscripcionesProActivas", "ingresos"):
        assert datos[clave]["valor"] is None
        assert datos[clave]["error"] == metricas_service.MENSAJE_SIN_SUSCRIPCIONES


def test_solicitudes_ia_del_periodo(client, db_session, headers_admin):
    db_session.add_all([
        SolicitudIA(Servicio="sugerencia_actividades", Modelo="m", Exitosa=True, Fecha=_utc(_hace(3))),
        SolicitudIA(Servicio="analisis_horarios", Modelo="m", Exitosa=False, Fecha=_utc(_hace(10))),
        SolicitudIA(Servicio="analisis_horarios", Modelo="m", Exitosa=True, Fecha=_utc(_hace(45))),
    ])
    db_session.commit()
    r = client.get(URL, headers=headers_admin)
    assert r.json()["solicitudesIA"]["valor"] == 2


def test_respuesta_no_expone_datos_personales(client, db_session, headers_admin):
    _crear_usuario(db_session, "privado@cyanea.test", Nombre="Lucrecia", Apellido="Secreta")
    texto = client.get(URL, headers=headers_admin).text
    for dato in ("privado@cyanea.test", "Lucrecia", "Secreta", "privado"):
        assert dato not in texto


def test_registrar_solicitud_ia_guarda_el_registro(db_session):
    registro_ia.registrar_solicitud_ia("analisis_horarios", "gemini-test", True)
    assert db_session.query(SolicitudIA).count() == 1


def test_registrar_solicitud_ia_no_interrumpe_si_falla(monkeypatch):
    import app.db.session as session_module

    def rota():
        raise RuntimeError("sin base")

    monkeypatch.setattr(session_module, "SessionLocal", rota)
    registro_ia.registrar_solicitud_ia("analisis_horarios", "gemini-test", True)


def test_request_autenticado_registra_ultimo_acceso(client, db_session):
    usuario = _crear_usuario(db_session, "app@cyanea.test")
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    db_session.refresh(usuario)
    assert usuario.UltimoAcceso is not None