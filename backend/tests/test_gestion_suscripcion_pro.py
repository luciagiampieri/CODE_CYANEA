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
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.services.notificaciones_suscripciones import fecha_corta
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    CobroPasarela,
    ErrorPasarela,
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
        self.canceladas: list[str] = []
        self.pausadas: list[str] = []
        self.reactivadas: list[str] = []
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

    async def pausar_suscripcion(self, id_suscripcion):
        self._verificar()
        self.pausadas.append(id_suscripcion)
        self.suscripciones[id_suscripcion].estado = "paused"

    async def reactivar_suscripcion(self, id_suscripcion):
        self._verificar()
        self.reactivadas.append(id_suscripcion)
        self.suscripciones[id_suscripcion].estado = "authorized"

    async def obtener_cobro(self, id_cobro):
        self._verificar()
        return self.cobros[id_cobro]

    async def listar_cobros(self, id_suscripcion):
        self._verificar()
        return [c for c in self.cobros.values() if c.id_suscripcion == id_suscripcion]

    def cobrar(self, id_suscripcion, estado, id_cobro="cobro-1", fecha=APROBACION):
        self.cobros[id_cobro] = CobroPasarela(
            id=id_cobro, id_suscripcion=id_suscripcion, estado=estado, monto=None, fecha=fecha
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
    monkeypatch.setattr(settings, "mercadopago_webhook_allow_unsigned", True)
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


def _avisar_cobro(client, id_cobro="cobro-1"):
    return client.post(
        f"{WEBHOOK}?data.id={id_cobro}&type=subscription_authorized_payment",
        json={"type": "subscription_authorized_payment", "data": {"id": id_cobro}},
    )


@pytest.fixture
def suscripcion_activa(client, auth_headers, pasarela):
    respuesta = client.post(
        URL, headers=auth_headers, json={"modalidad": "mensual", "aceptaRenovacionAutomatica": True}
    )
    assert respuesta.status_code == 201
    pasarela.cobrar("pre-1", PAGO_APROBADO)
    assert _avisar_cobro(client).status_code == 200
    return pasarela


def _ver(client, auth_headers):
    return client.get(URL, headers=auth_headers).json()


def _cancelar(client, auth_headers):
    return client.post(f"{URL}/cancelar", headers=auth_headers)


def _reactivar(client, auth_headers):
    return client.post(f"{URL}/reactivar", headers=auth_headers)


def _plan(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).IdPlan


def _pagos(db_session):
    return db_session.scalars(select(PagoSuscripcion)).all()


def _notificaciones(db_session, usuario, tipo):
    return db_session.scalars(
        select(Notificacion).where(
            Notificacion.IdUsuario == usuario.IdUsuario, Notificacion.Tipo == tipo
        )
    ).all()


def _minutos(valor: datetime) -> str:
    return valor.strftime("%Y-%m-%dT%H:%M")


def test_sin_suscripciones_informa_plan_gratuito(client, auth_headers, pasarela):
    datos = _ver(client, auth_headers)

    assert datos["planActual"] == "gratuito"
    assert datos["suscripcion"] is None


def test_ver_estado_y_proxima_renovacion_de_suscripcion_activa(
    client, auth_headers, suscripcion_activa
):
    datos = _ver(client, auth_headers)

    assert datos["planActual"] == "pro"
    suscripcion = datos["suscripcion"]
    assert suscripcion["estado"] == "activa"
    assert suscripcion["modalidad"] == "mensual"
    assert Decimal(suscripcion["precioARS"]) == Decimal("4900")
    assert suscripcion["fechaProximaRenovacion"].startswith(_minutos(sumar_meses(APROBACION, 1)))
    assert suscripcion["renovacionAutomatica"] is True
    assert suscripcion["puedeCancelar"] is True
    assert suscripcion["puedeReactivar"] is False
    assert suscripcion["urlMedioPago"] is None


def test_un_intento_sin_pago_no_se_muestra_como_suscripcion(client, auth_headers, pasarela):
    client.post(
        URL, headers=auth_headers, json={"modalidad": "mensual", "aceptaRenovacionAutomatica": True}
    )

    assert _ver(client, auth_headers)["suscripcion"] is None


def test_cancelar_pasa_a_cancelada_y_mantiene_beneficios_hasta_el_fin(
    client, db_session, usuario_activo, auth_headers, suscripcion_activa
):
    respuesta = _cancelar(client, auth_headers)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    suscripcion = datos["suscripcion"]
    assert suscripcion["estado"] == "cancelada"
    assert suscripcion["fechaCancelacion"] is not None
    assert suscripcion["fechaProximaRenovacion"] is None
    assert suscripcion["renovacionAutomatica"] is False
    assert suscripcion["puedeCancelar"] is False
    assert suscripcion["puedeReactivar"] is True
    assert datos["planActual"] == "pro"
    assert _plan(db_session, usuario_activo) == PLAN_PRO
    assert fecha_corta(sumar_meses(APROBACION, 1)) in datos["message"]


def test_cancelar_informa_a_la_pasarela_y_no_se_registran_nuevos_cobros(
    client, db_session, auth_headers, suscripcion_activa
):
    _cancelar(client, auth_headers)
    fin = _ver(client, auth_headers)["suscripcion"]["fechaFin"]

    assert suscripcion_activa.pausadas == ["pre-1"]
    assert suscripcion_activa.suscripciones["pre-1"].estado == "paused"

    suscripcion_activa.cobrar(
        "pre-1", PAGO_APROBADO, id_cobro="cobro-2", fecha=APROBACION + timedelta(days=30)
    )
    assert _avisar_cobro(client, "cobro-2").status_code == 200

    suscripcion = _ver(client, auth_headers)["suscripcion"]
    assert suscripcion["estado"] == "cancelada"
    assert suscripcion["fechaFin"] == fin
    assert len(_pagos(db_session)) == 1


def test_se_envia_el_correo_de_cancelacion(
    client, db_session, usuario_activo, auth_headers, suscripcion_activa
):
    _cancelar(client, auth_headers)

    correos = [
        m
        for m in suscripcion_activa.mail.enviados
        if m["template_name"] == "subscription_cancelled.html"
    ]
    assert len(correos) == 1
    assert correos[0]["to"] == [usuario_activo.Email]
    assert correos[0]["context"]["fecha_fin"] == fecha_corta(sumar_meses(APROBACION, 1))
    assert len(_notificaciones(db_session, usuario_activo, "suscripcion_cancelada")) == 1


def test_no_se_puede_cancelar_dos_veces(client, auth_headers, suscripcion_activa):
    _cancelar(client, auth_headers)

    respuesta = _cancelar(client, auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_NOT_CANCELLABLE"
    assert suscripcion_activa.pausadas == ["pre-1"]


def test_cancelar_sin_suscripcion_activa_falla(client, auth_headers, pasarela):
    respuesta = _cancelar(client, auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_NOT_CANCELLABLE"


def test_si_la_pasarela_falla_la_suscripcion_sigue_activa(
    client, auth_headers, suscripcion_activa
):
    suscripcion_activa.falla = ErrorPasarela("caída")

    respuesta = _cancelar(client, auth_headers)

    assert respuesta.status_code == 502
    assert respuesta.headers["x-error-code"] == "PAYMENT_GATEWAY_ERROR"
    assert _ver(client, auth_headers)["suscripcion"]["estado"] == "activa"


def test_reactivar_antes_del_fin_del_periodo_sin_nuevo_cobro(
    client, db_session, auth_headers, suscripcion_activa
):
    _cancelar(client, auth_headers)

    respuesta = _reactivar(client, auth_headers)

    assert respuesta.status_code == 200
    suscripcion = respuesta.json()["suscripcion"]
    assert suscripcion["estado"] == "activa"
    assert suscripcion["fechaCancelacion"] is None
    assert suscripcion["fechaProximaRenovacion"].startswith(_minutos(sumar_meses(APROBACION, 1)))
    assert suscripcion["puedeCancelar"] is True
    assert suscripcion_activa.reactivadas == ["pre-1"]
    assert suscripcion_activa.suscripciones["pre-1"].estado == "authorized"
    assert len(suscripcion_activa.creadas) == 1
    assert len(_pagos(db_session)) == 1


def test_reactivar_luego_de_finalizado_el_periodo_falla(
    client, db_session, auth_headers, suscripcion_activa
):
    _cancelar(client, auth_headers)
    suscripcion = db_session.scalar(select(SuscripcionUsuario))
    suscripcion.FechaFin = datetime.now(timezone.utc) - timedelta(hours=1)
    db_session.commit()

    respuesta = _reactivar(client, auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_PERIOD_ENDED"
    assert suscripcion_activa.reactivadas == []


def test_reactivar_una_suscripcion_activa_falla(client, auth_headers, suscripcion_activa):
    respuesta = _reactivar(client, auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["x-error-code"] == "SUBSCRIPTION_NOT_REACTIVABLE"


def test_gestion_requiere_sesion(client, pasarela):
    assert client.get(URL).status_code == 401
    assert client.post(f"{URL}/cancelar").status_code == 401
    assert client.post(f"{URL}/reactivar").status_code == 401