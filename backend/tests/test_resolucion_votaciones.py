"""Tests de la US 91: incorporar automáticamente la sugerencia ganadora al itinerario."""

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.security import create_access_token, hash_password
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.lugar_interes import LugarInteres
from app.models.participante_viaje import ParticipanteViaje
from app.models.propuesta import Propuesta
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.models.usuario import Usuario
from app.models.votacion import TipoVotacionEnum, Votacion
from app.models.voto import Voto
from app.services import resolucion_votaciones
from app.services.notifications import NotificationType

URL_VOTACIONES = "/api/v1/votaciones"


@pytest.fixture()
def estados(db_session):
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
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=2)
    db_session.add(dia)
    db_session.commit()
    db_session.refresh(dia)
    return dia


@pytest.fixture(autouse=True)
def avisos(monkeypatch):
    """Captura las notificaciones y evita los avisos en tiempo real (WebSocket, rutas)."""
    eventos = []

    async def _dispatch_falso(db, evento, usuarios, *args, **kwargs):
        eventos.append((evento, sorted(u.IdUsuario for u in usuarios)))

    async def _sin_tiempo_real(db, resultado):
        return None

    monkeypatch.setattr(resolucion_votaciones, "dispatch_user_notification", _dispatch_falso)
    monkeypatch.setattr(resolucion_votaciones, "_avisar_tiempo_real", _sin_tiempo_real)
    return eventos


def _crear_participante(db_session, viaje, nombre):
    usuario = Usuario(
        Nombre=nombre,
        Apellido="Test",
        NombreUsuario=f"{nombre.lower()}_test",
        Email=f"{nombre.lower()}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.flush()
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=rol.IdRolParticipante,
            IdEstadoParticipacion=aceptado.IdEstadoParticipacion,
        )
    )
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _crear_sugerencias(db_session, viaje, creador, dia, estados, cantidad, estado):
    solicitud = SolicitudSugerenciaActividad(
        IdViaje=viaje.IdViaje,
        IdUsuario=creador.IdUsuario,
        IdDiaCronograma=dia.IdDiaCronograma,
        HoraInicio=time(14, 0),
        HoraFin=time(15, 0),
        Estado="completada",
        CantidadSugerencias=cantidad,
    )
    db_session.add(solicitud)
    db_session.flush()
    sugerencias = [
        SugerenciaActividad(
            IdSolicitudSugerenciaActividad=solicitud.IdSolicitudSugerenciaActividad,
            IdViaje=viaje.IdViaje,
            IdDiaCronograma=dia.IdDiaCronograma,
            IdEstadoSugerenciaActividad=estados[estado],
            Nombre=f"Actividad {indice}",
            Descripcion="Descripción de prueba",
            HoraInicio=time(14, 0),
            HoraFin=time(15, 0),
            GooglePlaceId=f"google:place-{solicitud.IdSolicitudSugerenciaActividad}-{indice}",
            LugarNombre=f"Lugar {indice}",
            LugarDireccion=f"Calle {indice} 123",
            Lat=-31.42,
            Lng=-64.18,
            CostoEstimadoARS=Decimal("5000.00"),
            Motivo="Motivo de prueba",
        )
        for indice in range(1, cantidad + 1)
    ]
    db_session.add_all(sugerencias)
    db_session.flush()
    return [s.IdSugerenciaActividad for s in sugerencias]


