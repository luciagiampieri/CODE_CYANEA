from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, hash_password
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_PRO
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario

BASE = "/api/v1/backoffice"


def test_historial_comercial_usuario_periodicidad_renovacion_y_plan_actual(
    client, db_session, admin_headers, usuario_activo
):
    primera = suscripcion(db_session, usuario_activo, estado="vencida")
    primera.FechaInicio = datetime(2026, 8, 1, tzinfo=timezone.utc)
    primera.FechaFin = datetime(2026, 9, 1, tzinfo=timezone.utc)
    segunda = suscripcion(db_session, usuario_activo, estado="vencida")
    segunda.FechaInicio = primera.FechaFin
    segunda.FechaFin = datetime(2026, 10, 1, tzinfo=timezone.utc)
    anual = suscripcion(db_session, usuario_activo, estado="cancelada", meses=12, precio="49000")
    anual.FechaCancelacion = datetime(2026, 10, 10, tzinfo=timezone.utc)
    db_session.commit()
    pago(db_session, primera, monto="4900")
    pago(db_session, anual, monto="49000")
    pago(db_session, anual, estado="rechazado")
    pago(db_session, anual, estado="pendiente")
    r = client.get(
        f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial", headers=admin_headers
    )
    assert r.status_code == 200, r.text
    datos = r.json()
    assert datos["planActual"] == "gratuito"  # No inferir plan de la ultima suscripcion.
    assert datos["total"] == 3 and Decimal(datos["totalPagadoARS"]) == Decimal("53900")
    assert (
        datos["pagosAprobados"] == 2 and datos["pagosRechazados"] == datos["pagosPendientes"] == 1
    )
    assert [i["movimiento"] for i in datos["items"]] == [
        "cambio_periodicidad",
        "renovacion",
        "primer_periodo",
    ]
    assert datos["items"][0]["fechaCancelacion"] is not None
    assert datos["ultimaSuscripcion"]["id"] == anual.IdSuscripcionUsuario
    detalle = client.get(
        f"{BASE}/usuarios/{usuario_activo.IdUsuario}", headers=admin_headers
    ).json()
    assert detalle["estadoSuscripcion"] == "cancelada"


def test_pagos_por_usuario_no_mezclan_cuentas_y_respetan_interseccion(
    client, db_session, admin_headers, usuario_activo
):
    otro = Usuario(
        Nombre="Otra",
        Apellido="Persona",
        NombreUsuario="otra_cuenta",
        Email="otra@test.invalid",
        HashedPassword="no-login",
    )
    db_session.add(otro)
    db_session.commit()
    propia = suscripcion(db_session, usuario_activo)
    ajena = suscripcion(db_session, otro)
    pago(db_session, propia, monto="17.25")
    pago(db_session, ajena, monto="99999")
    datos = client.get(
        f"{BASE}/pagos?idUsuario={usuario_activo.IdUsuario}", headers=admin_headers
    ).json()
    assert datos["total"] == 1 and Decimal(datos["totalIngresosAprobadosARS"]) == Decimal("17.25")
    datos = client.get(
        f"{BASE}/pagos?idUsuario={usuario_activo.IdUsuario}&idSuscripcion={ajena.IdSuscripcionUsuario}",
        headers=admin_headers,
    ).json()
    assert datos["total"] == 0 and Decimal(datos["totalIngresosAprobadosARS"]) == 0
    historia = client.get(
        f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial", headers=admin_headers
    ).json()
    assert historia["total"] == 1 and Decimal(historia["totalPagadoARS"]) == Decimal("17.25")


def test_historial_comercial_paginado_no_pierde_antecedente(
    client, db_session, admin_headers, usuario_activo
):
    for _ in range(22):
        suscripcion(db_session, usuario_activo)
    datos = client.get(
        f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial?pagina=1",
        headers=admin_headers,
    ).json()
    assert datos["total"] == 22 and len(datos["items"]) == 20
    assert all(i["movimiento"] != "primer_periodo" for i in datos["items"])
    datos = client.get(
        f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial?pagina=2",
        headers=admin_headers,
    ).json()
    assert len(datos["items"]) == 2 and datos["items"][-1]["movimiento"] == "primer_periodo"


