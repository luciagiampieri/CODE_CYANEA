import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.categorias_documento import CategoriaDocumento
from app.models.dia_cronograma import DiaCronograma
from app.models.documento_viaje import DocumentoViaje
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.notificacion import Notificacion
from app.models.pago_suscripcion import EstadoPagoSuscripcion
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes as lp
from app.services.fin_suscripciones import finalizar_suscripciones
from app.services.precios_suscripciones import crear_periodo
from tests.test_limites_planes_viajes import (
    MB,
    _crear_viaje,
    _dia,
    _headers,
    _participar,
    _set_limites,
    _solicitud,
    _usuario,
    _viaje,
)


class MailFalso:
    def __init__(self):
        self.enviados = []

    def send_template(self, **kwargs):
        self.enviados.append(kwargs)


@pytest.fixture
def pro_vencido(db_session, master_data, usuario_activo):
    """Usuario Pro cuya suscripción cancelada terminó hace 5 minutos."""
    db_session.add_all(
        [
            EstadoSuscripcion(Nombre=nombre, Activo=True)
            for nombre in ("activa", "cancelada", "vencida", "pendiente_pago", "descartada")
        ]
        + [EstadoPagoSuscripcion(Nombre=nombre) for nombre in ("aprobado", "rechazado", "pendiente")]
    )
    pro = db_session.get(Plan, PLAN_PRO)
    pro.PrecioMensualARS, pro.PrecioAnualARS = Decimal("4900"), Decimal("49000")
    pro.MaxParticipantesViaje = 10
    usuario_activo.IdPlan = PLAN_PRO
    db_session.commit()

    fin = datetime.now(timezone.utc) - timedelta(minutes=5)
    id_cancelada = db_session.scalar(
        select(EstadoSuscripcion.IdEstadoSuscripcion).where(EstadoSuscripcion.Nombre == "cancelada")
    )
    suscripcion = crear_periodo(
        db_session,
        id_usuario=usuario_activo.IdUsuario,
        id_estado=id_cancelada,
        meses=1,
        inicio=fin - timedelta(days=30),
    )
    db_session.flush()
    suscripcion.FechaInicio = fin - timedelta(days=30)
    suscripcion.FechaFin = fin
    suscripcion.FechaCancelacion = fin - timedelta(days=10)
    db_session.commit()
    return suscripcion


def _finalizar(db):
    mail = MailFalso()
    cambios = asyncio.run(finalizar_suscripciones(db, mail))
    db.expire_all()
    return cambios, mail


def _notificaciones(db, usuario, tipo):
    return db.scalars(
        select(Notificacion).where(
            Notificacion.IdUsuario == usuario.IdUsuario, Notificacion.Tipo == tipo
        )
    ).all()


def _documento(db, viaje, usuario, tamano):
    categoria = db.query(CategoriaDocumento).filter_by(Nombre="Otros").first()
    if categoria is None:
        categoria = CategoriaDocumento(Nombre="Otros")
        db.add(categoria)
        db.commit()
    db.add(
        DocumentoViaje(
            IdViaje=viaje.IdViaje,
            IdCategoriaDocumento=categoria.IdCategoriaDocumento,
            IdUsuarioSubida=usuario.IdUsuario,
            NombreArchivo="pesado.pdf",
            UrlArchivo=f"viajes/{viaje.IdViaje}/Otros/pesado.pdf",
            TamanoBytes=tamano,
        )
    )
    db.commit()


def _documentos(db, viaje):
    return db.query(DocumentoViaje).filter_by(IdViaje=viaje.IdViaje).count()


def test_al_volver_a_gratuito_se_conserva_todo_el_contenido(db_session, usuario_activo, pro_vencido):
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, _usuario(db_session, "beto"))
    dia = _dia(db_session, viaje)
    _solicitud(db_session, viaje, usuario_activo, dia, datetime.now(timezone.utc), 0)
    _documento(db_session, viaje, usuario_activo, MB)

    cambios, _ = _finalizar(db_session)

    assert cambios == 1
    assert db_session.get(Usuario, usuario_activo.IdUsuario).IdPlan == PLAN_GRATUITO
    assert db_session.get(Viaje, viaje.IdViaje) is not None
    assert lp.contar_participantes(db_session, viaje.IdViaje) == 2
    assert _documentos(db_session, viaje) == 1
    assert db_session.query(DiaCronograma).filter_by(IdViaje=viaje.IdViaje).count() == 1
    assert lp.contar_sugerencias_hoy(db_session, viaje.IdViaje) == 1


