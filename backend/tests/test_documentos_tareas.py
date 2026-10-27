"""US: Subir las entradas o la reserva al completar una tarea de compra o reserva.

Gemini se reemplaza por un clasificador simulado (o por un transporte HTTP
simulado para probar el cliente): ningún test sale a Internet.
"""

import asyncio
import io
import json

import httpx
import pytest

from app.main import app
from app.models import CategoriaDocumento, DocumentoViaje, SolicitudIA
from app.models.categorias_checklist import CategoriasChecklist
from app.models.checklist import Checklist
from app.models.usuario import Usuario
from app.services import documentos_tareas
from app.services.documentos_tareas import (
    ALOJAMIENTO,
    ENTRADAS,
    EXCURSION,
    NO_ES_COMPRA,
    RESERVA,
    SEGURO,
    TRANSPORTE,
    VUELO,
    GeminiClasificadorTareas,
    analizar_palabras_clave,
    get_clasificador_tareas,
    nombre_sugerido,
)
from app.services.registro_ia import SERVICIO_DOCUMENTOS_TAREAS

from tests.test_checklists import (  # noqa: F401 (fixtures)
    _agregar_participante,
    _crear_usuario,
    _headers,
    mock_checklist_broadcast,
)


class ClasificadorFalso:
    def __init__(self, tipo=NO_ES_COMPRA, error=False):
        self.tipo = tipo
        self.error = error
        self.llamadas = []

    async def clasificar(self, nombre, categoria):
        self.llamadas.append((nombre, categoria))
        if self.error:
            raise documentos_tareas.ErrorClasificacion("sin respuesta")
        return self.tipo


@pytest.fixture()
def clasificador():
    falso = ClasificadorFalso()
    app.dependency_overrides[get_clasificador_tareas] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_clasificador_tareas, None)


@pytest.fixture(autouse=True)
def storage(monkeypatch):
    monkeypatch.setattr("app.api.routes.documentos.subir_documento", lambda archivo, ruta: ruta)
    monkeypatch.setattr(
        "app.api.routes.documentos.obtener_url_publica", lambda ruta: f"https://fake-public-url/{ruta}"
    )
    monkeypatch.setattr(
        "app.services.supabase.storage.obtener_url_publica", lambda ruta: f"https://fake-public-url/{ruta}"
    )
    monkeypatch.setattr("app.api.routes.documentos.eliminar_documento", lambda ruta: None)
    monkeypatch.setattr("app.api.routes.documentos.manager.broadcast_to_trip", _sin_broadcast)


async def _sin_broadcast(*args, **kwargs):
    return None


@pytest.fixture()
def categorias(db_session):
    """Categorías de checklist y de documentos como las de la base."""
    checklist = {
        nombre: CategoriasChecklist(Nombre=nombre, Activo=True)
        for nombre in ("Otros", "Equipamiento", "Reservas y entradas", "Seguros")
    }
    documentos = {
        nombre: CategoriaDocumento(Nombre=nombre, Activo=True)
        for nombre in ("Vuelos", "Alojamiento", "Excursiones", "Seguros", "Otros", "Reservas y entradas")
    }
    db_session.add_all([*checklist.values(), *documentos.values()])
    db_session.commit()
    return checklist, documentos


@pytest.fixture()
def grupo(db_session, viaje_con_admin):
    """Viaje con Ana (admin, acepta IA), Lucía y Bruno."""
    viaje, participacion = viaje_con_admin
    ana = db_session.get(Usuario, participacion.IdUsuario)
    ana.ConsienteProcesamientoIA = True
    lucia = _crear_usuario(db_session, "lucia")
    bruno = _crear_usuario(db_session, "bruno")
    _agregar_participante(db_session, viaje, lucia)
    _agregar_participante(db_session, viaje, bruno)
    db_session.commit()
    return viaje, ana, lucia, bruno


def _url(viaje, sufijo=""):
    return f"/api/v1/trips/{viaje.IdViaje}/checklists{sufijo}"


def _crear(client, viaje, usuario, categoria, nombre, privada=False):
    response = client.post(
        _url(viaje),
        json={"Nombre": nombre, "IdCategoriaChecklist": categoria.IdCategoriaChecklist, "EsPrivada": privada},
        headers=_headers(usuario),
    )
    assert response.status_code == 200, response.text
    return response.json()["item"]


