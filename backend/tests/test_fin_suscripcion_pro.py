import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion import Notificacion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.fin_suscripciones import procesar_fin_suscripciones
from app.services.notificaciones_suscripciones import fecha_corta
from app.services.pagos.mercadopago import ErrorPasarela
from app.services.precios_suscripciones import crear_periodo

URL = "/api/v1/users/me/suscripcion"
AHORA = datetime.now(timezone.utc).replace(microsecond=0)


class ClienteFalso:
    def __init__(self):
        self.canceladas: list[str] = []
        self.falla = False

    async def cancelar_suscripcion(self, id_suscripcion):
        if self.falla:
            raise ErrorPasarela("Mercado Pago no responde")
        self.canceladas.append(id_suscripcion)


class MailFalso:
    def __init__(self):
        self.enviados = []

    def send_template(self, **kwargs):
        self.enviados.append(kwargs)


@pytest.fixture
def entorno(db_session):
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
    return ClienteFalso(), MailFalso()


def _suscripcion(db_session, usuario, estado, fin, *, pasarela="paused"):
    id_estado = db_session.scalar(
        select(EstadoSuscripcion.IdEstadoSuscripcion).where(EstadoSuscripcion.Nombre == estado)
    )
    suscripcion = crear_periodo(
        db_session,
        id_usuario=usuario.IdUsuario,
        id_estado=id_estado,
        meses=1,
        inicio=fin - timedelta(days=30),
    )
    db_session.flush()
    suscripcion.FechaInicio = fin - timedelta(days=30)
    suscripcion.FechaFin = fin
    suscripcion.IdSuscripcionPasarela = f"pre-{suscripcion.IdSuscripcionUsuario}"
    suscripcion.EstadoPasarela = pasarela
    if estado == "cancelada":
        suscripcion.FechaCancelacion = fin - timedelta(days=10)
    db_session.get(Usuario, usuario.IdUsuario).IdPlan = PLAN_PRO
    db_session.commit()
    return suscripcion


def _procesar(db_session, entorno):
    cliente, mail = entorno
    return asyncio.run(procesar_fin_suscripciones(db_session, cliente, mail))


def _plan(db_session, usuario):
    db_session.expire_all()
    return db_session.get(Usuario, usuario.IdUsuario).IdPlan


def _notificaciones(db_session, usuario, tipo):
    return db_session.scalars(
        select(Notificacion).where(
            Notificacion.IdUsuario == usuario.IdUsuario, Notificacion.Tipo == tipo
        )
    ).all()


def _correos(entorno, template):
    return [m for m in entorno[1].enviados if m["template_name"] == template]


# --- Aviso previo ------------------------------------------------------------


def test_se_avisa_tres_dias_antes_del_fin_de_una_suscripcion_cancelada(
    db_session, usuario_activo, entorno
):
    fin = AHORA + timedelta(days=2, hours=20)
    _suscripcion(db_session, usuario_activo, "cancelada", fin)

    _procesar(db_session, entorno)

    correos = _correos(entorno, "subscription_ending_soon.html")
    assert len(correos) == 1
    assert correos[0]["to"] == [usuario_activo.Email]
    assert correos[0]["context"]["fecha_fin"] == fecha_corta(fin)
    assert len(_notificaciones(db_session, usuario_activo, "suscripcion_por_finalizar")) == 1
    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_el_aviso_previo_se_envia_una_sola_vez(db_session, usuario_activo, entorno):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA + timedelta(days=2))

    _procesar(db_session, entorno)
    _procesar(db_session, entorno)

    assert len(_correos(entorno, "subscription_ending_soon.html")) == 1
    assert len(_notificaciones(db_session, usuario_activo, "suscripcion_por_finalizar")) == 1


def test_no_se_avisa_si_faltan_mas_de_tres_dias(db_session, usuario_activo, entorno):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA + timedelta(days=5))

    _procesar(db_session, entorno)

    assert _correos(entorno, "subscription_ending_soon.html") == []


def test_no_se_avisa_el_fin_de_una_suscripcion_que_se_renueva(db_session, usuario_activo, entorno):
    _suscripcion(
        db_session, usuario_activo, "activa", AHORA + timedelta(days=2), pasarela="authorized"
    )

    _procesar(db_session, entorno)

    assert _correos(entorno, "subscription_ending_soon.html") == []


# --- Vuelta al plan gratuito ---------------------------------------------------


