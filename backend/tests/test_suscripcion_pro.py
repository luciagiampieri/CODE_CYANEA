import hashlib
import hmac
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select

from app.core.config import settings
from app.main import app
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion import Notificacion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    PAGO_PENDIENTE,
    PAGO_RECHAZADO,
    CobroPasarela,
    ErrorPasarela,
    PasarelaNoConfigurada,
    SuscripcionPasarela,
    cobro_desde_api,
    get_cliente_pasarela,
)

URL = "/api/v1/users/me/suscripcion"
WEBHOOK = "/api/v1/pagos/mercadopago/webhook"
APROBACION = datetime(2026, 10, 31, 15, 0, tzinfo=timezone.utc)


class ClienteFalso:
    def __init__(self):
        self.suscripciones: dict[str, SuscripcionPasarela] = {}
        self.cobros: dict[str, CobroPasarela] = {}
        self.creadas: list[dict] = []
        self.canceladas: list[str] = []
        self.falla: Exception | None = None

    def _verificar(self):
        if self.falla is not None:
            raise self.falla

    async def crear_suscripcion(self, **kwargs):
        self._verificar()
        id_remoto = f"pre-{len(self.creadas) + 1}"
        self.creadas.append(kwargs)
        remota = SuscripcionPasarela(
            id=id_remoto,
            estado="pending",
            url_pago=f"https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id={id_remoto}",
            referencia_externa=kwargs["referencia_externa"],
        )
        self.suscripciones[id_remoto] = remota
        return remota

    async def obtener_suscripcion(self, id_suscripcion):
        self._verificar()
        return self.suscripciones[id_suscripcion]

    async def cancelar_suscripcion(self, id_suscripcion):
        self._verificar()
        self.canceladas.append(id_suscripcion)
        self.suscripciones[id_suscripcion].estado = "cancelled"

    async def obtener_cobro(self, id_cobro):
        self._verificar()
        return self.cobros[id_cobro]

    async def listar_cobros(self, id_suscripcion):
        self._verificar()
        return [c for c in self.cobros.values() if c.id_suscripcion == id_suscripcion]

    def cobrar(self, id_suscripcion, estado, id_cobro="cobro-1", monto=None, fecha=APROBACION):
        self.cobros[id_cobro] = CobroPasarela(
            id=id_cobro, id_suscripcion=id_suscripcion, estado=estado, monto=monto, fecha=fecha
        )


class MailFalso:
    def __init__(self):
        self.enviados = []

    def send_template(self, **kwargs):
        self.enviados.append(kwargs)

    def send_html(self, **kwargs):
        self.enviados.append(kwargs)


@pytest.fixture
def pasarela(client, db_session, usuario_activo, monkeypatch):
    # Los tests no dependen del backend/.env de cada desarrollador: la firma del
    # webhook, el comprador de prueba y las URLs se fijan acá (cada test que
    # necesite otra cosa la cambia con monkeypatch).
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", None)
    monkeypatch.setattr(settings, "mercadopago_test_payer_email", None)
    monkeypatch.setattr(settings, "mercadopago_back_url", None)
    monkeypatch.setattr(settings, "mercadopago_app_return_url", "cyanea://suscripcion/retorno")
    db_session.add_all(
        [
            EstadoSuscripcion(Nombre=nombre, Activo=True)
            for nombre in ("activa", "cancelada", "vencida", "pendiente_pago", "descartada")
        ]
        + [
            EstadoPagoSuscripcion(Nombre=nombre)
            for nombre in ("aprobado", "rechazado", "pendiente")
        ]
    )
    pro = db_session.get(Plan, PLAN_PRO)
    pro.PrecioMensualARS, pro.PrecioAnualARS = Decimal("4900"), Decimal("49000")
    db_session.commit()
    cliente, mail = ClienteFalso(), MailFalso()
    app.dependency_overrides[get_cliente_pasarela] = lambda: cliente
    app.dependency_overrides[get_mail_service] = lambda: mail
    cliente.mail = mail
    return cliente


def _suscribir(client, auth_headers, modalidad="mensual", acepta=True):
    return client.post(
        URL,
        headers=auth_headers,
        json={"modalidad": modalidad, "aceptaRenovacionAutomatica": acepta},
    )


def _avisar_cobro(client, id_cobro="cobro-1"):
    return client.post(
        f"{WEBHOOK}?data.id={id_cobro}&type=subscription_authorized_payment",
        json={"type": "subscription_authorized_payment", "data": {"id": id_cobro}},
    )


