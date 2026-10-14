from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.security import create_access_token, hash_password
from app.models.sugerencia_actividad import (
    EstadoSugerenciaActividad,
    SolicitudSugerenciaActividad,
    SugerenciaActividad,
)
from app.models.usuario import Usuario
from app.models.votacion import Votacion
from app.services import sugerencias_votacion
from app.services.notifications import NotificationType

URL_VOTACIONES = "/api/v1/votaciones"
URL_DESDE_SUGERENCIAS = f"{URL_VOTACIONES}/desde-sugerencias"

FECHA_DIA = date(2026, 12, 2)
ID_DIA = 1


@pytest.fixture()
def estados_sugerencias(db_session):
    estados = {
        nombre: EstadoSugerenciaActividad(Nombre=nombre)
        for nombre in ("pendiente", "aceptada", "descartada", "en_votacion")
    }
    db_session.add_all(estados.values())
    db_session.commit()
    return {nombre: estado.IdEstadoSugerenciaActividad for nombre, estado in estados.items()}


@pytest.fixture(autouse=True)
def fecha_del_dia(monkeypatch):
    monkeypatch.setattr(sugerencias_votacion, "obtener_fecha_dia", lambda db, id_dia: FECHA_DIA)


@pytest.fixture(autouse=True)
def notificaciones(monkeypatch):
    eventos = []

    async def _dispatch_falso(db, evento, *args, **kwargs):
        eventos.append(evento)

    monkeypatch.setattr("app.api.routes.votaciones.dispatch_trip_notification", _dispatch_falso)
    return eventos


def _crear_sugerencias(
    db_session,
    viaje,
    usuario,
    estados,
    cantidad,
    *,
    hora_inicio=time(14, 0),
    hora_fin=time(15, 0),
    estado="pendiente",
):
    solicitud = SolicitudSugerenciaActividad(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdDiaCronograma=ID_DIA,
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        Estado="completada",
        CantidadSugerencias=cantidad,
    )
    db_session.add(solicitud)
    db_session.flush()

    sugerencias = [
        SugerenciaActividad(
            IdSolicitudSugerenciaActividad=solicitud.IdSolicitudSugerenciaActividad,
            IdViaje=viaje.IdViaje,
            IdDiaCronograma=ID_DIA,
            IdEstadoSugerenciaActividad=estados[estado],
            Nombre=f"Actividad {indice}",
            Descripcion="Descripción de prueba",
            HoraInicio=hora_inicio,
            HoraFin=hora_fin,
            GooglePlaceId=f"place-{solicitud.IdSolicitudSugerenciaActividad}-{indice}",
            LugarNombre=f"Lugar {indice}",
            LugarDireccion="Dirección de prueba",
            Lat=0.0,
            Lng=0.0,
            CostoEstimadoARS=Decimal("12000.00"),
            Motivo="Motivo de prueba",
        )
        for indice in range(1, cantidad + 1)
    ]
    db_session.add_all(sugerencias)
    db_session.commit()
    return [s.IdSugerenciaActividad for s in sugerencias]


def _payload(viaje, ids, *, cierre=None, nombre=None):
    cierre = cierre or (datetime.now(timezone.utc) + timedelta(days=1))
    return {
        "idViaje": viaje.IdViaje,
        "idsSugerencias": ids,
        "fechaCierre": cierre.isoformat(),
        "nombre": nombre,
    }


def _estado_de(db_session, id_sugerencia):
    db_session.expire_all()
    return db_session.get(SugerenciaActividad, id_sugerencia).IdEstadoSugerenciaActividad


def _cantidad_votaciones(db_session):
    db_session.expire_all()
    return db_session.query(Votacion).count()


def test_proponer_tres_sugerencias_crea_votacion_con_tres_propuestas(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 3)

    respuesta = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["Tipo"] == "opcion_unica"
    assert cuerpo["Estado"] == "abierta"
    assert len(cuerpo["Propuestas"]) == 3
    assert [p["IdSugerenciaActividad"] for p in cuerpo["Propuestas"]] == ids
    assert "2 de diciembre" in cuerpo["Titulo"]
    assert "de 14:00 a 15:00" in cuerpo["Titulo"]
    texto = cuerpo["Propuestas"][0]["Texto"]
    assert "Lugar 1" in texto
    assert "14:00–15:00" in texto
    assert "ARS $ 12.000 por persona" in texto
    for id_sugerencia in ids:
        assert _estado_de(db_session, id_sugerencia) == estados_sugerencias["en_votacion"]


def test_el_titulo_predefinido_se_puede_modificar(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids, nombre="  Plan del miércoles  "),
        headers=auth_headers,
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["Titulo"] == "Plan del miércoles"


def test_proponer_una_sola_sugerencia_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 1)

    respuesta = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)

    assert respuesta.status_code == 400
    assert _cantidad_votaciones(db_session) == 0
    assert _estado_de(db_session, ids[0]) == estados_sugerencias["pendiente"]


def test_proponer_seis_sugerencias_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 6)

    respuesta = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)

    assert respuesta.status_code == 400
    assert _cantidad_votaciones(db_session) == 0


