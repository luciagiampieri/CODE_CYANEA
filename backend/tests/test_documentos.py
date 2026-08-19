import io
import pytest

from app.models import (
    DocumentoViaje,
    CategoriaDocumento,
    Usuario,
)

from app.core.security import create_access_token

@pytest.fixture()
def categoria_documento(db_session):
    categoria = CategoriaDocumento(
        Nombre="Pasajes"
    )

    db_session.add(categoria)
    db_session.commit()
    db_session.refresh(categoria)

    return categoria


@pytest.fixture(autouse=True)
def mock_storage(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.documentos.subir_documento",
        lambda archivo, ruta: ruta
    )
    monkeypatch.setattr(
        "app.api.routes.documentos.obtener_url_publica",
        lambda ruta: f"https://fake-public-url/{ruta}"
    )

    
def test_subir_documento_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    archivo = io.BytesIO(b"contenido pdf")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                archivo,
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == "Documento subido correctamente"
    assert "IdDocumento" in data


def test_subir_documento_sin_categoria(
    client,
    auth_headers,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin

    archivo = io.BytesIO(b"contenido pdf")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                archivo,
                "application/pdf",
            )
        },
        data={
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    assert response.status_code == 422


def test_subir_documento_formato_no_soportado(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    archivo = io.BytesIO(b"contenido ejecutable")

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "virus.exe",
                archivo,
                "application/octet-stream",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Archivo Prohibido",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Tipo de archivo no permitido. Solo se permiten PDF, JPG, JPEG y PNG."
    )


def test_subir_documento_imagen_permitida(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "seguro.jpg",
                io.BytesIO(b"imagen falsa"),
                "image/jpeg",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Seguro medico",
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == (
        "Documento subido correctamente"
    )


def test_subir_documento_nombre_duplicado(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    response_1 = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido 1"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    assert response_1.status_code == 200

    response_2 = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "otro.pdf",
                io.BytesIO(b"contenido 2"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    assert response_2.status_code == 409
    assert response_2.json()["detail"] == (
        "Ya existe un documento con ese nombre en este viaje."
    )


def test_subir_documento_usa_nombre_original_si_usuario_no_lo_modifica(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
    db_session,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje_mendoza.pdf",
                io.BytesIO(b"contenido pdf"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
        },
    )

    assert response.status_code == 200

    documento = db_session.query(DocumentoViaje).first()

    assert documento.NombreArchivo == "pasaje_mendoza.pdf"


def test_subir_documento_viaje_no_existe(
    client,
    auth_headers,
    categoria_documento,
):
    response = client.post(
        "/api/v1/trips/99999/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Viaje no encontrado"


def test_subir_documento_categoria_no_existe(
    client,
    auth_headers,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": 99999,
            "NombreArchivo": "Pasaje",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == (
        "Categoría de documento no encontrada"
    )


def test_subir_documento_nombre_vacio(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):

    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "   ",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "El nombre del documento es obligatorio."
    )


def test_usuario_no_pertenece_al_viaje_no_puede_subir_documento(
    client,
    db_session,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    usuario_externo = Usuario(
        Nombre="Pedro",
        Apellido="Test",
        NombreUsuario="pedro_test",
        Email="pedro@test.com",
        HashedPassword="hashed",
        Activo=True,
        EmailConfirmado=True,
    )

    db_session.add(usuario_externo)
    db_session.commit()
    db_session.refresh(usuario_externo)

    token = create_access_token(
        {
            "sub": usuario_externo.Email,
            "user_id": usuario_externo.IdUsuario,
        }
    )

    headers = {
        "Authorization": f"Bearer {token}"
    }

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "No formas parte de este viaje"
    )


def test_subir_documento_se_guarda_en_bd(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    assert response.status_code == 200

    documento = (
        db_session.query(DocumentoViaje)
        .filter_by(
            IdViaje=viaje.IdViaje
        )
        .first()
    )

    assert documento is not None
    assert documento.NombreArchivo == "Pasaje Mendoza.pdf"
    assert documento.IdCategoriaDocumento == (
        categoria_documento.IdCategoriaDocumento
    )


def test_listar_documentos_viaje_devuelve_info_asociada(
    client,
    auth_headers,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={
            "archivo": (
                "pasaje.pdf",
                io.BytesIO(b"contenido"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Pasaje Mendoza",
        },
    )

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
    )

    assert response.status_code == 200

    body = response.json()
    assert len(body) == 1
    assert body[0]["NombreArchivo"] == "Pasaje Mendoza.pdf"
    assert body[0]["NombreCategoria"] == categoria_documento.Nombre
    assert body[0]["UrlArchivo"].startswith("https://fake-public-url/")
    assert "NombreUsuarioSubida" in body[0]


def test_listar_documentos_viaje_vacio(
    client,
    auth_headers,
    viaje_con_admin,
):
    viaje, _ = viaje_con_admin

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == []


def test_listar_documentos_viaje_rechaza_usuario_ajeno(
    client,
    db_session,
    viaje_con_admin,
    categoria_documento,
):
    viaje, _ = viaje_con_admin

    usuario_externo = Usuario(
        Nombre="Pedro",
        Apellido="Test",
        NombreUsuario="pedro_test_docs",
        Email="pedro_docs@test.com",
        HashedPassword="hashed",
        Activo=True,
        EmailConfirmado=True,
    )

    db_session.add(usuario_externo)
    db_session.commit()
    db_session.refresh(usuario_externo)

    token = create_access_token(
        {
            "sub": usuario_externo.Email,
            "user_id": usuario_externo.IdUsuario,
        }
    )

    headers = {
        "Authorization": f"Bearer {token}"
    }

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "No formas parte de este viaje"
    )


def test_listar_documentos_viaje_no_existe(
    client,
    auth_headers,
):
    response = client.get(
        "/api/v1/trips/99999/documents",
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Viaje no encontrado"