def _estado(client, auth_headers):
    return client.get(f"{URL}/estado", headers=auth_headers).json()


def _plan(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).IdPlan


def _notificaciones(db_session, usuario, tipo):
    return db_session.scalars(
        select(Notificacion).where(
            Notificacion.IdUsuario == usuario.IdUsuario, Notificacion.Tipo == tipo
        )
    ).all()


def test_cp1_mensual_con_pago_aprobado_pasa_a_pro(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    respuesta = _suscribir(client, auth_headers)
    assert respuesta.status_code == 201
    datos = respuesta.json()
    assert datos["urlPago"].startswith("https://www.mercadopago.com.ar/")
    assert datos["modalidad"] == "mensual" and Decimal(datos["precioARS"]) == Decimal("4900")
    pedido = pasarela.creadas[0]
    assert pedido["meses"] == 1 and pedido["monto"] == Decimal("4900")
    assert pedido["email_pagador"] == usuario_activo.Email
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO

    pasarela.cobrar("pre-1", PAGO_APROBADO)
    assert _avisar_cobro(client).status_code == 200

    assert _plan(db_session, usuario_activo) == PLAN_PRO
    estado = _estado(client, auth_headers)
    assert estado["estado"] == "activa" and estado["planActual"] == "pro"
    # El período se cuenta desde la aprobación del pago.
    assert estado["fechaInicio"].startswith("2026-10-31T15:00")
    assert estado["fechaProximaRenovacion"].startswith("2026-11-30T15:00")
    pago = db_session.scalar(select(PagoSuscripcion))
    assert pago.MontoARS == Decimal("4900") and pago.IdOperacionPasarela == "cobro-1"


def test_cp2_anual_con_pago_aprobado_renueva_a_los_doce_meses(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    resumen = client.get(f"{URL}/resumen", headers=auth_headers).json()
    assert resumen["puedeSuscribirse"] is True
    assert Decimal(resumen["modalidades"]["anual"]["precioARS"]) == Decimal("49000")
    assert _suscribir(client, auth_headers, "anual").status_code == 201
    assert pasarela.creadas[0]["meses"] == 12
    pasarela.cobrar("pre-1", PAGO_APROBADO, monto=Decimal("49000"))
    _avisar_cobro(client)
    estado = _estado(client, auth_headers)
    assert estado["modalidad"] == "anual"
    assert estado["fechaProximaRenovacion"].startswith("2027-10-31")


def test_cp3_cp4_pago_rechazado_sigue_gratuito_y_permite_reintentar(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_RECHAZADO)
    _avisar_cobro(client)
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert _estado(client, auth_headers)["estado"] == "pago_rechazado"

    # Reintentar: el intento rechazado se cancela en Mercado Pago y se crea otro.
    assert _suscribir(client, auth_headers).status_code == 201
    assert pasarela.canceladas == ["pre-1"]
    pasarela.cobrar("pre-2", PAGO_APROBADO, id_cobro="cobro-2")
    _avisar_cobro(client, "cobro-2")
    assert _plan(db_session, usuario_activo) == PLAN_PRO
    estados = db_session.scalars(
        select(EstadoSuscripcion.Nombre)
        .join(SuscripcionUsuario)
        .order_by(SuscripcionUsuario.IdSuscripcionUsuario)
    ).all()
    assert estados == ["descartada", "activa"]


def test_cp5_cp6_abandonar_no_modifica_el_plan_y_permite_un_nuevo_intento(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    assert _estado(client, auth_headers)["estado"] == "sin_pago"
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert client.get(f"{URL}/resumen", headers=auth_headers).json()["puedeSuscribirse"] is True

    segundo = _suscribir(client, auth_headers, "anual")
    assert segundo.status_code == 201
    assert pasarela.canceladas == ["pre-1"]
    assert _estado(client, auth_headers)["modalidad"] == "anual"


def test_cp7_sin_aceptar_la_renovacion_automatica(client, db_session, auth_headers, pasarela):
    respuesta = _suscribir(client, auth_headers, acepta=False)
    assert respuesta.status_code == 400
    assert respuesta.headers["x-error-code"] == "AUTO_RENEWAL_NOT_ACCEPTED"
    assert pasarela.creadas == [] and db_session.scalar(select(SuscripcionUsuario)) is None


def test_cp8_con_una_suscripcion_activa(client, db_session, usuario_activo, auth_headers, pasarela):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    _avisar_cobro(client)
    respuesta = _suscribir(client, auth_headers)
    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_ALREADY_ACTIVE"
    resumen = client.get(f"{URL}/resumen", headers=auth_headers).json()
    assert (
        resumen["puedeSuscribirse"] is False and resumen["codigo"] == "SUBSCRIPTION_ALREADY_ACTIVE"
    )
    assert len(pasarela.creadas) == 1


def test_cp9_cp10_pago_pendiente_informa_y_bloquea_otro_intento(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_PENDIENTE)
    _avisar_cobro(client)
    assert _estado(client, auth_headers)["estado"] == "pago_en_proceso"
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO

    respuesta = _suscribir(client, auth_headers)
    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_PAYMENT_PENDING"
    assert "se activará al acreditarse el pago" in respuesta.json()["detail"]
    assert pasarela.canceladas == []

    # Al acreditarse, la misma operación pasa a aprobada y se activa.
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    _avisar_cobro(client)
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_tarjeta_autorizada_sin_cobro_todavia_cuenta_como_pago_en_proceso(
    client, db_session, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.suscripciones["pre-1"].estado = "authorized"
    assert (
        client.post(f"{WEBHOOK}?data.id=pre-1&type=subscription_preapproval", json={}).status_code
        == 200
    )
    assert _estado(client, auth_headers)["estado"] == "pago_en_proceso"
    assert (
        _suscribir(client, auth_headers).headers["x-error-code"] == "SUBSCRIPTION_PAYMENT_PENDING"
    )


def test_cp11_pago_pendiente_rechazado_despues_se_notifica(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_PENDIENTE)
    _avisar_cobro(client)
    pasarela.cobrar("pre-1", PAGO_RECHAZADO)
    _avisar_cobro(client)
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert len(_notificaciones(db_session, usuario_activo, "pago_suscripcion_rechazado")) == 1
    correos = [
        m
        for m in pasarela.mail.enviados
        if m["template_name"] == "subscription_payment_rejected.html"
    ]
    assert len(correos) == 1 and correos[0]["to"] == [usuario_activo.Email]


def test_rechazo_inmediato_no_envia_aviso_porque_el_usuario_lo_ve_en_pantalla(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_RECHAZADO)
    _avisar_cobro(client)
    assert _notificaciones(db_session, usuario_activo, "pago_suscripcion_rechazado") == []


def test_cp12_volver_a_la_app_sin_confirmacion_no_cambia_el_plan(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    retorno = client.get(
        "/api/v1/pagos/mercadopago/retorno?preapproval_id=pre-1&status=approved",
        follow_redirects=False,
    )
    assert retorno.status_code == 302
    assert retorno.headers["location"].startswith(settings.mercadopago_app_return_url)
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert _estado(client, auth_headers)["estado"] == "sin_pago"


def test_cp13_activacion_notifica_por_correo_y_en_la_app(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    _avisar_cobro(client)
    notificaciones = _notificaciones(db_session, usuario_activo, "suscripcion_activada")
    assert len(notificaciones) == 1 and notificaciones[0].IdViaje is None
    correo = [
        m for m in pasarela.mail.enviados if m["template_name"] == "subscription_activated.html"
    ]
    assert len(correo) == 1
    assert correo[0]["context"]["fecha_renovacion"] == "30/11/2026"
    assert correo[0]["context"]["precio"] == "ARS 4.900,00"


def test_notificacion_repetida_registra_un_solo_pago_y_una_activacion(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    for _ in range(3):
        assert _avisar_cobro(client).status_code == 200
    _estado(client, auth_headers)
    assert len(db_session.scalars(select(PagoSuscripcion)).all()) == 1
    assert len(_notificaciones(db_session, usuario_activo, "suscripcion_activada")) == 1


def test_estado_consulta_a_mercado_pago_aunque_el_webhook_no_llegue(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    assert _estado(client, auth_headers)["estado"] == "activa"
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_precio_congelado_aunque_cambie_la_tarifa(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    db_session.get(Plan, PLAN_PRO).PrecioMensualARS = Decimal("6000")
    db_session.commit()
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    _avisar_cobro(client)
    assert Decimal(_estado(client, auth_headers)["precioARS"]) == Decimal("4900")
    assert db_session.scalar(select(PagoSuscripcion)).MontoARS == Decimal("4900")


def test_no_se_almacenan_datos_de_tarjeta(client, db_session, auth_headers, pasarela):
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    _avisar_cobro(client)
    columnas = {
        c.key.lower()
        for modelo in (PagoSuscripcion, SuscripcionUsuario)
        for c in sa_inspect(modelo).columns
    }
    for prohibida in ("card", "tarjeta", "cvv", "token", "vencimiento"):
        assert not any(prohibida in columna for columna in columnas)
    assert not any("card" in clave for clave in pasarela.creadas[0])


def test_correo_sin_confirmar_no_puede_suscribirse(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    usuario_activo.EmailConfirmado = False
    db_session.commit()
    respuesta = _suscribir(client, auth_headers)
    assert (
        respuesta.status_code == 403 and respuesta.headers["x-error-code"] == "EMAIL_NOT_CONFIRMED"
    )


def test_requiere_sesion(client, pasarela):
    assert (
        client.post(
            URL, json={"modalidad": "mensual", "aceptaRenovacionAutomatica": True}
        ).status_code
        == 401
    )
    assert client.get(f"{URL}/resumen").status_code == 401


def test_modalidad_invalida(client, auth_headers, pasarela):
    respuesta = client.post(
        URL, headers=auth_headers, json={"modalidad": "semanal", "aceptaRenovacionAutomatica": True}
    )
    assert respuesta.status_code == 422


def test_precio_sin_configurar(client, db_session, auth_headers, pasarela):
    db_session.get(Plan, PLAN_PRO).PrecioAnualARS = None
    db_session.commit()
    resumen = client.get(f"{URL}/resumen", headers=auth_headers).json()
    assert resumen["puedeSuscribirse"] is False and resumen["codigo"] == "PLAN_PRICE_UNAVAILABLE"
    assert _suscribir(client, auth_headers, "anual").status_code == 409


def test_pasarela_sin_configurar_o_caida_no_deja_intentos_a_medias(
    client, db_session, auth_headers, pasarela
):
    pasarela.falla = PasarelaNoConfigurada()
    respuesta = _suscribir(client, auth_headers)
    assert (
        respuesta.status_code == 503
        and respuesta.headers["x-error-code"] == "PAYMENT_GATEWAY_UNAVAILABLE"
    )
    pasarela.falla = ErrorPasarela("caída")
    assert _suscribir(client, auth_headers).status_code == 502
    assert db_session.scalar(select(SuscripcionUsuario)) is None


def test_suscripcion_cancelada_en_mercado_pago_queda_descartada(
    client, db_session, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.suscripciones["pre-1"].estado = "cancelled"
    client.post(f"{WEBHOOK}?data.id=pre-1&type=subscription_preapproval", json={})
    assert _estado(client, auth_headers)["estado"] == "descartada"
    assert _suscribir(client, auth_headers).status_code == 201


def test_webhook_valida_la_firma_cuando_hay_clave(
    client, db_session, usuario_activo, auth_headers, pasarela, monkeypatch
):
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", "secreto-de-prueba")
    _suscribir(client, auth_headers)
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    falsa = client.post(
        f"{WEBHOOK}?data.id=cobro-1&type=subscription_authorized_payment",
        headers={"x-signature": "ts=1,v1=abc", "x-request-id": "req-1"},
        json={},
    )
    assert falsa.status_code == 401
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO

    firma = hmac.new(
        b"secreto-de-prueba", b"id:cobro-1;request-id:req-1;ts:1742505638683;", hashlib.sha256
    ).hexdigest()
    valida = client.post(
        f"{WEBHOOK}?data.id=cobro-1&type=subscription_authorized_payment",
        headers={"x-signature": f"ts=1742505638683,v1={firma}", "x-request-id": "req-1"},
        json={},
    )
    assert valida.status_code == 200
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_traduccion_de_cobros_de_mercado_pago():
    base = {"id": 7, "preapproval_id": "pre-1", "transaction_amount": 4900}
    assert cobro_desde_api({**base, "payment": {"status": "approved"}}).estado == PAGO_APROBADO
    assert cobro_desde_api({**base, "payment": {"status": "rejected"}}).estado == PAGO_RECHAZADO
    assert cobro_desde_api({**base, "payment": {"status": "in_process"}}).estado == PAGO_PENDIENTE
    assert cobro_desde_api({**base, "status": "recycling"}).estado == PAGO_RECHAZADO
    assert cobro_desde_api({**base, "status": "scheduled"}).estado == PAGO_PENDIENTE
    assert cobro_desde_api(base).id == "7" and cobro_desde_api(base).monto == Decimal("4900")