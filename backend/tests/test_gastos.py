import sys
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.api.routes import gastos as gastos_module
from app.core.config import settings
from app.core.security import hash_password, create_access_token
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_transferencia_liquidacion import EstadoTransferenciaLiquidacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.gasto import Gasto
from app.models.liquidacion_viaje import LiquidacionViaje
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.rol_participante import RolParticipante
from app.models.transferencia_liquidacion import TransferenciaLiquidacion
from app.models.usuario import Usuario
from app.services.websocket_manager import manager
from tests.conftest import TestingSessionLocal


def _agregar_participante_aceptado(db_session, viaje, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(), Apellido="Test", NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)

    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(participante)
    return usuario, participante


# ---------------------------------------------------------------------------
# Helpers para los tests de moneda / tipo de cambio (US-85)
# ---------------------------------------------------------------------------

def _otra_moneda(viaje):
    """Una moneda distinta a la moneda base del viaje."""
    return "EUR" if (viaje.Moneda or "").upper() != "EUR" else "USD"


def _modulo_router_gastos(client):
    """
    Devuelve el módulo del router de gastos (donde vive create_gasto), para parchear ahí
    obtener_tipo_cambio. Se busca en sys.modules en lugar de recorrer client.app.routes,
    que falla si las rutas están montadas en sub-apps o el endpoint está decorado.
    """
    for modulo in list(sys.modules.values()):
        nombre = getattr(modulo, "__name__", "") or ""
        contenido = getattr(modulo, "__dict__", {})
        if (
            nombre.startswith("app.")
            and "create_gasto" in contenido
            and "obtener_tipo_cambio" in contenido
        ):
            return modulo
    raise RuntimeError("No se encontró el módulo del router de gastos (create_gasto + obtener_tipo_cambio)")


@pytest.fixture
def fijar_tipo_cambio(client, monkeypatch):
    """
    Reemplaza obtener_tipo_cambio por un falso (sin red).
    Uso: llamadas = fijar_tipo_cambio(tasa=Decimal("2.5"))  o  fijar_tipo_cambio(error=Exception("caído"))
    Devuelve la lista de llamadas recibidas (origen, destino, fecha).
    """
    modulo = _modulo_router_gastos(client)

    def _fijar(tasa=None, error=None):
        llamadas = []

        def falso(origen, destino, fecha=None):
            llamadas.append((origen, destino, fecha))
            if error is not None:
                raise error
            return tasa

        monkeypatch.setattr(modulo, "obtener_tipo_cambio", falso)
        return llamadas

    return _fijar


def test_create_gasto_individual(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "IdGasto" in response.json()


def test_create_gasto_rejects_future_date(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today() + timedelta(days=5)),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_create_gasto_personalizada_montos_no_coinciden(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursion",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "IdPagador": participante.IdParticipanteViaje,
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "500.00"}
        ],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400 


def test_create_gasto_personalizada_success(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursion",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "IdPagador": participante.IdParticipanteViaje,
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "1000.00"}
        ],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]


def test_create_gasto_igualitaria_dividir_entre_todos(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    _agregar_participante_aceptado(db_session, viaje, "bruno")

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": True,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    montos = (
        db_session.query(ParticipantesGastos)
        .filter_by(IdGasto=id_gasto)
        .all()
    )
    assert len(montos) == 2
    assert all(m.MontoAsignado == 500 for m in montos)


def test_create_gasto_igualitaria_dividir_entre_ciertos_participantes(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    _, otro_participante = _agregar_participante_aceptado(db_session, viaje, "bruno")
    _agregar_participante_aceptado(db_session, viaje, "carla") 

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
        "IdParticipantes": [admin_participante.IdParticipanteViaje, otro_participante.IdParticipanteViaje],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    montos = db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).all()
    assert len(montos) == 2
    assert all(m.MontoAsignado == 500 for m in montos)


def test_delete_gasto_elimina_asignaciones_y_recalcula_liquidacion(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    _agregar_participante_aceptado(db_session, viaje, "bruno")

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": True,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
    }
    create_response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert create_response.status_code == 200
    id_gasto = create_response.json()["IdGasto"]
    liquidacion_original = (
        db_session.query(LiquidacionViaje)
        .filter_by(IdViaje=viaje.IdViaje, Activa=True)
        .one()
    )

    response = client.delete(f"/api/v1/gastos/{id_gasto}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["IdGasto"] == id_gasto
    assert db_session.query(Gasto).filter_by(IdGasto=id_gasto).first() is None
    assert db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).count() == 0
    liquidacion_nueva = (
        db_session.query(LiquidacionViaje)
        .filter_by(IdViaje=viaje.IdViaje, Activa=True)
        .one()
    )
    assert liquidacion_nueva.Version == liquidacion_original.Version + 1
    assert liquidacion_nueva.Transferencias == []


