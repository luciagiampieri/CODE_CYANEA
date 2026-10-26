from datetime import date, datetime, time, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, hash_password
from app.models.categorias_documento import CategoriaDocumento
from app.models.dia_cronograma import DiaCronograma
from app.models.documento_viaje import DocumentoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import SolicitudSugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes as lp
from app.services.estado_viajes import CAMBIO_REACTIVADO, recalcular_estado_viaje

MB = 1024 * 1024
PASSWORD = "Password123!"


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _set_plan(db, usuario, id_plan):
    usuario.IdPlan = id_plan
    db.commit()


def _por_nombre(db, modelo, nombre):
    return db.query(modelo).filter_by(Nombre=nombre).first()


def _usuario(db, alias, id_plan=PLAN_GRATUITO):
    usuario = Usuario(
        Nombre=alias.capitalize(),
        Apellido="Test",
        NombreUsuario=f"{alias}_test",
        Email=f"{alias}@test.com",
        HashedPassword=hash_password(PASSWORD),
        Activo=True,
        EmailConfirmado=True,
        IdPlan=id_plan,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _participar(db, viaje, usuario, estado="aceptado", rol="participante", incorporacion=None):
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=_por_nombre(db, RolParticipante, rol).IdRolParticipante,
        IdEstadoParticipacion=_por_nombre(db, EstadoParticipacion, estado).IdEstadoParticipacion,
        FechaIncorporacion=incorporacion or datetime.now(),
    )
    db.add(participacion)
    db.commit()
    return participacion


def _viaje(db, admin, estado="activo", inicio=None, fin=None):
    hoy = date.today()
    viaje = Viaje(
        Titulo=f"Viaje de {admin.Nombre}",
        FechaInicio=inicio or hoy + timedelta(days=30),
        FechaFin=fin or hoy + timedelta(days=40),
        IdEstadoViaje=_por_nombre(db, EstadoViaje, estado).IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=admin.IdUsuario,
    )
    db.add(viaje)
    db.commit()
    db.refresh(viaje)
    _participar(db, viaje, admin, rol="administrador", incorporacion=datetime(2020, 1, 1))
    return viaje


def _dia(db, viaje):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=viaje.FechaInicio, IndiceDia=1)
    db.add(dia)
    db.commit()
    db.refresh(dia)
    return dia


def _solicitud(db, viaje, usuario, dia, fecha, orden, estado="completada"):
    db.add(
        SolicitudSugerenciaActividad(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdDiaCronograma=dia.IdDiaCronograma,
            HoraInicio=time(8 + orden, 0),
            HoraFin=time(9 + orden, 0),
            Estado=estado,
            FechaSolicitud=fecha,
        )
    )
    db.commit()


def _payload_viaje():
    hoy = date.today()
    return {
        "title": "Nuevo viaje",
        "destinations": [{"name": "Bariloche", "country": "Argentina", "placeId": "place-bariloche"}],
        "startDate": (hoy + timedelta(days=10)).isoformat(),
        "endDate": (hoy + timedelta(days=15)).isoformat(),
        "currency": "ARS",
    }


def _crear_viaje(client, headers):
    return client.post("/api/v1/trips", headers=headers, json=_payload_viaje())


def test_crear_viaje_superando_limite_gratuito_falla_con_error_estandarizado(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)

    respuesta = _crear_viaje(client, auth_headers)

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"
    detalle = respuesta.json()["detail"]
    assert detalle["tipoLimite"] == "viajes_activos"
    assert detalle["limite"] == 1
    assert detalle["usoActual"] == 1
    assert detalle["mensaje"]


def test_crear_el_mismo_viaje_siendo_pro_pasa(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)
    _set_plan(db_session, usuario_activo, PLAN_PRO)

    assert _crear_viaje(client, auth_headers).status_code == 201


def test_crear_el_ultimo_viaje_permitido_pasa_y_el_siguiente_falla(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=2)
    _viaje(db_session, usuario_activo)

    assert _crear_viaje(client, auth_headers).status_code == 201
    assert _crear_viaje(client, auth_headers).status_code == 409