def _crear_votacion(db_session, viaje, creador, dia, estados, *, cantidad=2, cierre=None):
    """Votación de sugerencias ya cerrada (por defecto) con `cantidad` propuestas."""
    ids_sugerencias = _crear_sugerencias(
        db_session, viaje, creador, dia, estados, cantidad, "en_votacion"
    )
    votacion = Votacion(
        IdViaje=viaje.IdViaje,
        Titulo="¿Qué hacemos a la tarde?",
        Tipo=TipoVotacionEnum.opcion_unica,
        FechaCierre=cierre or (datetime.now(timezone.utc) - timedelta(minutes=1)),
        IdCreador=creador.IdUsuario,
        EsDeSugerencias=True,
        IdDiaCronograma=dia.IdDiaCronograma,
    )
    db_session.add(votacion)
    db_session.flush()
    propuestas = [
        Propuesta(
            IdVotacion=votacion.IdVotacion,
            Texto=f"Actividad {indice}",
            Orden=indice,
            IdSugerenciaActividad=id_sugerencia,
        )
        for indice, id_sugerencia in enumerate(ids_sugerencias, start=1)
    ]
    db_session.add_all(propuestas)
    db_session.flush()
    resultado = (
        votacion.IdVotacion,
        ids_sugerencias,
        [p.IdPropuesta for p in propuestas],
    )
    db_session.commit()
    return resultado


def _votar(db_session, id_votacion, id_propuesta, usuario):
    db_session.add(
        Voto(IdUsuario=usuario.IdUsuario, IdVotacion=id_votacion, IdPropuesta=id_propuesta)
    )
    db_session.commit()


def _procesar(db_session):
    return asyncio.run(resolucion_votaciones.procesar_pendientes(db_session))


def _votacion(db_session, id_votacion):
    db_session.expire_all()
    return db_session.get(Votacion, id_votacion)


def _actividades_de(db_session, id_votacion):
    db_session.expire_all()
    return db_session.query(ActividadItinerario).filter_by(IdVotacionOrigen=id_votacion).all()


def _estado_de(db_session, id_sugerencia):
    db_session.expire_all()
    return db_session.get(SugerenciaActividad, id_sugerencia).IdEstadoSugerenciaActividad



def test_votacion_con_ganadora_crea_la_actividad(
    db_session, viaje_con_admin, usuario_activo, dia, estados, avisos
):
    viaje, _ = viaje_con_admin
    id_votacion, _, propuestas = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)

    _procesar(db_session)

    actividades = _actividades_de(db_session, id_votacion)
    assert len(actividades) == 1
    actividad = actividades[0]
    assert actividad.Nombre == "Actividad 1"
    assert actividad.IdDiaCronograma == dia.IdDiaCronograma
    assert actividad.HoraInicio == time(14, 0)
    assert actividad.HoraFin == time(15, 0)
    lugar = db_session.get(LugarInteres, actividad.IdLugarInteres)
    assert lugar.Nombre == "Lugar 1"
    assert _votacion(db_session, id_votacion).EstadoResolucion == "incorporada"

    evento, destinatarios = avisos[0]
    assert evento.notification_type == NotificationType.NUEVA_ACTIVIDAD
    assert destinatarios == [usuario_activo.IdUsuario]


def test_la_ganadora_queda_aceptada_y_las_demas_descartadas(
    db_session, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    id_votacion, sugerencias, propuestas = _crear_votacion(
        db_session, viaje, usuario_activo, dia, estados, cantidad=3
    )
    _votar(db_session, id_votacion, propuestas[1], usuario_activo)

    _procesar(db_session)

    assert _estado_de(db_session, sugerencias[1]) == estados["aceptada"]
    assert _estado_de(db_session, sugerencias[0]) == estados["descartada"]
    assert _estado_de(db_session, sugerencias[2]) == estados["descartada"]


def test_empate_no_incorpora_y_notifica_al_creador(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados, avisos
):
    viaje, _ = viaje_con_admin
    otro = _crear_participante(db_session, viaje, "Bruno")
    id_votacion, sugerencias, propuestas = _crear_votacion(
        db_session, viaje, usuario_activo, dia, estados
    )
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)
    _votar(db_session, id_votacion, propuestas[1], otro)

    _procesar(db_session)

    assert _actividades_de(db_session, id_votacion) == []
    votacion = _votacion(db_session, id_votacion)
    assert votacion.EstadoResolucion == "empate"
    assert votacion.FechaLimiteDesempate is not None
    for id_sugerencia in sugerencias:
        assert _estado_de(db_session, id_sugerencia) == estados["en_votacion"]

    evento, destinatarios = avisos[0]
    assert evento.notification_type == NotificationType.NUEVA_VOTACION
    assert evento.data["eventType"] == "voting_tie"
    assert destinatarios == [usuario_activo.IdUsuario]

    listado = client.get(URL_VOTACIONES, params={"idViaje": viaje.IdViaje}, headers=auth_headers)
    leida = next(v for v in listado.json() if v["IdVotacion"] == id_votacion)
    assert leida["EstadoResolucion"] == "empate"
    assert sorted(leida["IdPropuestasEmpatadas"]) == sorted(propuestas)


