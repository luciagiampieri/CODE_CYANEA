"""US: Responsables y tareas privadas en el checklist."""

import pytest

from app.models.checklist import Checklist
from app.models.usuario import Usuario

from tests.test_checklists import (  # noqa: F401 (fixtures)
    _agregar_participante,
    _crear_usuario,
    _headers,
    categoria_checklist,
    mock_checklist_broadcast,
)


@pytest.fixture()
def grupo(db_session, viaje_con_admin):
    """Viaje con Ana (admin), Lucía y Bruno."""
    viaje, participacion = viaje_con_admin
    ana = db_session.get(Usuario, participacion.IdUsuario)
    lucia = _crear_usuario(db_session, "lucia")
    bruno = _crear_usuario(db_session, "bruno")
    _agregar_participante(db_session, viaje, lucia)
    _agregar_participante(db_session, viaje, bruno)
    return viaje, ana, lucia, bruno


def _url(viaje, sufijo=""):
    return f"/api/v1/trips/{viaje.IdViaje}/checklists{sufijo}"


def _crear(client, viaje, usuario, categoria, nombre="Comprar vuelos", responsables=None, privada=False):
    response = client.post(
        _url(viaje),
        json={
            "Nombre": nombre,
            "IdCategoriaChecklist": categoria.IdCategoriaChecklist,
            "IdsResponsables": responsables or [],
            "EsPrivada": privada,
        },
        headers=_headers(usuario),
    )
    return response


def _marcar(client, viaje, usuario, id_tarea, completada=True):
    return client.patch(
        _url(viaje, f"/{id_tarea}/completada"),
        json={"Completada": completada},
        headers=_headers(usuario),
    )


def _listar(client, viaje, usuario):
    return client.get(_url(viaje), headers=_headers(usuario)).json()


def _editar(client, viaje, usuario, id_tarea, **cambios):
    return client.put(_url(viaje, f"/{id_tarea}"), json=cambios, headers=_headers(usuario))


# ---------------------------------------------------------------------------
# Responsables
# ---------------------------------------------------------------------------


def test_el_responsable_puede_marcar_y_desmarcar_la_tarea(client, grupo, categoria_checklist):
    viaje, ana, lucia, _ = grupo
    tarea = _crear(client, viaje, ana, categoria_checklist, responsables=[lucia.IdUsuario]).json()["item"]

    hecha = _marcar(client, viaje, lucia, tarea["IdChecklist"])
    desmarcada = _marcar(client, viaje, lucia, tarea["IdChecklist"], completada=False)

    assert hecha.status_code == 200
    assert hecha.json()["item"]["Completada"] is True
    assert hecha.json()["item"]["NombreUsuarioCompletada"] == "Lucia Test"
    assert desmarcada.json()["item"]["Completada"] is False
    assert desmarcada.json()["item"]["NombreUsuarioCompletada"] is None


def test_otro_integrante_no_puede_marcar_una_tarea_asignada(client, db_session, grupo, categoria_checklist):
    viaje, ana, lucia, bruno = grupo
    tarea = _crear(client, viaje, ana, categoria_checklist, responsables=[lucia.IdUsuario]).json()["item"]

    response = _marcar(client, viaje, bruno, tarea["IdChecklist"])

    assert response.status_code == 403
    assert response.json()["detail"] == "Solo Lucia Test puede marcar esta tarea como hecha."
    db_session.expire_all()
    assert db_session.get(Checklist, tarea["IdChecklist"]).Completada is False


def test_el_creador_que_no_es_responsable_no_puede_marcarla_pero_si_reasignarla(
    client, grupo, categoria_checklist
):
    viaje, ana, lucia, bruno = grupo
    tarea = _crear(client, viaje, ana, categoria_checklist, responsables=[lucia.IdUsuario]).json()["item"]

    marcar = _marcar(client, viaje, ana, tarea["IdChecklist"])
    reasignar = _editar(client, viaje, ana, tarea["IdChecklist"], IdsResponsables=[bruno.IdUsuario])
    marcar_por_edicion = _editar(client, viaje, ana, tarea["IdChecklist"], Completada=True)

    assert marcar.status_code == 403
    assert reasignar.status_code == 200
    assert [r["IdUsuario"] for r in reasignar.json()["item"]["Responsables"]] == [bruno.IdUsuario]
    assert marcar_por_edicion.status_code == 403