def test_delete_gasto_rechaza_si_hay_transferencias_realizadas(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    _agregar_participante_aceptado(db_session, viaje, "bruno")

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "MontoOriginal": "1200.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": True,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
    }
    create_response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert create_response.status_code == 200
    id_gasto = create_response.json()["IdGasto"]

    estado_realizada = db_session.query(EstadoTransferenciaLiquidacion).filter_by(Nombre="realizada").one()
    transferencia = (
        db_session.query(TransferenciaLiquidacion)
        .join(LiquidacionViaje)
        .filter(LiquidacionViaje.IdViaje == viaje.IdViaje)
        .one()
    )
    transferencia.IdEstadoTransferenciaLiquidacion = estado_realizada.IdEstadoTransferenciaLiquidacion
    db_session.commit()

    response = client.delete(f"/api/v1/gastos/{id_gasto}", headers=auth_headers)

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "EXPENSE_DELETE_LOCKED_BY_PAID_SETTLEMENT"
    assert db_session.query(Gasto).filter_by(IdGasto=id_gasto).first() is not None
    assert db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).count() == 2


def test_create_gasto_igualitaria_rechaza_menos_de_dos_participantes(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "MontoOriginal": "1000.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
        "IdParticipantes": [admin_participante.IdParticipanteViaje],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_get_categories_devuelve_solo_activas(client, db_session):
    activa = CategoriasGastos(Nombre="Comida", Activo=True)
    inactiva = CategoriasGastos(Nombre="Vieja", Activo=False)
    db_session.add_all([activa, inactiva])
    db_session.commit()

    response = client.get("/api/v1/gastos/categories")
    assert response.status_code == 200
    nombres = [c["Nombre"] for c in response.json()]
    assert "Comida" in nombres
    assert "Vieja" not in nombres


def test_get_categories_no_requiere_auth(client, categoria_gasto):
    response = client.get("/api/v1/gastos/categories")
    assert response.status_code == 200


def test_get_trip_participants_requires_auth(client, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}/participants")
    assert response.status_code == 401


def test_get_trip_participants_viaje_no_encontrado(client, auth_headers):
    response = client.get("/api/v1/gastos/trips/9999/participants", headers=auth_headers)
    assert response.status_code == 404


def test_get_trip_participants_rechaza_no_miembro(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    intruso = Usuario(
        Nombre="Intruso", Apellido="Ajeno", NombreUsuario="intruso_gastos",
        Email="intruso_gastos@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(intruso)
    db_session.commit()
    db_session.refresh(intruso)
    token = create_access_token({"sub": intruso.Email, "user_id": intruso.IdUsuario})

    response = client.get(
        f"/api/v1/gastos/trips/{viaje.IdViaje}/participants",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_get_trip_participants_success_incluye_solo_aceptados(client, db_session, auth_headers, viaje_con_admin):
    viaje, admin_participante = viaje_con_admin
    otro_usuario, _ = _agregar_participante_aceptado(db_session, viaje, "bruno")

    invitado = Usuario(
        Nombre="Invitado", Apellido="Pendiente", NombreUsuario="invitado_pendiente",
        Email="invitado_pendiente@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(invitado)
    db_session.commit()
    db_session.refresh(invitado)
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_invitado = db_session.query(EstadoParticipacion).filter_by(Nombre="invitado").first()
    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=invitado.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
    ))
    db_session.commit()

    response = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}/participants", headers=auth_headers)
    assert response.status_code == 200
    nombres_usuario = [p["NombreUsuario"] for p in response.json()]
    assert "ana_test" in nombres_usuario 
    assert "bruno" in nombres_usuario
    assert "invitado_pendiente" not in nombres_usuario



# ---------------------------------------------------------------------------
# US-85: conversión del importe a la moneda base del viaje
# ---------------------------------------------------------------------------

# CP1 / CA 4
def test_gasto_en_moneda_base_no_se_convierte(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    llamadas = fijar_tipo_cambio(tasa=Decimal("9.99"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    assert llamadas == []
    gasto = db_session.query(Gasto).filter_by(IdGasto=id_gasto).first()
    assert gasto.Monto == Decimal("100.00")
    assert gasto.MontoOriginal == Decimal("100.00")
    assert gasto.MonedaOriginal == viaje.Moneda.upper()
    assert gasto.TipoCambio == Decimal("1")


# CP2 / CP6 / CA 1 / CA 2 / CA 4
def test_gasto_en_otra_moneda_guarda_original_cotizacion_y_convertido(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    moneda = _otra_moneda(viaje)
    llamadas = fijar_tipo_cambio(tasa=Decimal("2.5"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    assert len(llamadas) == 1
    origen, destino, _fecha = llamadas[0]
    assert origen == moneda
    assert destino == viaje.Moneda

    gasto = db_session.query(Gasto).filter_by(IdGasto=id_gasto).first()
    assert gasto.MontoOriginal == Decimal("100.00")
    assert gasto.MonedaOriginal == moneda
    assert gasto.TipoCambio == Decimal("2.5")
    assert gasto.Monto == Decimal("250.00")


# CP4 / CP5 / CA 3 / CA 7 / CA 8
def test_gasto_usa_la_cotizacion_de_la_fecha_del_gasto_y_no_la_de_hoy(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    fecha_gasto = date.today() - timedelta(days=10)
    llamadas = fijar_tipo_cambio(tasa=Decimal("2"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": _otra_moneda(viaje),
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(fecha_gasto),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    assert len(llamadas) == 1
    assert llamadas[0][2] == fecha_gasto
    assert llamadas[0][2] != date.today()
    gasto = db_session.query(Gasto).filter_by(IdGasto=id_gasto).first()
    assert gasto.FechaGasto == fecha_gasto


# CA 3 / CA 8
def test_gasto_cada_gasto_consulta_la_cotizacion_de_su_propia_fecha(client, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    fechas = [date.today() - timedelta(days=7), date.today() - timedelta(days=2)]
    llamadas = fijar_tipo_cambio(tasa=Decimal("2"))

    for fecha in fechas:
        payload = {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Museo",
            "MontoOriginal": "100.00",
            "MonedaOriginal": _otra_moneda(viaje),
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(fecha),
            "EsCompartido": False,
        }
        response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
        assert response.status_code == 200

    assert [llamada[2] for llamada in llamadas] == fechas


# CP7 / CA 9 (parte backend): sin servicio de cotización no se persiste nada a medias
def test_servicio_de_cotizacion_caido_devuelve_503_y_no_guarda_el_gasto(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    fijar_tipo_cambio(error=Exception("servicio caído"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": _otra_moneda(viaje),
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 503

    assert db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).count() == 0
    assert db_session.query(ParticipantesGastos).count() == 0


def test_servicio_de_cotizacion_caido_no_afecta_gastos_en_moneda_base(client, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, _ = viaje_con_admin
    fijar_tipo_cambio(error=Exception("servicio caído"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200


# CA 5
def test_division_igualitaria_usa_el_importe_convertido(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, admin_participante = viaje_con_admin
    _agregar_participante_aceptado(db_session, viaje, "bruno")
    fijar_tipo_cambio(tasa=Decimal("2.5"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": _otra_moneda(viaje),
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": True,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    montos = db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).all()
    assert len(montos) == 2
    assert all(m.MontoAsignado == Decimal("125.00") for m in montos)


# Contrato actual: en la división personalizada los montos se expresan en la moneda base
# y deben sumar el importe CONVERTIDO (no el original).
def test_division_personalizada_se_valida_en_la_moneda_original_y_se_convierte(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    # US 79: el usuario reparte el gasto en la moneda en que lo cargó. Las partes
    # deben sumar el monto original y se guardan convertidas a la moneda del viaje.
    # (Antes, US-85, debían sumar el monto ya convertido.)
    viaje, participante = viaje_con_admin
    fijar_tipo_cambio(tasa=Decimal("2.5"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Museo",
        "MontoOriginal": "100.00",
        "MonedaOriginal": _otra_moneda(viaje),
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "IdPagador": participante.IdParticipanteViaje,
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "250.00"}
        ],
    }
    # suma el importe convertido (250), no el original (100)
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400

    payload["DetalleMontosPersonalizados"][0]["MontoAsignado"] = "100.00"
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    asignacion = db_session.query(ParticipantesGastos).filter_by(IdGasto=response.json()["IdGasto"]).one()
    assert asignacion.MontoAsignado == Decimal("250.00")


def test_division_personalizada_en_otra_moneda_reparte_el_redondeo(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
    viaje, ana = viaje_con_admin
    _, bruno = _agregar_participante_aceptado(db_session, viaje, "bruno")
    _, carla = _agregar_participante_aceptado(db_session, viaje, "carla")
    fijar_tipo_cambio(tasa=Decimal("1.333333"))
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursión",
        "MontoOriginal": "100.00",
        "MonedaOriginal": _otra_moneda(viaje),
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "IdPagador": ana.IdParticipanteViaje,
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": ana.IdParticipanteViaje, "MontoAsignado": "33.33"},
            {"IdParticipanteViaje": bruno.IdParticipanteViaje, "MontoAsignado": "33.33"},
            {"IdParticipanteViaje": carla.IdParticipanteViaje, "MontoAsignado": "33.34"},
        ],
    }

    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)

    assert response.status_code == 200, response.text
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    asignaciones = db_session.query(ParticipantesGastos).filter_by(IdGasto=gasto.IdGasto).all()
    assert sum(Decimal(a.MontoAsignado) for a in asignaciones) == Decimal(gasto.Monto)


# ===========================================================================
# US 79 - Editar gasto
#
# Escenario base (fixture `gasto_editable`):
# - Ana: administradora del viaje, incluida en la división; no creó ni pagó.
# - Bruno: registró el gasto (creador); no está en la división ni pagó.
# - Carla: pagadora actual, incluida en la división.
# - Dario: incluido en la división; no creó ni pagó.
# Gasto "Cena": 900 ARS dividido en partes iguales entre Ana, Carla y Dario.
# ===========================================================================

API_GASTOS = "/api/v1/gastos"


def _headers_de(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


class _GastoEditable:
    def __init__(self, viaje, categoria, personas, id_gasto):
        self.viaje = viaje
        self.categoria = categoria
        self.personas = personas  # nombre -> (usuario, participante)
        self.id_gasto = id_gasto

    def usuario(self, nombre):
        return self.personas[nombre][0]

    def participante(self, nombre):
        return self.personas[nombre][1].IdParticipanteViaje

    def headers(self, nombre):
        return _headers_de(self.usuario(nombre))

    def payload(self, **cambios):
        """Datos actuales del gasto, con los `cambios` indicados."""
        base = {
            "Nombre": "Cena",
            "MontoOriginal": "900.00",
            "MonedaOriginal": "ARS",
            "IdCategoria": self.categoria.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": False,
            "TipoDivision": "igualitaria",
            "IdPagador": self.participante("carla"),
            "IdParticipantes": [
                self.participante("ana"),
                self.participante("carla"),
                self.participante("dario"),
            ],
        }
        base.update(cambios)
        return base


@pytest.fixture
def gasto_editable(client, db_session, viaje_con_admin, usuario_activo, categoria_gasto):
    viaje, participante_ana = viaje_con_admin
    # El viaje sigue en curso aunque los tests se ejecuten más adelante.
    viaje.FechaInicio = date.today() - timedelta(days=5)
    viaje.FechaFin = date.today() + timedelta(days=30)
    db_session.commit()

    personas = {"ana": (usuario_activo, participante_ana)}
    for nombre in ("bruno", "carla", "dario"):
        personas[nombre] = _agregar_participante_aceptado(db_session, viaje, nombre)

    esc = _GastoEditable(viaje, categoria_gasto, personas, id_gasto=None)
    alta = esc.payload()
    alta["IdViaje"] = viaje.IdViaje
    response = client.post(f"{API_GASTOS}/", json=alta, headers=esc.headers("bruno"))
    assert response.status_code == 200, response.text
    esc.id_gasto = response.json()["IdGasto"]

    # Las notificaciones del alta no interesan para estos tests.
    db_session.query(Notificacion).delete()
    db_session.commit()
    return esc


@pytest.fixture
def ws_gastos(monkeypatch):
    """El WebSocket de edición abre su propia sesión: se usa la de test.
    Además se limpia el estado en memoria de las ediciones activas."""
    monkeypatch.setattr(gastos_module, "SessionLocal", TestingSessionLocal)
    manager._ediciones_gastos.clear()
    yield
    manager._ediciones_gastos.clear()


@pytest.fixture
def broadcasts(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(gastos_module.manager, "broadcast_to_trip", mock)
    return mock


def _editar(client, esc, quien, **cambios):
    return client.put(
        f"{API_GASTOS}/{esc.id_gasto}", json=esc.payload(**cambios), headers=esc.headers(quien)
    )


def _asignaciones(db_session, id_gasto):
    db_session.expire_all()
    return {
        a.IdParticipanteViaje: Decimal(a.MontoAsignado)
        for a in db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).all()
    }


def _notificados(db_session, esc):
    """Nombres de quienes recibieron la notificación de modificación (con repetidos)."""
    db_session.expire_all()
    por_id = {usuario.IdUsuario: nombre for nombre, (usuario, _) in esc.personas.items()}
    return sorted(
        por_id[n.IdUsuario]
        for n in db_session.query(Notificacion).filter_by(Tipo="gasto_modificado").all()
    )


def _ws_url(esc, quien):
    usuario = esc.usuario(quien)
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return f"{API_GASTOS}/ws/{esc.id_gasto}?token={token}"


# --- Datos y validaciones ---------------------------------------------------

def test_editar_gasto_cp01_monto_valido_actualiza_balances(client, db_session, gasto_editable):
    esc = gasto_editable
    response = _editar(client, esc, "carla", MontoOriginal="1200.00")

    assert response.status_code == 200, response.text
    gasto = db_session.get(Gasto, esc.id_gasto)
    db_session.refresh(gasto)
    assert gasto.Monto == Decimal("1200.00")
    assert set(_asignaciones(db_session, esc.id_gasto).values()) == {Decimal("400.00")}

    liquidacion = client.get(
        f"/api/v1/trips/{esc.viaje.IdViaje}/settlement", headers=esc.headers("ana")
    ).json()
    balances = {
        r["IdParticipanteViaje"]: Decimal(str(r["BalanceOriginal"]))
        for r in liquidacion["ResumenParticipantes"]
    }
    assert balances[esc.participante("carla")] == Decimal("800.00")
    assert balances[esc.participante("ana")] == Decimal("-400.00")
    assert balances[esc.participante("dario")] == Decimal("-400.00")


def test_editar_gasto_cp02_monto_cero_falla(client, gasto_editable):
    response = _editar(client, gasto_editable, "carla", MontoOriginal="0")
    assert response.status_code == 400
    assert "mayor a cero" in response.json()["detail"]


def test_editar_gasto_cp07_monto_negativo_falla(client, db_session, gasto_editable):
    response = _editar(client, gasto_editable, "carla", MontoOriginal="-50.00")

    assert response.status_code == 400
    gasto = db_session.get(Gasto, gasto_editable.id_gasto)
    db_session.refresh(gasto)
    assert gasto.MontoOriginal == Decimal("900.00")


def test_editar_gasto_cp08_categoria_vacia_falla(client, gasto_editable):
    response = _editar(client, gasto_editable, "carla", IdCategoria=None)
    assert response.status_code == 400
    assert "categoría" in response.json()["detail"]


def test_editar_gasto_sin_pagador_falla(client, gasto_editable):
    response = _editar(client, gasto_editable, "carla", IdPagador=None)
    assert response.status_code == 400
    assert "quién pagó" in response.json()["detail"]


def test_editar_gasto_compartido_sin_tipo_division_falla(client, gasto_editable):
    response = _editar(client, gasto_editable, "carla", TipoDivision=None)
    assert response.status_code == 400


def test_editar_gasto_nombre_fecha_y_categoria(client, db_session, gasto_editable):
    esc = gasto_editable
    transporte = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(transporte)
    db_session.commit()
    ayer = date.today() - timedelta(days=1)

    response = _editar(
        client, esc, "carla", Nombre="Taxi", FechaGasto=str(ayer), IdCategoria=transporte.IdCategoria
    )

    assert response.status_code == 200, response.text
    detalle = client.get(f"{API_GASTOS}/{esc.id_gasto}", headers=esc.headers("carla")).json()
    assert detalle["Nombre"] == "Taxi"
    assert detalle["FechaGasto"] == str(ayer)
    assert detalle["NombreCategoria"] == "Transporte"


def test_editar_gasto_cp09_cambiar_moneda_recalcula_importe_convertido(
    client, db_session, gasto_editable, fijar_tipo_cambio
):
    llamadas = fijar_tipo_cambio(tasa=Decimal("1000"))

    response = _editar(client, gasto_editable, "carla", MontoOriginal="3.00", MonedaOriginal="USD")

    assert response.status_code == 200, response.text
    assert llamadas == [("USD", "ARS", date.today())]
    gasto = db_session.get(Gasto, gasto_editable.id_gasto)
    db_session.refresh(gasto)
    assert gasto.MonedaOriginal == "USD"
    assert gasto.TipoCambio == Decimal("1000")
    assert gasto.Monto == Decimal("3000.00")
    assert set(_asignaciones(db_session, gasto_editable.id_gasto).values()) == {Decimal("1000.00")}


def test_editar_gasto_sin_cambiar_moneda_ni_monto_no_recotiza(client, gasto_editable, fijar_tipo_cambio):
    llamadas = fijar_tipo_cambio(tasa=Decimal("1000"))

    response = _editar(client, gasto_editable, "carla", Nombre="Cena con postre")

    assert response.status_code == 200, response.text
    assert llamadas == []


def test_editar_gasto_cp10_igualitaria_a_personalizada_que_suma_el_total(client, db_session, gasto_editable):
    esc = gasto_editable
    response = _editar(
        client,
        esc,
        "carla",
        TipoDivision="personalizada",
        DetalleMontosPersonalizados=[
            {"IdParticipanteViaje": esc.participante("ana"), "MontoAsignado": "500.00"},
            {"IdParticipanteViaje": esc.participante("dario"), "MontoAsignado": "400.00"},
        ],
    )

    assert response.status_code == 200, response.text
    assert _asignaciones(db_session, esc.id_gasto) == {
        esc.participante("ana"): Decimal("500.00"),
        esc.participante("dario"): Decimal("400.00"),
    }


def test_editar_gasto_cp11_personalizada_que_no_suma_el_total_falla(client, db_session, gasto_editable):
    esc = gasto_editable
    response = _editar(
        client,
        esc,
        "carla",
        TipoDivision="personalizada",
        DetalleMontosPersonalizados=[
            {"IdParticipanteViaje": esc.participante("ana"), "MontoAsignado": "500.00"},
            {"IdParticipanteViaje": esc.participante("dario"), "MontoAsignado": "100.00"},
        ],
    )

    assert response.status_code == 400
    # La división original queda intacta.
    assert set(_asignaciones(db_session, esc.id_gasto).values()) == {Decimal("300.00")}


def test_editar_gasto_division_personalizada_en_otra_moneda(client, db_session, gasto_editable, fijar_tipo_cambio):
    # El gasto pasa a USD 3 (ARS 3000) y se reparte en dólares: 2 y 1.
    fijar_tipo_cambio(tasa=Decimal("1000"))
    esc = gasto_editable
    response = _editar(
        client,
        esc,
        "carla",
        MontoOriginal="3.00",
        MonedaOriginal="USD",
        TipoDivision="personalizada",
        DetalleMontosPersonalizados=[
            {"IdParticipanteViaje": esc.participante("ana"), "MontoAsignado": "2.00"},
            {"IdParticipanteViaje": esc.participante("dario"), "MontoAsignado": "1.00"},
        ],
    )

    assert response.status_code == 200, response.text
    assert _asignaciones(db_session, esc.id_gasto) == {
        esc.participante("ana"): Decimal("2000.00"),
        esc.participante("dario"): Decimal("1000.00"),
    }


# --- Permisos ---------------------------------------------------------------

def test_editar_gasto_cp03_pagador_actual_que_no_lo_registro_puede_editar(client, gasto_editable):
    assert _editar(client, gasto_editable, "carla", Nombre="Cena editada").status_code == 200


def test_editar_gasto_creador_que_no_es_pagador_puede_editar(client, gasto_editable):
    assert _editar(client, gasto_editable, "bruno", Nombre="Cena editada").status_code == 200


def test_editar_gasto_cp04_participante_de_la_division_no_puede_editar(client, db_session, gasto_editable):
    response = _editar(client, gasto_editable, "dario", MontoOriginal="1.00")

    assert response.status_code == 403
    assert response.headers["X-Error-Code"] == "EXPENSE_EDIT_FORBIDDEN"
    assert response.json()["detail"] == "Solo el creador del gasto o su pagador actual pueden editarlo."
    gasto = db_session.get(Gasto, gasto_editable.id_gasto)
    db_session.refresh(gasto)
    assert gasto.MontoOriginal == Decimal("900.00")


def test_editar_gasto_cp05_administrador_no_creador_ni_pagador_no_puede_editar(client, gasto_editable):
    response = _editar(client, gasto_editable, "ana", MontoOriginal="1.00")
    assert response.status_code == 403
    assert response.headers["X-Error-Code"] == "EXPENSE_EDIT_FORBIDDEN"


def test_editar_gasto_cp06_cambiar_pagador_actualiza_el_permiso(client, gasto_editable):
    esc = gasto_editable
    assert _editar(client, esc, "carla", IdPagador=esc.participante("dario")).status_code == 200

    # El nuevo pagador puede editar.
    assert _editar(client, esc, "dario", IdPagador=esc.participante("dario")).status_code == 200
    # El pagador anterior, que no es el creador, pierde el permiso.
    assert _editar(client, esc, "carla", IdPagador=esc.participante("dario")).status_code == 403
    # El creador original lo conserva.
    assert _editar(client, esc, "bruno", IdPagador=esc.participante("dario")).status_code == 200


def test_editar_gasto_sin_creador_registrado_solo_lo_edita_el_pagador(client, db_session, gasto_editable):
    # Gastos cargados antes de la US 79 no tienen creador.
    gasto = db_session.get(Gasto, gasto_editable.id_gasto)
    gasto.IdParticipanteCreador = None
    db_session.commit()

    assert _editar(client, gasto_editable, "bruno").status_code == 403
    assert _editar(client, gasto_editable, "carla").status_code == 200


def test_editar_gasto_inexistente_devuelve_404(client, gasto_editable):
    response = client.put(
        f"{API_GASTOS}/999999", json=gasto_editable.payload(), headers=gasto_editable.headers("carla")
    )
    assert response.status_code == 404


def test_alta_de_gasto_guarda_el_creador(db_session, gasto_editable):
    gasto = db_session.get(Gasto, gasto_editable.id_gasto)
    assert gasto.IdParticipanteCreador == gasto_editable.participante("bruno")


# --- Estado del viaje y liquidación -------------------------------------------

def test_editar_gasto_cp12_transferencia_realizada_bloquea_la_edicion(client, db_session, gasto_editable):
    realizada = db_session.query(EstadoTransferenciaLiquidacion).filter_by(Nombre="realizada").one()
    transferencia = (
        db_session.query(TransferenciaLiquidacion)
        .join(LiquidacionViaje)
        .filter(LiquidacionViaje.IdViaje == gasto_editable.viaje.IdViaje, LiquidacionViaje.Activa.is_(True))
        .first()
    )
    transferencia.IdEstadoTransferenciaLiquidacion = realizada.IdEstadoTransferenciaLiquidacion
    db_session.commit()

    response = _editar(client, gasto_editable, "carla", MontoOriginal="1200.00")

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "EXPENSE_EDIT_LOCKED_BY_PAID_SETTLEMENT"
    assert "pagos registrados" in response.json()["detail"]


def test_editar_gasto_cp15_viaje_finalizado_falla(client, db_session, gasto_editable):
    gasto_editable.viaje.FechaFin = date.today() - timedelta(days=1)
    db_session.commit()

    response = _editar(client, gasto_editable, "carla", MontoOriginal="1200.00")

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_FINISHED"


def test_editar_gasto_cp16_viaje_cancelado_falla(client, db_session, gasto_editable):
    cancelado = db_session.query(EstadoViaje).filter_by(Nombre="cancelado").one()
    gasto_editable.viaje.IdEstadoViaje = cancelado.IdEstadoViaje
    db_session.commit()

    response = _editar(client, gasto_editable, "carla", MontoOriginal="1200.00")

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_CANCELLED"
    assert response.json()["detail"] == "No se pueden editar gastos de un viaje cancelado."


def test_editar_gasto_genera_nueva_version_de_la_liquidacion(client, db_session, gasto_editable):
    viaje_id = gasto_editable.viaje.IdViaje
    version_previa = db_session.query(LiquidacionViaje).filter_by(IdViaje=viaje_id, Activa=True).one().Version

    assert _editar(client, gasto_editable, "carla", MontoOriginal="1200.00").status_code == 200

    db_session.expire_all()
    activas = db_session.query(LiquidacionViaje).filter_by(IdViaje=viaje_id, Activa=True).all()
    assert len(activas) == 1
    assert activas[0].Version == version_previa + 1


# --- Confirmación y tiempo real ---------------------------------------------

def test_editar_gasto_cp13_cambios_se_emiten_al_viaje_sin_recargar(client, gasto_editable, broadcasts):
    assert _editar(client, gasto_editable, "carla", MontoOriginal="1200.00").status_code == 200

    eventos = [call.args for call in broadcasts.await_args_list]
    assert (
        gasto_editable.viaje.IdViaje,
        {"tipo": "gasto_actualizado", "idGasto": gasto_editable.id_gasto},
    ) in eventos


def test_editar_gasto_fallido_no_emite_cambios(client, gasto_editable, broadcasts):
    assert _editar(client, gasto_editable, "carla", MontoOriginal="0").status_code == 400
    assert not any(call.args[1]["tipo"] == "gasto_actualizado" for call in broadcasts.await_args_list)


def test_editar_gasto_cp14_muestra_mensaje_de_confirmacion(client, gasto_editable):
    response = _editar(client, gasto_editable, "carla", MontoOriginal="1200.00")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Los cambios del gasto se guardaron correctamente.",
        "IdGasto": gasto_editable.id_gasto,
    }


# --- Notificaciones ---------------------------------------------------------

def test_editar_gasto_cp17_notifica_division_creador_y_pagador(client, db_session, gasto_editable):
    # Edita la pagadora: se notifica a la división y al creador, no a ella misma.
    assert _editar(client, gasto_editable, "carla", MontoOriginal="1200.00").status_code == 200
    assert _notificados(db_session, gasto_editable) == ["ana", "bruno", "dario"]


def test_editar_gasto_cp17_si_edita_el_creador_se_notifica_al_pagador(client, db_session, gasto_editable):
    assert _editar(client, gasto_editable, "bruno", MontoOriginal="1200.00").status_code == 200
    assert _notificados(db_session, gasto_editable) == ["ana", "carla", "dario"]


def test_editar_gasto_notificacion_identifica_gasto_y_autor(client, db_session, gasto_editable):
    assert _editar(client, gasto_editable, "carla", Nombre="Cena de despedida").status_code == 200

    notificacion = db_session.query(Notificacion).filter_by(Tipo="gasto_modificado").first()
    assert notificacion.IdViaje == gasto_editable.viaje.IdViaje
    assert notificacion.Titulo == f"Gasto modificado en {gasto_editable.viaje.Titulo}"
    assert notificacion.Mensaje == 'Carla Test modificó el gasto "Cena de despedida" (antes "Cena").'


def test_editar_gasto_cp18_cp19_cambio_de_pagador_notifica_nuevo_pagador_y_division(
    client, db_session, gasto_editable
):
    esc = gasto_editable
    # Eva queda fuera de la división: solo se la notifica por ser la nueva pagadora.
    esc.personas["eva"] = _agregar_participante_aceptado(db_session, esc.viaje, "eva")

    assert _editar(client, esc, "bruno", IdPagador=esc.participante("eva")).status_code == 200

    notificados = _notificados(db_session, esc)
    assert "eva" in notificados                         # CP18: nuevo pagador
    assert {"ana", "carla", "dario"} <= set(notificados)  # CP19: división actual


def test_editar_gasto_cp20_pagador_anterior_fuera_de_la_division_no_se_notifica(
    client, db_session, gasto_editable
):
    esc = gasto_editable
    # Carla deja de pagar y de estar en la división.
    response = _editar(
        client,
        esc,
        "carla",
        IdPagador=esc.participante("dario"),
        IdParticipantes=[esc.participante("ana"), esc.participante("dario")],
    )

    assert response.status_code == 200, response.text
    assert _notificados(db_session, esc) == ["ana", "bruno", "dario"]


def test_editar_gasto_cp20_pagador_anterior_que_sigue_en_la_division_se_notifica(
    client, db_session, gasto_editable
):
    esc = gasto_editable
    assert _editar(client, esc, "bruno", IdPagador=esc.participante("dario")).status_code == 200
    assert "carla" in _notificados(db_session, esc)


def test_editar_gasto_cp21_usuario_con_varios_roles_recibe_una_sola_notificacion(
    client, db_session, gasto_editable
):
    # Carla es pagadora y está en la división; edita Bruno.
    assert _editar(client, gasto_editable, "bruno", MontoOriginal="1200.00").status_code == 200

    notificados = _notificados(db_session, gasto_editable)
    assert notificados.count("carla") == 1
    assert len(notificados) == len(set(notificados))


def test_editar_gasto_rechazado_no_notifica(client, db_session, gasto_editable):
    assert _editar(client, gasto_editable, "carla", MontoOriginal="-1").status_code == 400
    assert _editar(client, gasto_editable, "dario").status_code == 403
    assert _notificados(db_session, gasto_editable) == []


# --- Detalle del gasto (GET) ------------------------------------------------

def test_detalle_gasto_usuario_sin_permiso_puede_consultar(client, gasto_editable):
    body = client.get(
        f"{API_GASTOS}/{gasto_editable.id_gasto}", headers=gasto_editable.headers("dario")
    ).json()

    assert body["Nombre"] == "Cena"
    assert body["NombrePagador"] == "Carla Test"
    assert body["NombreCreador"] == "Bruno Test"
    assert body["EsCompartido"] is True
    assert body["TipoDivision"] == "igualitaria"
    assert len(body["Participantes"]) == 3
    assert body["PuedeEditar"] is False
    assert body["CodigoNoEditable"] == "EXPENSE_EDIT_FORBIDDEN"
    assert body["MotivoNoEditable"] == "Solo el creador del gasto o su pagador actual pueden editarlo."


def test_detalle_gasto_creador_y_pagador_pueden_editar(client, gasto_editable):
    for quien in ("bruno", "carla"):
        body = client.get(
            f"{API_GASTOS}/{gasto_editable.id_gasto}", headers=gasto_editable.headers(quien)
        ).json()
        assert body["PuedeEditar"] is True
        assert body["MotivoNoEditable"] is None


def test_detalle_gasto_viaje_cancelado_informa_el_motivo(client, db_session, gasto_editable):
    cancelado = db_session.query(EstadoViaje).filter_by(Nombre="cancelado").one()
    gasto_editable.viaje.IdEstadoViaje = cancelado.IdEstadoViaje
    db_session.commit()

    body = client.get(
        f"{API_GASTOS}/{gasto_editable.id_gasto}", headers=gasto_editable.headers("carla")
    ).json()
    assert body["PuedeEditar"] is False
    assert body["CodigoNoEditable"] == "TRIP_CANCELLED"


def test_detalle_gasto_inexistente_y_categorias_siguen_funcionando(client, gasto_editable):
    assert client.get(f"{API_GASTOS}/999999", headers=gasto_editable.headers("carla")).status_code == 404
    assert client.get(f"{API_GASTOS}/categories").status_code == 200


# --- Edición concurrente (WebSocket) ----------------------------------------

def test_editar_gasto_cp23_creador_no_puede_editar_mientras_edita_el_pagador(
    client, gasto_editable, ws_gastos
):
    esc = gasto_editable
    with client.websocket_connect(_ws_url(esc, "carla")) as ws_carla:
        assert ws_carla.receive_json()["tipo"] == "edicion_gasto_concedida"

        with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
            respuesta = ws_bruno.receive_json()

        assert respuesta["tipo"] == "edicion_gasto_rechazada"
        assert respuesta["codigo"] == "EXPENSE_BEING_EDITED"
        assert "está siendo editado por otro usuario" in respuesta["mensaje"]
        assert "Carla Test" in respuesta["mensaje"]


def test_editar_gasto_cp24_pagador_no_puede_editar_mientras_edita_el_creador(
    client, gasto_editable, ws_gastos
):
    esc = gasto_editable
    with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
        assert ws_bruno.receive_json()["tipo"] == "edicion_gasto_concedida"

        with client.websocket_connect(_ws_url(esc, "carla")) as ws_carla:
            assert ws_carla.receive_json()["codigo"] == "EXPENSE_BEING_EDITED"

        # Tampoco puede guardar por PUT mientras la edición es del creador.
        response = _editar(client, esc, "carla", MontoOriginal="1.00")
        assert response.status_code == 423
        assert response.headers["X-Error-Code"] == "EXPENSE_BEING_EDITED"


def test_editar_gasto_cp25_guardar_libera_la_edicion(client, gasto_editable, ws_gastos):
    esc = gasto_editable
    with client.websocket_connect(_ws_url(esc, "carla")) as ws_carla:
        ws_carla.receive_json()
        assert _editar(client, esc, "carla", MontoOriginal="1200.00").status_code == 200

        # Con el formulario de Carla todavía abierto, Bruno ya puede editar.
        with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
            assert ws_bruno.receive_json()["tipo"] == "edicion_gasto_concedida"


def test_editar_gasto_cp25_cancelar_libera_la_edicion(client, gasto_editable, ws_gastos):
    esc = gasto_editable
    with client.websocket_connect(_ws_url(esc, "carla")) as ws_carla:
        ws_carla.receive_json()
    # Cerrar el formulario (desconectar) libera la edición.

    with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
        assert ws_bruno.receive_json()["tipo"] == "edicion_gasto_concedida"


def test_editar_gasto_cp22_cancelar_la_edicion_no_notifica(client, db_session, gasto_editable, ws_gastos):
    with client.websocket_connect(_ws_url(gasto_editable, "carla")) as ws_carla:
        ws_carla.receive_json()

    assert _notificados(db_session, gasto_editable) == []


def test_editar_gasto_cp26_edicion_interrumpida_se_libera_por_inactividad(
    client, gasto_editable, ws_gastos, monkeypatch
):
    esc = gasto_editable
    reloj = [1000.0]
    monkeypatch.setattr(manager, "_ahora", lambda: reloj[0])
    ttl = settings.expense_edit_lock_ttl_seconds

    # Carla abre la edición y deja de renovar (por ejemplo, perdió la conexión).
    with client.websocket_connect(_ws_url(esc, "carla")) as ws_carla:
        ws_carla.receive_json()

        # Antes de cumplirse el período de inactividad sigue bloqueado.
        reloj[0] += ttl - 10
        with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
            assert ws_bruno.receive_json()["tipo"] == "edicion_gasto_rechazada"

        # Cumplido el período, otro usuario autorizado puede editar.
        reloj[0] += 20
        with client.websocket_connect(_ws_url(esc, "bruno")) as ws_bruno:
            assert ws_bruno.receive_json()["tipo"] == "edicion_gasto_concedida"

            # Si Carla vuelve y renueva, se le informa que perdió la edición.
            ws_carla.send_json({"tipo": "renovar"})
            assert ws_carla.receive_json()["tipo"] == "edicion_gasto_perdida"


def test_editar_gasto_ws_usuario_sin_permiso_es_rechazado(client, gasto_editable, ws_gastos):
    with client.websocket_connect(_ws_url(gasto_editable, "dario")) as ws:
        respuesta = ws.receive_json()

    assert respuesta["tipo"] == "edicion_gasto_rechazada"
    assert respuesta["codigo"] == "EXPENSE_EDIT_FORBIDDEN"
    assert "creador del gasto o su pagador actual" in respuesta["mensaje"]