def _marcar(client, viaje, usuario, id_tarea, completada=True):
    response = client.patch(
        _url(viaje, f"/{id_tarea}/completada"),
        json={"Completada": completada},
        headers=_headers(usuario),
    )
    assert response.status_code == 200, response.text
    return response.json()["item"]


def _sugerencia(client, viaje, usuario, id_tarea):
    response = client.post(_url(viaje, f"/{id_tarea}/sugerencia-documento"), headers=_headers(usuario))
    assert response.status_code == 200, response.text
    return response.json()


def _subir(client, viaje, usuario, categoria, id_tarea=None, nombre="Entradas Louvre", publico=True):
    datos = {
        "IdCategoriaDocumento": categoria.IdCategoriaDocumento,
        "NombreArchivo": nombre,
        "EsPublico": "true" if publico else "false",
    }
    if id_tarea is not None:
        datos["IdChecklist"] = id_tarea
    return client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=_headers(usuario),
        files={"archivo": ("entradas.pdf", io.BytesIO(b"%PDF-1.4 contenido"), "application/pdf")},
        data=datos,
    )


def _tarea_hecha(client, viaje, usuario, categoria, nombre, privada=False):
    tarea = _crear(client, viaje, usuario, categoria, nombre, privada=privada)
    _marcar(client, viaje, usuario, tarea["IdChecklist"])
    return tarea


# ---------------------------------------------------------------------------
# Palabras clave
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("nombre", "categoria", "tipo"),
    [
        ("Comprar entradas para el Louvre", "Otros", ENTRADAS),
        ("Hotel en Roma", "Otros", ALOJAMIENTO),
        ("Contratar seguro de viaje", "Seguros", SEGURO),
        ("Sacar pasajes a Roma", "Transporte", TRANSPORTE),
        ("Vuelo a Madrid", "Otros", VUELO),
        ("Excursión al glaciar Perito Moreno", "Otros", EXCURSION),
        ("Reservar mesa en Don Julio", "Comida", RESERVA),
        ("Traslado al hotel", "Otros", TRANSPORTE),
        ("Museo del Prado", "Reservas y entradas", ENTRADAS),
        ("Llevar el cargador", "Equipamiento", NO_ES_COMPRA),
        ("Renovar el pasaporte", "Documentación", NO_ES_COMPRA),
        ("Imprimir los pasajes", "Transporte", NO_ES_COMPRA),
        ("Reservar La Cabrera", "Comida", None),
        ("Comprar adaptador", "Equipamiento", None),
    ],
)
def test_palabras_clave(nombre, categoria, tipo):
    assert analizar_palabras_clave(nombre, categoria).tipo == tipo


def test_nombre_sugerido_sin_el_verbo():
    def tarea(nombre):
        return Checklist(Nombre=nombre)

    assert nombre_sugerido(tarea("Comprar entradas – Museo del Prado")) == "Entradas – Museo del Prado"
    assert nombre_sugerido(tarea("Reservar – La Cabrera")) == "Reserva – La Cabrera"
    assert nombre_sugerido(tarea("Contratar seguro de viaje")) == "Seguro de viaje"
    assert nombre_sugerido(tarea("Hotel en Roma")) == "Hotel en Roma"


# ---------------------------------------------------------------------------
# Sugerencia al marcar la tarea como hecha
# ---------------------------------------------------------------------------


def test_sugiere_subir_las_entradas_con_la_categoria_y_publico(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")

    sugerencia = _sugerencia(client, viaje, ana, tarea["IdChecklist"])

    assert sugerencia["sugerir"] is True
    assert sugerencia["tipo"] == ENTRADAS
    assert sugerencia["titulo"] == "¿Subís las entradas?"
    assert "comprobante de pago" in sugerencia["mensaje"]
    assert sugerencia["IdCategoriaDocumento"] == documentos["Reservas y entradas"].IdCategoriaDocumento
    assert sugerencia["EsPublico"] is True
    assert sugerencia["NombreSugerido"] == "Entradas para el Louvre"
    assert clasificador.llamadas == []  # alcanzaron las palabras clave


@pytest.mark.parametrize(
    ("nombre", "categoria_documento"),
    [
        ("Sacar el vuelo a Madrid", "Vuelos"),
        ("Reservar hotel en Roma", "Alojamiento"),
        ("Contratar seguro de viaje", "Seguros"),
        ("Reservar tour por Toscana", "Excursiones"),
        ("Alquilar auto en Mendoza", "Otros"),
    ],
)
def test_preselecciona_la_categoria_segun_lo_que_se_compro(
    client, grupo, categorias, clasificador, mock_checklist_broadcast, nombre, categoria_documento
):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], nombre)

    sugerencia = _sugerencia(client, viaje, ana, tarea["IdChecklist"])

    assert sugerencia["IdCategoriaDocumento"] == documentos[categoria_documento].IdCategoriaDocumento


