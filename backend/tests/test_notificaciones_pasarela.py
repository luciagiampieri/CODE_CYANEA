"""US 117: procesar notificaciones de la pasarela de pagos (CP1 a CP7)."""
import asyncio
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.main import app
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion import Notificacion
from app.models.notificacion_pasarela import EstadoNotificacionPasarela, NotificacionPasarela
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.fin_suscripciones import procesar_fin_suscripciones, vencer_pendientes_de_pago
from app.services.mail import get_mail_service
from app.services.notificaciones_suscripciones import TIPO_RENOVACION_RECHAZADA, fecha_corta
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    PAGO_RECHAZADO,
    CobroPasarela,
    ErrorPasarela,
    SuscripcionPasarela,
    get_cliente_pasarela,
)
from app.services.precios_suscripciones import sumar_meses

URL = "/api/v1/users/me/suscripcion"
WEBHOOK = "/api/v1/pagos/mercadopago/webhook"
BACKOFFICE = "/api/v1/backoffice"
SECRETO = "clave-webhook-de-prueba"
APROBACION = (datetime.now(timezone.utc) - timedelta(days=1)).replace(second=0, microsecond=0)
TIPO_COBRO = "subscription_authorized_payment"


class ClienteFalso:
    """Simula la API de Mercado Pago: es la fuente de verdad del estado de cada cobro."""

    def __init__(self):
        self.suscripciones: dict[str, SuscripcionPasarela] = {}
        self.cobros: dict[str, CobroPasarela] = {}
        self.consultas: list[str] = []
        self.canceladas: list[str] = []
        self.falla: Exception | None = None
        self.falla_cancelar: Exception | None = None

    async def crear_suscripcion(self, **kwargs):
        id_remoto = f"pre-{len(self.suscripciones) + 1}"
        self.suscripciones[id_remoto] = SuscripcionPasarela(
            id=id_remoto,
            estado="pending",
            url_pago=f"https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id={id_remoto}",
            referencia_externa=kwargs["referencia_externa"],
        )
        return self.suscripciones[id_remoto]

    async def obtener_suscripcion(self, id_suscripcion):
        return self.suscripciones[id_suscripcion]

    async def cancelar_suscripcion(self, id_suscripcion):
        if self.falla_cancelar:
            raise self.falla_cancelar
        self.canceladas.append(id_suscripcion)
        self.suscripciones[id_suscripcion].estado = "cancelled"

    async def pausar_suscripcion(self, id_suscripcion):
        self.suscripciones[id_suscripcion].estado = "paused"

    async def reactivar_suscripcion(self, id_suscripcion):
        self.suscripciones[id_suscripcion].estado = "authorized"

    async def obtener_cobro(self, id_cobro):
        self.consultas.append(id_cobro)
        if self.falla:
            raise self.falla
        return self.cobros[id_cobro]

    async def listar_cobros(self, id_suscripcion):
        return [c for c in self.cobros.values() if c.id_suscripcion == id_suscripcion]

    def cobrar(self, estado, id_cobro, fecha, monto=None):
        self.cobros[id_cobro] = CobroPasarela(
            id=id_cobro, id_suscripcion="pre-1", estado=estado, monto=monto, fecha=fecha
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
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", SECRETO)
    monkeypatch.setattr(settings, "mercadopago_webhook_allow_unsigned", False)
    monkeypatch.setattr(settings, "subscription_pending_payment_days", 3)
    monkeypatch.setattr(settings, "mercadopago_test_payer_email", None)
    monkeypatch.setattr(settings, "mercadopago_back_url", None)
    db_session.add_all(
        [
            EstadoSuscripcion(Nombre=nombre, Activo=True)
            for nombre in ("activa", "cancelada", "vencida", "pendiente_pago", "descartada")
        ]
        + [EstadoPagoSuscripcion(Nombre=n) for n in ("aprobado", "rechazado", "pendiente")]
        + [EstadoNotificacionPasarela(Nombre=n) for n in ("procesada", "ignorada", "error")]
    )
    pro = db_session.get(Plan, PLAN_PRO)
    pro.PrecioMensualARS, pro.PrecioAnualARS = Decimal("4900"), Decimal("49000")
    db_session.commit()
    cliente, mail = ClienteFalso(), MailFalso()
    app.dependency_overrides[get_cliente_pasarela] = lambda: cliente
    app.dependency_overrides[get_mail_service] = lambda: mail
    cliente.mail = mail
    return cliente


def _firma(data_id: str, id_solicitud: str, ts: str = "1761500000000") -> str:
    manifiesto = f"id:{data_id};request-id:{id_solicitud};ts:{ts};".encode()
    v1 = hmac.new(SECRETO.encode(), manifiesto, hashlib.sha256).hexdigest()
    return f"ts={ts},v1={v1}"


def _notificar(client, data_id, tipo=TIPO_COBRO, id_solicitud="req-1", firma=None):
    return client.post(
        f"{WEBHOOK}?data.id={data_id}&type={tipo}",
        headers={
            "x-signature": firma if firma is not None else _firma(data_id, id_solicitud),
            "x-request-id": id_solicitud,
        },
        json={"type": tipo, "data": {"id": data_id}},
    )


def _suscribir(client, auth_headers, modalidad="mensual"):
    respuesta = client.post(
        URL, headers=auth_headers, json={"modalidad": modalidad, "aceptaRenovacionAutomatica": True}
    )
    assert respuesta.status_code == 201, respuesta.text


def _activar(client, auth_headers, pasarela, modalidad="mensual"):
    _suscribir(client, auth_headers, modalidad)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)
    assert _notificar(client, "cobro-1", id_solicitud="req-activacion").status_code == 200


