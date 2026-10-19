"""US 103: actualización automática del estado de los viajes.

Cubre los casos de prueba de la US:
- el proceso diario finaliza viajes activos cuya fecha de fin ya pasó (no los
  que terminan hoy ni los cancelados);
- al finalizar vencen las invitaciones pendientes y se descartan las
  sugerencias pendientes; las votaciones abiertas quedan cerradas;
- correr el proceso dos veces no duplica cambios ni notificaciones;
- los participantes reciben el aviso de fin de viaje;
- si el admin cambia las fechas, el estado se recalcula en el momento y, si
  el viaje vuelve a estar activo, se restaura lo que cambió la finalización.
"""

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, hash_password
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.votacion import Votacion
from app.services.estado_viajes import (
    CAMBIO_FINALIZADO,
    CAMBIO_REACTIVADO,
    actualizar_estados_viajes,
    recalcular_estado_viaje,
    segundos_hasta_proxima_medianoche,
)
from app.services.notifications import NotificationType

HOY = date.today()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture()
def estados_sugerencias(db_session):
    estados = {
        nombre: EstadoSugerenciaActividad(Nombre=nombre)
        for nombre in ("pendiente", "aceptada", "descartada", "en_votacion")
    }
    db_session.add_all(estados.values())
    db_session.commit()
    return {nombre: estado.IdEstadoSugerenciaActividad for nombre, estado in estados.items()}


def _correr(hoy=HOY, db=None):
    return asyncio.run(actualizar_estados_viajes(db, hoy=hoy))


def _fechas(db_session, viaje, inicio_offset, fin_offset):
    viaje.FechaInicio = HOY + timedelta(days=inicio_offset)
    viaje.FechaFin = HOY + timedelta(days=fin_offset)
    db_session.commit()
    db_session.refresh(viaje)
    return viaje


def _estado_viaje(db_session, viaje):
    db_session.expire_all()
    return db_session.get(Viaje, viaje.IdViaje).EstadoViaje.Nombre


def _poner_estado_viaje(db_session, viaje, nombre):
    estado = db_session.query(EstadoViaje).filter_by(Nombre=nombre).first()
    viaje.IdEstadoViaje = estado.IdEstadoViaje
    db_session.commit()
    db_session.refresh(viaje)


def _crear_miembro(db_session, viaje, nombre, estado="aceptado"):
    usuario = Usuario(
        Nombre=nombre.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre,
        Email=f"{nombre}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.flush()
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_obj = db_session.query(EstadoParticipacion).filter_by(Nombre=estado).first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_obj.IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    db_session.refresh(usuario)
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


def _estado_participacion(db_session, viaje, usuario):
    db_session.expire_all()
    participacion = (
        db_session.query(ParticipanteViaje)
        .filter_by(IdViaje=viaje.IdViaje, IdUsuario=usuario.IdUsuario)
        .one()
    )
    return participacion.EstadoParticipacion.Nombre


def _crear_invitacion_mail(db_session, viaje, admin, email, vence=None):
    pendiente = db_session.query(EstadoInvitacion).filter_by(Nombre="pendiente").first()
    invitacion = InvitacionViaje(
        IdViaje=viaje.IdViaje,
        EmailInvitado=email,
        TokenInvitacion=f"token-{email}",
        FechaVencimiento=vence or datetime.now() + timedelta(days=7),
        IdEstadoInvitacion=pendiente.IdEstadoInvitacion,
        InvitadoPor=admin.IdUsuario,
    )
    db_session.add(invitacion)
    db_session.commit()
    return invitacion


def _estado_invitacion_mail(db_session, invitacion_id):
    db_session.expire_all()
    return db_session.get(InvitacionViaje, invitacion_id).EstadoInvitacion.Nombre


def _crear_dia(db_session, viaje, fecha=None):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=fecha or viaje.FechaInicio, IndiceDia=1)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _crear_sugerencia(db_session, viaje, usuario, dia, estados, estado="pendiente"):
    solicitud = SolicitudSugerenciaActividad(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdDiaCronograma=dia.IdDiaCronograma,
        HoraInicio=time(14, 0),
        HoraFin=time(18, 0),
        Estado="completada",
        CantidadSugerencias=1,
    )
    db_session.add(solicitud)
    db_session.flush()
    sugerencia = SugerenciaActividad(
        IdSolicitudSugerenciaActividad=solicitud.IdSolicitudSugerenciaActividad,
        IdViaje=viaje.IdViaje,
        IdDiaCronograma=dia.IdDiaCronograma,
        IdEstadoSugerenciaActividad=estados[estado],
        Nombre=f"Sugerencia {estado}",
        Descripcion="Recorrido.",
        HoraInicio=time(15, 0),
        HoraFin=time(17, 0),
        GooglePlaceId="google:place",
        LugarNombre="Museo",
        LugarDireccion="Calle 123",
        Lat=-34.6,
        Lng=-58.4,
        CostoEstimadoARS=Decimal("0"),
        Motivo="Interés del grupo.",
    )
    db_session.add(sugerencia)
    db_session.commit()
    db_session.refresh(sugerencia)
    return sugerencia


