import base64
from datetime import date
from types import SimpleNamespace

import pytest

from app.api.routes import trips as trips_module
from app.core.security import create_access_token, hash_password
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.cover_ai import CoverGenerationError

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PNG_B64 = base64.b64encode(PNG).decode("ascii")
RUTA_ANTERIOR = "portadas/anterior.png"


class _StorageFalso:
    def __init__(self):
        self.subidas = []
        self.borrados = []
        self.falla_subida = False
        self.falla_borrado = False

    def subir(self, archivo, id_viaje):
        if self.falla_subida:
            raise RuntimeError("Supabase caído")
        self.subidas.append(archivo.filename)
        return f"portadas/{id_viaje}/subida.png"

    def subir_bytes(self, contenido, id_viaje, extension, mime):
        if self.falla_subida:
            raise RuntimeError("Supabase caído")
        self.subidas.append(mime)
        return f"portadas/{id_viaje}/ia.{extension}"

    def borrar(self, ruta):
        if self.falla_borrado:
            raise RuntimeError("Supabase caído")
        self.borrados.append(ruta)


@pytest.fixture()
def storage(monkeypatch):
    falso = _StorageFalso()
    monkeypatch.setattr(trips_module, "subir_portada_viaje", falso.subir)
    monkeypatch.setattr(trips_module, "subir_portada_viaje_bytes", falso.subir_bytes)
    monkeypatch.setattr(trips_module, "eliminar_documento_storage", falso.borrar)
    monkeypatch.setattr(trips_module, "obtener_url_publica", lambda ruta: f"https://storage.test/{ruta}")
    return falso


@pytest.fixture()
def ia(monkeypatch):
    estado = SimpleNamespace(prompts=[], error=None)

    async def _generar(prompt):
        if estado.error:
            raise estado.error
        estado.prompts.append(prompt)
        return SimpleNamespace(content=PNG, mime_type="image/png")

    monkeypatch.setattr(trips_module, "generate_cover_image", _generar)
    return estado


@pytest.fixture()
def headers_no_admin(db_session):
    usuario = Usuario(
        Nombre="Beto",
        Apellido="Test",
        NombreUsuario="beto_test",
        Email="beto@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _error_ia(status_code, message):
    error = CoverGenerationError.__new__(CoverGenerationError)
    error.status_code = status_code
    error.message = message
    return error


def _url(viaje, sufijo=""):
    return f"/api/v1/trips/{viaje.IdViaje}/cover{sufijo}"


def _portada(db_session, viaje):
    db_session.expire_all()
    return db_session.get(Viaje, viaje.IdViaje).UrlPortadaPersonalizada


def _con_portada(db_session, viaje, ruta=RUTA_ANTERIOR):
    viaje.UrlPortadaPersonalizada = ruta
    db_session.commit()


def _archivo(nombre="portada.png"):
    return {"archivo": (nombre, PNG, "image/png")}


def test_subir_portada_la_guarda(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje), files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    assert _portada(db_session, viaje) == f"portadas/{viaje.IdViaje}/subida.png"
    assert storage.borrados == []


def test_subir_portada_reemplaza_y_borra_la_anterior(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)

    respuesta = client.post(_url(viaje), files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 200
    assert storage.borrados == [RUTA_ANTERIOR]


@pytest.mark.parametrize("nombre", ["portada.gif", "portada.pdf", "portada"])
def test_subir_portada_rechaza_extension_no_permitida(client, viaje_con_admin, auth_headers, storage, nombre):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje), files=_archivo(nombre), headers=auth_headers)

    assert respuesta.status_code == 400
    assert "JPG, JPEG y PNG" in respuesta.json()["detail"]
    assert storage.subidas == []


def test_si_falla_el_storage_se_conserva_la_portada_actual(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)
    storage.falla_subida = True

    respuesta = client.post(_url(viaje), files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 500
    assert _portada(db_session, viaje) == RUTA_ANTERIOR
    assert storage.borrados == []


def test_si_falla_borrar_la_anterior_la_nueva_queda_igual(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)
    storage.falla_borrado = True

    respuesta = client.post(_url(viaje), files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 200
    assert _portada(db_session, viaje) == f"portadas/{viaje.IdViaje}/subida.png"


def test_subir_portada_requiere_ser_admin(client, viaje_con_admin, headers_no_admin, storage):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje), files=_archivo(), headers=headers_no_admin)

    assert respuesta.status_code == 403
    assert storage.subidas == []


def test_subir_portada_de_viaje_inexistente(client, auth_headers, master_data, storage):
    respuesta = client.post("/api/v1/trips/99999/cover", files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 404


def test_no_se_puede_cambiar_la_portada_fuera_del_plazo_de_edicion(
    client, db_session, viaje_con_admin, auth_headers, storage
):
    viaje, _ = viaje_con_admin
    viaje.FechaInicio = date(2025, 1, 1)
    viaje.FechaFin = date(2025, 1, 10)
    db_session.commit()

    respuesta = client.post(_url(viaje), files=_archivo(), headers=auth_headers)

    assert respuesta.status_code == 403
    assert respuesta.headers["X-Error-Code"] == "TRIP_EDIT_WINDOW_CLOSED"
    assert storage.subidas == []


def test_quitar_portada_cuando_ya_es_la_predeterminada(client, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin

    respuesta = client.delete(_url(viaje), headers=auth_headers)

    assert respuesta.status_code == 200
    assert "predeterminada" in respuesta.json()["message"]
    assert storage.borrados == []


def test_quitar_portada_personalizada(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)

    respuesta = client.delete(_url(viaje), headers=auth_headers)

    assert respuesta.status_code == 200
    assert _portada(db_session, viaje) is None
    assert storage.borrados == [RUTA_ANTERIOR]


def test_quitar_portada_aunque_falle_el_borrado_en_storage(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)
    storage.falla_borrado = True

    respuesta = client.delete(_url(viaje), headers=auth_headers)

    assert respuesta.status_code == 200
    assert _portada(db_session, viaje) is None


def test_quitar_portada_requiere_ser_admin(client, db_session, viaje_con_admin, headers_no_admin, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)

    respuesta = client.delete(_url(viaje), headers=headers_no_admin)

    assert respuesta.status_code == 403
    assert _portada(db_session, viaje) == RUTA_ANTERIOR


def test_generar_portada_ia_devuelve_vista_previa_sin_guardar(client, db_session, viaje_con_admin, auth_headers, ia):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje, "/ai/generate"), json={"prompt": "playa al atardecer"}, headers=auth_headers)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["imageBase64"] == PNG_B64
    assert respuesta.json()["mimeType"] == "image/png"
    assert len(ia.prompts) == 1
    assert _portada(db_session, viaje) is None