def _rechazar_renovacion(client, pasarela):
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-2", sumar_meses(APROBACION, 1))
    assert _notificar(client, "cobro-2", id_solicitud="req-rechazo").status_code == 200


def _ver(client, auth_headers):
    return client.get(URL, headers=auth_headers).json()


def _plan(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).IdPlan


def _pagos(db_session):
    db_session.expire_all()
    return db_session.scalars(
        select(PagoSuscripcion).order_by(PagoSuscripcion.IdPagoSuscripcion)
    ).all()


def _registros(db_session):
    db_session.expire_all()
    filas = db_session.execute(
        select(NotificacionPasarela, EstadoNotificacionPasarela.Nombre)
        .join(
            EstadoNotificacionPasarela,
            EstadoNotificacionPasarela.IdEstadoNotificacionPasarela
            == NotificacionPasarela.IdEstadoNotificacionPasarela,
        )
        .order_by(NotificacionPasarela.IdNotificacionPasarela)
    ).all()
    return [(n, estado) for n, estado in filas]


def _suscripcion(db_session):
    db_session.expire_all()
    return db_session.scalar(select(SuscripcionUsuario))


def _minutos(valor: datetime) -> str:
    return valor.strftime("%Y-%m-%dT%H:%M")


# CA1, CA3, CA4, CA7 ---------------------------------------------------------