def _estado_sugerencia(db_session, sugerencia_id):
    db_session.expire_all()
    sugerencia = db_session.get(SugerenciaActividad, sugerencia_id)
    return db_session.get(
        EstadoSugerenciaActividad, sugerencia.IdEstadoSugerenciaActividad
    ).Nombre


def _avisos_fin(db_session, viaje):
    db_session.expire_all()
    return (
        db_session.query(Notificacion)
        .filter_by(IdViaje=viaje.IdViaje, Tipo="viaje_finalizado")
        .all()
    )


def _payload_edicion(viaje, fin):
    return {
        "title": viaje.Titulo,
        "description": "",
        "startDate": str(viaje.FechaInicio),
        "endDate": str(fin),
        "destinations": [
            {"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}
        ],
    }


# ---------------------------------------------------------------------------
# Proceso diario: qué viajes finaliza
# ---------------------------------------------------------------------------


def test_viaje_activo_que_termino_ayer_pasa_a_finalizado(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)

    finalizados = _correr(db=db_session)

    assert finalizados == [viaje.IdViaje]
    assert _estado_viaje(db_session, viaje) == "finalizado"


def test_viaje_activo_que_termina_hoy_sigue_activo(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, 0)

    assert _correr(db=db_session) == []
    assert _estado_viaje(db_session, viaje) == "activo"


def test_viaje_futuro_sigue_activo(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, 3, 8)

    assert _correr(db=db_session) == []
    assert _estado_viaje(db_session, viaje) == "activo"


@pytest.mark.parametrize("estado", ["cancelado", "eliminado"])
def test_viaje_cancelado_o_eliminado_no_cambia(db_session, viaje_con_admin, estado):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _poner_estado_viaje(db_session, viaje, estado)

    assert _correr(db=db_session) == []
    assert _estado_viaje(db_session, viaje) == estado
    assert _avisos_fin(db_session, viaje) == []


def test_finaliza_viajes_que_terminaron_hace_tiempo(db_session, viaje_con_admin):
    """Si el servidor estuvo caído, la siguiente corrida igual los finaliza."""
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -40, -30)

    assert _correr(db=db_session) == [viaje.IdViaje]
    assert _estado_viaje(db_session, viaje) == "finalizado"


# ---------------------------------------------------------------------------
# Invitaciones
# ---------------------------------------------------------------------------


def test_invitaciones_pendientes_pasan_a_vencida(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    invitada, _ = _crear_miembro(db_session, viaje, "flor", estado="invitado")
    rechazo, _ = _crear_miembro(db_session, viaje, "juan", estado="rechazado")
    por_mail = _crear_invitacion_mail(db_session, viaje, usuario_activo, "nuevo@test.com")

    _correr(db=db_session)

    assert _estado_participacion(db_session, viaje, invitada) == "vencida"
    # Las que no estaban pendientes no se tocan.
    assert _estado_participacion(db_session, viaje, rechazo) == "rechazado"
    assert _estado_invitacion_mail(db_session, por_mail.IdInvitacionViaje) == "vencida"


def test_no_se_puede_aceptar_una_invitacion_vencida(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _, headers_invitada = _crear_miembro(db_session, viaje, "flor", estado="invitado")
    _correr(db=db_session)

    aceptar = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=headers_invitada,
    )

    assert aceptar.status_code == 409, aceptar.text
    assert aceptar.headers.get("X-Error-Code") == "INVITATION_EXPIRED"
    assert aceptar.json()["detail"] == "Esta invitación venció porque el viaje ya finalizó."

    # Deja de figurar entre sus invitaciones pendientes y ya no puede ver el viaje.
    pendientes = client.get("/api/v1/trips/invitations/pending", headers=headers_invitada)
    assert pendientes.status_code == 200
    assert pendientes.json() == []
    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=headers_invitada)
    assert detalle.status_code == 403


