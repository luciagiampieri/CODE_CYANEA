"""US 88: aceptar una sugerencia de actividad generada por el asistente.

Los casos de prueba de la US se mapean como CP1 a CP10.
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest

from app.core.security import create_access_token, hash_password
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.lugar_interes import LugarInteres
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.models.usuario import Usuario
from app.services.notifications import NotificationType

FECHA_DIA = date.today() + timedelta(days=10)


def _url(viaje, id_sugerencia):
    return f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades/{id_sugerencia}/aceptar"


@pytest.fixture()
def estados_sugerencias(db_session):
    estados = {
        nombre: EstadoSugerenciaActividad(Nombre=nombre)
        for nombre in ("pendiente", "aceptada", "descartada", "en_votacion")
    }
    db_session.add_all(estados.values())
    db_session.commit()
    return {nombre: estado.IdEstadoSugerenciaActividad for nombre, estado in estados.items()}


@pytest.fixture()
def dia(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = FECHA_DIA - timedelta(days=1)
    viaje.FechaFin = FECHA_DIA + timedelta(days=3)
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=FECHA_DIA, IndiceDia=2)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


@pytest.fixture(autouse=True)
def notificaciones(monkeypatch):
    """Captura los eventos para no depender del despacho real (salvo CP10 integrado)."""
    eventos = []

    async def _dispatch_falso(db, evento, *args, **kwargs):
        eventos.append(evento)

    monkeypatch.setattr(
        "app.api.routes.sugerencias.dispatch_trip_notification", _dispatch_falso
    )
    return eventos


def _crear_sugerencia(
    db_session,
    viaje,
    usuario,
    dia,
    estados,
    *,
    estado="pendiente",
    hora_inicio=time(15, 0),
    hora_fin=time(17, 0),
    place_id="google:place-museo",
):
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
        Nombre="Visita al Museo de Bellas Artes",
        Descripcion="Recorrido por la colección permanente.",
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        GooglePlaceId=place_id,
        LugarNombre="Museo Nacional de Bellas Artes",
        LugarDireccion="Av. del Libertador 1473, CABA",
        Lat=-34.5838,
        Lng=-58.3929,
        CostoEstimadoARS=Decimal("0"),
        Motivo="Al grupo le interesa la cultura.",
    )
    db_session.add(sugerencia)
    db_session.commit()
    db_session.refresh(sugerencia)
    return sugerencia


def _crear_actividad(db_session, dia, nombre, inicio, fin):
    actividad = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre=nombre,
        HoraInicio=inicio,
        HoraFin=fin,
        Icono="location-dot",
    )
    db_session.add(actividad)
    db_session.commit()
    return actividad


def _actividades_del_dia(db_session, dia):
    db_session.expire_all()
    return db_session.query(ActividadItinerario).filter_by(IdDiaCronograma=dia.IdDiaCronograma).all()


def _estado_de(db_session, sugerencia_id):
    db_session.expire_all()
    sugerencia = db_session.get(SugerenciaActividad, sugerencia_id)
    return db_session.get(EstadoSugerenciaActividad, sugerencia.IdEstadoSugerenciaActividad).Nombre


def _crear_participante(db_session, viaje, nombre, estado="aceptado"):
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
    estado_part = db_session.query(EstadoParticipacion).filter_by(Nombre=estado).first()
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=rol.IdRolParticipante,
            IdEstadoParticipacion=estado_part.IdEstadoParticipacion,
        )
    )
    db_session.commit()
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


# --- CP1: aceptar una sugerencia pendiente -------------------------------------


def test_cp1_aceptar_pendiente_crea_actividad_con_los_datos_de_la_sugerencia(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["Aceptada"] is True
    assert cuerpo["RequiereConfirmacion"] is False
    assert "Visita al Museo de Bellas Artes" in cuerpo["Mensaje"]
    assert cuerpo["Sugerencia"]["Estado"] == "aceptada"

    actividades = _actividades_del_dia(db_session, dia)
    assert len(actividades) == 1
    actividad = actividades[0]
    assert actividad.IdActividad == cuerpo["IdActividad"]
    assert actividad.Nombre == "Visita al Museo de Bellas Artes"
    assert actividad.Descripcion == "Recorrido por la colección permanente."
    assert actividad.HoraInicio == time(15, 0)
    assert actividad.HoraFin == time(17, 0)

    lugar = db_session.get(LugarInteres, actividad.IdLugarInteres)
    assert lugar.Nombre == "Museo Nacional de Bellas Artes"
    assert lugar.Direccion == "Av. del Libertador 1473, CABA"
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "aceptada"


def test_aceptar_reutiliza_el_lugar_si_ya_existe(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    existente = LugarInteres(
        GooglePlaceId="place-museo",
        Nombre="Museo Nacional de Bellas Artes",
        Direccion="Av. del Libertador 1473",
        Lat=-34.58,
        Lng=-58.39,
    )
    db_session.add(existente)
    db_session.commit()
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    assert _actividades_del_dia(db_session, dia)[0].IdLugarInteres == existente.IdLugarInteres
    assert db_session.query(LugarInteres).count() == 1


# --- CP2 y CP3: modificar el horario antes de confirmar ------------------------


def test_cp2_aceptar_con_horario_modificado_valido(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(
        _url(viaje, sugerencia.IdSugerenciaActividad),
        json={"HoraInicio": "16:30", "HoraFin": "18:00"},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    actividad = _actividades_del_dia(db_session, dia)[0]
    assert (actividad.HoraInicio, actividad.HoraFin) == (time(16, 30), time(18, 0))


@pytest.mark.parametrize(("inicio", "fin"), [("18:00", "16:00"), ("16:00", "16:00")])
def test_cp3_hora_de_fin_no_posterior_a_inicio_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias,
    inicio, fin,
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(
        _url(viaje, sugerencia.IdSugerenciaActividad),
        json={"HoraInicio": inicio, "HoraFin": fin},
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert respuesta.headers["X-Error-Code"] == "SLOT_INVALID"
    assert "posterior" in respuesta.json()["detail"]
    assert _actividades_del_dia(db_session, dia) == []
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "pendiente"


# --- CP4 y CP5: superposición horaria ------------------------------------------


def test_superposicion_sin_confirmar_no_crea_y_pide_confirmacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias,
    notificaciones,
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    # La actividad se crea después de generada la sugerencia.
    _crear_actividad(db_session, dia, "Almuerzo en Palermo", time(16, 0), time(17, 30))

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["Aceptada"] is False
    assert cuerpo["RequiereConfirmacion"] is True
    assert [a["Nombre"] for a in cuerpo["Superpuestas"]] == ["Almuerzo en Palermo"]
    assert cuerpo["Superpuestas"][0]["HoraInicio"] == "16:00"
    assert "Almuerzo en Palermo" in cuerpo["Mensaje"]
    assert len(_actividades_del_dia(db_session, dia)) == 1
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "pendiente"
    assert notificaciones == []


def test_cp4_superposicion_confirmada_crea_la_actividad(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    _crear_actividad(db_session, dia, "Almuerzo en Palermo", time(16, 0), time(17, 30))

    advertencia = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)
    assert advertencia.json()["RequiereConfirmacion"] is True

    respuesta = client.post(
        _url(viaje, sugerencia.IdSugerenciaActividad),
        json={"ConfirmarSuperposicion": True},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["Aceptada"] is True
    nombres = sorted(a.Nombre for a in _actividades_del_dia(db_session, dia))
    assert nombres == ["Almuerzo en Palermo", "Visita al Museo de Bellas Artes"]
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "aceptada"


def test_cp5_superposicion_cancelada_no_crea_la_actividad(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    """Cancelar la advertencia = no reenviar la confirmación: la sugerencia sigue pendiente."""
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    _crear_actividad(db_session, dia, "Almuerzo en Palermo", time(16, 0), time(17, 30))

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.json()["RequiereConfirmacion"] is True
    assert [a.Nombre for a in _actividades_del_dia(db_session, dia)] == ["Almuerzo en Palermo"]
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "pendiente"


def test_horario_modificado_que_evita_la_superposicion_no_pide_confirmacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    _crear_actividad(db_session, dia, "Almuerzo en Palermo", time(16, 0), time(17, 30))

    respuesta = client.post(
        _url(viaje, sugerencia.IdSugerenciaActividad),
        json={"HoraInicio": "17:30", "HoraFin": "19:00"},
        headers=auth_headers,
    )

    assert respuesta.json()["Aceptada"] is True
    assert len(_actividades_del_dia(db_session, dia)) == 2


# --- CP6 a CP8: solo se aceptan sugerencias pendientes -------------------------


@pytest.mark.parametrize(
    ("estado", "codigo"),
    [
        ("aceptada", "SUGGESTION_ALREADY_ACCEPTED"),
        ("descartada", "SUGGESTION_NOT_PENDING"),
        ("en_votacion", "SUGGESTION_IN_VOTING"),
    ],
)
def test_cp6_cp7_cp8_solo_se_aceptan_sugerencias_pendientes(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias,
    estado, codigo,
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(
        db_session, viaje, usuario_activo, dia, estados_sugerencias, estado=estado
    )

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == codigo
    assert _actividades_del_dia(db_session, dia) == []
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == estado


def test_cp6_una_sugerencia_aceptada_no_puede_volver_a_aceptarse(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    primera = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)
    segunda = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert primera.status_code == 200
    assert segunda.status_code == 409
    assert segunda.headers["X-Error-Code"] == "SUGGESTION_ALREADY_ACCEPTED"
    assert len(_actividades_del_dia(db_session, dia)) == 1


def test_la_sugerencia_aceptada_deja_de_listarse(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    listado = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades", headers=auth_headers
    )

    assert listado.status_code == 200
    assert listado.json() == []


# --- CP9 y criterios 1 y 3: permisos y viaje finalizado ------------------------


def test_cp9_aceptar_en_un_viaje_finalizado_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    finalizado = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first()
    viaje.IdEstadoViaje = finalizado.IdEstadoViaje
    db_session.commit()

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_FINISHED"
    assert _actividades_del_dia(db_session, dia) == []
    assert _estado_de(db_session, sugerencia.IdSugerenciaActividad) == "pendiente"


def test_solo_los_participantes_actuales_pueden_aceptar(
    client, db_session, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)
    _, headers_ex = _crear_participante(db_session, viaje, "exparticipante", estado="salio")

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=headers_ex)

    assert respuesta.status_code == 403
    assert _actividades_del_dia(db_session, dia) == []


def test_sugerencia_de_otro_viaje_devuelve_404(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/sugerencias-actividades/{sugerencia.IdSugerenciaActividad + 99}/aceptar",
        json={},
        headers=auth_headers,
    )

    assert respuesta.status_code == 404
    assert respuesta.headers["X-Error-Code"] == "SUGGESTION_NOT_FOUND"


# --- CP10: notificación a los participantes ------------------------------------


def test_cp10_se_notifica_la_nueva_actividad(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias,
    notificaciones,
):
    viaje, _ = viaje_con_admin
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert len(notificaciones) == 1
    evento = notificaciones[0]
    assert evento.notification_type == NotificationType.NUEVA_ACTIVIDAD
    assert evento.id_viaje == viaje.IdViaje
    assert evento.id_usuario_actor == usuario_activo.IdUsuario
    assert "Visita al Museo de Bellas Artes" in evento.mensaje
    assert evento.data["dayId"] == dia.IdDiaCronograma


def test_cp10_los_demas_participantes_reciben_la_notificacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados_sugerencias,
    monkeypatch,
):
    """Despacho real: el resto del grupo recibe la notificación interna; el que aceptó no."""
    from app.services.notifications import dispatch_trip_notification

    monkeypatch.setattr(
        "app.api.routes.sugerencias.dispatch_trip_notification", dispatch_trip_notification
    )
    viaje, _ = viaje_con_admin
    companera, _ = _crear_participante(db_session, viaje, "companera")
    sugerencia = _crear_sugerencia(db_session, viaje, usuario_activo, dia, estados_sugerencias)

    respuesta = client.post(_url(viaje, sugerencia.IdSugerenciaActividad), json={}, headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    db_session.expire_all()
    destinatarios = {n.IdUsuario for n in db_session.query(Notificacion).all()}
    assert destinatarios == {companera.IdUsuario}
