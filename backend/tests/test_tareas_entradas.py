"""US: Recordar la compra de entradas o la reserva en el checklist.

Reutiliza los fakes de `test_recomendacion_entradas.py` (identificación del lugar
de la US 98, sitios oficiales y Gemini simulados): ningún test sale a Internet.
Las notificaciones se reemplazan por mocks para verificar a quién se avisa.
"""

from datetime import date
from unittest.mock import AsyncMock

import pytest

from app.models.categorias_checklist import CategoriasChecklist
from app.models.checklist import Checklist
from app.services import tareas_entradas
from app.services.entradas_ai import limpiar_cache
from app.services.notifications import NotificationType
from app.services.websocket_manager import manager

from tests.test_checklists import _agregar_participante, _crear_usuario, _headers
from tests.test_recomendacion_entradas import (  # noqa: F401 (fixtures)
    ABIERTO_9_A_18_LUNES,
    LUGARES,
    _actividad,
    _crear,
    _entorno,
    _lugar_interes,
    _modificar,
    _payload,
    _url_actividades,
    dia,
    lugares,
    web,
)

URL_COMPRA_PRADO = "https://entradas.museodelprado.es/comprar"
URL_RESERVA_REINA = "https://www.museoreinasofia.es/reservas"


@pytest.fixture(autouse=True)
def avisos(monkeypatch):
    """Notificaciones y broadcasts simulados."""
    todos = AsyncMock()
    personas = AsyncMock()
    monkeypatch.setattr(tareas_entradas, "dispatch_trip_notification", todos)
    monkeypatch.setattr(tareas_entradas, "dispatch_user_notification", personas)
    monkeypatch.setattr(manager, "broadcast_to_trip", AsyncMock())
    return {"todos": todos, "personas": personas}


@pytest.fixture()
def companera(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    usuario = _crear_usuario(db_session, "ana")
    _agregar_participante(db_session, viaje, usuario)
    return usuario


def _recordar(client, viaje, id_actividad, headers, **datos):
    cuerpo = {"tipo": "ENTRADAS_ANTICIPADAS", "enlace": URL_COMPRA_PRADO, "nombreLugar": "Museo del Prado"}
    cuerpo.update(datos)
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/activities/{id_actividad}/tarea-entradas",
        json=cuerpo,
        headers=headers,
    )


def _registrar(client, viaje, dia, headers, nombre="Museo del Prado", **payload):
    response = _crear(client, viaje, dia, headers, _payload(nombre, **payload))
    assert response.status_code == 201, response.text
    return response.json()


def _tareas(db_session):
    db_session.expire_all()
    return db_session.query(Checklist).order_by(Checklist.IdChecklist).all()


def _eliminar(client, viaje, dia, id_actividad, headers, **params):
    return client.delete(
        f"{_url_actividades(viaje, dia)}/{id_actividad}", headers=headers, params=params
    )


@pytest.fixture()
def tarea_prado(client, db_session, auth_headers, viaje_con_admin, dia, lugares, web, avisos):
    """Actividad "Museo del Prado" con su tarea "Comprar entradas" ya creada."""
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)
    response = _recordar(client, viaje, actividad["IdActividad"], auth_headers)
    assert response.status_code == 200, response.text
    avisos["todos"].reset_mock()
    avisos["personas"].reset_mock()
    return actividad["IdActividad"], response.json()["item"]


# ---------------------------------------------------------------------------
# Crear la tarea con "Recordármelo"
# ---------------------------------------------------------------------------


def test_recordarmelo_crea_la_tarea_de_comprar_entradas_con_el_enlace_oficial(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)

    response = _recordar(client, viaje, actividad["IdActividad"], auth_headers)

    assert response.status_code == 200
    datos = response.json()
    assert datos["creada"] is True
    tarea = datos["item"]
    assert tarea["Nombre"] == "Comprar entradas – Museo del Prado"
    assert tarea["Enlace"] == URL_COMPRA_PRADO
    assert tarea["IdActividad"] == actividad["IdActividad"]
    assert tarea["CategoriaChecklist"]["Nombre"] == "Reservas y entradas"
    assert tarea["Responsables"] == []
    assert tarea["Completada"] is False
    guardada = _tareas(db_session)[0]
    assert guardada.GooglePlaceIdEntradas == "ChIJprado"