def test_historial_sin_suscripciones_y_permisos(client, db_session, admin_headers, usuario_activo):
    url = f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial"
    assert client.get(url).status_code == 401
    token = create_access_token({"user_id": usuario_activo.IdUsuario})
    assert client.get(url, headers={"Authorization": f"Bearer {token}"}).status_code in (401, 403)
    datos = client.get(url, headers=admin_headers).json()
    assert datos["items"] == [] and datos["ultimaSuscripcion"] is None
    assert Decimal(datos["totalPagadoARS"]) == 0
    assert (
        client.get(f"{BASE}/usuarios/999999/historial-comercial", headers=admin_headers).status_code
        == 404
    )
    assert client.get(f"{BASE}/pagos?idUsuario=999999", headers=admin_headers).status_code == 404


def test_historial_cambio_de_plan_y_periodicidad_desconocida(client, db_session, admin_headers, usuario_activo):
    anterior = suscripcion(db_session, usuario_activo, meses=None, precio=None)
    anterior.IdPlan = 1
    posterior = suscripcion(db_session, usuario_activo, meses=12)
    datos = client.get(f"{BASE}/usuarios/{usuario_activo.IdUsuario}/historial-comercial", headers=admin_headers).json()
    assert datos["items"][0]["id"] == posterior.IdSuscripcionUsuario
    assert datos["items"][0]["movimiento"] == "cambio_plan"
    assert datos["items"][0]["planAnterior"] == "gratuito"
    assert datos["items"][0]["tipoPlanAnterior"] is None
    admin = db_session.query(Usuario).filter_by(IdRolSistema=ROL_ADMIN_SISTEMA).one()
    assert client.get(f"{BASE}/usuarios/{admin.IdUsuario}/historial-comercial", headers=admin_headers).status_code == 404
    assert client.get(f"{BASE}/pagos?idUsuario={admin.IdUsuario}", headers=admin_headers).status_code == 404


def test_resumen_mensual_argentino_y_comparacion(client, db_session, admin_headers, usuario_activo):
    sub = suscripcion(db_session, usuario_activo)
    anual = suscripcion(db_session, usuario_activo, meses=12)
    # Febrero argentino aunque la fecha UTC cae en marzo.
    pago(db_session, sub, monto="100.10", fecha=datetime(2026, 3, 1, 2, 59, tzinfo=timezone.utc))
    pago(db_session, anual, monto="1200.20", fecha=datetime(2026, 3, 1, 3, tzinfo=timezone.utc))
    pago(db_session, sub, estado="rechazado", fecha=datetime(2026, 3, 3, 12, tzinfo=timezone.utc))
    pago(
        db_session,
        sub,
        estado="pendiente",
        monto="200.20",
        fecha=datetime(2026, 3, 4, 12, tzinfo=timezone.utc),
    )
    pago(db_session, sub, monto="600.10", fecha=datetime(2025, 12, 15, 12, tzinfo=timezone.utc))
    r = client.get(
        f"{BASE}/finanzas/resumen?desde=2026-01-01&hasta=2026-03-31", headers=admin_headers
    )
    assert r.status_code == 200, r.text
    datos = r.json()
    assert [p["periodo"] for p in datos["periodos"]] == ["2026-01", "2026-02", "2026-03"]
    assert Decimal(datos["periodos"][0]["ingresosARS"]) == 0
    assert Decimal(datos["periodos"][1]["mensualARS"]) == Decimal("100.10")
    assert Decimal(datos["periodos"][2]["anualARS"]) == Decimal("1200.20")
    assert Decimal(datos["ingresosARS"]) == Decimal("1300.30")
    assert Decimal(datos["ingresosAnterioresARS"]) == Decimal("600.10")
    assert datos["pagosAprobados"] == 2 and datos["pagosRechazados"] == 1
    assert Decimal(datos["tasaAprobacion"]) == 50
    assert Decimal(datos["pendientesARS"]) == Decimal("200.20")


def test_resumen_suma_todas_las_paginas_y_periodicidad_desconocida(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo, meses=None)
    for _ in range(23):
        pago(db_session, sub, monto="0.10")
    datos = client.get(
        f"{BASE}/finanzas/resumen?desde=2026-10-01&hasta=2026-10-24", headers=admin_headers
    ).json()
    assert datos["pagosAprobados"] == 23
    assert Decimal(datos["ingresosARS"]) == Decimal("2.30")
    assert Decimal(datos["periodos"][0]["sinPeriodicidadARS"]) == Decimal("2.30")
    assert datos["variacionPorcentaje"] is None


