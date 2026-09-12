import io
import pytest

from app.models import (
    DocumentoViaje,
    CategoriaDocumento,
    Usuario,
    ParticipanteViaje,
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


@pytest.fixture()
def documento_existente(
    db_session,
    viaje_con_admin,
    categoria_documento,
):
    viaje, admin = viaje_con_admin

    documento = DocumentoViaje(
        IdViaje=viaje.IdViaje,
        IdCategoriaDocumento=categoria_documento.IdCategoriaDocumento,
        IdUsuarioSubida=admin.IdUsuario,
        NombreArchivo="Pasaje Mendoza.pdf",
        UrlArchivo=(
f"viajes/{viaje.IdViaje}/"
            "Pasajes/Pasaje Mendoza.pdf"
        ),
    )

    db_session.add(documento)
    db_session.commit()
    db_session.refresh(documento)

    return documento


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

    eliminados = []

    def mock_eliminar(ruta):
        eliminados.append(ruta)

    monkeypatch.setattr(
        "app.api.routes.documentos.eliminar_documento_storage",
        mock_eliminar
    )

    return eliminados

    
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
        "No tienes permisos para ver este viaje"
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
        "No tienes permisos para ver este viaje"
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


def test_reemplazar_documento_correctamente(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
    db_session,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "nuevo_pasaje.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == "Documento actualizado correctamente."
    assert data["IdDocumento"] == documento_existente.IdDocumento

    db_session.refresh(documento_existente)

    assert documento_existente.NombreArchivo == "Pasaje Mendoza.pdf"


def test_otro_usuario_no_puede_reemplazar_documento(
    client,
    db_session,
    viaje_con_admin,
    documento_existente,
):
    viaje, admin = viaje_con_admin

    otro_usuario = Usuario(
        Nombre="Pedro",
        Apellido="Test",
        NombreUsuario="pedro_reemplazo",
        Email="pedro_reemplazo@test.com",
        HashedPassword="hashed",
        Activo=True,
        EmailConfirmado=True,
    )

    db_session.add(otro_usuario)
    db_session.commit()
    db_session.refresh(otro_usuario)

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=otro_usuario.IdUsuario,
        IdRolParticipante=2,       # participante
        IdEstadoParticipacion=2,   # aceptado
        InvitadoPor=admin.IdUsuario,
    )

    db_session.add(participante)
    db_session.commit()

    token = create_access_token(
        {
            "sub": otro_usuario.Email,
            "user_id": otro_usuario.IdUsuario,
        }
    )

    headers = {
        "Authorization": f"Bearer {token}"
    }

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/"
        f"{documento_existente.IdDocumento}",
        headers=headers,
        files={
            "archivo": (
                "nuevo.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 403

    assert response.json()["detail"] == (
        "Solo el usuario que cargó el documento puede modificarlo."
    )


def test_reemplazar_documento_formato_no_soportado(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "archivo.exe",
                io.BytesIO(b"contenido prohibido"),
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 400

    assert response.json()["detail"] == (
        "Tipo de archivo no permitido. "
        "Solo se permiten PDF, JPG, JPEG y PNG."
    )


def test_reemplazar_documento_conserva_nombre_y_categoria(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
    categoria_documento,
    db_session,
):
    viaje, _ = viaje_con_admin

    nombre_original = documento_existente.NombreArchivo
    categoria_original = documento_existente.IdCategoriaDocumento

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "nuevo_archivo.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 200

    db_session.refresh(documento_existente)

    assert documento_existente.NombreArchivo == nombre_original

    assert documento_existente.IdCategoriaDocumento == categoria_original


def test_reemplazar_documento_elimina_archivo_anterior(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
    mock_storage,
):
    viaje, _ = viaje_con_admin

    ruta_original = documento_existente.UrlArchivo

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "nuevo.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 200

    assert ruta_original in mock_storage


def test_reemplazar_documento_muestra_mensaje_confirmacion(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "nuevo.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 200

    assert response.json()["message"] == (
        "Documento actualizado correctamente."
    )


def test_reemplazar_documento_permite_modificar_nombre_y_categoria(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente,
    db_session,
):
    viaje, _ = viaje_con_admin

    nueva_categoria = CategoriaDocumento(
        Nombre="Reservas"
    )

    db_session.add(nueva_categoria)
    db_session.commit()
    db_session.refresh(nueva_categoria)

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/"
        f"{documento_existente.IdDocumento}",
        headers=auth_headers,
        files={
            "archivo": (
                "reserva.pdf",
                io.BytesIO(b"nuevo contenido"),
                "application/pdf",
            )
        },
        data={
            "NombreArchivo": "Reserva Hotel",
            "IdCategoriaDocumento": (
                nueva_categoria.IdCategoriaDocumento
            ),
        },
    )

    assert response.status_code == 200

    db_session.refresh(documento_existente)

    assert documento_existente.NombreArchivo == "Reserva Hotel.pdf"
    assert documento_existente.IdCategoriaDocumento == (
        nueva_categoria.IdCategoriaDocumento
    )


def test_subir_documento_privado_se_guarda_en_bd(
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
                "privado.pdf",
                io.BytesIO(b"contenido secreto"),
                "application/pdf",
            )
        },
        data={
            "IdCategoriaDocumento": categoria_documento.IdCategoriaDocumento,
            "NombreArchivo": "Doc Privado",
            "EsPublico": False,  
        },
    )

    assert response.status_code == 200

    documento = (
        db_session.query(DocumentoViaje)
        .filter_by(NombreArchivo="Doc Privado.pdf", IdViaje=viaje.IdViaje)
        .first()
    )

    assert documento is not None
    assert documento.EsPublico is False


def test_listar_documentos_respeta_privacidad(
    client,
    db_session,
    viaje_con_admin,
    categoria_documento,
    auth_headers, 
):
    viaje, admin = viaje_con_admin

    doc_publico = DocumentoViaje(
        IdViaje=viaje.IdViaje,
        IdCategoriaDocumento=categoria_documento.IdCategoriaDocumento,
        IdUsuarioSubida=admin.IdUsuario,
        NombreArchivo="Publico.pdf",
        UrlArchivo="url/publico.pdf",
        EsPublico=True
    )
    
    doc_privado = DocumentoViaje(
        IdViaje=viaje.IdViaje,
        IdCategoriaDocumento=categoria_documento.IdCategoriaDocumento,
        IdUsuarioSubida=admin.IdUsuario,
        NombreArchivo="Privado.pdf",
        UrlArchivo="url/privado.pdf",
        EsPublico=False
    )
    db_session.add_all([doc_publico, doc_privado])
    db_session.commit()

    res_admin = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
    )
    assert res_admin.status_code == 200
    docs_admin = res_admin.json()
    assert len(docs_admin) == 2

    otro_usuario = Usuario(
        Nombre="Test", Apellido="User", NombreUsuario="test_privacidad",
        Email="privacidad@test.com", HashedPassword="hashed", Activo=True, EmailConfirmado=True
    )
    db_session.add(otro_usuario)
    db_session.commit()
    db_session.refresh(otro_usuario)

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=otro_usuario.IdUsuario,
        IdRolParticipante=2,
        IdEstadoParticipacion=2,
        InvitadoPor=admin.IdUsuario,
    )
    db_session.add(participante)
    db_session.commit()

    token_otro = create_access_token({"sub": otro_usuario.Email, "user_id": otro_usuario.IdUsuario})
    headers_otro = {"Authorization": f"Bearer {token_otro}"}

    res_otro = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=headers_otro,
    )
    assert res_otro.status_code == 200
    docs_otro = res_otro.json()
    
    assert len(docs_otro) == 1
    assert docs_otro[0]["NombreArchivo"] == "Publico.pdf"


def test_editar_documento_actualiza_privacidad(
    client,
    auth_headers,
    viaje_con_admin,
    documento_existente, 
    db_session,
):
    viaje, _ = viaje_con_admin

    assert documento_existente.EsPublico is True

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento_existente.IdDocumento}",
        headers=auth_headers,
        data={
            "EsPublico": False,
        },
    )

    assert response.status_code == 200
    db_session.refresh(documento_existente)
    assert documento_existente.EsPublico is False