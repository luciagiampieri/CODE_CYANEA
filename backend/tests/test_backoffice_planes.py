"""US 112: autorización, precios, aplicación inmediata y auditoría."""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, hash_password
from app.models.auditoria_plan import AuditoriaPlan
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.plan import PLAN_PRO, Plan
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.services import limites_planes
from app.services.precios_suscripciones import crear_periodo

URL = "/api/v1/backoffice/planes"


@pytest.fixture
def admin_headers(client, db_session):
    db_session.add_all(
        [
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ]
    )
    db_session.add(
        Usuario(
            Nombre="Admin",
            Apellido="Test",
            NombreUsuario="admin_planes",
            Email="planes@cyanea.test",
            HashedPassword=hash_password("Segura123!"),
            Activo=True,
            EmailConfirmado=True,
            IdRolSistema=ROL_ADMIN_SISTEMA,
        )
    )
    db_session.commit()
    respuesta = client.post(
        "/api/v1/backoffice/auth/login",
        json={"email": "planes@cyanea.test", "password": "Segura123!"},
    )
    assert respuesta.status_code == 200
    return {"Authorization": f"Bearer {respuesta.json()['access_token']}"}


@pytest.fixture
def payload(client, admin_headers):
    datos = client.get(URL, headers=admin_headers).json()
    datos.update(precioMensualARS="4900.00", precioAnualARS="49000.00")
    return datos


def test_cp1_guarda_precios_en_ars(client, db_session, admin_headers, payload):
    respuesta = client.put(URL, headers=admin_headers, json=payload)
    assert respuesta.status_code == 200
    pro = db_session.get(Plan, PLAN_PRO)
    assert pro.PrecioMensualARS == Decimal("4900.00")
    assert pro.PrecioAnualARS == Decimal("49000.00")


@pytest.mark.parametrize("valor", [0, -1, "abc", "NaN", "Infinity", "1.001", None, True])
def test_cp2_rechaza_precios_invalidos(client, db_session, admin_headers, payload, valor):
    payload["precioMensualARS"] = valor
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 422
    assert db_session.get(Plan, PLAN_PRO).PrecioMensualARS is None
    assert db_session.query(AuditoriaPlan).count() == 0


@pytest.mark.parametrize(
    "campo",
    [
        "maxViajesActivos",
        "maxParticipantesViaje",
        "maxSugerenciasDiarias",
        "maxEscaneosMensuales",
        "maxAlmacenamientoMb",
    ],
)
@pytest.mark.parametrize("valor", [0, -1, 1.5, True, None, "10"])
def test_rechaza_limites_no_enteros_positivos(client, admin_headers, payload, campo, valor):
    payload["pro"][campo] = valor
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 422


def test_cp3_limite_se_aplica_inmediatamente(
    client, db_session, admin_headers, payload, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    assert limites_planes.uso_sugerencias(db_session, viaje).limite == 10
    payload["gratuito"]["maxSugerenciasDiarias"] = 2
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    assert limites_planes.uso_sugerencias(db_session, viaje).limite == 2
    with pytest.raises(HTTPException) as error:
        limites_planes.validar_sugerencias(db_session, viaje, solicitudes=3)
    assert error.value.status_code == 429


@pytest.mark.parametrize(
    "campo",
    [
        "maxViajesActivos",
        "maxParticipantesViaje",
        "maxSugerenciasDiarias",
        "maxEscaneosMensuales",
        "maxAlmacenamientoMb",
    ],
)
def test_cp4_pro_no_puede_ser_inferior_al_gratuito(
    client, db_session, admin_headers, payload, campo
):
    payload["pro"][campo] = payload["gratuito"][campo] - 1
    respuesta = client.put(URL, headers=admin_headers, json=payload)
    assert respuesta.status_code == 422
    assert db_session.query(AuditoriaPlan).count() == 0


def test_cp5_precio_contratado_no_cambia_y_nuevo_periodo_usa_precio_nuevo(
    client, db_session, admin_headers, payload, usuario_activo
):
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    estado = EstadoSuscripcion(Nombre="activa", Activo=True)
    db_session.add(estado)
    db_session.flush()
    anterior = crear_periodo(
        db_session,
        id_usuario=usuario_activo.IdUsuario,
        id_estado=estado.IdEstadoSuscripcion,
        meses=1,
        inicio=datetime(2026, 1, 31, 12, tzinfo=timezone.utc),
    )
    db_session.commit()
    payload["precioMensualARS"] = "5900.00"
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    db_session.refresh(anterior)
    assert anterior.PrecioPeriodoARS == Decimal("4900.00")
    assert (anterior.FechaFin.month, anterior.FechaFin.day) == (2, 28)
    siguiente = crear_periodo(
        db_session,
        id_usuario=usuario_activo.IdUsuario,
        id_estado=estado.IdEstadoSuscripcion,
        meses=1,
        inicio=anterior.FechaFin,
    )
    assert siguiente.PrecioPeriodoARS == Decimal("5900.00")
    anual = crear_periodo(
        db_session,
        id_usuario=usuario_activo.IdUsuario,
        id_estado=estado.IdEstadoSuscripcion,
        meses=12,
        inicio=datetime(2028, 2, 29, tzinfo=timezone.utc),
    )
    assert anual.PrecioPeriodoARS == Decimal("49000.00")
    assert anual.FechaFin.year == 2029 and anual.FechaFin.day == 28


def test_cp6_auditoria_anterior_nuevo_y_administrador(client, db_session, admin_headers, payload):
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    payload["precioMensualARS"] = "5900.00"
    payload["gratuito"]["maxSugerenciasDiarias"] = 5
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    filas = client.get(f"{URL}/auditoria", headers=admin_headers).json()
    cambio = next(f for f in filas if f["campo"] == "PrecioMensualARS")
    assert Decimal(cambio["valorAnterior"]) == Decimal("4900")
    assert Decimal(cambio["valorNuevo"]) == Decimal("5900")
    assert cambio["idAdministrador"] and cambio["fechaHora"]
    cantidad = db_session.query(AuditoriaPlan).count()
    assert client.put(URL, headers=admin_headers, json=payload).status_code == 200
    assert db_session.query(AuditoriaPlan).count() == cantidad


def test_solo_admin_puede_consultar_modificar_y_auditar(
    client, admin_headers, payload, usuario_activo
):
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})
    for headers in ({}, {"Authorization": f"Bearer {token}"}):
        assert client.get(URL, headers=headers).status_code == 401
        assert client.put(URL, headers=headers, json=payload).status_code == 401
        assert client.get(f"{URL}/auditoria", headers=headers).status_code == 401