def test_viajes_finalizados_y_cancelados_no_cuentan(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    hoy = date.today()
    _viaje(db_session, usuario_activo, "finalizado", hoy - timedelta(days=20), hoy - timedelta(days=10))
    _viaje(db_session, usuario_activo, "cancelado")

    assert _crear_viaje(client, auth_headers).status_code == 201


def test_modificar_el_limite_en_la_configuracion_se_aplica_sin_cambios_de_codigo(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)
    assert _crear_viaje(client, auth_headers).status_code == 409

    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=3)

    assert _crear_viaje(client, auth_headers).status_code == 201


def test_limite_ilimitado_no_se_valida_ni_muestra_uso_respecto_del_limite(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=None)
    _viaje(db_session, usuario_activo)
    _viaje(db_session, usuario_activo)

    assert _crear_viaje(client, auth_headers).status_code == 201
    limites = client.get("/api/v1/users/me/limites", headers=auth_headers).json()
    assert limites["viajesActivos"]["ilimitado"] is True
    assert limites["viajesActivos"]["limite"] is None


def test_transferir_a_usuario_gratuito_que_alcanzo_su_limite_falla(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    beto = _usuario(db_session, "beto")
    _viaje(db_session, beto)
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)

    respuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        headers=auth_headers,
        json={"nuevoAdministradorId": beto.IdUsuario},
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "RECIPIENT_ACTIVE_TRIP_LIMIT_REACHED"
    db_session.expire_all()
    assert db_session.get(Viaje, viaje.IdViaje).IdAdministrador == usuario_activo.IdUsuario


def test_transferir_a_usuario_gratuito_pasa_el_viaje_a_limites_gratuitos(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_plan(db_session, usuario_activo, PLAN_PRO)
    beto = _usuario(db_session, "beto")
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    assert lp.resumen_viaje(db_session, viaje)["plan"] == "pro"

    respuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        headers=auth_headers,
        json={"nuevoAdministradorId": beto.IdUsuario},
    )

    assert respuesta.status_code == 200
    db_session.expire_all()
    viaje = db_session.get(Viaje, viaje.IdViaje)
    assert lp.resumen_viaje(db_session, viaje)["plan"] == "gratuito"
    assert lp.uso_sugerencias(db_session, viaje).limite == 10


def test_transferir_con_mas_participantes_que_el_limite_conserva_y_bloquea_nuevos(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_PRO, MaxParticipantesViaje=10)
    _set_plan(db_session, usuario_activo, PLAN_PRO)
    beto, carla, dani, eva = (_usuario(db_session, n) for n in ("beto", "carla", "dani", "eva"))
    viaje = _viaje(db_session, usuario_activo)
    for participante in (beto, carla, dani):
        _participar(db_session, viaje, participante)
    _participar(db_session, viaje, eva, estado="invitado")

    transferencia = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        headers=auth_headers,
        json={"nuevoAdministradorId": beto.IdUsuario},
    )
    assert transferencia.status_code == 200
    assert lp.contar_participantes(db_session, viaje.IdViaje) == 4

    respuesta = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        headers=_headers(eva),
        json={"decision": "aceptar"},
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert respuesta.json()["detail"]["limite"] == 3
    assert respuesta.json()["detail"]["usoActual"] == 4
    assert lp.contar_participantes(db_session, viaje.IdViaje) == 4


def test_aceptar_invitacion_a_viaje_completo_falla(
    client, db_session, master_data, usuario_activo
):
    beto, carla, eva = (_usuario(db_session, n) for n in ("beto", "carla", "eva"))
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    _participar(db_session, viaje, carla)
    _participar(db_session, viaje, eva, estado="invitado")

    respuesta = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        headers=_headers(eva),
        json={"decision": "aceptar"},
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"