def test_invitacion_vencida_no_se_vincula_al_registrarse(db_session, viaje_con_admin, usuario_activo):
    from app.services.invitaciones_externas import vincular_invitaciones_externas

    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _crear_invitacion_mail(db_session, viaje, usuario_activo, "nuevo@test.com")
    _correr(db=db_session)

    nuevo = Usuario(
        Nombre="Nuevo",
        Apellido="Test",
        NombreUsuario="nuevo",
        Email="nuevo@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(nuevo)
    db_session.commit()

    assert vincular_invitaciones_externas(db_session, nuevo) == 0


def test_invitaciones_enviadas_muestran_las_vencidas(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _crear_miembro(db_session, viaje, "flor", estado="invitado")
    _correr(db=db_session)

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/invitations/sent", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert [item["status"] for item in response.json()] == ["vencida"]

    filtradas = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/invitations/sent?estado=vencida", headers=auth_headers
    )
    assert len(filtradas.json()) == 1


# ---------------------------------------------------------------------------
# Sugerencias y votaciones
# ---------------------------------------------------------------------------


def test_sugerencias_pendientes_pasan_a_descartada(
    db_session, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    dia = _crear_dia(db_session, viaje)
    pendiente = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    aceptada = _crear_sugerencia(
        db_session, viaje, usuario_activo, dia, estados_sugerencias, estado="aceptada"
    )

    _correr(db=db_session)

    assert _estado_sugerencia(db_session, pendiente.IdSugerenciaActividad) == "descartada"
    assert _estado_sugerencia(db_session, aceptada.IdSugerenciaActividad) == "aceptada"


def _crear_votacion(db_session, viaje, creador_id, dias_para_cerrar=10):
    votacion = Votacion(
        IdViaje=viaje.IdViaje,
        Titulo="¿Dónde cenamos?",
        Tipo="opcion_unica",
        FechaCierre=datetime.now(timezone.utc) + timedelta(days=dias_para_cerrar),
        IdCreador=creador_id,
    )
    db_session.add(votacion)
    db_session.commit()
    db_session.refresh(votacion)
    return votacion


def test_votacion_abierta_queda_cerrada_y_no_se_puede_votar(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    votacion = _crear_votacion(db_session, viaje, usuario_activo.IdUsuario)
    _correr(db=db_session)

    listado = client.get(f"/api/v1/votaciones?idViaje={viaje.IdViaje}", headers=auth_headers)
    assert listado.json()[0]["Estado"] == "cerrada"
    resultados = client.get(
        f"/api/v1/votaciones/{votacion.IdVotacion}/resultados", headers=auth_headers
    )
    assert resultados.status_code == 200

    votar = client.post(
        f"/api/v1/votaciones/{votacion.IdVotacion}/votar",
        json={"idPropuestas": [1]},
        headers=auth_headers,
    )
    assert votar.status_code == 409
    assert votar.headers.get("X-Error-Code") == "TRIP_FINISHED"


# ---------------------------------------------------------------------------
# Idempotencia y notificación
# ---------------------------------------------------------------------------


def test_ejecutar_dos_veces_no_duplica_cambios_ni_notificaciones(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _crear_miembro(db_session, viaje, "lucia")

    assert _correr(db=db_session) == [viaje.IdViaje]
    db_session.expire_all()
    actualizado_primera = db_session.get(Viaje, viaje.IdViaje).FechaActualizacion
    avisos = len(_avisos_fin(db_session, viaje))

    assert _correr(db=db_session) == []
    assert len(_avisos_fin(db_session, viaje)) == avisos == 2
    db_session.expire_all()
    assert db_session.get(Viaje, viaje.IdViaje).FechaActualizacion == actualizado_primera
    assert _estado_viaje(db_session, viaje) == "finalizado"


def test_participantes_reciben_el_aviso_de_fin_de_viaje(
    db_session, viaje_con_admin, usuario_activo, monkeypatch
):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    lucia, _ = _crear_miembro(db_session, viaje, "lucia")
    _crear_miembro(db_session, viaje, "flor", estado="invitado")

    eventos = []

    async def _dispatch_espia(db, evento, *args, **kwargs):
        eventos.append(evento)
        from app.services.notifications.dispatcher import dispatch_trip_notification

        return await dispatch_trip_notification(db, evento, *args, **kwargs)

    monkeypatch.setattr(
        "app.services.estado_viajes.dispatch_trip_notification", _dispatch_espia
    )

    _correr(db=db_session)

    avisos = _avisos_fin(db_session, viaje)
    # Solo los participantes aceptados (admin incluido); la invitada no.
    assert sorted(a.IdUsuario for a in avisos) == sorted(
        [usuario_activo.IdUsuario, lucia.IdUsuario]
    )
    assert "liquidación" in avisos[0].Mensaje
    assert len(eventos) == 1
    assert eventos[0].notification_type == NotificationType.VIAJE_FINALIZADO
    assert eventos[0].data == {"eventType": "trip_finished"}


def test_aviso_de_fin_respeta_preferencia_de_deudas():
    from app.services.notifications.service import NotificationService

    assert (
        NotificationService._notification_preferences[NotificationType.VIAJE_FINALIZADO]
        == "RecibeEmailsRecordatoriosDeuda"
    )
    assert (
        NotificationService._push_preferences[NotificationType.VIAJE_FINALIZADO]
        == "RecibePushRecordatoriosDeuda"
    )


def test_error_en_un_viaje_no_frena_al_resto(db_session, viaje_con_admin, usuario_activo, monkeypatch):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    otro = Viaje(
        Titulo="Otro",
        FechaInicio=HOY - timedelta(days=6),
        FechaFin=HOY - timedelta(days=2),
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )
    db_session.add(otro)
    db_session.commit()

    from app.services import estado_viajes

    original = estado_viajes._finalizar

    def _falla_con_el_otro(db, id_viaje, hoy, estados):
        if id_viaje == otro.IdViaje:
            raise RuntimeError("falla de prueba")
        return original(db, id_viaje, hoy, estados)

    monkeypatch.setattr(estado_viajes, "_finalizar", _falla_con_el_otro)

    assert _correr(db=db_session) == [viaje.IdViaje]
    assert _estado_viaje(db_session, viaje) == "finalizado"


# ---------------------------------------------------------------------------
# Cambio de fechas por el administrador
# ---------------------------------------------------------------------------


def test_acortar_el_viaje_a_una_fecha_pasada_lo_finaliza_y_avisa(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, 3)
    dia = _crear_dia(db_session, viaje)
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    invitada, _ = _crear_miembro(db_session, viaje, "flor", estado="invitado")
    lucia, _ = _crear_miembro(db_session, viaje, "lucia")

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}",
        json=_payload_edicion(viaje, HOY - timedelta(days=1)),
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["trip"]["status"] == "finalizado"
    assert _estado_viaje(db_session, viaje) == "finalizado"
    assert _estado_participacion(db_session, viaje, invitada) == "vencida"
    assert _estado_sugerencia(db_session, sugerencia.IdSugerenciaActividad) == "descartada"
    # El aviso de fin llega a todos los aceptados, también al admin que editó.
    assert sorted(a.IdUsuario for a in _avisos_fin(db_session, viaje)) == sorted(
        [usuario_activo.IdUsuario, lucia.IdUsuario]
    )


def test_editar_un_viaje_vigente_no_cambia_su_estado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, 2, 6)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}",
        json=_payload_edicion(viaje, HOY + timedelta(days=9)),
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert _estado_viaje(db_session, viaje) == "activo"
    assert _avisos_fin(db_session, viaje) == []


def test_extender_un_viaje_finalizado_lo_reactiva_y_restaura_todo(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    dia = _crear_dia(db_session, viaje)
    pendiente = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    ya_descartada = _crear_sugerencia(
        db_session, viaje, usuario_activo, dia, estados_sugerencias, estado="descartada"
    )
    invitada, headers_invitada = _crear_miembro(db_session, viaje, "flor", estado="invitado")
    vigente = _crear_invitacion_mail(db_session, viaje, usuario_activo, "vigente@test.com")
    # Su propio plazo vence antes de que el admin extienda el viaje.
    por_vencer = _crear_invitacion_mail(
        db_session, viaje, usuario_activo, "porvencer@test.com",
        vence=datetime.now() + timedelta(days=7),
    )
    votacion = _crear_votacion(db_session, viaje, usuario_activo.IdUsuario)

    _correr(db=db_session)
    assert _estado_viaje(db_session, viaje) == "finalizado"
    por_vencer = db_session.get(InvitacionViaje, por_vencer.IdInvitacionViaje)
    por_vencer.FechaVencimiento = datetime.now() - timedelta(hours=1)
    db_session.commit()

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}",
        json=_payload_edicion(viaje, HOY + timedelta(days=4)),
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["trip"]["status"] == "activo"
    assert _estado_viaje(db_session, viaje) == "activo"
    assert _estado_participacion(db_session, viaje, invitada) == "invitado"
    assert _estado_invitacion_mail(db_session, vigente.IdInvitacionViaje) == "pendiente"
    assert _estado_invitacion_mail(db_session, por_vencer.IdInvitacionViaje) == "vencida"
    assert _estado_sugerencia(db_session, pendiente.IdSugerenciaActividad) == "pendiente"
    # La que ya estaba descartada antes del fin del viaje sigue descartada.
    assert _estado_sugerencia(db_session, ya_descartada.IdSugerenciaActividad) == "descartada"

    # Las marcas se limpian: ya no hay nada pendiente de restaurar.
    db_session.expire_all()
    assert not db_session.query(ParticipanteViaje).filter_by(VencidaPorFinViaje=True).count()
    assert not db_session.query(InvitacionViaje).filter_by(VencidaPorFinViaje=True).count()
    assert not db_session.query(SugerenciaActividad).filter_by(DescartadaPorFinViaje=True).count()

    # La votación vuelve a estar abierta y la invitada puede aceptar.
    listado = client.get(f"/api/v1/votaciones?idViaje={viaje.IdViaje}", headers=auth_headers)
    assert listado.json()[0]["Estado"] == "abierta"
    aceptar = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=headers_invitada,
    )
    assert aceptar.status_code == 200, aceptar.text


