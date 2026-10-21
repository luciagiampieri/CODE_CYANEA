from datetime import date

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import PLAN_GRATUITO, PLAN_PRO, Plan
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes as lp


def _crear_usuario(db, nombre, id_plan=PLAN_GRATUITO):
    usuario = Usuario(
        Nombre=nombre,
        Apellido="Test",
        NombreUsuario=nombre.lower(),
        Email=f"{nombre.lower()}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
        IdPlan=id_plan,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _crear_viaje(db, admin, estado="activo"):
    estado_viaje = db.query(EstadoViaje).filter_by(Nombre=estado).first()
    viaje = Viaje(
        Titulo=f"Viaje {estado}",
        FechaInicio=date(2026, 12, 1),
        FechaFin=date(2026, 12, 10),
        IdEstadoViaje=estado_viaje.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=admin.IdUsuario,
    )
    db.add(viaje)
    db.commit()
    db.refresh(viaje)
    return viaje


def _agregar_participante(db, viaje, usuario, estado="aceptado", rol="participante"):
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=db.query(RolParticipante).filter_by(Nombre=rol).first().IdRolParticipante,
            IdEstadoParticipacion=db.query(EstadoParticipacion)
            .filter_by(Nombre=estado)
            .first()
            .IdEstadoParticipacion,
        )
    )
    db.commit()


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def test_viajes_finalizados_y_cancelados_no_cuentan(db_session, master_data, usuario_activo):
    _crear_viaje(db_session, usuario_activo, "activo")
    _crear_viaje(db_session, usuario_activo, "finalizado")
    _crear_viaje(db_session, usuario_activo, "cancelado")

    assert lp.contar_viajes_activos(db_session, usuario_activo.IdUsuario) == 1


