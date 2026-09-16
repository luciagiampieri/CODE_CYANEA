"""Reglas para viajes finalizados.

Un viaje se considera finalizado a partir del día siguiente a su FechaFin
(o si su estado en la base es "finalizado"). En ese caso:
- itinerario, lugares, participantes, checklist, votaciones, documentación y
  repositorio quedan en solo lectura (409 con X-Error-Code: TRIP_FINISHED);
- gastos y liquidaciones siguen habilitados;
- los datos generales y la portada se pueden editar hasta un mes después
  de FechaFin (403 TRIP_EDIT_WINDOW_CLOSED al vencer);
- las votaciones abiertas se muestran como cerradas.
"""

import io
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, hash_password
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.votacion import Votacion
from app.services.trip_access import (
    is_trip_finished,
    resolve_trip_status,
    trip_info_editable_until,
)

HOY = date.today()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _finalizar_por_fecha(db_session, viaje, dias_desde_fin=1):
    viaje.FechaInicio = HOY - timedelta(days=dias_desde_fin + 5)
    viaje.FechaFin = HOY - timedelta(days=dias_desde_fin)
    db_session.commit()
    db_session.refresh(viaje)
    return viaje


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
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=rol.IdRolParticipante,
            IdEstadoParticipacion=estado_obj.IdEstadoParticipacion,
        )
    )
    db_session.commit()
    db_session.refresh(usuario)
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, {"Authorization": f"Bearer {token}"}


def _crear_dia(db_session, viaje):
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=viaje.FechaInicio, IndiceDia=0)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


def _crear_votacion(db_session, viaje, creador_id, dias_para_cerrar=3):
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


def _assert_bloqueado(response, seccion):
    assert response.status_code == 409, response.text
    assert response.headers.get("X-Error-Code") == "TRIP_FINISHED"
    assert response.json()["detail"] == f"El viaje ya finalizó: {seccion} no se puede modificar."


# ---------------------------------------------------------------------------
# Regla de negocio
# ---------------------------------------------------------------------------


def test_el_ultimo_dia_del_viaje_todavia_no_esta_finalizado(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = HOY - timedelta(days=3)
    viaje.FechaFin = HOY
    db_session.commit()

    assert is_trip_finished(viaje) is False
    assert is_trip_finished(viaje, today=HOY + timedelta(days=1)) is True


def test_estado_expuesto_respeta_cancelado_aunque_haya_pasado_la_fecha(db_session, viaje_con_admin):
    from app.models.estado_viaje import EstadoViaje

    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    assert resolve_trip_status(viaje) == "finalizado"

    cancelado = db_session.query(EstadoViaje).filter_by(Nombre="cancelado").first()
    viaje.IdEstadoViaje = cancelado.IdEstadoViaje
    db_session.commit()
    db_session.refresh(viaje)
    assert resolve_trip_status(viaje) == "cancelado"


def test_detalle_y_listado_devuelven_estado_finalizado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert detalle.status_code == 200
    assert detalle.json()["status"] == "finalizado"

    listado = client.get("/api/v1/trips", headers=auth_headers)
    assert listado.status_code == 200
    assert listado.json()[0]["status"] == "finalizado"


# ---------------------------------------------------------------------------
# Secciones bloqueadas
# ---------------------------------------------------------------------------


def test_itinerario_bloqueado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    dia = _crear_dia(db_session, viaje)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities",
        json={"nombre": "Visita al museo", "horaInicio": "10:00:00", "horaFin": "12:00:00"},
        headers=auth_headers,
    )
    _assert_bloqueado(response, "el itinerario")

    response = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities/1",
        headers=auth_headers,
    )
    _assert_bloqueado(response, "el itinerario")


def test_itinerario_habilitado_si_el_viaje_no_termino(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = HOY - timedelta(days=2)
    viaje.FechaFin = HOY  # último día: todavía se puede editar
    db_session.commit()
    dia = _crear_dia(db_session, viaje)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/days/{dia.IdDiaCronograma}/activities",
        json={"nombre": "Visita al museo", "horaInicio": "10:00:00", "horaFin": "12:00:00"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text


def test_guardar_lugar_bloqueado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/places",
        json={
            "placeId": "google:abc",
            "name": "Catedral",
            "address": "Plaza 1",
            "lat": -31.4,
            "lng": -64.18,
        },
        headers=auth_headers,
    )
    _assert_bloqueado(response, "el itinerario")


def test_participantes_bloqueados(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    miembro, _ = _crear_miembro(db_session, viaje, "carla")

    agregar = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "nuevo@test.com"},
        headers=auth_headers,
    )
    _assert_bloqueado(agregar, "la lista de participantes")

    expulsar = client.delete(
        f"/api/v1/trips/{viaje.IdViaje}/participants/{miembro.IdUsuario}",
        headers=auth_headers,
    )
    _assert_bloqueado(expulsar, "la lista de participantes")


