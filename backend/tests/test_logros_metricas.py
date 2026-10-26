from datetime import date, timedelta

from app.models.estado_viaje import EstadoViaje
from app.models.viaje import Viaje
from app.services.logros import metricas_usuario
from tests.test_limites_planes_viajes import _participar, _payload_viaje, _por_nombre, _usuario, _viaje


def _metricas(db, usuario):
    return metricas_usuario(db, usuario.IdUsuario)


def _terminado(db, admin):
    hoy = date.today()
    return _viaje(db, admin, "finalizado", hoy - timedelta(days=20), hoy - timedelta(days=10))


def _viaje_con_pais(client, headers, db, pais, terminado=True):
    payload = _payload_viaje()
    payload["destinations"] = [
        {"name": f"Ciudad de {pais}", "country": pais, "placeId": f"place-{pais.lower()}"}
    ]
    assert client.post("/api/v1/trips", headers=headers, json=payload).status_code == 201
    viaje = db.query(Viaje).order_by(Viaje.IdViaje.desc()).first()
    if terminado:
        hoy = date.today()
        viaje.FechaInicio = hoy - timedelta(days=20)
        viaje.FechaFin = hoy - timedelta(days=10)
        viaje.IdEstadoViaje = _por_nombre(db, EstadoViaje, "finalizado").IdEstadoViaje
        db.commit()
    return viaje


def test_cuenta_los_viajes_aceptados_sin_cancelados_ni_invitaciones(
    db_session, master_data, usuario_activo
):
    beto, carla, dani = (_usuario(db_session, n) for n in ("beto", "carla", "dani"))
    _viaje(db_session, usuario_activo)
    _terminado(db_session, usuario_activo)
    _viaje(db_session, usuario_activo, "cancelado")
    _participar(db_session, _viaje(db_session, beto), usuario_activo)
    _participar(db_session, _viaje(db_session, carla), usuario_activo, estado="invitado")
    _participar(db_session, _viaje(db_session, dani), usuario_activo, estado="salio")

    assert _metricas(db_session, usuario_activo)["viajes"] == 3


def test_viajes_organizados_son_los_finalizados_que_administro(
    db_session, master_data, usuario_activo
):
    beto = _usuario(db_session, "beto")
    _terminado(db_session, usuario_activo)
    _viaje(db_session, usuario_activo)
    _participar(db_session, _terminado(db_session, beto), usuario_activo)

    assert _metricas(db_session, usuario_activo)["viajesOrganizados"] == 1


def test_amigos_por_viaje_toma_el_viaje_mas_grande_sin_contar_invitados(
    db_session, master_data, usuario_activo
):
    beto, carla, dani, eva, fede = (
        _usuario(db_session, n) for n in ("beto", "carla", "dani", "eva", "fede")
    )
    grande = _viaje(db_session, usuario_activo)
    for amigo in (beto, carla, dani):
        _participar(db_session, grande, amigo)
    _participar(db_session, grande, eva, estado="invitado")
    _participar(db_session, _viaje(db_session, fede), usuario_activo)

    assert _metricas(db_session, usuario_activo)["maxAmigosEnViaje"] == 3


def test_los_viajes_cancelados_no_cuentan_para_amigos(db_session, master_data, usuario_activo):
    cancelado = _viaje(db_session, usuario_activo, "cancelado")
    for alias in ("beto", "carla", "dani", "eva", "fede"):
        _participar(db_session, cancelado, _usuario(db_session, alias))

    assert _metricas(db_session, usuario_activo)["maxAmigosEnViaje"] == 0


def test_paises_cuenta_viajes_terminados_sin_repetir(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _viaje_con_pais(client, auth_headers, db_session, "Argentina")
    _viaje_con_pais(client, auth_headers, db_session, "Argentina")
    _viaje_con_pais(client, auth_headers, db_session, "Brasil")
    _viaje_con_pais(client, auth_headers, db_session, "Chile", terminado=False)

    assert _metricas(db_session, usuario_activo)["paises"] == 2
    visitados = client.get("/api/v1/users/me/paises-visitados", headers=auth_headers).json()
    assert visitados["paises"] == ["Argentina", "Brasil"]
    assert visitados["totalPaises"] == 2


def test_el_primer_viaje_otorga_su_logro(client, db_session, master_data, usuario_activo, auth_headers):
    _viaje_con_pais(client, auth_headers, db_session, "Argentina", terminado=False)

    datos = client.get("/api/v1/users/me/logros", headers=auth_headers).json()

    assert datos["metricas"]["viajes"] == 1
    primer = next(logro for logro in datos["logros"] if logro["id"] == "primer_viaje")
    assert primer["obtenido"] is True
    assert primer["progresoTexto"] == "Logro completo"