def test_crear_viaje_superando_limite_gratuito_falla(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    _crear_viaje(db_session, usuario_activo)

    with pytest.raises(HTTPException) as error:
        lp.validar_viajes_activos(db_session, usuario_activo)

    assert error.value.status_code == 409
    assert error.value.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"
    assert error.value.detail["tipoLimite"] == "viajes_activos"
    assert error.value.detail["limite"] == 1
    assert error.value.detail["usoActual"] == 1


def test_crear_viaje_que_alcanza_justo_el_limite_pasa(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=2)
    _crear_viaje(db_session, usuario_activo)

    lp.validar_viajes_activos(db_session, usuario_activo)


def test_usuario_pro_supera_limite_gratuito(db_session, master_data):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    pro = _crear_usuario(db_session, "Pro", PLAN_PRO)
    _crear_viaje(db_session, pro)

    lp.validar_viajes_activos(db_session, pro)


def test_limite_ilimitado_no_valida(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=None)
    for _ in range(3):
        _crear_viaje(db_session, usuario_activo)

    assert lp.uso_viajes_activos(db_session, usuario_activo).ilimitado
    lp.validar_viajes_activos(db_session, usuario_activo)


def test_plan_inactivo_devuelve_503(db_session, master_data, usuario_activo):
    _set_limites(db_session, PLAN_GRATUITO, Activo=False)

    with pytest.raises(HTTPException) as error:
        lp.validar_viajes_activos(db_session, usuario_activo)

    assert error.value.status_code == 503
    assert error.value.headers["X-Error-Code"] == "PLAN_UNAVAILABLE"


def test_plan_del_viaje_es_el_del_administrador(db_session, master_data):
    admin = _crear_usuario(db_session, "Admin", PLAN_GRATUITO)
    pro = _crear_usuario(db_session, "Pro", PLAN_PRO)
    viaje = _crear_viaje(db_session, admin)
    _agregar_participante(db_session, viaje, pro)

    assert lp.plan_de_viaje(db_session, viaje).IdPlan == PLAN_GRATUITO


def test_cambio_de_administrador_recalcula_plan_del_viaje(db_session, master_data):
    admin_pro = _crear_usuario(db_session, "AdminPro", PLAN_PRO)
    gratuito = _crear_usuario(db_session, "Gratuito", PLAN_GRATUITO)
    viaje = _crear_viaje(db_session, admin_pro)

    viaje.IdAdministrador = gratuito.IdUsuario
    db_session.commit()
    db_session.refresh(viaje)

    assert lp.plan_de_viaje(db_session, viaje).IdPlan == PLAN_GRATUITO


def test_invitaciones_pendientes_no_cuentan(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _agregar_participante(db_session, viaje, _crear_usuario(db_session, "Invitado"), estado="invitado")

    assert lp.contar_participantes(db_session, viaje.IdViaje) == 1


def test_agregar_participante_superando_limite_falla(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxParticipantesViaje=2)
    _agregar_participante(db_session, viaje, _crear_usuario(db_session, "Bruno"))

    with pytest.raises(HTTPException) as error:
        lp.validar_participantes(db_session, viaje)

    assert error.value.status_code == 409
    assert error.value.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert error.value.detail["usoActual"] == 2


def test_excedente_por_cambio_de_admin_conserva_participantes_y_bloquea_nuevos(db_session, master_data):
    _set_limites(db_session, PLAN_GRATUITO, MaxParticipantesViaje=2)
    _set_limites(db_session, PLAN_PRO, MaxParticipantesViaje=10)
    admin_pro = _crear_usuario(db_session, "AdminPro", PLAN_PRO)
    viaje = _crear_viaje(db_session, admin_pro)
    _agregar_participante(db_session, viaje, admin_pro, rol="administrador")
    nuevo_admin = _crear_usuario(db_session, "NuevoAdmin", PLAN_GRATUITO)
    _agregar_participante(db_session, viaje, nuevo_admin)
    _agregar_participante(db_session, viaje, _crear_usuario(db_session, "Carla"))

    viaje.IdAdministrador = nuevo_admin.IdUsuario
    db_session.commit()
    db_session.refresh(viaje)

    assert lp.contar_participantes(db_session, viaje.IdViaje) == 3
    with pytest.raises(HTTPException):
        lp.validar_participantes(db_session, viaje)


def test_destinatario_en_su_limite_no_puede_recibir_administracion(db_session, master_data):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    destinatario = _crear_usuario(db_session, "Destinatario")
    _crear_viaje(db_session, destinatario)

    with pytest.raises(HTTPException) as error:
        lp.validar_viajes_activos_destinatario(db_session, destinatario)

    assert error.value.headers["X-Error-Code"] == "RECIPIENT_ACTIVE_TRIP_LIMIT_REACHED"
    assert error.value.detail["tipoLimite"] == "viajes_activos_destinatario"


def test_aceptar_invitacion_en_viaje_completo_falla(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxParticipantesViaje=1)
    invitado = _crear_usuario(db_session, "Invitado")
    _agregar_participante(db_session, viaje, invitado, estado="invitado")

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        headers=_headers(invitado),
        json={"decision": "aceptar"},
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"
    assert response.json()["detail"]["tipoLimite"] == "participantes_viaje"


def test_aceptar_invitacion_con_cupo_pasa(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxParticipantesViaje=2)
    invitado = _crear_usuario(db_session, "Invitado")
    _agregar_participante(db_session, viaje, invitado, estado="invitado")

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        headers=_headers(invitado),
        json={"decision": "aceptar"},
    )

    assert response.status_code == 200


def test_transferir_administracion_a_usuario_en_su_limite_falla(
    client, db_session, viaje_con_admin, auth_headers
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=1)
    destinatario = _crear_usuario(db_session, "Destinatario")
    _agregar_participante(db_session, viaje, destinatario)
    _crear_viaje(db_session, destinatario)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        headers=auth_headers,
        json={"nuevoAdministradorId": destinatario.IdUsuario},
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "RECIPIENT_ACTIVE_TRIP_LIMIT_REACHED"
    db_session.refresh(viaje)
    assert viaje.IdAdministrador != destinatario.IdUsuario


def test_transferir_administracion_a_usuario_con_cupo_pasa(
    client, db_session, viaje_con_admin, auth_headers
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=2)
    destinatario = _crear_usuario(db_session, "Destinatario")
    _agregar_participante(db_session, viaje, destinatario)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/transferir-administracion",
        headers=auth_headers,
        json={"nuevoAdministradorId": destinatario.IdUsuario},
    )

    assert response.status_code == 200
    db_session.refresh(viaje)
    assert viaje.IdAdministrador == destinatario.IdUsuario