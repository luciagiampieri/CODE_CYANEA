"""US 139: modificar voto."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.api.routes import votaciones as votaciones_module
from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.propuesta import Propuesta
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.votacion import TipoVotacionEnum, Votacion
from app.models.voto import Voto

URL = "/api/v1/votaciones"


@pytest.fixture(autouse=True)
def avisos(monkeypatch):
    """Captura los avisos en tiempo real y las notificaciones."""
    broadcast = AsyncMock()
    notificaciones = []

    async def _dispatch_falso(db, evento, *args, **kwargs):
        notificaciones.append(evento)

    monkeypatch.setattr(votaciones_module.ws_manager, "broadcast", broadcast)
    monkeypatch.setattr(votaciones_module, "dispatch_trip_notification", _dispatch_falso)
    return {"broadcast": broadcast, "notificaciones": notificaciones}


def _crear_votacion(client, headers, viaje, tipo="opcion_unica", propuestas=("Asado", "Pizza", "Sushi")):
    respuesta = client.post(
        URL,
        json={
            "idViaje": viaje.IdViaje,
            "nombre": "¿Dónde comemos?",
            "fechaCierre": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
            "tipo": tipo,
            "propuestas": list(propuestas),
        },
        headers=headers,
    )
    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    return cuerpo["IdVotacion"], [p["IdPropuesta"] for p in cuerpo["Propuestas"]]


def _votar(client, headers, id_votacion, ids):
    respuesta = client.post(f"{URL}/{id_votacion}/votar", json={"idPropuestas": ids}, headers=headers)
    assert respuesta.status_code == 200, respuesta.text


def _modificar(client, headers, id_votacion, ids):
    return client.put(f"{URL}/{id_votacion}/voto", json={"idPropuestas": ids}, headers=headers)


def _mis_votos(db_session, id_votacion, usuario_id):
    db_session.expire_all()
    return sorted(
        v.IdPropuesta
        for v in db_session.query(Voto).filter_by(IdVotacion=id_votacion, IdUsuario=usuario_id)
    )


def _crear_miembro(db_session, viaje, nombre="bob"):
    usuario = Usuario(
        Nombre=nombre.capitalize(),
        Apellido="Test",
        NombreUsuario=f"{nombre}_test",
        Email=f"{nombre}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.flush()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=db_session.query(RolParticipante)
        .filter_by(Nombre="participante").one().IdRolParticipante,
        IdEstadoParticipacion=db_session.query(EstadoParticipacion)
        .filter_by(Nombre="aceptado").one().IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    db_session.refresh(usuario)
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return usuario, participacion, {"Authorization": f"Bearer {token}"}


def _cerrar(db_session, id_votacion):
    votacion = db_session.get(Votacion, id_votacion)
    votacion.FechaCierre = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()


def test_opcion_unica_reemplaza_el_voto_y_actualiza_el_progreso(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza])

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["detail"] == "Tu voto se actualizó correctamente."
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [pizza]

    progreso = client.get(f"{URL}/{id_votacion}/progreso", headers=auth_headers).json()
    votos = {r["IdPropuesta"]: r["Votos"] for r in progreso["Resultados"]}
    assert votos[asado] == 0
    assert votos[pizza] == 1
    assert progreso["TotalVotantes"] == 1
    assert progreso["MisPropuestas"] == [pizza]


def test_opcion_multiple_permite_agregar_y_quitar_opciones(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, sushi) = _crear_votacion(
        client, auth_headers, viaje, tipo="opcion_multiple"
    )
    _votar(client, auth_headers, id_votacion, [asado, pizza])

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza, sushi])

    assert respuesta.status_code == 200, respuesta.text
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == sorted([pizza, sushi])


def test_opcion_multiple_conserva_la_fecha_de_las_opciones_que_se_mantienen(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, sushi) = _crear_votacion(
        client, auth_headers, viaje, tipo="opcion_multiple"
    )
    _votar(client, auth_headers, id_votacion, [asado, pizza])
    voto_pizza = (
        db_session.query(Voto)
        .filter_by(IdVotacion=id_votacion, IdUsuario=usuario_activo.IdUsuario, IdPropuesta=pizza)
        .one()
    )
    id_voto_pizza = voto_pizza.IdVoto

    _modificar(client, auth_headers, id_votacion, [pizza, sushi])

    db_session.expire_all()
    assert (
        db_session.query(Voto)
        .filter_by(IdVotacion=id_votacion, IdUsuario=usuario_activo.IdUsuario, IdPropuesta=pizza)
        .one()
        .IdVoto
        == id_voto_pizza
    )


def test_opcion_multiple_sin_ninguna_opcion_falla_y_conserva_el_voto(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(
        client, auth_headers, viaje, tipo="opcion_multiple"
    )
    _votar(client, auth_headers, id_votacion, [asado, pizza])

    respuesta = _modificar(client, auth_headers, id_votacion, [])

    assert respuesta.status_code == 400
    assert respuesta.json()["detail"] == "Debes seleccionar al menos una propuesta."
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == sorted([asado, pizza])


def test_opcion_unica_con_dos_opciones_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, sushi) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza, sushi])

    assert respuesta.status_code == 400
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [asado]


def test_sin_voto_previo_no_hay_nada_que_modificar(client, db_session, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, _, _) = _crear_votacion(client, auth_headers, viaje)

    respuesta = _modificar(client, auth_headers, id_votacion, [asado])

    assert respuesta.status_code == 400
    assert "Todavía no votaste" in respuesta.json()["detail"]


def test_votacion_cerrada_conserva_el_voto_anterior(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])
    _cerrar(db_session, id_votacion)

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza])

    assert respuesta.status_code == 409
    assert "Se conservó tu voto anterior" in respuesta.json()["detail"]
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [asado]


def test_votacion_cancelada_no_admite_cambios(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])
    client.post(f"{URL}/{id_votacion}/cancelar", headers=auth_headers)

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza])

    assert respuesta.status_code == 400
    assert respuesta.json()["detail"] == "La votación fue cancelada."
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [asado]


def test_propuesta_de_otra_votacion_es_rechazada(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, _, _) = _crear_votacion(client, auth_headers, viaje)
    _, (ajena, _, _) = _crear_votacion(client, auth_headers, viaje, propuestas=("Playa", "Museo", "Cine"))
    _votar(client, auth_headers, id_votacion, [asado])

    respuesta = _modificar(client, auth_headers, id_votacion, [ajena])

    assert respuesta.status_code == 400
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [asado]


def test_misma_seleccion_no_cambia_nada(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, avisos
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, _, _) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])
    avisos["broadcast"].reset_mock()

    respuesta = _modificar(client, auth_headers, id_votacion, [asado])

    assert respuesta.status_code == 200
    assert respuesta.json()["detail"] == "Tu voto no cambió."
    avisos["broadcast"].assert_not_called()


def test_solo_cambia_el_voto_de_quien_modifica(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    bob, _, headers_bob = _crear_miembro(db_session, viaje)
    _votar(client, auth_headers, id_votacion, [asado])
    _votar(client, headers_bob, id_votacion, [asado])

    _modificar(client, headers_bob, id_votacion, [pizza])

    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [asado]
    assert _mis_votos(db_session, id_votacion, bob.IdUsuario) == [pizza]


def test_participante_que_salio_no_puede_modificar_y_su_voto_se_conserva(
    client, db_session, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    bob, participacion, headers_bob = _crear_miembro(db_session, viaje)
    _votar(client, headers_bob, id_votacion, [asado])

    participacion.IdEstadoParticipacion = (
        db_session.query(EstadoParticipacion).filter_by(Nombre="salio").one().IdEstadoParticipacion
    )
    participacion.FechaSalida = datetime.now(timezone.utc)
    db_session.commit()

    respuesta = _modificar(client, headers_bob, id_votacion, [pizza])

    assert respuesta.status_code in (403, 404)
    assert _mis_votos(db_session, id_votacion, bob.IdUsuario) == [asado]


def test_avisa_en_tiempo_real_y_no_notifica(
    client, db_session, auth_headers, viaje_con_admin, avisos
):
    viaje, _ = viaje_con_admin
    id_votacion, (asado, pizza, _) = _crear_votacion(client, auth_headers, viaje)
    _votar(client, auth_headers, id_votacion, [asado])
    avisos["broadcast"].reset_mock()
    avisos["notificaciones"].clear()

    respuesta = _modificar(client, auth_headers, id_votacion, [pizza])

    assert respuesta.status_code == 200
    avisos["broadcast"].assert_called_once_with(
        viaje.IdViaje, {"tipo": "votacion_actualizada", "idVotacion": id_votacion}
    )
    assert avisos["notificaciones"] == []


def test_tambien_aplica_a_votaciones_de_sugerencias(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo
):
    viaje, _ = viaje_con_admin
    votacion = Votacion(
        IdViaje=viaje.IdViaje,
        Titulo="¿Qué hacemos a la tarde?",
        Tipo=TipoVotacionEnum.opcion_unica,
        FechaCierre=datetime.now(timezone.utc) + timedelta(days=1),
        IdCreador=usuario_activo.IdUsuario,
        EsDeSugerencias=True,
    )
    db_session.add(votacion)
    db_session.flush()
    propuestas = [
        Propuesta(IdVotacion=votacion.IdVotacion, Texto=f"Actividad {i}", Orden=i)
        for i in (1, 2)
    ]
    db_session.add_all(propuestas)
    db_session.commit()
    id_votacion = votacion.IdVotacion
    primera, segunda = (p.IdPropuesta for p in propuestas)
    _votar(client, auth_headers, id_votacion, [primera])

    respuesta = _modificar(client, auth_headers, id_votacion, [segunda])

    assert respuesta.status_code == 200, respuesta.text
    assert _mis_votos(db_session, id_votacion, usuario_activo.IdUsuario) == [segunda]