def test_el_creador_elige_una_propuesta_empatada_y_se_crea_la_actividad(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    otro = _crear_participante(db_session, viaje, "Bruno")
    id_votacion, sugerencias, propuestas = _crear_votacion(
        db_session, viaje, usuario_activo, dia, estados
    )
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)
    _votar(db_session, id_votacion, propuestas[1], otro)
    _procesar(db_session)

    respuesta = client.post(
        f"{URL_VOTACIONES}/{id_votacion}/desempate",
        json={"idPropuesta": propuestas[1]},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["EstadoResolucion"] == "incorporada"
    actividades = _actividades_de(db_session, id_votacion)
    assert len(actividades) == 1
    assert actividades[0].Nombre == "Actividad 2"
    assert _estado_de(db_session, sugerencias[1]) == estados["aceptada"]
    assert _estado_de(db_session, sugerencias[0]) == estados["descartada"]


def test_un_participante_que_no_creo_la_votacion_no_puede_desempatar(
    client, db_session, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    otro = _crear_participante(db_session, viaje, "Bruno")
    id_votacion, _, propuestas = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)
    _votar(db_session, id_votacion, propuestas[1], otro)
    _procesar(db_session)

    respuesta = client.post(
        f"{URL_VOTACIONES}/{id_votacion}/desempate",
        json={"idPropuesta": propuestas[0]},
        headers=_headers(otro),
    )

    assert respuesta.status_code == 403
    assert _actividades_de(db_session, id_votacion) == []
    assert _votacion(db_session, id_votacion).EstadoResolucion == "empate"


def test_no_se_puede_elegir_una_propuesta_que_no_empato(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    otro = _crear_participante(db_session, viaje, "Bruno")
    id_votacion, _, propuestas = _crear_votacion(
        db_session, viaje, usuario_activo, dia, estados, cantidad=3
    )
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)
    _votar(db_session, id_votacion, propuestas[1], otro)
    _procesar(db_session)

    respuesta = client.post(
        f"{URL_VOTACIONES}/{id_votacion}/desempate",
        json={"idPropuesta": propuestas[2]},
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert _actividades_de(db_session, id_votacion) == []


def test_votacion_sin_votos_devuelve_las_sugerencias_a_pendiente(
    db_session, viaje_con_admin, usuario_activo, dia, estados, avisos
):
    viaje, _ = viaje_con_admin
    id_votacion, sugerencias, _ = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)

    _procesar(db_session)

    assert _actividades_de(db_session, id_votacion) == []
    assert _votacion(db_session, id_votacion).EstadoResolucion == "sin_votos"
    for id_sugerencia in sugerencias:
        assert _estado_de(db_session, id_sugerencia) == estados["pendiente"]
    assert avisos == []


def test_ganadora_superpuesta_se_incorpora_con_advertencia(
    db_session, viaje_con_admin, usuario_activo, dia, estados, avisos
):
    viaje, _ = viaje_con_admin
    db_session.add(
        ActividadItinerario(
            IdDiaCronograma=dia.IdDiaCronograma,
            Nombre="Almuerzo",
            HoraInicio=time(14, 30),
            HoraFin=time(15, 30),
        )
    )
    db_session.commit()
    id_votacion, _, propuestas = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)

    _procesar(db_session)

    assert len(_actividades_de(db_session, id_votacion)) == 1
    evento, _ = avisos[0]
    assert evento.data["hasOverlap"] is True
    assert "se superpone con Almuerzo" in evento.mensaje