def test_generar_link_con_viaje_completo_pasa_y_unirse_por_link_falla(
    client, db_session, master_data, usuario_activo, auth_headers
):
    beto, carla, fede = (_usuario(db_session, n) for n in ("beto", "carla", "fede"))
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    _participar(db_session, viaje, carla)

    enlace = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/enlace-invitacion",
        headers=auth_headers,
        json={"renovar": False},
    )
    assert enlace.status_code == 200
    token = enlace.json()["url"].rsplit("/unirse/", 1)[1]

    respuesta = client.post(
        f"/api/v1/invitaciones/enlaces/{token}/unirse", headers=_headers(fede)
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert lp.contar_participantes(db_session, viaje.IdViaje) == 3


def test_abandonar_eligiendo_admin_que_alcanzo_su_limite_falla(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    beto = _usuario(db_session, "beto")
    _viaje(db_session, beto)
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)

    respuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        headers=auth_headers,
        json={"confirmar": True, "nuevoAdministradorId": beto.IdUsuario},
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "RECIPIENT_ACTIVE_TRIP_LIMIT_REACHED"
    db_session.expire_all()
    assert db_session.get(Viaje, viaje.IdViaje).IdAdministrador == usuario_activo.IdUsuario


def test_baja_de_cuenta_reasigna_la_administracion_a_quien_tiene_cupo(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    beto, carla = _usuario(db_session, "beto"), _usuario(db_session, "carla")
    _viaje(db_session, beto)
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto, incorporacion=datetime(2021, 1, 1))
    _participar(db_session, viaje, carla, incorporacion=datetime(2022, 1, 1))

    respuesta = client.request(
        "DELETE", "/api/v1/users/me", headers=auth_headers, json={"password": PASSWORD}
    )

    assert respuesta.status_code == 204
    db_session.expire_all()
    assert db_session.get(Viaje, viaje.IdViaje).IdAdministrador == carla.IdUsuario


def test_extender_fechas_de_viaje_finalizado_con_limite_alcanzado_falla(
    client, db_session, master_data, usuario_activo, auth_headers
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)
    hoy = date.today()
    inicio = hoy - timedelta(days=10)
    viaje = _viaje(db_session, usuario_activo, "finalizado", inicio, hoy - timedelta(days=3))

    respuesta = client.put(
        f"/api/v1/trips/{viaje.IdViaje}",
        headers=auth_headers,
        json={
            "title": viaje.Titulo,
            "startDate": inicio.isoformat(),
            "endDate": (hoy + timedelta(days=5)).isoformat(),
            "destinations": [{"name": "Bariloche", "country": "Argentina", "placeId": "place-bariloche"}],
        },
    )

    assert respuesta.status_code == 409
    assert respuesta.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"
    db_session.rollback()
    db_session.expire_all()
    viaje = db_session.get(Viaje, viaje.IdViaje)
    assert viaje.EstadoViaje.Nombre == "finalizado"


def test_extender_fechas_de_viaje_finalizado_dentro_del_limite_lo_reactiva(
    db_session, master_data, usuario_activo
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=2)
    _viaje(db_session, usuario_activo)
    hoy = date.today()
    viaje = _viaje(db_session, usuario_activo, "finalizado", hoy - timedelta(days=10), hoy - timedelta(days=3))

    viaje.FechaFin = hoy + timedelta(days=5)

    assert recalcular_estado_viaje(db_session, viaje.IdViaje) == CAMBIO_REACTIVADO


def test_reactivar_viaje_con_limite_alcanzado_falla_en_el_servicio(
    db_session, master_data, usuario_activo
):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _viaje(db_session, usuario_activo)
    hoy = date.today()
    viaje = _viaje(db_session, usuario_activo, "finalizado", hoy - timedelta(days=10), hoy - timedelta(days=3))

    viaje.FechaFin = hoy + timedelta(days=5)

    with pytest.raises(HTTPException) as error:
        recalcular_estado_viaje(db_session, viaje.IdViaje)
    assert error.value.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"


def test_participante_gratuito_en_viaje_de_admin_pro_usa_limite_pro(
    db_session, master_data, usuario_activo
):
    _set_plan(db_session, usuario_activo, PLAN_PRO)
    beto = _usuario(db_session, "beto")
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)

    assert lp.uso_sugerencias(db_session, viaje).limite == 20