def test_puede_completar_se_informa_segun_quien_consulta(client, grupo, categoria_checklist):
    viaje, ana, lucia, bruno = grupo
    _crear(client, viaje, ana, categoria_checklist, responsables=[lucia.IdUsuario])
    _crear(client, viaje, ana, categoria_checklist, nombre="Sin asignar")

    def puede(usuario):
        return {t["Nombre"]: t["PuedeCompletar"] for t in _listar(client, viaje, usuario)}

    assert puede(lucia) == {"Comprar vuelos": True, "Sin asignar": True}
    assert puede(bruno) == {"Comprar vuelos": False, "Sin asignar": True}
    assert puede(ana) == {"Comprar vuelos": False, "Sin asignar": True}


def test_marcar_una_tarea_sin_responsables_asigna_a_quien_la_marca(client, grupo, categoria_checklist):
    viaje, ana, lucia, bruno = grupo
    tarea = _crear(client, viaje, ana, categoria_checklist).json()["item"]

    response = _marcar(client, viaje, bruno, tarea["IdChecklist"])

    item = response.json()["item"]
    assert response.status_code == 200
    assert [r["IdUsuario"] for r in item["Responsables"]] == [bruno.IdUsuario]
    assert item["IdUsuarioCompletada"] == bruno.IdUsuario
    assert item["NombreUsuarioCompletada"] == "Bruno Test"
    # Desde ahí, Bruno es el responsable: Lucía ya no puede desmarcarla.
    assert _marcar(client, viaje, lucia, tarea["IdChecklist"], completada=False).status_code == 403
    assert _marcar(client, viaje, bruno, tarea["IdChecklist"], completada=False).status_code == 200


def test_las_tareas_existentes_siguen_siendo_del_grupo(client, db_session, grupo, categoria_checklist):
    viaje, ana, lucia, _ = grupo
    tarea = Checklist(
        IdViaje=viaje.IdViaje,
        IdUsuarioCreador=ana.IdUsuario,
        Nombre="Tarea vieja",
        IdCategoriaChecklist=categoria_checklist.IdCategoriaChecklist,
    )
    db_session.add(tarea)
    db_session.commit()

    tareas = _listar(client, viaje, lucia)

    assert [t["Nombre"] for t in tareas] == ["Tarea vieja"]
    assert tareas[0]["EsPrivada"] is False


# ---------------------------------------------------------------------------
# Tareas privadas
# ---------------------------------------------------------------------------


def test_una_tarea_privada_solo_la_ve_quien_la_creo(client, grupo, categoria_checklist):
    viaje, ana, lucia, bruno = grupo

    creada = _crear(client, viaje, lucia, categoria_checklist, nombre="Llevar mis remedios", privada=True)

    item = creada.json()["item"]
    assert creada.status_code == 200
    assert item["EsPrivada"] is True
    assert [r["IdUsuario"] for r in item["Responsables"]] == [lucia.IdUsuario]
    assert [t["Nombre"] for t in _listar(client, viaje, lucia)] == ["Llevar mis remedios"]
    assert _listar(client, viaje, ana) == []
    assert _listar(client, viaje, bruno) == []


def test_una_tarea_privada_no_se_puede_asignar_a_otros(client, grupo, categoria_checklist):
    viaje, _, lucia, bruno = grupo

    creada = _crear(
        client, viaje, lucia, categoria_checklist, nombre="Mía", responsables=[bruno.IdUsuario], privada=True
    )

    assert creada.status_code == 400
    assert creada.json()["detail"] == "Una tarea privada no se puede asignar a otros integrantes del viaje."

    tarea = _crear(client, viaje, lucia, categoria_checklist, nombre="Mía", privada=True).json()["item"]
    asignar = _editar(client, viaje, lucia, tarea["IdChecklist"], IdsResponsables=[bruno.IdUsuario])
    assert asignar.status_code == 400


