import sys
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.security import hash_password, create_access_token
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_participacion import EstadoParticipacion
from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


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
def test_division_personalizada_debe_sumar_el_importe_convertido(client, auth_headers, viaje_con_admin, categoria_gasto, fijar_tipo_cambio):
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
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "100.00"}
        ],
    }
    # suma el importe original (100), no el convertido (250)
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400

    payload["DetalleMontosPersonalizados"][0]["MontoAsignado"] = "250.00"
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200