def test_no_admin_recibe_403_antes_que_409(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    _, headers_miembro = _crear_miembro(db_session, viaje, "dario")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/participants",
        json={"email": "nuevo@test.com"},
        headers=headers_miembro,
    )
    assert response.status_code == 403


def test_no_se_puede_abandonar_un_viaje_finalizado_por_fecha(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    _, headers_miembro = _crear_miembro(db_session, viaje, "eva")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/leave",
        json={"confirmar": True},
        headers=headers_miembro,
    )
    _assert_bloqueado(response, "la lista de participantes")


def test_invitacion_se_puede_rechazar_pero_no_aceptar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)
    _, headers_invitada = _crear_miembro(db_session, viaje, "flor", estado="invitado")

    aceptar = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=headers_invitada,
    )
    _assert_bloqueado(aceptar, "la lista de participantes")

    rechazar = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "rechazar"},
        headers=headers_invitada,
    )
    assert rechazar.status_code == 200, rechazar.text


def test_checklist_bloqueada(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    crear = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={"Nombre": "Pasaporte", "IdCategoriaChecklist": 1},
        headers=auth_headers,
    )
    _assert_bloqueado(crear, "la checklist")

    marcar = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/1",
        json={"Completada": True},
        headers=auth_headers,
    )
    _assert_bloqueado(marcar, "la checklist")


