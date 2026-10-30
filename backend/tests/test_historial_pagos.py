"""US 120: consultar historial de pagos (CP1 a CP8)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion_pasarela import EstadoNotificacionPasarela
from app.models.pago_suscripcion import EstadoPagoSuscripcion
from app.models.plan import PLAN_PRO, Plan
from app.models.usuario import Usuario
from app.services.mail import get_mail_service
from app.services.pagos.mercadopago import (
    PAGO_APROBADO,
    PAGO_PENDIENTE,
    PAGO_RECHAZADO,
    CobroPasarela,
    SuscripcionPasarela,
    get_cliente_pasarela,
)
from app.services.precios_suscripciones import sumar_meses

URL = "/api/v1/users/me/suscripcion"
HISTORIAL = f"{URL}/pagos"
WEBHOOK = "/api/v1/pagos/mercadopago/webhook"
APROBACION = (datetime.now(timezone.utc) - timedelta(days=1)).replace(second=0, microsecond=0)
TIPO_COBRO = "subscription_authorized_payment"


class ClienteFalso:
    """Simula la API de Mercado Pago: es la fuente de verdad del estado de cada cobro."""

    def __init__(self):
        self.suscripciones: dict[str, SuscripcionPasarela] = {}
        self.cobros: dict[str, CobroPasarela] = {}

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
    def send_template(self, **kwargs):
        pass

    def send_html(self, **kwargs):
        pass


@pytest.fixture
def pasarela(client, db_session, usuario_activo, monkeypatch):
    # La firma del webhook se prueba en la US 117.
    monkeypatch.setattr(settings, "mercadopago_webhook_secret", None)
    monkeypatch.setattr(settings, "mercadopago_webhook_allow_unsigned", True)
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
    cliente = ClienteFalso()
    app.dependency_overrides[get_cliente_pasarela] = lambda: cliente
    app.dependency_overrides[get_mail_service] = lambda: MailFalso()
    return cliente


@pytest.fixture
def otro_headers(db_session):
    usuario = Usuario(
        Nombre="Bruno",
        Apellido="Test",
        NombreUsuario="bruno_test",
        Email="bruno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _notificar(client, data_id):
    respuesta = client.post(f"{WEBHOOK}?data.id={data_id}&type={TIPO_COBRO}")
    assert respuesta.status_code == 200, respuesta.text


def _suscribir(client, headers, modalidad="mensual"):
    respuesta = client.post(
        URL, headers=headers, json={"modalidad": modalidad, "aceptaRenovacionAutomatica": True}
    )
    assert respuesta.status_code == 201, respuesta.text


def _cobro(client, pasarela, estado, id_cobro, fecha, **kwargs):
    pasarela.cobrar(estado, id_cobro, fecha, **kwargs)
    _notificar(client, id_cobro)


def _activar(client, headers, pasarela, modalidad="mensual"):
    _suscribir(client, headers, modalidad)
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-1", APROBACION, monto=Decimal("4900"))


def _historial(client, headers):
    respuesta = client.get(HISTORIAL, headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["items"]


def _minutos(valor: datetime) -> str:
    return valor.strftime("%Y-%m-%dT%H:%M")


def _periodo(pago):
    return pago["periodoDesde"][:16], pago["periodoHasta"][:16]


# CA7: orden ------------------------------------------------------------------


def test_cp1_pagos_ordenados_del_mas_reciente_al_mas_antiguo(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-2", sumar_meses(APROBACION, 1))
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-3", sumar_meses(APROBACION, 2))

    pagos = _historial(client, auth_headers)

    fechas = [p["fecha"] for p in pagos]
    assert len(pagos) == 3
    assert [f[:16] for f in fechas] == [
        _minutos(sumar_meses(APROBACION, 2)),
        _minutos(sumar_meses(APROBACION, 1)),
        _minutos(APROBACION),
    ]
    # Las renovaciones encadenan los períodos pagados.
    assert [_periodo(p) for p in pagos] == [
        (_minutos(sumar_meses(APROBACION, n)), _minutos(sumar_meses(APROBACION, n + 1)))
        for n in (2, 1, 0)
    ]


# CA4: datos de cada pago --------------------------------------------------------


def test_cp2_cada_pago_muestra_fecha_monto_periodo_y_estado(client, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela, modalidad="anual")

    (pago,) = _historial(client, auth_headers)

    assert set(pago) == {"id", "fecha", "montoARS", "estado", "periodoDesde", "periodoHasta"}
    assert pago["fecha"].startswith(_minutos(APROBACION))
    assert Decimal(pago["montoARS"]) == Decimal("4900")
    assert pago["estado"] == "aprobado"
    assert _periodo(pago) == (_minutos(APROBACION), _minutos(sumar_meses(APROBACION, 12)))
    # El período coincide con la vigencia que se activó.
    suscripcion = client.get(URL, headers=auth_headers).json()["suscripcion"]
    assert suscripcion["fechaFin"].startswith(pago["periodoHasta"][:16])


# CA5: período de rechazados y pendientes ----------------------------------------


def test_cp3_renovacion_rechazada_muestra_el_periodo_que_intentaba_pagar(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    renovacion = sumar_meses(APROBACION, 1)
    _cobro(client, pasarela, PAGO_RECHAZADO, "cobro-2", renovacion + timedelta(hours=2))

    rechazado, aprobado = _historial(client, auth_headers)

    assert rechazado["estado"] == "rechazado"
    assert _periodo(rechazado) == (_minutos(renovacion), _minutos(sumar_meses(APROBACION, 2)))
    assert aprobado["estado"] == "aprobado"


def test_cp3_primer_cobro_rechazado_muestra_el_periodo_desde_su_fecha(
    client, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    _cobro(client, pasarela, PAGO_RECHAZADO, "cobro-1", APROBACION)

    (pago,) = _historial(client, auth_headers)

    assert pago["estado"] == "rechazado"
    assert _periodo(pago) == (_minutos(APROBACION), _minutos(sumar_meses(APROBACION, 1)))


def test_cp4_cobro_pendiente_se_muestra_con_su_estado(client, auth_headers, pasarela):
    _suscribir(client, auth_headers)
    _cobro(client, pasarela, PAGO_PENDIENTE, "cobro-1", APROBACION)

    (pago,) = _historial(client, auth_headers)

    assert pago["estado"] == "pendiente"
    assert _periodo(pago) == (_minutos(APROBACION), _minutos(sumar_meses(APROBACION, 1)))


# CA6: reintentos -----------------------------------------------------------------


def test_cp5_renovacion_rechazada_y_aprobada_por_reintento_se_muestra_una_vez(
    client, auth_headers, pasarela
):
    _activar(client, auth_headers, pasarela)
    renovacion = sumar_meses(APROBACION, 1)
    _cobro(client, pasarela, PAGO_RECHAZADO, "cobro-2", renovacion)
    # Mercado Pago reintenta el mismo cobro y lo aprueba.
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-2", renovacion + timedelta(days=1))

    pagos = _historial(client, auth_headers)

    assert [p["estado"] for p in pagos] == ["aprobado", "aprobado"]
    assert pagos[0]["fecha"].startswith(_minutos(renovacion + timedelta(days=1)))
    assert _periodo(pagos[0]) == (_minutos(renovacion), _minutos(sumar_meses(APROBACION, 2)))


def test_cp5_primer_cobro_aprobado_por_reintento_recalcula_el_periodo(
    client, auth_headers, pasarela
):
    _suscribir(client, auth_headers)
    rechazo = APROBACION - timedelta(days=2)
    _cobro(client, pasarela, PAGO_RECHAZADO, "cobro-1", rechazo)
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-1", APROBACION)

    (pago,) = _historial(client, auth_headers)

    assert pago["estado"] == "aprobado"
    # Coincide con la vigencia, que se cuenta desde la aprobación.
    assert _periodo(pago) == (_minutos(APROBACION), _minutos(sumar_meses(APROBACION, 1)))
    suscripcion = client.get(URL, headers=auth_headers).json()["suscripcion"]
    assert suscripcion["fechaInicio"].startswith(_minutos(APROBACION))


# CA1 y CA3: sin Pro e intentos no concretados ----------------------------------------


def test_cp6_usuario_que_cancelo_sigue_viendo_sus_pagos(client, auth_headers, pasarela):
    _activar(client, auth_headers, pasarela)
    assert client.post(f"{URL}/cancelar", headers=auth_headers).status_code == 200

    (pago,) = _historial(client, auth_headers)

    assert pago["estado"] == "aprobado"


def test_se_listan_los_pagos_de_intentos_descartados(client, auth_headers, pasarela):
    _suscribir(client, auth_headers)
    _cobro(client, pasarela, PAGO_RECHAZADO, "cobro-1", APROBACION - timedelta(hours=3))
    # Un nuevo intento descarta el anterior, que tuvo el pago rechazado.
    _suscribir(client, auth_headers)
    _cobro(client, pasarela, PAGO_APROBADO, "cobro-2", APROBACION, id_suscripcion="pre-2")

    pagos = _historial(client, auth_headers)

    assert [p["estado"] for p in pagos] == ["aprobado", "rechazado"]


# CA2: privacidad ---------------------------------------------------------------------


def test_cp7_no_se_pueden_consultar_los_pagos_de_otro_usuario(
    client, auth_headers, otro_headers, usuario_activo, pasarela
):
    _activar(client, auth_headers, pasarela)

    assert _historial(client, otro_headers) == []
    # El usuario sale del token: un id en la consulta se ignora.
    respuesta = client.get(
        f"{HISTORIAL}?idUsuario={usuario_activo.IdUsuario}", headers=otro_headers
    )
    assert respuesta.json()["items"] == []
    assert client.get(
        f"/api/v1/users/{usuario_activo.IdUsuario}/suscripcion/pagos", headers=otro_headers
    ).status_code in (404, 405)
    assert client.get(HISTORIAL).status_code == 401


# CA8 ---------------------------------------------------------------------------------


def test_cp8_sin_pagos_devuelve_un_listado_vacio(client, auth_headers, pasarela):
    respuesta = client.get(HISTORIAL, headers=auth_headers)

    assert respuesta.status_code == 200
    assert respuesta.json() == {"items": []}
    assert respuesta.headers["Cache-Control"] == "no-store"