def test_cp1_pago_aprobado_activa_la_suscripcion(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION, monto=Decimal("4900"))

    respuesta = _notificar(client, "cobro-1")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"recibido": True}
    datos = _ver(client, auth_headers)
    assert datos["planActual"] == "pro"
    assert datos["suscripcion"]["estado"] == "activa"
    assert datos["suscripcion"]["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 1)))
    assert _plan(db_session, usuario_activo) == PLAN_PRO

    (pago,) = _pagos(db_session)
    assert pago.IdOperacionPasarela == "cobro-1"
    assert pago.MontoARS == Decimal("4900")
    assert _minutos(pago.FechaPago) == _minutos(APROBACION)
    estado_pago = db_session.get(EstadoPagoSuscripcion, pago.IdEstadoPagoSuscripcion).Nombre
    assert estado_pago == "aprobado"

    ((registro, estado),) = _registros(db_session)
    assert estado == "procesada"
    assert (registro.Tipo, registro.IdRecurso, registro.IdSolicitudPasarela) == (
        TIPO_COBRO,
        "cobro-1",
        "req-1",
    )
    assert registro.Error is None


def test_el_estado_del_pago_se_consulta_a_la_pasarela_y_no_al_cuerpo(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    # Mercado Pago informa el cobro como rechazado aunque el cuerpo diga otra cosa.
    pasarela.cobrar(PAGO_RECHAZADO, "cobro-1", APROBACION)
    respuesta = client.post(
        f"{WEBHOOK}?data.id=cobro-1&type={TIPO_COBRO}",
        headers={"x-signature": _firma("cobro-1", "req-1"), "x-request-id": "req-1"},
        json={"type": TIPO_COBRO, "action": "payment.approved", "data": {"id": "cobro-1"}},
    )

    assert respuesta.status_code == 200
    assert pasarela.consultas == ["cobro-1"]
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert _ver(client, auth_headers)["suscripcion"] is None


def test_cp2_renovacion_aprobada_extiende_la_vigencia(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela, modalidad="anual")
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 12))

    assert _notificar(client, "cobro-2", id_solicitud="req-renovacion").status_code == 200

    suscripcion = _ver(client, auth_headers)["suscripcion"]
    assert suscripcion["estado"] == "activa"
    assert suscripcion["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 24)))
    assert len(_pagos(db_session)) == 2
    assert _plan(db_session, usuario_activo) == PLAN_PRO


# CA5 -----------------------------------------------------------------------


def test_cp3_renovacion_rechazada_pasa_a_pendiente_de_pago_y_avisa(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)

    _rechazar_renovacion(client, pasarela)

    suscripcion = _ver(client, auth_headers)["suscripcion"]
    assert suscripcion["estado"] == "pendiente_pago"
    registro = _suscripcion(db_session)
    assert registro.FechaPendientePago is not None
    limite = registro.FechaPendientePago + timedelta(days=3)
    assert suscripcion["fechaLimitePago"].startswith(_minutos(limite))
    # Durante el plazo de gracia conserva Pro.
    assert _plan(db_session, usuario_activo) == PLAN_PRO

    avisos = db_session.scalars(
        select(Notificacion).where(Notificacion.Tipo == TIPO_RENOVACION_RECHAZADA)
    ).all()
    assert len(avisos) == 1
    assert fecha_corta(limite) in avisos[0].Mensaje
    correos = [
        m
        for m in pasarela.mail.enviados
        if m["template_name"] == "subscription_renewal_rejected.html"
    ]
    assert len(correos) == 1
    assert correos[0]["context"]["fecha_limite"] == fecha_corta(limite)


def test_el_reintento_rechazado_no_reinicia_el_plazo_ni_repite_el_aviso(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    inicio = _suscripcion(db_session).FechaPendientePago

    pasarela.cobrar(PAGO_RECHAZADO, "cobro-3", sumar_meses(APROBACION, 1) + timedelta(days=1))
    assert _notificar(client, "cobro-3", id_solicitud="req-reintento").status_code == 200

    assert _suscripcion(db_session).FechaPendientePago == inicio
    assert len(_pagos(db_session)) == 3
    avisos = db_session.scalars(
        select(Notificacion).where(Notificacion.Tipo == TIPO_RENOVACION_RECHAZADA)
    ).all()
    assert len(avisos) == 1


def test_un_pago_aprobado_durante_el_plazo_reactiva_la_suscripcion(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)

    pasarela.cobrar(PAGO_APROBADO, "cobro-3", sumar_meses(APROBACION, 1) + timedelta(days=1))
    assert _notificar(client, "cobro-3", id_solicitud="req-recupero").status_code == 200

    suscripcion = _ver(client, auth_headers)["suscripcion"]
    assert suscripcion["estado"] == "activa"
    assert suscripcion["fechaLimitePago"] is None
    assert _suscripcion(db_session).FechaPendientePago is None


# CA2 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "firma",
    [
        "ts=1761500000000,v1=" + "0" * 64,  # firma inválida
        "",  # sin firma
        "v1=abc",  # firma incompleta
    ],
)
def test_cp4_notificacion_con_firma_invalida_se_rechaza(
    client, db_session, usuario_activo, auth_headers, pasarela, firma
):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)

    respuesta = _notificar(client, "cobro-1", firma=firma)

    assert respuesta.status_code == 401
    assert respuesta.headers["X-Error-Code"] == "INVALID_SIGNATURE"
    assert pasarela.consultas == []
    assert _pagos(db_session) == []
    assert _registros(db_session) == []
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO


def test_firma_de_otro_recurso_no_sirve(client, db_session, auth_headers, pasarela):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)

    respuesta = _notificar(client, "cobro-1", firma=_firma("cobro-99", "req-1"))

    assert respuesta.status_code == 401
    assert _pagos(db_session) == []