def test_los_demas_no_pueden_tocar_una_tarea_privada(client, grupo, categoria_checklist):
    viaje, ana, lucia, bruno = grupo
    tarea = _crear(client, viaje, lucia, categoria_checklist, nombre="Mía", privada=True).json()["item"]

    # Para el resto del grupo no existe: 404, sin revelar que hay una tarea privada.
    assert _marcar(client, viaje, bruno, tarea["IdChecklist"]).status_code == 404
    assert _editar(client, viaje, ana, tarea["IdChecklist"], Nombre="Otra").status_code == 404
    assert client.delete(_url(viaje, f"/{tarea['IdChecklist']}"), headers=_headers(ana)).status_code == 404
    assert _marcar(client, viaje, lucia, tarea["IdChecklist"]).status_code == 200


def test_crear_una_tarea_privada_no_notifica_al_grupo(client, grupo, categoria_checklist, monkeypatch):
    from unittest.mock import AsyncMock

    from app.services import tareas_entradas

    viaje, _, lucia, _ = grupo
    avisos = AsyncMock()
    monkeypatch.setattr(tareas_entradas, "dispatch_trip_notification", avisos)
    monkeypatch.setattr(tareas_entradas, "dispatch_user_notification", avisos)

    _crear(client, viaje, lucia, categoria_checklist, nombre="Mía", privada=True)

    avisos.assert_not_awaited()


def test_cambiar_una_tarea_privada_a_grupal(client, grupo, categoria_checklist):
    viaje, ana, lucia, _ = grupo
    tarea = _crear(client, viaje, lucia, categoria_checklist, nombre="Comprar adaptador", privada=True).json()["item"]

    response = _editar(client, viaje, lucia, tarea["IdChecklist"], EsPrivada=False)

    assert response.status_code == 200
    assert response.json()["item"]["EsPrivada"] is False
    assert [t["Nombre"] for t in _listar(client, viaje, ana)] == ["Comprar adaptador"]


def test_una_tarea_asignada_a_otro_no_se_puede_hacer_privada(client, grupo, categoria_checklist):
    viaje, ana, lucia, _ = grupo
    asignada = _crear(client, viaje, ana, categoria_checklist, responsables=[lucia.IdUsuario]).json()["item"]
    propia = _crear(client, viaje, ana, categoria_checklist, nombre="Propia", responsables=[ana.IdUsuario]).json()["item"]

    rechazada = _editar(client, viaje, ana, asignada["IdChecklist"], EsPrivada=True)
    # Si al mismo tiempo se quita al otro responsable, sí se puede.
    con_cambio = _editar(client, viaje, ana, asignada["IdChecklist"], EsPrivada=True, IdsResponsables=[])
    aceptada = _editar(client, viaje, ana, propia["IdChecklist"], EsPrivada=True)

    assert rechazada.status_code == 400
    assert con_cambio.status_code == 200
    assert aceptada.status_code == 200
    assert aceptada.json()["item"]["EsPrivada"] is True


def test_una_tarea_de_recordarmelo_no_se_puede_hacer_privada(client, db_session, grupo, categoria_checklist):
    viaje, ana, _, _ = grupo
    tarea = Checklist(
        IdViaje=viaje.IdViaje,
        IdUsuarioCreador=ana.IdUsuario,
        Nombre="Comprar entradas – Museo del Prado",
        IdCategoriaChecklist=categoria_checklist.IdCategoriaChecklist,
        GooglePlaceIdEntradas="ChIJprado",
        Enlace="https://entradas.museodelprado.es/comprar",
    )
    db_session.add(tarea)
    db_session.commit()

    assert _listar(client, viaje, ana)[0]["PuedeSerPrivada"] is False
    response = _editar(client, viaje, ana, tarea.IdChecklist, EsPrivada=True)

    assert response.status_code == 400
    assert "Recordármelo" in response.json()["detail"]


def test_el_nombre_de_una_tarea_privada_ajena_no_bloquea(client, grupo, categoria_checklist):
    viaje, ana, lucia, _ = grupo
    _crear(client, viaje, lucia, categoria_checklist, nombre="Comprar adaptador", privada=True)

    propia = _crear(client, viaje, ana, categoria_checklist, nombre="Comprar adaptador")
    repetida_propia = _crear(client, viaje, lucia, categoria_checklist, nombre="Comprar adaptador", privada=True)

    assert propia.status_code == 200
    assert repetida_propia.status_code == 400
