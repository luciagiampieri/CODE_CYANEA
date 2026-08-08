from datetime import date
from decimal import Decimal

from app.core.security import hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


def _crear_participante_aceptado(db_session, viaje, nombre, apellido=None, usuario_nombre=None):
    usuario = Usuario(
        Nombre=nombre,
        Apellido=apellido or "Test",
        NombreUsuario=usuario_nombre or nombre.lower(),
        Email=f"{(usuario_nombre or nombre.lower())}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
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
    return participante


def _crear_gasto(client, auth_headers, payload):
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_genera_plan_liquidacion_con_multiples_deudas(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    bruno = _crear_participante_aceptado(db_session, viaje, "Bruno")
    carla = _crear_participante_aceptado(db_session, viaje, "Carla")

    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Alojamiento",
            "Monto": "90.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": True,
            "TipoDivision": "igualitaria",
            "IdPagador": admin_participante.IdParticipanteViaje,
        },
    )

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    assert data["Version"] == 1
    assert len(data["Transferencias"]) == 2
    assert {item["NombreDeudor"] for item in data["Transferencias"]} == {"Bruno Test", "Carla Test"}
    assert {Decimal(item["Monto"]) for item in data["Transferencias"]} == {Decimal("30.00")}
    assert all(item["NombreAcreedor"] == "Ana Test" for item in data["Transferencias"])


def test_plan_liquidacion_minimiza_transferencias(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    bruno = _crear_participante_aceptado(db_session, viaje, "Bruno")
    carla = _crear_participante_aceptado(db_session, viaje, "Carla")
    diego = _crear_participante_aceptado(db_session, viaje, "Diego")

    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Hotel",
            "Monto": "120.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": False,
            "TipoDivision": "igualitaria",
            "IdPagador": admin_participante.IdParticipanteViaje,
            "IdParticipantes": [
                admin_participante.IdParticipanteViaje,
                bruno.IdParticipanteViaje,
                carla.IdParticipanteViaje,
            ],
        },
    )
    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Traslado",
            "Monto": "60.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": False,
            "TipoDivision": "igualitaria",
            "IdPagador": diego.IdParticipanteViaje,
            "IdParticipantes": [
                carla.IdParticipanteViaje,
                diego.IdParticipanteViaje,
            ],
        },
    )

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers)
    assert response.status_code == 200
    transferencias = response.json()["Transferencias"]

    assert len(transferencias) == 3
    assert {(item["NombreDeudor"], item["NombreAcreedor"], Decimal(item["Monto"])) for item in transferencias} == {
        ("Carla Test", "Ana Test", Decimal("70.00")),
        ("Bruno Test", "Diego Test", Decimal("30.00")),
        ("Bruno Test", "Ana Test", Decimal("10.00")),
    }


def test_recalcula_liquidacion_automaticamente_al_registrar_gasto(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    bruno = _crear_participante_aceptado(db_session, viaje, "Bruno")

    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Cena",
            "Monto": "40.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": True,
            "TipoDivision": "igualitaria",
            "IdPagador": admin_participante.IdParticipanteViaje,
        },
    )

    primera = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers).json()
    assert primera["Version"] == 1

    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Museo",
            "Monto": "20.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": True,
            "TipoDivision": "igualitaria",
            "IdPagador": bruno.IdParticipanteViaje,
        },
    )

    segunda = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers).json()
    assert segunda["Version"] == 2


def test_marcar_transferencia_realizada_actualiza_balance_pendiente(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    _crear_participante_aceptado(db_session, viaje, "Bruno")

    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Cena",
            "Monto": "50.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": True,
            "TipoDivision": "igualitaria",
            "IdPagador": admin_participante.IdParticipanteViaje,
        },
    )

    settlement = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers).json()
    transferencia = settlement["Transferencias"][0]

    response = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/settlement/transfers/{transferencia['IdTransferenciaLiquidacion']}",
        json={"Realizada": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()

    resumen = {item["NombreCompleto"]: Decimal(item["BalancePendiente"]) for item in data["ResumenParticipantes"]}
    assert resumen["Ana Test"] == Decimal("0.00")
    assert resumen["Bruno Test"] == Decimal("0.00")
    assert data["Transferencias"][0]["Estado"] == "realizada"


def test_liquidacion_balance_cero_no_generar_transferencias(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin
    _crear_participante_aceptado(db_session, viaje, "Bruno")

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()

    assert data["TieneDesbalances"] is False
    assert data["Transferencias"] == []
    assert all(Decimal(item["BalanceOriginal"]) == Decimal("0.00") for item in data["ResumenParticipantes"])


def test_recalcular_no_revive_deudas_ya_saldadas(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_gasto,
):
    viaje, admin_participante = viaje_con_admin
    _crear_participante_aceptado(db_session, viaje, "Bruno")
    _crear_gasto(
        client,
        auth_headers,
        {
            "IdViaje": viaje.IdViaje,
            "Nombre": "Cena",
            "Monto": "50.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": True,
            "DividirEntreTodos": True,
            "TipoDivision": "igualitaria",
            "IdPagador": admin_participante.IdParticipanteViaje,
        },
    )

    settlement = client.get(f"/api/v1/trips/{viaje.IdViaje}/settlement", headers=auth_headers).json()
    transferencia = settlement["Transferencias"][0]

    paid_response = client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/settlement/transfers/{transferencia['IdTransferenciaLiquidacion']}",
        json={"Realizada": True},
        headers=auth_headers,
    )
    assert paid_response.status_code == 200

    rebuild_response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/settlement/rebuild",
        headers=auth_headers,
    )
    assert rebuild_response.status_code == 200
    data = rebuild_response.json()

    assert data["TieneDesbalances"] is False
    assert data["Transferencias"] == []
    resumen = {item["NombreCompleto"]: Decimal(item["BalancePendiente"]) for item in data["ResumenParticipantes"]}
    assert resumen["Ana Test"] == Decimal("0.00")
    assert resumen["Bruno Test"] == Decimal("0.00")