def test_sin_clave_configurada_no_se_procesa_y_la_pasarela_reintenta(
    client, db_session, usuario_activo, auth_headers, pasarela, monkeypatch
):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", None)

    respuesta = _notificar(client, "cobro-1")

    assert respuesta.status_code == 503
    assert respuesta.headers["X-Error-Code"] == "WEBHOOK_SIGNATURE_NOT_CONFIGURED"
    assert pasarela.consultas == []
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO


# CA8 -----------------------------------------------------------------------


def test_cp5_la_misma_notificacion_dos_veces_registra_un_unico_pago(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    pasarela.cobrar(PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))

    for _ in range(2):
        assert _notificar(client, "cobro-2", id_solicitud="req-repetida").status_code == 200

    assert [p.IdOperacionPasarela for p in _pagos(db_session)] == ["cobro-1", "cobro-2"]
    suscripcion = _ver(client, auth_headers)["suscripcion"]
    assert suscripcion["fechaFin"].startswith(_minutos(sumar_meses(APROBACION, 2)))
    renovaciones = db_session.scalars(
        select(Notificacion).where(Notificacion.Tipo == "suscripcion_renovada")
    ).all()
    assert len(renovaciones) == 1
    # Ambas recepciones quedan registradas.
    repetidas = [n for n, _ in _registros(db_session) if n.IdSolicitudPasarela == "req-repetida"]
    assert len(repetidas) == 2


