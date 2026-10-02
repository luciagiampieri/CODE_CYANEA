"""US 94 - Confirmar gasto precargado desde un comprobante.

El escaneo (US 93) no persiste nada: el gasto se registra con POST /gastos
cuando el usuario confirma el formulario. Estos tests cubren las reglas que
aplica el backend al confirmar: monto mayor a cero (RN-21), pagador
obligatorio (RN-19), conversión obligatoria a ARS (RN-39) y división
personalizada que coincida con el total.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.security import hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario

URL = "/api/v1/gastos/"


def _agregar_participante(db_session, viaje, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(), Apellido="Test", NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=aceptado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(participante)
    return participante


def _payload(viaje, categoria, **cambios):
    """Gasto tal como lo envía el formulario precargado desde un comprobante."""
    base = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Café Martínez",
        "MontoOriginal": "15230.50",
        "MonedaOriginal": "ARS",
        "IdCategoria": categoria.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
        "DesdeComprobante": True,
    }
    base.update(cambios)
    return base


@pytest.fixture
def cotizacion(monkeypatch):
    """Reemplaza el servicio de cotización y registra si se lo llamó."""
    llamadas = []

    def falso(origen, destino, fecha=None):
        llamadas.append((origen, destino))
        return Decimal("0.001")

    monkeypatch.setattr("app.api.routes.gastos.obtener_tipo_cambio", falso)
    return llamadas


# CP1
def test_confirma_gasto_precargado_sin_modificar(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin

    response = client.post(URL, json=_payload(viaje, categoria_gasto), headers=auth_headers)

    assert response.status_code == 200
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    assert gasto.Nombre == "Café Martínez"
    assert gasto.Monto == Decimal("15230.50")
    assert gasto.IdPagador == participante.IdParticipanteViaje


# CP2
def test_registra_el_monto_corregido(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin

    response = client.post(
        URL, json=_payload(viaje, categoria_gasto, MontoOriginal="9999.99"), headers=auth_headers
    )

    assert response.status_code == 200
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    assert gasto.Monto == Decimal("9999.99")
    assert gasto.MontoOriginal == Decimal("9999.99")


# CP3 / RN-21
@pytest.mark.parametrize("monto", [None, "", "abc"])
def test_rechaza_monto_vacio_o_no_numerico(client, auth_headers, viaje_con_admin, categoria_gasto, monto):
    viaje, _ = viaje_con_admin

    response = client.post(URL, json=_payload(viaje, categoria_gasto, MontoOriginal=monto), headers=auth_headers)

    assert response.status_code == 422


@pytest.mark.parametrize("monto", ["0", "-10"])
def test_rechaza_monto_no_positivo(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, monto):
    viaje, _ = viaje_con_admin

    response = client.post(URL, json=_payload(viaje, categoria_gasto, MontoOriginal=monto), headers=auth_headers)

    assert response.status_code == 400
    assert "mayor a cero" in response.json()["detail"]
    assert db_session.query(Gasto).count() == 0


# CP4
def test_rechaza_gasto_sin_categoria(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = _payload(viaje, categoria_gasto)
    payload.pop("IdCategoria")

    response = client.post(URL, json=payload, headers=auth_headers)

    assert response.status_code == 422


# RN-19
def test_rechaza_gasto_compartido_sin_pagador(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    _agregar_participante(db_session, viaje, "bruno")

    response = client.post(
        URL,
        json=_payload(viaje, categoria_gasto, EsCompartido=True, TipoDivision="igualitaria", DividirEntreTodos=True),
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Debés indicar quién pagó el gasto."


def test_permite_cambiar_el_pagador(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    bruno = _agregar_participante(db_session, viaje, "bruno")

    response = client.post(
        URL,
        json=_payload(
            viaje, categoria_gasto,
            EsCompartido=True, TipoDivision="igualitaria", DividirEntreTodos=True,
            IdPagador=bruno.IdParticipanteViaje,
        ),
        headers=auth_headers,
    )

    assert response.status_code == 200
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    assert gasto.IdPagador == bruno.IdParticipanteViaje


def test_rechaza_pagador_ajeno_al_viaje(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin

    response = client.post(
        URL,
        json=_payload(
            viaje, categoria_gasto,
            EsCompartido=True, TipoDivision="igualitaria", DividirEntreTodos=True, IdPagador=987654,
        ),
        headers=auth_headers,
    )

    assert response.status_code == 400


# AC4: el frontend precarga como pagador al usuario que escaneó
def test_participantes_marcan_al_usuario_actual(client, db_session, auth_headers, viaje_con_admin):
    viaje, participante = viaje_con_admin
    _agregar_participante(db_session, viaje, "bruno")

    response = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}/participants", headers=auth_headers)

    assert response.status_code == 200
    actuales = [p["IdParticipanteViaje"] for p in response.json() if p["EsUsuarioActual"]]
    assert actuales == [participante.IdParticipanteViaje]


# CP6 / RN-39
def test_rechaza_comprobante_en_dolares_sin_conversion(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, cotizacion):
    viaje, _ = viaje_con_admin

    response = client.post(
        URL, json=_payload(viaje, categoria_gasto, MontoOriginal="50", MonedaOriginal="USD"), headers=auth_headers
    )

    assert response.status_code == 400
    assert response.headers["X-Error-Code"] == "CONVERSION_REQUIRED"
    assert "USD" in response.json()["detail"]
    assert cotizacion == []
    assert db_session.query(Gasto).count() == 0


def test_rechaza_monto_convertido_no_positivo(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin

    response = client.post(
        URL,
        json=_payload(viaje, categoria_gasto, MontoOriginal="50", MonedaOriginal="USD", MontoConvertidoARS="0"),
        headers=auth_headers,
    )

    assert response.status_code == 400


# CP7
def test_registra_comprobante_en_dolares_con_monto_convertido(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, cotizacion):
    viaje, _ = viaje_con_admin  # viaje en ARS

    response = client.post(
        URL,
        json=_payload(viaje, categoria_gasto, MontoOriginal="50", MonedaOriginal="USD", MontoConvertidoARS="60000"),
        headers=auth_headers,
    )

    assert response.status_code == 200
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    assert gasto.Monto == Decimal("60000")
    assert gasto.MontoOriginal == Decimal("50")
    assert gasto.MonedaOriginal == "USD"
    assert gasto.TipoCambio == Decimal("1200")
    # Se usa la conversión del usuario, no la cotización automática.
    assert cotizacion == []


def test_viaje_en_otra_moneda_convierte_el_monto_en_ars(client, db_session, auth_headers, viaje_con_admin, categoria_gasto, cotizacion):
    viaje, _ = viaje_con_admin
    viaje.Moneda = "USD"
    db_session.commit()

    response = client.post(
        URL,
        json=_payload(viaje, categoria_gasto, MontoOriginal="50", MonedaOriginal="EUR", MontoConvertidoARS="60000"),
        headers=auth_headers,
    )

    assert response.status_code == 200
    gasto = db_session.get(Gasto, response.json()["IdGasto"])
    assert gasto.Monto == Decimal("60")  # 60000 ARS * 0.001
    assert cotizacion == [("ARS", "USD")]


def test_la_carga_manual_sigue_convirtiendo_automaticamente(client, auth_headers, viaje_con_admin, categoria_gasto, cotizacion):
    """Sin DesdeComprobante se mantiene el comportamiento de la US-85."""
    viaje, _ = viaje_con_admin

    response = client.post(
        URL,
        json=_payload(viaje, categoria_gasto, MontoOriginal="50", MonedaOriginal="USD", DesdeComprobante=False),
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert cotizacion == [("USD", "ARS")]


# CP8: la fecha fuera del viaje es solo una advertencia del frontend
def test_permite_fecha_anterior_al_inicio_del_viaje(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = date.today() + timedelta(days=1)
    viaje.FechaFin = date.today() + timedelta(days=10)
    db_session.commit()
    fecha = date.today() - timedelta(days=5)

    response = client.post(URL, json=_payload(viaje, categoria_gasto, FechaGasto=str(fecha)), headers=auth_headers)

    assert response.status_code == 200


# CP10
def test_rechaza_division_personalizada_que_no_suma_el_total(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    bruno = _agregar_participante(db_session, viaje, "bruno")

    response = client.post(
        URL,
        json=_payload(
            viaje, categoria_gasto,
            MontoOriginal="1000",
            EsCompartido=True, DividirEntreTodos=False, TipoDivision="personalizada",
            IdPagador=participante.IdParticipanteViaje,
            DetalleMontosPersonalizados=[
                {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "600"},
                {"IdParticipanteViaje": bruno.IdParticipanteViaje, "MontoAsignado": "300"},
            ],
        ),
        headers=auth_headers,
    )

    assert response.status_code == 400
    assert "no coincide" in response.json()["detail"]
    assert db_session.query(Gasto).count() == 0


def test_division_personalizada_en_dolares_se_compara_con_el_monto_en_ars(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    bruno = _agregar_participante(db_session, viaje, "bruno")

    response = client.post(
        URL,
        json=_payload(
            viaje, categoria_gasto,
            MontoOriginal="50", MonedaOriginal="USD", MontoConvertidoARS="60000",
            EsCompartido=True, DividirEntreTodos=False, TipoDivision="personalizada",
            IdPagador=participante.IdParticipanteViaje,
            DetalleMontosPersonalizados=[
                {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "40000"},
                {"IdParticipanteViaje": bruno.IdParticipanteViaje, "MontoAsignado": "20000"},
            ],
        ),
        headers=auth_headers,
    )

    assert response.status_code == 200
    montos = db_session.query(ParticipantesGastos).filter_by(IdGasto=response.json()["IdGasto"]).all()
    assert sorted(m.MontoAsignado for m in montos) == [Decimal("20000"), Decimal("40000")]