def test_tarea_privada_sugiere_documento_privado(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, _ = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Reservar hotel en Roma", privada=True)

    sugerencia = _sugerencia(client, viaje, ana, tarea["IdChecklist"])

    assert sugerencia["EsPublico"] is False
    assert "tenés a mano" in sugerencia["mensaje"]


def test_tarea_que_no_es_de_compra_no_sugiere_nada_ni_consulta_ia(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, _ = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Equipamiento"], "Llevar el cargador")

    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"]) == {"sugerir": False}
    assert clasificador.llamadas == []


def test_si_no_alcanzan_las_palabras_clave_consulta_a_gemini(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    clasificador.tipo = RESERVA
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Reservar La Cabrera")

    sugerencia = _sugerencia(client, viaje, ana, tarea["IdChecklist"])

    assert clasificador.llamadas == [("Reservar La Cabrera", "Otros")]
    assert sugerencia["tipo"] == RESERVA
    assert sugerencia["IdCategoriaDocumento"] == documentos["Reservas y entradas"].IdCategoriaDocumento


def test_gemini_dice_que_no_es_compra(client, grupo, categorias, clasificador, mock_checklist_broadcast):
    viaje, ana, _, _ = grupo
    checklist, _ = categorias
    clasificador.tipo = NO_ES_COMPRA
    tarea = _tarea_hecha(client, viaje, ana, checklist["Equipamiento"], "Comprar adaptador")

    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"]) == {"sugerir": False}


def test_error_de_gemini_no_sugiere_nada_y_la_tarea_sigue_hecha(
    client, db_session, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, _ = categorias
    clasificador.error = True
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Reservar La Cabrera")

    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"]) == {"sugerir": False}
    db_session.expire_all()
    guardada = db_session.get(Checklist, tarea["IdChecklist"])
    assert guardada.Completada is True
    assert guardada.SugerenciaDocumentoMostrada is False


def test_sin_consentimiento_de_ia_no_consulta_a_gemini(
    client, db_session, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, _, lucia, _ = grupo
    checklist, _ = categorias
    tarea = _tarea_hecha(client, viaje, lucia, checklist["Otros"], "Reservar La Cabrera")

    assert _sugerencia(client, viaje, lucia, tarea["IdChecklist"]) == {"sugerir": False}
    assert clasificador.llamadas == []


def test_las_tareas_de_recordarmelo_siempre_son_de_compra(
    client, db_session, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = Checklist(
        IdViaje=viaje.IdViaje,
        IdUsuarioCreador=ana.IdUsuario,
        Nombre="Reservar – Sobrino de Botín",
        IdCategoriaChecklist=checklist["Reservas y entradas"].IdCategoriaChecklist,
        GooglePlaceIdEntradas="ChIJbotin",
        Enlace="https://botin.es/reservas",
    )
    db_session.add(tarea)
    db_session.commit()
    _marcar(client, viaje, ana, tarea.IdChecklist)

    sugerencia = _sugerencia(client, viaje, ana, tarea.IdChecklist)

    assert sugerencia["tipo"] == RESERVA
    assert sugerencia["NombreSugerido"] == "Reserva – Sobrino de Botín"
    assert sugerencia["IdCategoriaDocumento"] == documentos["Reservas y entradas"].IdCategoriaDocumento
    assert clasificador.llamadas == []


def test_se_sugiere_una_sola_vez_por_tarea(client, grupo, categorias, clasificador, mock_checklist_broadcast):
    viaje, ana, lucia, _ = grupo
    checklist, _ = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")
    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"])["sugerir"] is True

    # La desmarca y la vuelve a marcar: ya no se sugiere.
    _marcar(client, viaje, ana, tarea["IdChecklist"], completada=False)
    _marcar(client, viaje, ana, tarea["IdChecklist"])

    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"]) == {"sugerir": False}
    assert _sugerencia(client, viaje, lucia, tarea["IdChecklist"]) == {"sugerir": False}


def test_solo_se_sugiere_a_quien_la_marco_y_si_esta_hecha(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, lucia, _ = grupo
    checklist, _ = categorias
    pendiente = _crear(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")
    hecha = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Reservar hotel en Roma")

    assert _sugerencia(client, viaje, ana, pendiente["IdChecklist"]) == {"sugerir": False}
    assert _sugerencia(client, viaje, lucia, hecha["IdChecklist"]) == {"sugerir": False}
    assert _sugerencia(client, viaje, ana, hecha["IdChecklist"])["sugerir"] is True


def test_no_se_sugiere_si_la_tarea_ya_tiene_documentos(
    client, grupo, categorias, clasificador, mock_checklist_broadcast
):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = _crear(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")
    assert _subir(client, viaje, ana, documentos["Reservas y entradas"], tarea["IdChecklist"]).status_code == 200
    _marcar(client, viaje, ana, tarea["IdChecklist"])

    assert _sugerencia(client, viaje, ana, tarea["IdChecklist"]) == {"sugerir": False}


def test_privada_de_otro_no_existe(client, grupo, categorias, clasificador, mock_checklist_broadcast):
    viaje, ana, lucia, _ = grupo
    checklist, _ = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Reservar hotel en Roma", privada=True)

    response = client.post(_url(viaje, f"/{tarea['IdChecklist']}/sugerencia-documento"), headers=_headers(lucia))

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Subir documentos desde la tarea
# ---------------------------------------------------------------------------


def test_subir_desde_la_tarea_la_vincula_y_se_ve_en_la_tarea(
    client, grupo, categorias, mock_checklist_broadcast
):
    viaje, ana, lucia, _ = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")

    entradas = _subir(client, viaje, ana, documentos["Reservas y entradas"], tarea["IdChecklist"])
    comprobante = _subir(
        client, viaje, ana, documentos["Otros"], tarea["IdChecklist"], nombre="Comprobante Louvre", publico=False
    )

    assert entradas.status_code == 200, entradas.text
    assert entradas.json()["IdChecklist"] == tarea["IdChecklist"]
    assert comprobante.status_code == 200

    def documentos_de(usuario):
        lista = client.get(_url(viaje), headers=_headers(usuario)).json()
        return [d["NombreArchivo"] for d in next(t for t in lista if t["IdChecklist"] == tarea["IdChecklist"])["Documentos"]]

    assert documentos_de(ana) == ["Entradas Louvre.pdf", "Comprobante Louvre.pdf"]
    # El comprobante privado de Ana no lo ve Lucía.
    assert documentos_de(lucia) == ["Entradas Louvre.pdf"]


def test_cualquier_integrante_puede_agregar_documentos_a_una_tarea_del_grupo(
    client, grupo, categorias, mock_checklist_broadcast
):
    viaje, ana, _, bruno = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")

    response = _subir(client, viaje, bruno, documentos["Reservas y entradas"], tarea["IdChecklist"])

    assert response.status_code == 200


def test_no_se_puede_subir_a_una_tarea_privada_de_otro(client, db_session, grupo, categorias, mock_checklist_broadcast):
    viaje, ana, lucia, _ = grupo
    checklist, documentos = categorias
    tarea = _crear(client, viaje, ana, checklist["Otros"], "Reservar hotel en Roma", privada=True)

    response = _subir(client, viaje, lucia, documentos["Alojamiento"], tarea["IdChecklist"])

    assert response.status_code == 404
    assert db_session.query(DocumentoViaje).count() == 0


def test_eliminar_la_tarea_conserva_los_documentos(client, db_session, grupo, categorias, mock_checklist_broadcast):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")
    _subir(client, viaje, ana, documentos["Reservas y entradas"], tarea["IdChecklist"])

    response = client.delete(_url(viaje, f"/{tarea['IdChecklist']}"), headers=_headers(ana))

    assert response.status_code == 200
    db_session.expire_all()
    assert [d.NombreArchivo for d in db_session.query(DocumentoViaje).all()] == ["Entradas Louvre.pdf"]


def test_eliminar_el_documento_lo_quita_de_la_tarea(client, db_session, grupo, categorias, mock_checklist_broadcast):
    viaje, ana, _, _ = grupo
    checklist, documentos = categorias
    tarea = _tarea_hecha(client, viaje, ana, checklist["Otros"], "Comprar entradas para el Louvre")
    id_documento = _subir(client, viaje, ana, documentos["Reservas y entradas"], tarea["IdChecklist"]).json()[
        "IdDocumento"
    ]

    response = client.delete(f"/api/v1/trips/{viaje.IdViaje}/documents/{id_documento}", headers=_headers(ana))

    assert response.status_code == 200
    lista = client.get(_url(viaje), headers=_headers(ana)).json()
    assert lista[0]["Documentos"] == []
    db_session.expire_all()
    assert db_session.get(Checklist, tarea["IdChecklist"]) is not None


# ---------------------------------------------------------------------------
# Cliente de Gemini
# ---------------------------------------------------------------------------


def _transporte(tipo=None, status=200):
    def responder(request):
        if status != 200:
            return httpx.Response(status)
        cuerpo = {
            "candidates": [{"content": {"parts": [{"text": json.dumps({"tipo": tipo})}]}}],
            "usageMetadata": {"promptTokenCount": 120, "candidatesTokenCount": 8},
        }
        return httpx.Response(200, json=cuerpo)

    return httpx.MockTransport(responder)


def test_gemini_clasifica_y_registra_el_consumo(db_session):
    clasificador = GeminiClasificadorTareas("clave", "gemini-lite", 5, transport=_transporte(RESERVA))

    assert asyncio.run(clasificador.clasificar("Reservar La Cabrera", "Comida")) == RESERVA
    registro = db_session.query(SolicitudIA).one()
    assert registro.Servicio == SERVICIO_DOCUMENTOS_TAREAS
    assert registro.Exitosa is True
    assert registro.TokensEntrada == 120


def test_gemini_respuesta_invalida_es_error(db_session):
    clasificador = GeminiClasificadorTareas("clave", "gemini-lite", 5, transport=_transporte("CUALQUIERA"))

    with pytest.raises(documentos_tareas.ErrorClasificacion):
        asyncio.run(clasificador.clasificar("Reservar La Cabrera", "Comida"))
    assert db_session.query(SolicitudIA).one().Exitosa is False


def test_gemini_no_disponible_es_error(db_session):
    clasificador = GeminiClasificadorTareas("clave", "gemini-lite", 5, transport=_transporte(status=503))

    with pytest.raises(documentos_tareas.ErrorClasificacion):
        asyncio.run(clasificador.clasificar("Reservar La Cabrera", "Comida"))


# ---------------------------------------------------------------------------
# Documentos desde la actividad
# ---------------------------------------------------------------------------

from tests.test_tareas_entradas import avisos, tarea_prado  # noqa: E402,F401 (fixtures)
from tests.test_recomendacion_entradas import dia, lugares, web  # noqa: E402,F401 (fixtures)


def test_las_entradas_se_ven_desde_la_actividad(
    client, db_session, monkeypatch, auth_headers, viaje_con_admin, tarea_prado
):
    import app.api.routes.trips as trips_module

    monkeypatch.setattr(trips_module, "obtener_url_publica", lambda ruta: f"https://fake-public-url/{ruta}")
    viaje, _ = viaje_con_admin
    id_actividad, tarea = tarea_prado
    categoria = CategoriaDocumento(Nombre="Reservas y entradas", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    respuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={"archivo": ("entradas.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        data={
            "IdCategoriaDocumento": categoria.IdCategoriaDocumento,
            "NombreArchivo": "Entradas Prado",
            "IdChecklist": tarea["IdChecklist"],
        },
    )
    assert respuesta.status_code == 200, respuesta.text

    detalle = client.get(f"/api/v1/trips/{viaje.IdViaje}", headers=auth_headers).json()

    actividad = next(
        a for d in detalle["Cronograma"] for a in d["Actividades"] if a["IdActividad"] == id_actividad
    )
    assert [d["nombreArchivo"] for d in actividad["DocumentosReserva"]] == ["Entradas Prado.pdf"]
    assert actividad["DocumentosReserva"][0]["idChecklist"] == tarea["IdChecklist"]