def test_recordarmelo_en_una_reserva_crea_la_tarea_reservar(
    client, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers, "Museo Reina Sofía")

    response = _recordar(
        client, viaje, actividad["IdActividad"], auth_headers,
        tipo="RESERVA", enlace=URL_RESERVA_REINA, nombreLugar="Museo Reina Sofía",
    )

    assert response.json()["item"]["Nombre"] == "Reservar – Museo Reina Sofía"
    assert response.json()["item"]["Enlace"] == URL_RESERVA_REINA


def test_recordarmelo_en_un_lugar_que_acepta_reservas_crea_la_tarea(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers, "Cabildo")  # sin recomendación en caché

    response = _recordar(
        client, viaje, actividad["IdActividad"], auth_headers,
        tipo="RESERVA_DISPONIBLE", enlace="https://cabildo.cultura.gob.ar/reservas",
        nombreLugar="Cabildo de Buenos Aires",
    )

    assert response.status_code == 200
    assert response.json()["item"]["Nombre"] == "Reservar – Cabildo de Buenos Aires"


def test_sin_enlace_oficial_la_tarea_se_crea_sin_enlace(
    client, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers, "Cabildo")

    response = _recordar(
        client, viaje, actividad["IdActividad"], auth_headers,
        tipo="RESERVA", enlace=None, nombreLugar="Cabildo de Buenos Aires",
    )

    assert response.status_code == 200
    assert response.json()["item"]["Enlace"] is None


def test_el_enlace_guardado_es_el_verificado_y_no_el_que_envia_la_app(
    client, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)

    response = _recordar(
        client, viaje, actividad["IdActividad"], auth_headers,
        enlace="https://revendedor.example.com/prado", nombreLugar="Otro nombre",
    )

    assert response.json()["item"]["Enlace"] == URL_COMPRA_PRADO
    assert response.json()["item"]["Nombre"] == "Comprar entradas – Museo del Prado"


def test_sin_recomendacion_en_cache_se_valida_el_enlace_que_envia_la_app(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)
    limpiar_cache()  # por ejemplo, el servidor se reinició

    invalido = _recordar(client, viaje, actividad["IdActividad"], auth_headers, enlace="javascript:alert(1)")
    valido = _recordar(client, viaje, actividad["IdActividad"], auth_headers)

    assert invalido.status_code == 400
    assert valido.status_code == 200
    assert valido.json()["item"]["Enlace"] == URL_COMPRA_PRADO


def test_entradas_presenciales_no_genera_tarea(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers, "Teatro Colón")

    pide_presencial = _recordar(client, viaje, actividad["IdActividad"], auth_headers, tipo="ENTRADAS_PRESENCIALES")
    # Aunque la app pida otra cosa, la recomendación verificada es de boletería.
    disfrazada = _recordar(client, viaje, actividad["IdActividad"], auth_headers, tipo="ENTRADAS_ANTICIPADAS")

    assert pide_presencial.status_code == 422
    assert disfrazada.status_code == 400
    assert _tareas(db_session) == []