def test_procesar_dos_veces_crea_una_sola_actividad(
    db_session, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    id_votacion, _, propuestas = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)

    _procesar(db_session)
    _procesar(db_session)
    assert len(_actividades_de(db_session, id_votacion)) == 1

    db_session.query(Votacion).filter_by(IdVotacion=id_votacion).update(
        {"EstadoResolucion": None}
    )
    db_session.commit()
    _procesar(db_session)

    assert len(_actividades_de(db_session, id_votacion)) == 1


def test_votacion_cuyo_dia_fue_eliminado_no_incorpora_y_avisa_al_creador(
    db_session, viaje_con_admin, usuario_activo, dia, estados, avisos
):
    viaje, _ = viaje_con_admin
    id_votacion, sugerencias, propuestas = _crear_votacion(
        db_session, viaje, usuario_activo, dia, estados
    )
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)
    db_session.query(Votacion).filter_by(IdVotacion=id_votacion).update(
        {"IdDiaCronograma": None}
    )
    db_session.delete(db_session.get(DiaCronograma, dia.IdDiaCronograma))
    db_session.commit()

    _procesar(db_session)

    assert _actividades_de(db_session, id_votacion) == []
    assert _votacion(db_session, id_votacion).EstadoResolucion == "dia_inexistente"
    for id_sugerencia in sugerencias:
        assert _estado_de(db_session, id_sugerencia) == estados["descartada"]
    evento, destinatarios = avisos[0]
    assert evento.data["eventType"] == "voting_day_missing"
    assert destinatarios == [usuario_activo.IdUsuario]


def test_empate_vencido_descarta_las_sugerencias(
    db_session, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    id_votacion, sugerencias, _ = _crear_votacion(db_session, viaje, usuario_activo, dia, estados)
    db_session.query(Votacion).filter_by(IdVotacion=id_votacion).update(
        {
            "EstadoResolucion": "empate",
            "FechaLimiteDesempate": datetime.now(timezone.utc) - timedelta(hours=1),
        }
    )
    db_session.commit()

    _procesar(db_session)

    assert _votacion(db_session, id_votacion).EstadoResolucion == "empate_vencido"
    for id_sugerencia in sugerencias:
        assert _estado_de(db_session, id_sugerencia) == estados["descartada"]


def test_una_votacion_abierta_no_se_procesa(
    db_session, viaje_con_admin, usuario_activo, dia, estados
):
    viaje, _ = viaje_con_admin
    id_votacion, _, propuestas = _crear_votacion(
        db_session,
        viaje,
        usuario_activo,
        dia,
        estados,
        cierre=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    _votar(db_session, id_votacion, propuestas[0], usuario_activo)

    _procesar(db_session)

    assert _votacion(db_session, id_votacion).EstadoResolucion is None
    assert _actividades_de(db_session, id_votacion) == []


def test_crear_votacion_desde_sugerencias_la_marca_para_resolverla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, dia, estados, monkeypatch
):
    async def _sin_notificar(*args, **kwargs):
        return None

    monkeypatch.setattr("app.api.routes.votaciones.dispatch_trip_notification", _sin_notificar)
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, dia, estados, 2, "pendiente")
    db_session.commit()

    respuesta = client.post(
        f"{URL_VOTACIONES}/desde-sugerencias",
        json={
            "idViaje": viaje.IdViaje,
            "idsSugerencias": ids,
            "fechaCierre": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "nombre": None,
        },
        headers=auth_headers,
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["EsDeSugerencias"] is True
    votacion = _votacion(db_session, respuesta.json()["IdVotacion"])
    assert votacion.IdDiaCronograma == dia.IdDiaCronograma