def test_documentacion_bloqueada(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    subir = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        files={"archivo": ("pasaje.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        data={"IdCategoriaDocumento": "1"},
        headers=auth_headers,
    )
    _assert_bloqueado(subir, "la documentación")

    borrar = client.delete(f"/api/v1/trips/{viaje.IdViaje}/documents/1", headers=auth_headers)
    _assert_bloqueado(borrar, "la documentación")


def test_documentacion_se_puede_seguir_consultando(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/documents", headers=auth_headers)
    assert response.status_code == 200


def test_repositorio_bloqueado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/repositorio",
        json={
            "titulo": "Hotel",
            "tipo": "direccion",
            "contenido": "Av. Siempre Viva 123",
            "descripcion": "Reserva",
            "esPublico": True,
        },
        headers=auth_headers,
    )
    _assert_bloqueado(response, "el repositorio")


def _payload_edicion(viaje, titulo="Nuevo título"):
    return {
        "title": titulo,
        "description": "",
        "startDate": str(viaje.FechaInicio),
        "endDate": str(viaje.FechaFin),
        "destinations": [
            {"name": "Bariloche", "country": "Argentina", "lat": -41.15, "lng": -71.31}
        ],
    }


def _terminar_hace(db_session, viaje, **delta):
    """Deja el viaje terminado en HOY - delta (con 5 días de duración)."""
    viaje.FechaFin = HOY - timedelta(**delta)
    viaje.FechaInicio = viaje.FechaFin - timedelta(days=5)
    db_session.commit()
    db_session.refresh(viaje)
    return viaje


def test_datos_del_viaje_editables_durante_el_mes_posterior(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _terminar_hace(db_session, viaje, days=10)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}", json=_payload_edicion(viaje), headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["trip"]["title"] == "Nuevo título"


def test_datos_del_viaje_no_editables_pasado_el_mes(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _terminar_hace(db_session, viaje, days=45)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}", json=_payload_edicion(viaje), headers=auth_headers
    )
    assert response.status_code == 403
    assert response.headers.get("X-Error-Code") == "TRIP_EDIT_WINDOW_CLOSED"
    assert (
        response.json()["detail"]
        == "El plazo para editar la información general de este viaje ha vencido"
    )


def test_el_ultimo_dia_del_plazo_todavia_se_puede_editar(db_session, viaje_con_admin):
    from app.services.trip_access import require_trip_info_editable

    viaje, _ = viaje_con_admin
    viaje.FechaInicio = date(2026, 3, 1)
    viaje.FechaFin = date(2026, 3, 8)
    db_session.commit()

    assert trip_info_editable_until(viaje) == date(2026, 4, 8)
    require_trip_info_editable(viaje, today=date(2026, 4, 8))
    with pytest.raises(HTTPException) as excinfo:
        require_trip_info_editable(viaje, today=date(2026, 4, 9))
    assert excinfo.value.status_code == 403


def test_el_plazo_ajusta_meses_mas_cortos(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = date(2027, 1, 25)
    viaje.FechaFin = date(2027, 1, 31)
    db_session.commit()
    assert trip_info_editable_until(viaje) == date(2027, 2, 28)

    viaje.FechaInicio = date(2026, 12, 20)
    viaje.FechaFin = date(2026, 12, 31)
    db_session.commit()
    assert trip_info_editable_until(viaje) == date(2027, 1, 31)


def test_detalle_expone_hasta_cuando_se_puede_editar(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _terminar_hace(db_session, viaje, days=3)

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["infoEditableUntil"] == str(trip_info_editable_until(viaje))


def test_portada_sigue_la_misma_regla_del_mes(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _terminar_hace(db_session, viaje, days=45)

    subir = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/cover",
        files={"archivo": ("portada.jpg", io.BytesIO(b"fake-jpg"), "image/jpeg")},
        headers=auth_headers,
    )
    assert subir.status_code == 403
    assert subir.headers.get("X-Error-Code") == "TRIP_EDIT_WINDOW_CLOSED"

    quitar = client.delete(f"/api/v1/trips/{viaje.IdViaje}/cover", headers=auth_headers)
    assert quitar.status_code == 403


def test_admin_puede_eliminar_un_viaje_finalizado(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.delete(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers)
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------------------
# Votaciones
# ---------------------------------------------------------------------------


def test_votaciones_bloqueadas(client, db_session, auth_headers, usuario_activo, viaje_con_admin):
    viaje, _ = viaje_con_admin
    votacion = _crear_votacion(db_session, viaje, usuario_activo.IdUsuario)
    _finalizar_por_fecha(db_session, viaje)

    crear = client.post(
        "/api/v1/votaciones",
        json={
            "idViaje": viaje.IdViaje,
            "nombre": "Otra votación",
            "fechaCierre": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "tipo": "opcion_unica",
            "propuestas": ["A", "B"],
        },
        headers=auth_headers,
    )
    _assert_bloqueado(crear, "las votaciones")

    votar = client.post(
        f"/api/v1/votaciones/{votacion.IdVotacion}/votar",
        json={"idPropuestas": [1]},
        headers=auth_headers,
    )
    _assert_bloqueado(votar, "las votaciones")


def test_votacion_abierta_se_cierra_al_finalizar_el_viaje(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    votacion = _crear_votacion(db_session, viaje, usuario_activo.IdUsuario, dias_para_cerrar=10)

    antes = client.get(f"/api/v1/votaciones?idViaje={viaje.IdViaje}", headers=auth_headers)
    assert antes.json()[0]["Estado"] == "abierta"

    _finalizar_por_fecha(db_session, viaje)

    despues = client.get(f"/api/v1/votaciones?idViaje={viaje.IdViaje}", headers=auth_headers)
    assert despues.json()[0]["Estado"] == "cerrada"

    # Al quedar cerrada, los resultados ya se pueden consultar.
    resultados = client.get(
        f"/api/v1/votaciones/{votacion.IdVotacion}/resultados", headers=auth_headers
    )
    assert resultados.status_code == 200
    assert resultados.json()["Estado"] == "cerrada"


# ---------------------------------------------------------------------------
# Gastos siguen habilitados
# ---------------------------------------------------------------------------


def test_gastos_siguen_habilitados(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.post(
        "/api/v1/gastos/",
        json={
            "IdViaje": viaje.IdViaje,
            "Nombre": "Nafta de la vuelta",
            "Monto": "15000.00",
            "IdCategoria": categoria_gasto.IdCategoria,
            "FechaGasto": str(viaje.FechaFin),
            "EsCompartido": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text


def test_liquidacion_sigue_habilitada(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/settlement/rebuild", headers=auth_headers
    )
    assert response.status_code != 409, response.text


@pytest.mark.parametrize("dias_desde_fin", [1, 30, 400])
def test_bloqueo_no_depende_de_cuanto_tiempo_paso(client, db_session, auth_headers, viaje_con_admin, dias_desde_fin):
    viaje, _ = viaje_con_admin
    _finalizar_por_fecha(db_session, viaje, dias_desde_fin=dias_desde_fin)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={"Nombre": "Pasaporte", "IdCategoriaChecklist": 1},
        headers=auth_headers,
    )
    _assert_bloqueado(response, "la checklist")