def test_resumen_vacio_sin_falsas_variaciones(client, admin_headers):
    datos = client.get(
        f"{BASE}/finanzas/resumen?desde=2026-01-15&hasta=2026-03-04", headers=admin_headers
    ).json()
    assert len(datos["periodos"]) == 3
    assert Decimal(datos["ingresosARS"]) == 0
    assert datos["variacionPorcentaje"] is None
    assert datos["periodos"][0]["desde"] == "2026-01-15"
    assert datos["periodos"][-1]["hasta"] == "2026-03-04"


@pytest.mark.parametrize(
    "rango",
    ["desde=2026-03-01&hasta=2026-01-01", "desde=2024-01-01&hasta=2026-01-01", "hasta=2099-01-01"],
)
def test_resumen_rechaza_rangos_invalidos(client, admin_headers, rango):
    assert client.get(f"{BASE}/finanzas/resumen?{rango}", headers=admin_headers).status_code == 422


def test_resumen_requiere_administrador(client, usuario_activo):
    assert client.get(f"{BASE}/finanzas/resumen").status_code == 401
    token = create_access_token({"user_id": usuario_activo.IdUsuario})
    assert client.get(
        f"{BASE}/finanzas/resumen", headers={"Authorization": f"Bearer {token}"}
    ).status_code in (401, 403)


def test_ultima_por_usuario_antes_de_filtrar_y_busqueda_literal(
    client, db_session, admin_headers, usuario_activo
):
    anterior = suscripcion(db_session, usuario_activo)
    ultima = suscripcion(db_session, usuario_activo, estado="pendiente_pago", meses=12)
    datos = client.get(
        f"{BASE}/suscripciones?soloUltima=true&estado=activa", headers=admin_headers
    ).json()
    assert datos["total"] == 0  # No rescatar una renovacion anterior activa.
    datos = client.get(
        f"{BASE}/suscripciones?soloUltima=true&tipoPlan=anual&q={usuario_activo.Email}",
        headers=admin_headers,
    ).json()
    assert datos["total"] == 1 and datos["items"][0]["id"] == ultima.IdSuscripcionUsuario
    assert client.get(f"{BASE}/suscripciones?q=%25", headers=admin_headers).json()["total"] == 0
    pago(db_session, anterior, monto="10.20")
    datos = client.get(f"{BASE}/pagos?q={usuario_activo.Email}", headers=admin_headers).json()
    assert datos["total"] == 1 and Decimal(datos["totalIngresosAprobadosARS"]) == Decimal("10.20")
    assert client.get(f"{BASE}/pagos?q=no_existe", headers=admin_headers).json()["total"] == 0


@pytest.fixture
def datos_maestros(db_session):
    db_session.add_all(
        [
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
            *[
                EstadoSuscripcion(Nombre=n)
                for n in ("activa", "pendiente_pago", "cancelada", "vencida")
            ],
            *[EstadoPagoSuscripcion(Nombre=n) for n in ("aprobado", "rechazado", "pendiente")],
        ]
    )
    db_session.commit()


@pytest.fixture
def admin_headers(client, db_session, datos_maestros):
    db_session.add(
        Usuario(
            Nombre="Admin",
            Apellido="Test",
            NombreUsuario="admin_suscripciones",
            Email="admin_suscripciones@test.com",
            HashedPassword=hash_password("Segura123!"),
            IdRolSistema=ROL_ADMIN_SISTEMA,
            Activo=True,
            EmailConfirmado=True,
        )
    )
    db_session.commit()
    respuesta = client.post(
        f"{BASE}/auth/login",
        json={"email": "admin_suscripciones@test.com", "password": "Segura123!"},
    )
    assert respuesta.status_code == 200
    return {"Authorization": f"Bearer {respuesta.json()['access_token']}"}


def suscripcion(db, usuario, estado="activa", meses=1, precio="4900.00"):
    registro = SuscripcionUsuario(
        IdUsuario=usuario.IdUsuario,
        IdPlan=PLAN_PRO,
        IdEstadoSuscripcion=db.query(EstadoSuscripcion)
        .filter_by(Nombre=estado)
        .one()
        .IdEstadoSuscripcion,
        FechaInicio=datetime(2026, 10, 1, tzinfo=timezone.utc),
        FechaFin=datetime(2027, 10, 1, tzinfo=timezone.utc),
        PrecioPeriodoARS=Decimal(precio) if precio is not None else None,
        MesesPeriodo=meses,
    )
    db.add(registro)
    db.commit()
    return registro


