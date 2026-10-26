from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.main import app
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion import Notificacion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_PRO, Plan
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.services.notificaciones_suscripciones import fecha_corta
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    PAGO_RECHAZADO,
    CobroPasarela,
    SuscripcionPasarela,
    get_cliente_pasarela,
)
from app.services.precios_suscripciones import sumar_meses

URL = "/api/v1/users/me/suscripcion"
WEBHOOK = "/api/v1/pagos/mercadopago/webhook"
APROBACION = (datetime.now(timezone.utc) - timedelta(days=1)).replace(second=0, microsecond=0)


class ClienteFalso:
    def __init__(self):
        self.suscripciones: dict[str, SuscripcionPasarela] = {}
        self.cobros: dict[str, CobroPasarela] = {}
        self.creadas: list[dict] = []

    async def crear_suscripcion(self, **kwargs):
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
        return self.suscripciones[id_suscripcion]

    async def cancelar_suscripcion(self, id_suscripcion):
        self.suscripciones[id_suscripcion].estado = "cancelled"

    async def pausar_suscripcion(self, id_suscripcion):
        self.suscripciones[id_suscripcion].estado = "paused"

    async def reactivar_suscripcion(self, id_suscripcion):
        self.suscripciones[id_suscripcion].estado = "authorized"

    async def obtener_cobro(self, id_cobro):
        return self.cobros[id_cobro]

    async def listar_cobros(self, id_suscripcion):
        return [c for c in self.cobros.values() if c.id_suscripcion == id_suscripcion]

    def cobrar(self, estado, id_cobro, fecha, monto=None, id_suscripcion="pre-1"):
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


def _avisar_cobro(client, id_cobro):
    return client.post(
        f"{WEBHOOK}?data.id={id_cobro}&type=subscription_authorized_payment",
        json={"type": "subscription_authorized_payment", "data": {"id": id_cobro}},
    )


def _avisar_suscripcion(client, id_suscripcion="pre-1"):
    return client.post(f"{WEBHOOK}?data.id={id_suscripcion}&type=subscription_preapproval", json={})


def _activar(client, auth_headers, pasarela, modalidad="mensual"):
    respuesta = client.post(
        URL, headers=auth_headers, json={"modalidad": modalidad, "aceptaRenovacionAutomatica": True}
    )
    assert respuesta.status_code == 201
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)
    assert _avisar_cobro(client, "cobro-1").status_code == 200


def _ver(client, auth_headers):
    return client.get(URL, headers=auth_headers).json()["suscripcion"]


def _plan(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).IdPlan


def _pagos(db_session):
    return db_session.scalars(
        select(PagoSuscripcion).order_by(PagoSuscripcion.IdPagoSuscripcion)
    ).all()


def _notificaciones(db_session, usuario, tipo):
    return db_session.scalars(
        select(Notificacion).where(
            Notificacion.IdUsuario == usuario.IdUsuario, Notificacion.Tipo == tipo
        )
    ).all()


def _correos(pasarela, template):
    return [m for m in pasarela.mail.enviados if m["template_name"] == template]


def _minutos(valor: datetime) -> str:
    return valor.strftime("%Y-%m-%dT%H:%M")