def test_la_activacion_repetida_no_duplica_el_periodo(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    fin = _ver(client, auth_headers)["suscripcion"]["fechaFin"]

    assert _notificar(client, "cobro-1", id_solicitud="req-activacion").status_code == 200

    assert len(_pagos(db_session)) == 1
    assert _ver(client, auth_headers)["suscripcion"]["fechaFin"] == fin


# CA6 -----------------------------------------------------------------------


def _vencer(db_session, pasarela, ahora):
    return asyncio.run(vencer_pendientes_de_pago(db_session, pasarela, ahora))


def test_cp6_pendiente_de_pago_durante_3_dias_pasa_a_vencida(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    inicio = _suscripcion(db_session).FechaPendientePago

    assert _vencer(db_session, pasarela, inicio + timedelta(days=3)) == 1

    assert _ver(client, auth_headers)["suscripcion"]["estado"] == "vencida"
    assert pasarela.canceladas == ["pre-1"]
    assert _suscripcion(db_session).EstadoPasarela == "cancelled"


def test_antes_de_los_3_dias_sigue_pendiente_de_pago(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    inicio = _suscripcion(db_session).FechaPendientePago

    assert _vencer(db_session, pasarela, inicio + timedelta(days=2, hours=23)) == 0

    assert _ver(client, auth_headers)["suscripcion"]["estado"] == "pendiente_pago"
    assert _plan(db_session, usuario_activo) == PLAN_PRO
    assert pasarela.canceladas == []


def test_el_plazo_de_vencimiento_es_configurable(
    client, db_session, auth_headers, pasarela, monkeypatch
):
    monkeypatch.setattr(settings, "subscription_pending_payment_days", 5)
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    inicio = _suscripcion(db_session).FechaPendientePago

    assert _vencer(db_session, pasarela, inicio + timedelta(days=3)) == 0
    assert _vencer(db_session, pasarela, inicio + timedelta(days=5)) == 1


def test_al_vencer_la_cuenta_vuelve_al_plan_gratuito(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    # Mercado Pago cobra la renovación al terminar el período pagado.
    ahora = sumar_meses(APROBACION, 1) + timedelta(days=3)

    resultado = asyncio.run(procesar_fin_suscripciones(db_session, pasarela, pasarela.mail, ahora))

    assert resultado["vencidasPorFaltaDePago"] == 1
    assert resultado["cambiosDePlan"] == 1
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO


def test_si_la_pasarela_no_responde_la_suscripcion_vence_igual(
    client, db_session, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _rechazar_renovacion(client, pasarela)
    inicio = _suscripcion(db_session).FechaPendientePago
    pasarela.falla_cancelar = ErrorPasarela("caída")

    assert _vencer(db_session, pasarela, inicio + timedelta(days=3)) == 1

    assert _ver(client, auth_headers)["suscripcion"]["estado"] == "vencida"


def test_un_intento_inicial_sin_pago_no_vence_por_este_proceso(
    client, db_session, auth_headers, pasarela
):
    _suscribir(client, auth_headers)

    ahora = datetime.now(timezone.utc) + timedelta(days=30)
    assert _vencer(db_session, pasarela, ahora) == 0


# CA9 -----------------------------------------------------------------------


def test_cp7_error_de_procesamiento_se_registra_y_pide_reintento(
    client, db_session, usuario_activo, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)
    pasarela.falla = RuntimeError("fallo inesperado al procesar")

    respuesta = _notificar(client, "cobro-1")

    assert respuesta.status_code == 500
    assert respuesta.headers["X-Error-Code"] == "WEBHOOK_PROCESSING_ERROR"
    assert _pagos(db_session) == []
    ((registro, estado),) = _registros(db_session)
    assert estado == "error"
    assert registro.Error == "RuntimeError: fallo inesperado al procesar"

    # Mercado Pago reintenta: esta vez se procesa una única vez.
    pasarela.falla = None
    assert _notificar(client, "cobro-1").status_code == 200
    assert len(_pagos(db_session)) == 1
    assert _plan(db_session, usuario_activo) == PLAN_PRO
    assert [estado for _, estado in _registros(db_session)] == ["error", "procesada"]


def test_si_la_pasarela_no_responde_se_pide_reintento(
    client, db_session, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.falla = ErrorPasarela("Mercado Pago respondió 500")

    respuesta = _notificar(client, "cobro-1")

    assert respuesta.status_code == 503
    assert respuesta.headers["X-Error-Code"] == "PAYMENT_GATEWAY_UNAVAILABLE"
    ((registro, estado),) = _registros(db_session)
    assert estado == "error"
    assert "Mercado Pago respondió 500" in registro.Error


def test_notificacion_de_un_tipo_ajeno_se_registra_como_ignorada(
    client, db_session, auth_headers, pasarela
):
    respuesta = _notificar(client, "123", tipo="merchant_order")

    assert respuesta.status_code == 200
    ((registro, estado),) = _registros(db_session)
    assert (registro.Tipo, estado) == ("merchant_order", "ignorada")


# Consulta desde el backoffice ----------------------------------------------


@pytest.fixture
def admin_headers(client, db_session, pasarela):
    db_session.add_all(
        [
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
            Usuario(
                Nombre="Admin",
                Apellido="Pagos",
                NombreUsuario="admin_pagos",
                Email="admin_pagos@test.com",
                HashedPassword=hash_password("Segura123!"),
                IdRolSistema=ROL_ADMIN_SISTEMA,
                Activo=True,
                EmailConfirmado=True,
            ),
        ]
    )
    db_session.commit()
    respuesta = client.post(
        f"{BACKOFFICE}/auth/login",
        json={"email": "admin_pagos@test.com", "password": "Segura123!"},
    )
    assert respuesta.status_code == 200
    return {"Authorization": f"Bearer {respuesta.json()['access_token']}"}


def test_backoffice_lista_las_notificaciones_y_filtra_errores(
    client, db_session, auth_headers, admin_headers, pasarela
):
    _suscribir(client, auth_headers)
    pasarela.cobrar(PAGO_APROBADO, "cobro-1", APROBACION)
    pasarela.falla = RuntimeError("caída")
    _notificar(client, "cobro-1", id_solicitud="req-a")
    pasarela.falla = None
    _notificar(client, "cobro-1", id_solicitud="req-b")
    _notificar(client, "9", tipo="merchant_order", id_solicitud="req-c")

    todas = client.get(f"{BACKOFFICE}/pagos/notificaciones", headers=admin_headers)
    assert todas.status_code == 200, todas.text
    datos = todas.json()
    assert datos["total"] == 3
    assert datos["totalesPorEstado"] == {"procesada": 1, "ignorada": 1, "error": 1}
    assert {item["idSolicitud"] for item in datos["items"]} == {"req-a", "req-b", "req-c"}

    errores = client.get(
        f"{BACKOFFICE}/pagos/notificaciones?estado=error", headers=admin_headers
    ).json()
    assert errores["total"] == 1
    (item,) = errores["items"]
    assert (item["idRecurso"], item["estado"], item["error"]) == (
        "cobro-1",
        "error",
        "RuntimeError: caída",
    )
    # Los totales por estado no dependen del filtro.
    assert errores["totalesPorEstado"]["procesada"] == 1


def test_backoffice_notificaciones_requiere_administrador(client, auth_headers, pasarela):
    assert client.get(f"{BACKOFFICE}/pagos/notificaciones", headers=auth_headers).status_code == 401