def test_cancelada_vuelve_a_gratuito_al_terminar_el_periodo(db_session, usuario_activo, entorno):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA - timedelta(minutes=5))

    resultado = _procesar(db_session, entorno)

    assert resultado["cambiosDePlan"] == 1
    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert len(_correos(entorno, "subscription_ended.html")) == 1
    assert len(_notificaciones(db_session, usuario_activo, "plan_gratuito")) == 1


def test_vencida_vuelve_a_gratuito(db_session, usuario_activo, entorno):
    _suscripcion(
        db_session, usuario_activo, "vencida", AHORA - timedelta(days=4), pasarela="cancelled"
    )

    _procesar(db_session, entorno)

    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO


def test_cancelada_dentro_del_periodo_conserva_pro(db_session, usuario_activo, entorno):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA + timedelta(days=10))

    _procesar(db_session, entorno)

    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_renovacion_pendiente_de_pago_conserva_pro_aunque_haya_pasado_el_fin(
    db_session, usuario_activo, entorno
):
    suscripcion = _suscripcion(
        db_session,
        usuario_activo,
        "pendiente_pago",
        AHORA - timedelta(days=2),
        pasarela="authorized",
    )
    db_session.add(
        PagoSuscripcion(
            IdSuscripcionUsuario=suscripcion.IdSuscripcionUsuario,
            IdEstadoPagoSuscripcion=db_session.scalar(
                select(EstadoPagoSuscripcion.IdEstadoPagoSuscripcion).where(
                    EstadoPagoSuscripcion.Nombre == "aprobado"
                )
            ),
            FechaPago=AHORA - timedelta(days=32),
            MontoARS=Decimal("4900"),
            IdOperacionPasarela="cobro-1",
        )
    )
    db_session.commit()

    _procesar(db_session, entorno)

    assert _plan(db_session, usuario_activo) == PLAN_PRO


def test_no_vuelve_a_gratuito_si_tiene_otra_suscripcion_vigente(
    db_session, usuario_activo, entorno
):
    _suscripcion(
        db_session, usuario_activo, "vencida", AHORA - timedelta(days=1), pasarela="cancelled"
    )
    _suscripcion(
        db_session, usuario_activo, "activa", AHORA + timedelta(days=29), pasarela="authorized"
    )

    _procesar(db_session, entorno)

    assert _plan(db_session, usuario_activo) == PLAN_PRO
    assert _notificaciones(db_session, usuario_activo, "plan_gratuito") == []


def test_procesar_dos_veces_cambia_el_plan_y_avisa_una_sola_vez(
    db_session, usuario_activo, entorno
):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA - timedelta(minutes=5))

    _procesar(db_session, entorno)
    segundo = _procesar(db_session, entorno)

    assert segundo["cambiosDePlan"] == 0
    assert len(_correos(entorno, "subscription_ended.html")) == 1
    assert len(_notificaciones(db_session, usuario_activo, "plan_gratuito")) == 1


def test_la_gestion_muestra_el_plan_gratuito(client, db_session, usuario_activo, auth_headers, entorno):
    _suscripcion(db_session, usuario_activo, "cancelada", AHORA - timedelta(minutes=5))

    _procesar(db_session, entorno)
    datos = client.get(URL, headers=auth_headers).json()

    assert datos["planActual"] == "gratuito"
    assert datos["suscripcion"]["puedeReactivar"] is False


# --- Mercado Pago ----------------------------------------------------------------


def test_al_terminar_el_periodo_se_cancela_definitivamente_en_mercado_pago(
    db_session, usuario_activo, entorno
):
    suscripcion = _suscripcion(db_session, usuario_activo, "cancelada", AHORA - timedelta(minutes=5))
    id_pasarela = suscripcion.IdSuscripcionPasarela

    _procesar(db_session, entorno)

    assert entorno[0].canceladas == [id_pasarela]
    db_session.expire_all()
    assert db_session.scalar(select(SuscripcionUsuario.EstadoPasarela)) == "cancelled"


def test_si_mercado_pago_falla_igual_vuelve_a_gratuito_y_se_reintenta(
    db_session, usuario_activo, entorno
):
    suscripcion = _suscripcion(db_session, usuario_activo, "cancelada", AHORA - timedelta(minutes=5))
    id_pasarela = suscripcion.IdSuscripcionPasarela
    entorno[0].falla = True

    _procesar(db_session, entorno)

    assert _plan(db_session, usuario_activo) == PLAN_GRATUITO
    assert db_session.scalar(select(SuscripcionUsuario.EstadoPasarela)) == "paused"

    entorno[0].falla = False
    _procesar(db_session, entorno)

    assert entorno[0].canceladas == [id_pasarela]