def test_no_se_duplica_la_tarea_de_la_misma_actividad_y_lugar(
    client, db_session, auth_headers, viaje_con_admin, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado

    response = _recordar(client, viaje, id_actividad, auth_headers)

    assert response.status_code == 200
    assert response.json()["creada"] is False
    assert response.json()["item"]["IdChecklist"] == tarea["IdChecklist"]
    assert len(_tareas(db_session)) == 1


def test_otra_actividad_en_el_mismo_lugar_agrega_el_dia_al_titulo(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado
):
    viaje, _ = viaje_con_admin
    otra = _registrar(client, viaje, dia, auth_headers, horaInicio="15:00:00", horaFin="16:00:00")

    response = _recordar(client, viaje, otra["IdActividad"], auth_headers)

    assert response.json()["item"]["Nombre"] == "Comprar entradas – Museo del Prado (lun 07/12)"
    tercera = _registrar(client, viaje, dia, auth_headers, horaInicio="17:00:00", horaFin="18:00:00")
    assert (
        _recordar(client, viaje, tercera["IdActividad"], auth_headers).json()["item"]["Nombre"]
        == "Comprar entradas – Museo del Prado (lun 07/12, 2)"
    )


def test_un_nombre_de_lugar_largo_entra_completo(
    client, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers, "Cabildo")
    nombre = "Disney's Hollywood Studios Walt Disney World Resort"

    response = _recordar(client, viaje, actividad["IdActividad"], auth_headers, nombreLugar=nombre, enlace=None)

    assert response.json()["item"]["Nombre"] == f"Comprar entradas – {nombre}"


def test_la_categoria_reservas_y_entradas_se_puede_usar_para_tareas_manuales(
    client, db_session, auth_headers, viaje_con_admin, tarea_prado
):
    viaje, _ = viaje_con_admin
    categoria = db_session.query(CategoriasChecklist).filter_by(Nombre="Reservas y entradas").one()

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={"Nombre": "Reservar cena de despedida", "IdCategoriaChecklist": categoria.IdCategoriaChecklist},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["item"]["IdActividad"] is None
    assert response.json()["item"]["Enlace"] is None


def test_crear_la_tarea_notifica_a_todos_los_participantes(
    client, auth_headers, viaje_con_admin, dia, lugares, web, avisos
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)

    _recordar(client, viaje, actividad["IdActividad"], auth_headers)

    avisos["todos"].assert_awaited_once()
    evento = avisos["todos"].await_args.args[1]
    assert evento.notification_type == NotificationType.TAREA_RESERVA_ENTRADAS
    assert evento.tipo == "tarea_entradas_creada"
    assert "Comprar entradas – Museo del Prado" in evento.mensaje
    assert evento.id_usuario_actor is not None  # quien la creó no se avisa a sí mismo
    avisos["personas"].assert_not_awaited()


def test_asignar_un_responsable_notifica_solo_a_esa_persona(
    client, auth_headers, viaje_con_admin, companera, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    _, tarea = tarea_prado

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{tarea['IdChecklist']}",
        json={"Nombre": "Entradas del Prado", "IdsResponsables": [companera.IdUsuario]},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["item"]["IdActividad"] == tarea["IdActividad"]  # sigue vinculada
    avisos["personas"].assert_awaited_once()
    destinatarios = avisos["personas"].await_args.args[2]
    assert [u.IdUsuario for u in destinatarios] == [companera.IdUsuario]
    assert avisos["personas"].await_args.args[1].tipo == "tarea_entradas_asignada"
    avisos["todos"].assert_not_awaited()


def test_un_usuario_ajeno_al_viaje_no_puede_crear_la_tarea(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)
    ajeno = _crear_usuario(db_session, "ajeno")

    response = _recordar(client, viaje, actividad["IdActividad"], _headers(ajeno))

    assert response.status_code in (403, 404)
    assert _tareas(db_session) == []


def test_una_actividad_de_otro_viaje_devuelve_404(
    client, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin

    response = _recordar(client, viaje, 99999, auth_headers)

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cambio de lugar de la actividad
# ---------------------------------------------------------------------------


def test_cambiar_el_lugar_pide_confirmacion_y_no_guarda_nada(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado

    response = _modificar(client, viaje, dia, id_actividad, auth_headers, _payload("Museo Reina Sofía"))

    assert response.status_code == 200
    datos = response.json()
    assert datos["confirmarTareasEntradas"] is True
    assert datos["tareas"] == [{"idChecklist": tarea["IdChecklist"], "nombre": tarea["Nombre"]}]
    assert "Al cambiar el lugar de la actividad, se eliminará la tarea" in datos["mensaje"]
    actividad = _actividad(db_session, id_actividad)
    assert actividad.Nombre == "Museo del Prado"
    assert actividad.GooglePlaceIdEntradas == "ChIJprado"
    assert len(_tareas(db_session)) == 1


def test_confirmar_el_cambio_de_lugar_elimina_la_tarea_y_analiza_el_nuevo_lugar(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado

    response = _modificar(
        client, viaje, dia, id_actividad, auth_headers,
        _payload("Museo Reina Sofía", tareasEntradasAEliminar=[tarea["IdChecklist"]]),
    )

    assert response.status_code == 200
    assert response.json()["RecomendacionEntradas"]["tipo"] == "RESERVA"
    assert _tareas(db_session) == []
    assert _actividad(db_session, id_actividad).GooglePlaceIdEntradas == "ChIJreina"
    # La tarea no tenía responsable: se avisa a todos.
    avisos["todos"].assert_awaited_once()
    assert avisos["todos"].await_args.args[1].tipo == "tarea_entradas_eliminada"
    # Y se puede crear la tarea del nuevo lugar.
    nueva = _recordar(
        client, viaje, id_actividad, auth_headers, tipo="RESERVA", enlace=URL_RESERVA_REINA
    )
    assert nueva.json()["item"]["Nombre"] == "Reservar – Museo Reina Sofía"


def test_eliminar_por_cambio_de_lugar_avisa_solo_al_responsable(
    client, db_session, auth_headers, viaje_con_admin, dia, companera, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{tarea['IdChecklist']}",
        json={"IdsResponsables": [companera.IdUsuario]},
        headers=auth_headers,
    )
    avisos["personas"].reset_mock()

    _modificar(
        client, viaje, dia, id_actividad, auth_headers,
        _payload("Museo Reina Sofía", tareasEntradasAEliminar=[tarea["IdChecklist"]]),
    )

    avisos["personas"].assert_awaited_once()
    assert [u.IdUsuario for u in avisos["personas"].await_args.args[2]] == [companera.IdUsuario]
    assert avisos["personas"].await_args.args[1].tipo == "tarea_entradas_eliminada"
    avisos["todos"].assert_not_awaited()


@pytest.mark.parametrize(
    "cambios",
    [
        {"nombre": "Visita al Museo del Prado"},
        {"horaInicio": "11:00:00", "horaFin": "13:00:00"},
        {"icono": "landmark"},
    ],
)
def test_editar_sin_cambiar_el_lugar_no_avisa_ni_elimina_la_tarea(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, cambios
):
    viaje, _ = viaje_con_admin
    id_actividad, _ = tarea_prado

    response = _modificar(client, viaje, dia, id_actividad, auth_headers, _payload(**cambios))

    assert response.status_code == 200
    assert "confirmarTareasEntradas" not in response.json()
    assert len(_tareas(db_session)) == 1
    assert response.json()["TareasEntradasPendientes"][0]["nombre"] == "Comprar entradas – Museo del Prado"


def test_agregar_la_ubicacion_del_mismo_lugar_no_elimina_la_tarea(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, _ = tarea_prado
    lugar = _lugar_interes(db_session, "ChIJprado", "Museo del Prado")

    response = _modificar(
        client, viaje, dia, id_actividad, auth_headers, _payload(idLugarInteres=lugar.IdLugarInteres)
    )

    assert response.status_code == 200
    assert "confirmarTareasEntradas" not in response.json()
    assert len(_tareas(db_session)) == 1


def test_cambiar_el_lugar_conserva_la_tarea_ya_hecha_sin_avisar(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{tarea['IdChecklist']}/completada",
        json={"Completada": True},
        headers=auth_headers,
    )

    response = _modificar(client, viaje, dia, id_actividad, auth_headers, _payload("Museo Reina Sofía"))

    assert response.status_code == 200
    assert "confirmarTareasEntradas" not in response.json()
    assert response.json()["RecomendacionEntradas"]["tipo"] == "RESERVA"
    assert len(_tareas(db_session)) == 1
    avisos["todos"].assert_not_awaited()
    # Para el nuevo lugar se puede crear otra tarea.
    nueva = _recordar(client, viaje, id_actividad, auth_headers, tipo="RESERVA", enlace=URL_RESERVA_REINA)
    assert nueva.json()["creada"] is True


def test_cambio_de_lugar_con_advertencia_de_horario_pide_las_dos_confirmaciones(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, monkeypatch
):
    """Primero se confirma la eliminación de la tarea; después, la advertencia de
    horario; al confirmar las dos se guarda y se elimina la tarea."""
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    monkeypatch.setitem(LUGARES["ChIJreina"], "opening_hours", ABIERTO_9_A_18_LUNES)
    payload = _payload("Museo Reina Sofía", horaInicio="19:00:00", horaFin="20:00:00")

    primera = _modificar(client, viaje, dia, id_actividad, auth_headers, payload).json()
    assert primera["confirmarTareasEntradas"] is True

    confirmado = {**payload, "tareasEntradasAEliminar": [tarea["IdChecklist"]]}
    segunda = _modificar(client, viaje, dia, id_actividad, auth_headers, confirmado).json()
    assert segunda["advertencia"] is True
    assert len(_tareas(db_session)) == 1  # todavía no se guardó nada

    tercera = _modificar(
        client, viaje, dia, id_actividad, auth_headers,
        {**confirmado, "googlePlaceIdEntradas": segunda["googlePlaceIdEntradas"]},
        ignorar_advertencia="true",
    )
    assert tercera.status_code == 200
    assert _tareas(db_session) == []
    assert _actividad(db_session, id_actividad).GooglePlaceIdEntradas == "ChIJreina"


# ---------------------------------------------------------------------------
# Eliminación de la actividad
# ---------------------------------------------------------------------------


def test_el_itinerario_informa_las_tareas_pendientes_de_cada_actividad(
    client, auth_headers, viaje_con_admin, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado

    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers).json()

    actividad = detalle["Cronograma"][0]["Actividades"][0]
    assert actividad["IdActividad"] == id_actividad
    assert actividad["TareasEntradasPendientes"] == [
        {"idChecklist": tarea["IdChecklist"], "nombre": tarea["Nombre"]}
    ]


def test_eliminar_la_actividad_sin_confirmar_no_borra_nada(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado

    response = _eliminar(client, viaje, dia, id_actividad, auth_headers)

    assert response.status_code == 409
    detalle = response.json()["detail"]
    assert detalle["codigo"] == "confirmar_tareas_entradas"
    assert detalle["tareas"] == [{"idChecklist": tarea["IdChecklist"], "nombre": tarea["Nombre"]}]
    assert "viaje ya finaliz" not in detalle["mensaje"]
    assert _actividad(db_session, id_actividad) is not None
    assert len(_tareas(db_session)) == 1


def test_eliminar_la_actividad_confirmando_elimina_la_tarea_pendiente_y_avisa(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    id_actividad, _ = tarea_prado

    response = _eliminar(client, viaje, dia, id_actividad, auth_headers, confirmar_eliminar_tareas="true")

    assert response.status_code == 200
    assert _actividad(db_session, id_actividad) is None
    assert _tareas(db_session) == []
    avisos["todos"].assert_awaited_once()
    assert "eliminó la actividad" in avisos["todos"].await_args.args[1].mensaje


def test_eliminar_la_actividad_conserva_la_tarea_ya_hecha(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado, avisos
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    client.patch(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{tarea['IdChecklist']}/completada",
        json={"Completada": True},
        headers=auth_headers,
    )

    response = _eliminar(client, viaje, dia, id_actividad, auth_headers)

    assert response.status_code == 200  # sin tareas pendientes no hace falta confirmar
    tareas = _tareas(db_session)
    assert len(tareas) == 1
    assert tareas[0].Completada is True
    assert tareas[0].IdActividad is None
    avisos["todos"].assert_not_awaited()


def test_eliminar_una_actividad_sin_tareas_no_pide_confirmacion(
    client, db_session, auth_headers, viaje_con_admin, dia, lugares, web
):
    viaje, _ = viaje_con_admin
    actividad = _registrar(client, viaje, dia, auth_headers)

    response = _eliminar(client, viaje, dia, actividad["IdActividad"], auth_headers)

    assert response.status_code == 200


def test_borrar_la_tarea_a_mano_no_vuelve_a_ofrecer_la_recomendacion(
    client, db_session, auth_headers, viaje_con_admin, dia, tarea_prado
):
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    client.delete(f"/api/v1/trips/{viaje.IdViaje}/checklists/{tarea['IdChecklist']}", headers=auth_headers)

    response = _modificar(client, viaje, dia, id_actividad, auth_headers, _payload(descripcion="Con amigos"))

    assert response.status_code == 200
    assert response.json()["RecomendacionEntradas"] is None


# ---------------------------------------------------------------------------
# Unitarios
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fecha, etiqueta",
    [(date(2026, 12, 7), "lun 07/12"), (date(2026, 11, 14), "sáb 14/11"), (date(2026, 1, 1), "jue 01/01")],
)
def test_etiqueta_dia(fecha, etiqueta):
    assert tareas_entradas.etiqueta_dia(fecha) == etiqueta


@pytest.mark.parametrize(
    "url, valida",
    [
        ("https://www.museodelprado.es/entradas", True),
        ("http://sitio.com", True),
        ("javascript:alert(1)", False),
        ("ftp://sitio.com", False),
        ("https://sitio .com", False),
        ("https://" + "a" * 600 + ".com", False),
        (None, False),
    ],
)
def test_url_valida(url, valida):
    assert (tareas_entradas.url_valida(url) is not None) is valida


def test_enlace_de_recomendacion_prioriza_la_compra_y_despues_el_sitio():
    assert tareas_entradas.enlace_de_recomendacion(
        {"tipo": "ENTRADAS_ANTICIPADAS", "urlAccion": "https://a.com/comprar", "urlSitioOficial": "https://a.com"}
    ) == "https://a.com/comprar"
    assert tareas_entradas.enlace_de_recomendacion(
        {"tipo": "RESERVA", "urlReservaExterna": "https://www.opentable.com/r/x", "urlSitioOficial": "https://a.com"}
    ) == "https://www.opentable.com/r/x"
    assert tareas_entradas.enlace_de_recomendacion(
        {"tipo": "ENTRADAS_ANTICIPADAS", "urlReservaExterna": "https://www.opentable.com/r/x", "urlSitioOficial": "https://a.com"}
    ) == "https://a.com"
    assert tareas_entradas.enlace_de_recomendacion({"tipo": "RESERVA"}) is None