def test_generar_portada_ia_propaga_el_error_del_proveedor(client, viaje_con_admin, auth_headers, ia):
    viaje, _ = viaje_con_admin
    ia.error = _error_ia(503, "El servicio de imágenes no está disponible.")

    respuesta = client.post(_url(viaje, "/ai/generate"), json={"prompt": None}, headers=auth_headers)

    assert respuesta.status_code == 503
    assert respuesta.json()["detail"] == "El servicio de imágenes no está disponible."


def test_generar_portada_ia_requiere_ser_admin(client, viaje_con_admin, headers_no_admin, ia):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje, "/ai/generate"), json={"prompt": None}, headers=headers_no_admin)

    assert respuesta.status_code == 403
    assert ia.prompts == []


def test_vista_previa_sin_titulo_ni_destinos_falla(client, auth_headers, ia):
    respuesta = client.post(
        "/api/v1/trips/cover/ai/preview",
        json={"title": None, "destinations": ["   "], "prompt": None},
        headers=auth_headers,
    )

    assert respuesta.status_code == 400
    assert ia.prompts == []


def test_vista_previa_para_viaje_nuevo(client, auth_headers, ia):
    respuesta = client.post(
        "/api/v1/trips/cover/ai/preview",
        json={"title": "Escapada", "destinations": ["Roma, Italia"], "prompt": None},
        headers=auth_headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["imageBase64"] == PNG_B64


def test_vista_previa_propaga_el_error_del_proveedor(client, auth_headers, ia):
    ia.error = _error_ia(429, "Se alcanzó el límite de generaciones.")

    respuesta = client.post(
        "/api/v1/trips/cover/ai/preview",
        json={"title": "Escapada", "destinations": [], "prompt": None},
        headers=auth_headers,
    )

    assert respuesta.status_code == 429


@pytest.mark.parametrize("imagen", [PNG_B64, f"data:image/png;base64,{PNG_B64}"], ids=["base64", "data-url"])
def test_aceptar_portada_ia(client, db_session, viaje_con_admin, auth_headers, storage, imagen):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "/ai/accept"), json={"imageBase64": imagen, "mimeType": "image/png"}, headers=auth_headers
    )

    assert respuesta.status_code == 200, respuesta.text
    ruta = _portada(db_session, viaje)
    assert ruta.startswith(f"portadas/{viaje.IdViaje}/ia.")
    assert respuesta.json()["image"] == f"https://storage.test/{ruta}"


def test_aceptar_portada_ia_borra_la_anterior(client, db_session, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)

    client.post(_url(viaje, "/ai/accept"), json={"imageBase64": PNG_B64, "mimeType": "image/png"}, headers=auth_headers)

    assert storage.borrados == [RUTA_ANTERIOR]


def test_aceptar_portada_ia_con_base64_invalido(client, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin

    respuesta = client.post(
        _url(viaje, "/ai/accept"), json={"imageBase64": "esto no es base64!!", "mimeType": "image/png"}, headers=auth_headers
    )

    assert respuesta.status_code == 400
    assert respuesta.json()["detail"] == "La imagen enviada no es válida."


def test_aceptar_portada_ia_que_no_es_imagen(client, viaje_con_admin, auth_headers, storage):
    viaje, _ = viaje_con_admin
    texto = base64.b64encode(b"hola mundo").decode("ascii")

    respuesta = client.post(
        _url(viaje, "/ai/accept"), json={"imageBase64": texto, "mimeType": "image/png"}, headers=auth_headers
    )

    assert respuesta.status_code == 400
    assert "JPG, JPEG y PNG" in respuesta.json()["detail"]


def test_aceptar_portada_ia_demasiado_grande(client, viaje_con_admin, auth_headers, storage, monkeypatch):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(trips_module, "MAX_COVER_BYTES", 10)

    respuesta = client.post(
        _url(viaje, "/ai/accept"), json={"imageBase64": PNG_B64, "mimeType": "image/png"}, headers=auth_headers
    )

    assert respuesta.status_code == 413
    assert storage.subidas == []


def test_aceptar_portada_ia_si_falla_el_storage_conserva_la_actual(
    client, db_session, viaje_con_admin, auth_headers, storage
):
    viaje, _ = viaje_con_admin
    _con_portada(db_session, viaje)
    storage.falla_subida = True

    respuesta = client.post(
        _url(viaje, "/ai/accept"), json={"imageBase64": PNG_B64, "mimeType": "image/png"}, headers=auth_headers
    )

    assert respuesta.status_code == 500
    assert _portada(db_session, viaje) == RUTA_ANTERIOR