def pago(db, sub, estado="aprobado", monto="4900.00", fecha=None, operacion=True):
    registro = PagoSuscripcion(
        IdSuscripcionUsuario=sub.IdSuscripcionUsuario,
        IdEstadoPagoSuscripcion=db.query(EstadoPagoSuscripcion)
        .filter_by(Nombre=estado)
        .one()
        .IdEstadoPagoSuscripcion,
        FechaPago=fecha or datetime(2026, 10, 24, 15, tzinfo=timezone.utc),
        MontoARS=Decimal(monto),
        IdOperacionPasarela=f"op-{db.query(PagoSuscripcion).count() + 1}" if operacion else None,
    )
    db.add(registro)
    db.commit()
    return registro


def test_cp1_lista_activa_con_usuario_periodo_y_renovacion(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo)
    respuesta = client.get(f"{BASE}/suscripciones?estado=activa", headers=admin_headers)
    assert respuesta.status_code == 200
    item = respuesta.json()["items"][0]
    assert item["id"] == sub.IdSuscripcionUsuario
    assert item["usuario"]["email"] == usuario_activo.Email
    assert item["tipoPlan"] == "mensual" and item["plan"] == "pro"
    assert item["estado"] == "activa" and item["fechaInicio"]
    assert item["fechaProximaRenovacion"] == item["fechaFin"]


def test_cp2_filtra_pendientes_y_no_confunde_planes_del_usuario(
    client, db_session, admin_headers, usuario_activo
):
    suscripcion(db_session, usuario_activo)
    pendiente = suscripcion(db_session, usuario_activo, "pendiente_pago", meses=12)
    datos = client.get(f"{BASE}/suscripciones?estado=pendiente_pago", headers=admin_headers).json()
    assert datos["total"] == 1
    assert datos["items"][0]["id"] == pendiente.IdSuscripcionUsuario
    assert datos["items"][0]["tipoPlan"] == "anual"
    assert datos["items"][0]["fechaProximaRenovacion"] is None


@pytest.mark.parametrize("estado", ["cancelada", "vencida"])
def test_filtra_estados_sin_inventar_renovaciones(
    client, db_session, admin_headers, usuario_activo, estado
):
    sub = suscripcion(db_session, usuario_activo, estado)
    datos = client.get(f"{BASE}/suscripciones?estado={estado}", headers=admin_headers).json()
    assert datos["total"] == 1 and datos["items"][0]["fechaProximaRenovacion"] is None
    assert (
        db_session.get(SuscripcionUsuario, sub.IdSuscripcionUsuario).IdEstadoSuscripcion
        == sub.IdEstadoSuscripcion
    )
    assert usuario_activo.IdPlan == 1


def test_cp3_detalle_e_historial_solo_de_la_suscripcion(
    client, db_session, admin_headers, usuario_activo
):
    uno = suscripcion(db_session, usuario_activo)
    dos = suscripcion(db_session, usuario_activo, meses=12)
    pago(db_session, uno, "rechazado")
    pago(db_session, uno, "aprobado")
    pago(db_session, dos, "aprobado", "49000.00")
    detalle = client.get(f"{BASE}/suscripciones/{uno.IdSuscripcionUsuario}", headers=admin_headers)
    assert detalle.status_code == 200
    historial = client.get(
        f"{BASE}/pagos?idSuscripcion={uno.IdSuscripcionUsuario}", headers=admin_headers
    ).json()
    assert historial["total"] == 2
    assert {p["estado"] for p in historial["items"]} == {"aprobado", "rechazado"}
    assert all(p["idSuscripcion"] == uno.IdSuscripcionUsuario for p in historial["items"])
    assert Decimal(historial["totalIngresosAprobadosARS"]) == Decimal("4900")
    assert all(p["idOperacionPasarela"] for p in historial["items"])


def test_cp4_rechazados_en_rango_inclusivo_argentino(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo)
    for instante in [
        datetime(2026, 10, 24, 2, 59, 59, tzinfo=timezone.utc),
        datetime(2026, 10, 24, 3, tzinfo=timezone.utc),
        datetime(2026, 10, 25, 2, 59, 59, tzinfo=timezone.utc),
        datetime(2026, 10, 25, 3, tzinfo=timezone.utc),
    ]:
        pago(db_session, sub, "rechazado", fecha=instante)
    pago(db_session, sub, "aprobado")
    datos = client.get(
        f"{BASE}/pagos?estado=rechazado&desde=2026-10-24&hasta=2026-10-24", headers=admin_headers
    ).json()
    assert datos["total"] == 2
    assert all(p["estado"] == "rechazado" for p in datos["items"])
    assert Decimal(datos["totalIngresosAprobadosARS"]) == 0