def test_renovacion_mensual_aprobada_extiende_un_mes(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))

    assert _avisar_cobro(client, "cobro-2").status_code == 200

    suscripcion = _ver(client, auth_headers)
    assert suscripcion["estado"] == "activa"
    assert suscripcion["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 2)))
    assert suscripcion["fechaProximaRenovacion"].startswith(_minutos(sumar_meses(APROBACION, 2)))
    assert len(_pagos(db_session)) == 2
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_renovacion_anual_aprobada_extiende_un_anio(client, db_session, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela, modalidad="anual")
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 12))

    _avisar_cobro(client, "cobro-2")

    suscripcion = _ver(client, auth_headers)
    assert suscripcion["modalidad"] == "anual"
    assert suscripcion["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 24)))


def test_notificacion_repetida_de_la_renovacion_registra_un_solo_pago(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))

    for _ in range(3):
        assert _avisar_cobro(client, "cobro-2").status_code == 200

    assert len(_pagos(db_session)) == 2
    assert _ver(client, auth_headers)["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 2)))


def test_la_renovacion_mantiene_el_precio_contratado(client, db_session, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela)
    db_session.get(Plan, PLAN_PRO).PrecioMensualARS = Decimal("6000")
    db_session.commit()
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))

    _avisar_cobro(client, "cobro-2")

    assert _pagos(db_session)[-1].MontoARS == Decimal("4900")
    assert Decimal(_ver(client, auth_headers)["precioARS"]) == Decimal("4900")


def test_cobro_rechazado_pasa_a_pendiente_de_pago_conservando_pro(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))

    _avisar_cobro(client, "cobro-2")

    suscripcion = _ver(client, auth_headers)
    assert suscripcion["estado"] == "pendiente_pago"
    assert suscripcion["renovacionAutomatica"] is True
    assert suscripcion["urlMedioPago"] is not None
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_la_pantalla_de_estado_informa_activa_durante_la_renovacion_pendiente(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    _avisar_cobro(client, "cobro-2")

    estado = client.get(f"{URL}/estado", headers=auth_headers).json()

    assert estado["estado"] == "activa"
    assert estado["planActual"] == "pro"


def test_reintento_aprobado_vuelve_a_activa_y_extiende_el_periodo(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    _avisar_cobro(client, "cobro-2")

    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1) + timedelta(days=3))
    _avisar_cobro(client, "cobro-2")

    suscripcion = _ver(client, auth_headers)
    assert suscripcion["estado"] == "activa"
    assert suscripcion["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 2)))
    assert len(_pagos(db_session)) == 2


def test_baja_por_falta_de_pago_pasa_a_vencida(client, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    _avisar_cobro(client, "cobro-2")
    pasarela.suscripciones["pre-1"].estado = "cancelled"

    assert _avisar_suscripcion(client).status_code == 200

    assert _ver(client, auth_headers)["estado"] == "vencida"


def test_baja_desde_mercado_pago_de_una_suscripcion_al_dia_queda_cancelada(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.suscripciones["pre-1"].estado = "cancelled"

    _avisar_suscripcion(client)

    suscripcion = _ver(client, auth_headers)
    assert suscripcion["estado"] == "cancelada"
    assert suscripcion["fechaCancelacion"] is not None
    assert suscripcion["puedeReactivar"] is True


def test_se_notifica_la_renovacion(client, db_session, usuario_activo, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))

    _avisar_cobro(client, "cobro-2")

    correos = _correos(pasarela, "subscription_renewed.html")
    assert len(correos) == 1
    assert correos[0]["to"] == [usuario_activo.Email]
    assert correos[0]["context"]["fecha_renovacion"] == fecha_corta(sumar_meses(APROBACION, 2))
    assert len(_notificaciones(db_session, usuario_activo, "suscripcion_renovada")) == 1


def test_se_notifica_una_sola_vez_el_cobro_rechazado(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-3", sumar_meses(APROBACION, 1) + timedelta(days=2))

    _avisar_cobro(client, "cobro-2")
    _avisar_cobro(client, "cobro-2")
    _avisar_cobro(client, "cobro-3")

    assert len(_correos(pasarela, "subscription_renewal_rejected.html")) == 1
    assert len(_notificaciones(db_session, usuario_activo, "renovacion_suscripcion_rechazada")) == 1


def test_con_la_renovacion_pendiente_no_se_puede_iniciar_otra_suscripcion(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    _avisar_cobro(client, "cobro-2")

    respuesta = client.post(
        URL, headers=auth_headers, json={"modalidad": "mensual", "aceptaRenovacionAutomatica": True}
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_ALREADY_ACTIVE"