def test_si_vuelve_a_finalizar_se_avisa_de_nuevo(db_session, viaje_con_admin):
    """Un viaje reactivado que vuelve a terminar es una finalización nueva."""
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _correr(db=db_session)
    assert len(_avisos_fin(db_session, viaje)) == 1

    viaje = db_session.get(Viaje, viaje.IdViaje)
    viaje.FechaFin = HOY + timedelta(days=2)
    assert recalcular_estado_viaje(db_session, viaje.IdViaje, HOY) == CAMBIO_REACTIVADO
    db_session.commit()

    assert _correr(hoy=HOY + timedelta(days=3), db=db_session) == [viaje.IdViaje]
    assert len(_avisos_fin(db_session, viaje)) == 2


def test_recalcular_no_toca_viajes_cancelados(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)
    _poner_estado_viaje(db_session, viaje, "cancelado")

    assert recalcular_estado_viaje(db_session, viaje.IdViaje, HOY) is None
    viaje = db_session.get(Viaje, viaje.IdViaje)
    viaje.FechaFin = HOY + timedelta(days=3)
    assert recalcular_estado_viaje(db_session, viaje.IdViaje, HOY) is None
    db_session.commit()
    assert _estado_viaje(db_session, viaje) == "cancelado"


def test_recalcular_finaliza_si_la_fecha_ya_paso(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _fechas(db_session, viaje, -5, -1)

    assert recalcular_estado_viaje(db_session, viaje.IdViaje, HOY) == CAMBIO_FINALIZADO
    db_session.commit()
    assert _estado_viaje(db_session, viaje) == "finalizado"
    # Segunda vez no hay nada que hacer.
    assert recalcular_estado_viaje(db_session, viaje.IdViaje, HOY) is None


# ---------------------------------------------------------------------------
# Programación diaria
# ---------------------------------------------------------------------------


def test_proxima_corrida_es_a_la_medianoche():
    zona = timezone(timedelta(hours=-3))
    ahora = datetime(2026, 10, 19, 22, 30, tzinfo=zona)
    assert segundos_hasta_proxima_medianoche(ahora) == pytest.approx(90 * 60 + 1)

    justo = datetime(2026, 10, 20, 0, 0, tzinfo=zona)
    assert segundos_hasta_proxima_medianoche(justo) == pytest.approx(24 * 3600 + 1)


def test_scheduler_no_arranca_en_tests():
    from app.services.estado_viajes import start_estado_viajes_scheduler

    assert start_estado_viajes_scheduler() is None
