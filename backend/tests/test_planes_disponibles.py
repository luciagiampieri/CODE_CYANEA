from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, hash_password
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.plan import Plan
from app.models.rol_sistema import RolSistema
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario

URL = "/api/v1/users/me/planes"


@pytest.fixture
def planes(db_session, usuario_activo):
    pro = db_session.get(Plan, 2)
    pro.PrecioMensualARS, pro.PrecioAnualARS = Decimal("4900"), Decimal("49000")
    pro.MaxParticipantesViaje = 10
    db_session.commit()
    return {
        "Authorization": "Bearer "
        + create_access_token({"user_id": usuario_activo.IdUsuario, "sub": usuario_activo.Email})
    }


def test_cp1_cp2_comparacion_autenticada_con_limites_vigentes(client, db_session, planes):
    assert client.get(URL).status_code == 401
    respuesta = client.get(URL, headers=planes)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert respuesta.headers["cache-control"] == "no-store"
    assert datos["planActual"] == "gratuito" and datos["ultimaSuscripcion"] is None
    assert Decimal(datos["ahorroAnualPorcentaje"]) == Decimal("16.67")
    for nombre, ident in [("gratuito", 1), ("pro", 2)]:
        p = db_session.get(Plan, ident)
        assert datos[nombre] == dict(
            maxViajesActivos=p.MaxViajesActivos,
            maxParticipantesViaje=p.MaxParticipantesViaje,
            maxSugerenciasDiarias=p.MaxSugerenciasDiarias,
            maxEscaneosMensuales=p.MaxEscaneosMensuales,
            maxAlmacenamientoMb=p.MaxAlmacenamientoMb,
        )


def test_cp3_refleja_edicion_del_backoffice_sin_reiniciar(
    client, db_session, usuario_activo, planes
):
    assert client.get(URL, headers=planes).json()["precioMensualARS"] == "4900.00"
    db_session.add_all(
        [
            RolSistema(IdRolSistema=1, Nombre="viajero"),
            RolSistema(IdRolSistema=2, Nombre="administrador_sistema"),
        ]
    )
    admin = Usuario(
        Nombre="Admin",
        Apellido="Planes",
        NombreUsuario="admin_planes115",
        Email="admin115@test.invalid",
        HashedPassword=hash_password("Segura123!"),
        IdRolSistema=2,
        EmailConfirmado=True,
        Activo=True,
    )
    db_session.add(admin)
    db_session.commit()
    login = client.post(
        "/api/v1/backoffice/auth/login", json={"email": admin.Email, "password": "Segura123!"}
    )
    admin_auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    configuracion = client.get("/api/v1/backoffice/planes", headers=admin_auth).json()
    configuracion["precioMensualARS"], configuracion["precioAnualARS"] = "6000", "60000"
    configuracion["pro"]["maxParticipantesViaje"] = 12
    assert (
        client.put("/api/v1/backoffice/planes", headers=admin_auth, json=configuracion).status_code
        == 200
    )
    datos = client.get(URL, headers=planes).json()
    assert Decimal(datos["precioMensualARS"]) == Decimal("6000")
    assert datos["pro"]["maxParticipantesViaje"] == 12


def test_cp5_pro_y_suscripcion_cancelada_solo_propia(client, db_session, usuario_activo, planes):
    usuario_activo.IdPlan = 2
    estado = EstadoSuscripcion(Nombre="cancelada")
    db_session.add(estado)
    db_session.flush()
    sub = SuscripcionUsuario(
        IdUsuario=usuario_activo.IdUsuario,
        IdPlan=2,
        IdEstadoSuscripcion=estado.IdEstadoSuscripcion,
        MesesPeriodo=1,
        PrecioPeriodoARS=Decimal("3900"),
        FechaInicio=datetime(2026, 10, 1, tzinfo=timezone.utc),
        FechaFin=datetime(2026, 11, 1, tzinfo=timezone.utc),
        FechaCancelacion=datetime(2026, 10, 15, tzinfo=timezone.utc),
    )
    db_session.add(sub)
    db_session.commit()
    datos = client.get(URL, headers=planes).json()
    assert datos["planActual"] == "pro"
    assert datos["ultimaSuscripcion"]["id"] == sub.IdSuscripcionUsuario
    assert datos["ultimaSuscripcion"]["estado"] == "cancelada"
    assert Decimal(datos["ultimaSuscripcion"]["precioPeriodoARS"]) == Decimal("3900")
    assert Decimal(datos["precioMensualARS"]) == Decimal("4900")
    otra = Usuario(
        Nombre="Otra",
        Apellido="Cuenta",
        NombreUsuario="otra115",
        Email="otra115@test.invalid",
        HashedPassword="no-login",
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(otra)
    db_session.commit()
    otro_token = create_access_token({"user_id": otra.IdUsuario, "sub": otra.Email})
    assert (
        client.get(URL, headers={"Authorization": f"Bearer {otro_token}"}).json()[
            "ultimaSuscripcion"
        ]
        is None
    )


def test_precio_sin_configurar_y_plan_desactivado(client, db_session, planes):
    pro = db_session.get(Plan, 2)
    pro.PrecioMensualARS = None
    pro.MaxAlmacenamientoMb = None
    db_session.commit()
    datos = client.get(URL, headers=planes).json()
    assert datos["ahorroAnualPorcentaje"] is None
    assert datos["pro"]["maxAlmacenamientoMb"] is None
    pro.Activo = False
    db_session.commit()
    assert client.get(URL, headers=planes).status_code == 503


def test_no_promete_ahorro_con_anual_mas_caro(client, db_session, planes):
    db_session.get(Plan, 2).PrecioAnualARS = Decimal("90000")
    db_session.commit()
    assert Decimal(client.get(URL, headers=planes).json()["ahorroAnualPorcentaje"]) == 0