def test_cp5_total_exacto_de_aprobados_para_el_filtro_y_todas_las_paginas(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo)
    for _ in range(21):
        pago(db_session, sub, monto="10.10")
    pago(db_session, sub, "rechazado", "999.99")
    pago(db_session, sub, "pendiente", "55.00", operacion=False)
    pago(db_session, sub, monto="100.00", fecha=datetime(2026, 9, 1, tzinfo=timezone.utc))
    url = f"{BASE}/pagos?estado=aprobado&desde=2026-10-01&hasta=2026-10-31"
    uno = client.get(url, headers=admin_headers).json()
    dos = client.get(url + "&pagina=2", headers=admin_headers).json()
    assert uno["total"] == 21 and len(uno["items"]) == 20 and len(dos["items"]) == 1
    assert Decimal(uno["totalIngresosAprobadosARS"]) == Decimal("212.10")
    assert dos["totalIngresosAprobadosARS"] == uno["totalIngresosAprobadosARS"]
    assert sum(Decimal(p["montoARS"]) for p in uno["items"] + dos["items"]) == Decimal("212.10")
    assert not ({p["id"] for p in uno["items"]} & {p["id"] for p in dos["items"]})


def test_cp6_viajero_y_anonimo_no_acceden_a_ninguna_consulta(client, admin_headers, usuario_activo):
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})
    for headers in ({}, {"Authorization": f"Bearer {token}"}):
        for ruta in ("suscripciones", "suscripciones/1", "pagos"):
            assert client.get(f"{BASE}/{ruta}", headers=headers).status_code == 401


def test_historicos_sin_periodicidad_no_se_inventan_y_vacios_se_informan(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo, meses=None, precio=None)
    item = client.get(
        f"{BASE}/suscripciones/{sub.IdSuscripcionUsuario}", headers=admin_headers
    ).json()
    assert item["tipoPlan"] is None and item["precioPeriodoARS"] is None
    datos = client.get(f"{BASE}/pagos", headers=admin_headers).json()
    assert datos["items"] == [] and datos["total"] == 0
    assert Decimal(datos["totalIngresosAprobadosARS"]) == 0
    assert (
        client.get(f"{BASE}/suscripciones?estado=vencida", headers=admin_headers).json()["items"]
        == []
    )


@pytest.mark.parametrize(
    "ruta",
    [
        "suscripciones?estado=otro",
        "suscripciones?pagina=0",
        "pagos?estado=otro",
        "pagos?desde=2026-10-25&hasta=2026-10-24",
        "pagos?desde=invalida",
        "pagos?idSuscripcion=0",
        "pagos?pagina=0",
    ],
)
def test_filtros_invalidos(client, admin_headers, ruta):
    assert client.get(f"{BASE}/{ruta}", headers=admin_headers).status_code == 422


def test_detalle_e_historial_inexistentes(client, admin_headers):
    for ruta in ("suscripciones/99999", "pagos?idSuscripcion=99999"):
        respuesta = client.get(f"{BASE}/{ruta}", headers=admin_headers)
        assert respuesta.status_code == 404
        assert respuesta.headers["X-Error-Code"] == "SUBSCRIPTION_NOT_FOUND"


def test_no_persisten_ni_se_exponen_datos_de_tarjetas(
    client, db_session, admin_headers, usuario_activo
):
    sub = suscripcion(db_session, usuario_activo)
    pago(db_session, sub)
    columnas = set(PagoSuscripcion.__table__.columns.keys())
    assert columnas == {
        "IdPagoSuscripcion",
        "IdSuscripcionUsuario",
        "IdEstadoPagoSuscripcion",
        "FechaPago",
        "MontoARS",
        "IdOperacionPasarela",
        "PeriodoDesde",
        "PeriodoHasta",
    }
    item = client.get(f"{BASE}/pagos", headers=admin_headers).json()["items"][0]
    assert set(item) == {
        "id",
        "idSuscripcion",
        "usuario",
        "fecha",
        "montoARS",
        "estado",
        "idOperacionPasarela",
    }
    assert "HashedPassword" not in str(item)