def test_proponer_sugerencias_con_horarios_que_no_se_superponen_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids_tarde = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    ids_noche = _crear_sugerencias(
        db_session,
        viaje,
        usuario_activo,
        estados_sugerencias,
        1,
        hora_inicio=time(19, 0),
        hora_fin=time(22, 0),
    )

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids_tarde + ids_noche),
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert "superponerse" in respuesta.json()["detail"]
    assert _cantidad_votaciones(db_session) == 0


def test_proponer_sugerencias_de_distintas_solicitudes_que_se_superponen_crea_la_votacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids_manana = _crear_sugerencias(
        db_session,
        viaje,
        usuario_activo,
        estados_sugerencias,
        1,
        hora_inicio=time(10, 0),
        hora_fin=time(12, 0),
    )
    ids_mediodia = _crear_sugerencias(
        db_session,
        viaje,
        usuario_activo,
        estados_sugerencias,
        1,
        hora_inicio=time(11, 0),
        hora_fin=time(13, 0),
    )

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids_manana + ids_mediodia),
        headers=auth_headers,
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert len(cuerpo["Propuestas"]) == 2
    assert "de 10:00 a 13:00" in cuerpo["Titulo"]


def test_proponer_una_sugerencia_aceptada_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids_pendientes = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    ids_aceptadas = _crear_sugerencias(
        db_session, viaje, usuario_activo, estados_sugerencias, 1, estado="aceptada"
    )

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids_pendientes + ids_aceptadas),
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert _cantidad_votaciones(db_session) == 0
    for id_sugerencia in ids_pendientes:
        assert _estado_de(db_session, id_sugerencia) == estados_sugerencias["pendiente"]


def test_fecha_de_cierre_anterior_a_ahora_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    cierre_pasado = datetime.now(timezone.utc) - timedelta(hours=1)

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids, cierre=cierre_pasado),
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert _cantidad_votaciones(db_session) == 0


def test_fecha_de_cierre_posterior_al_inicio_de_la_primera_actividad_falla(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    cierre_tarde = datetime(2026, 12, 2, 14, 30, tzinfo=timezone.utc)

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids, cierre=cierre_tarde),
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert "antes del inicio" in respuesta.json()["detail"]
    assert _cantidad_votaciones(db_session) == 0


def test_no_se_puede_aceptar_una_sugerencia_en_votacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    respuesta = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)
    assert respuesta.status_code == 201, respuesta.text

    db_session.expire_all()
    sugerencia = db_session.get(SugerenciaActividad, ids[0])
    with pytest.raises(HTTPException) as error:
        sugerencias_votacion.asegurar_sugerencia_modificable(sugerencia)

    assert error.value.status_code == 409


def test_cancelar_la_votacion_devuelve_las_sugerencias_a_pendiente(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 3)
    creada = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)
    assert creada.status_code == 201, creada.text

    cancelada = client.post(
        f"{URL_VOTACIONES}/{creada.json()['IdVotacion']}/cancelar", headers=auth_headers
    )

    assert cancelada.status_code == 200, cancelada.text
    assert cancelada.json()["Estado"] == "cancelada"
    for id_sugerencia in ids:
        assert _estado_de(db_session, id_sugerencia) == estados_sugerencias["pendiente"]


def test_la_votacion_aparece_en_el_listado_del_viaje(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    creada = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)
    assert creada.status_code == 201, creada.text

    listado = client.get(URL_VOTACIONES, params={"idViaje": viaje.IdViaje}, headers=auth_headers)

    assert listado.status_code == 200
    assert creada.json()["IdVotacion"] in [v["IdVotacion"] for v in listado.json()]


def test_se_notifica_a_los_participantes_la_nueva_votacion(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, estados_sugerencias, notificaciones
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)

    respuesta = client.post(URL_DESDE_SUGERENCIAS, json=_payload(viaje, ids), headers=auth_headers)

    assert respuesta.status_code == 201, respuesta.text
    assert len(notificaciones) == 1
    assert notificaciones[0].notification_type == NotificationType.NUEVA_VOTACION
    assert notificaciones[0].id_viaje == viaje.IdViaje


def test_un_usuario_que_no_participa_del_viaje_no_puede_proponer(
    client, db_session, viaje_con_admin, usuario_activo, estados_sugerencias
):
    viaje, _ = viaje_con_admin
    ids = _crear_sugerencias(db_session, viaje, usuario_activo, estados_sugerencias, 2)
    ajeno = Usuario(
        Nombre="Ajeno",
        Apellido="Test",
        NombreUsuario="ajeno_test",
        Email="ajeno@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(ajeno)
    db_session.commit()
    db_session.refresh(ajeno)
    token = create_access_token({"sub": ajeno.Email, "user_id": ajeno.IdUsuario})

    respuesta = client.post(
        URL_DESDE_SUGERENCIAS,
        json=_payload(viaje, ids),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code in (403, 404)
    assert _cantidad_votaciones(db_session) == 0