def test_participante_pro_en_viaje_de_admin_gratuito_con_limite_alcanzado_falla(
    db_session, master_data, usuario_activo
):
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    beto = _usuario(db_session, "beto", PLAN_PRO)
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    dia = _dia(db_session, viaje)
    ahora = datetime.now(timezone.utc)
    _solicitud(db_session, viaje, beto, dia, ahora, 0)
    _solicitud(db_session, viaje, beto, dia, ahora, 1)

    with pytest.raises(HTTPException) as error:
        lp.validar_sugerencias(db_session, viaje)

    assert error.value.status_code == 429
    assert error.value.headers["X-Error-Code"] == "SUGGESTION_LIMIT_REACHED"


def test_solicitudes_de_todos_los_participantes_suman_al_limite_del_viaje(
    db_session, master_data, usuario_activo
):
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    beto = _usuario(db_session, "beto")
    viaje = _viaje(db_session, usuario_activo)
    _participar(db_session, viaje, beto)
    dia = _dia(db_session, viaje)
    ahora = datetime.now(timezone.utc)
    _solicitud(db_session, viaje, usuario_activo, dia, ahora, 0)
    _solicitud(db_session, viaje, beto, dia, ahora, 1)

    with pytest.raises(HTTPException):
        lp.validar_sugerencias(db_session, viaje)


def test_la_ultima_sugerencia_permitida_pasa(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    viaje = _viaje(db_session, usuario_activo)
    dia = _dia(db_session, viaje)
    _solicitud(db_session, viaje, usuario_activo, dia, datetime.now(timezone.utc), 0)

    lp.validar_sugerencias(db_session, viaje)


def test_solicitudes_del_dia_anterior_no_cuentan(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=2)
    viaje = _viaje(db_session, usuario_activo)
    dia = _dia(db_session, viaje)
    ayer = lp.inicio_del_dia().astimezone(timezone.utc) - timedelta(seconds=1)
    _solicitud(db_session, viaje, usuario_activo, dia, ayer, 0)
    _solicitud(db_session, viaje, usuario_activo, dia, ayer, 1)

    assert lp.contar_sugerencias_hoy(db_session, viaje.IdViaje) == 0
    lp.validar_sugerencias(db_session, viaje)


def test_solicitudes_fallidas_no_cuentan(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxSugerenciasDiarias=1)
    viaje = _viaje(db_session, usuario_activo)
    dia = _dia(db_session, viaje)
    ahora = datetime.now(timezone.utc)
    _solicitud(db_session, viaje, usuario_activo, dia, ahora, 0, estado="fallida")
    _solicitud(db_session, viaje, usuario_activo, dia, ahora, 1, estado="sin_resultados")

    lp.validar_sugerencias(db_session, viaje)


def test_subir_documento_despues_de_liberar_espacio_pasa(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=1)
    viaje = _viaje(db_session, usuario_activo)
    categoria = CategoriaDocumento(Nombre="Otros")
    db_session.add(categoria)
    db_session.commit()
    documento = DocumentoViaje(
        IdViaje=viaje.IdViaje,
        IdCategoriaDocumento=categoria.IdCategoriaDocumento,
        IdUsuarioSubida=usuario_activo.IdUsuario,
        NombreArchivo="pesado.pdf",
        UrlArchivo=f"viajes/{viaje.IdViaje}/Otros/pesado.pdf",
        TamanoBytes=MB,
    )
    db_session.add(documento)
    db_session.commit()

    with pytest.raises(HTTPException):
        lp.validar_almacenamiento(db_session, viaje, MB // 2)

    db_session.delete(documento)
    db_session.commit()

    lp.validar_almacenamiento(db_session, viaje, MB // 2)