def test_con_mas_viajes_activos_que_el_limite_se_conservan_pero_no_puede_crear_otro(
    client, db_session, usuario_activo, auth_headers, pro_vencido
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)
    _viaje(db_session, usuario_activo)

    _finalizar(db_session)

    assert lp.contar_viajes_activos(db_session, usuario_activo.IdUsuario) == 2
    respuesta = _crear_viaje(client, auth_headers)
    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"
    aviso = _notificaciones(db_session, usuario_activo, "plan_gratuito")
    assert len(aviso) == 1
    assert "2 viajes activos" in aviso[0].Mensaje


def test_viaje_con_mas_participantes_que_el_limite_conserva_y_bloquea_nuevos(
    client, db_session, usuario_activo, pro_vencido
):
    viaje = _viaje(db_session, usuario_activo)
    beto, carla, dani, eva = (_usuario(db_session, n) for n in ("beto", "carla", "dani", "eva"))
    for participante in (beto, carla, dani):
        _participar(db_session, viaje, participante)
    _participar(db_session, viaje, eva, estado="invitado")

    _finalizar(db_session)

    assert lp.contar_participantes(db_session, viaje.IdViaje) == 4
    respuesta = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        headers=_headers(eva),
        json={"decision": "aceptar"},
    )
    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert lp.contar_participantes(db_session, viaje.IdViaje) == 4
    aviso_beto = _notificaciones(db_session, beto, "viaje_plan_gratuito")
    assert "no se pueden sumar participantes nuevos" in aviso_beto[0].Mensaje


def test_viaje_que_supera_el_almacenamiento_conserva_documentos_y_bloquea_subidas(
    db_session, usuario_activo, pro_vencido
):
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=1)
    viaje = _viaje(db_session, usuario_activo)
    _documento(db_session, viaje, usuario_activo, 2 * MB)

    _finalizar(db_session)

    assert _documentos(db_session, viaje) == 1
    viaje = db_session.get(Viaje, viaje.IdViaje)
    with pytest.raises(HTTPException) as error:
        lp.validar_almacenamiento(db_session, viaje, MB // 10)
    assert error.value.headers["X-Error-Code"] == "STORAGE_LIMIT_REACHED"
    aviso = _notificaciones(db_session, usuario_activo, "plan_gratuito")[0]
    assert "no se van a poder subir nuevos" in aviso.Mensaje


def test_los_participantes_de_los_viajes_activos_reciben_el_aviso(
    db_session, usuario_activo, pro_vencido
):
    beto, carla, eva = (_usuario(db_session, n) for n in ("beto", "carla", "eva"))
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    _participar(db_session, viaje, eva, estado="invitado")
    hoy = date.today()
    terminado = _viaje(
        db_session, usuario_activo, "finalizado", hoy - timedelta(days=20), hoy - timedelta(days=10)
    )
    _participar(db_session, terminado, carla)

    _finalizar(db_session)

    avisos_beto = _notificaciones(db_session, beto, "viaje_plan_gratuito")
    assert len(avisos_beto) == 1
    assert avisos_beto[0].IdViaje == viaje.IdViaje
    assert _notificaciones(db_session, eva, "viaje_plan_gratuito") == []
    assert _notificaciones(db_session, carla, "viaje_plan_gratuito") == []
    assert _notificaciones(db_session, usuario_activo, "viaje_plan_gratuito") == []


def test_el_limite_de_ia_gratuito_se_aplica_desde_el_dia_siguiente(
    db_session, usuario_activo, pro_vencido
):
    viaje = _viaje(db_session, usuario_activo)

    _finalizar(db_session)

    viaje = db_session.get(Viaje, viaje.IdViaje)
    assert lp.uso_sugerencias(db_session, viaje).limite == 20

    suscripcion = db_session.get(SuscripcionUsuario, pro_vencido.IdSuscripcionUsuario)
    suscripcion.FechaFinalizacion = lp.inicio_del_dia().astimezone(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    assert lp.uso_sugerencias(db_session, viaje).limite == 10