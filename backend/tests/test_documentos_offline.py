import io
from datetime import datetime, timezone

import pytest

from app.models import CategoriaDocumento, DocumentoViaje


FECHA_ANTERIOR = datetime(2020, 1, 1, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def mock_storage(monkeypatch):
    monkeypatch.setattr(
        "app.api.routes.documentos.subir_documento",
        lambda archivo, ruta: ruta,
    )
    monkeypatch.setattr(
        "app.api.routes.documentos.obtener_url_publica",
        lambda ruta: f"https://fake-public-url/{ruta}",
    )
    monkeypatch.setattr(
        "app.api.routes.documentos.eliminar_documento_storage",
        lambda ruta: None,
    )


@pytest.fixture()
def documento(db_session, viaje_con_admin):
    viaje, participante = viaje_con_admin

    categoria = CategoriaDocumento(Nombre="Pasajes")
    db_session.add(categoria)
    db_session.flush()

    documento = DocumentoViaje(
        IdViaje=viaje.IdViaje,
        IdCategoriaDocumento=categoria.IdCategoriaDocumento,
        IdUsuarioSubida=participante.IdUsuario,
        NombreArchivo="Pasaje.pdf",
        UrlArchivo=f"viajes/{viaje.IdViaje}/Pasajes/Pasaje.pdf",
        TamanoBytes=10,
        FechaSubida=FECHA_ANTERIOR,
        FechaActualizacion=FECHA_ANTERIOR,
    )
    db_session.add(documento)
    db_session.commit()
    db_session.refresh(documento)
    return documento


def test_listar_documentos_incluye_fecha_actualizacion_y_tamano(
    client, auth_headers, viaje_con_admin, documento
):
    viaje, _ = viaje_con_admin

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/documents", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body[0]["FechaActualizacion"].startswith("2020-01-01")
    assert body[0]["TamanoBytes"] == 10


def test_reemplazar_archivo_actualiza_fecha_actualizacion(
    client, auth_headers, viaje_con_admin, documento, db_session
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento.IdDocumento}",
        headers=auth_headers,
        files={"archivo": ("nuevo.pdf", io.BytesIO(b"contenido nuevo"), "application/pdf")},
    )

    assert response.status_code == 200
    db_session.refresh(documento)
    assert documento.FechaActualizacion > FECHA_ANTERIOR


def test_editar_solo_datos_no_cambia_fecha_actualizacion(
    client, auth_headers, viaje_con_admin, documento, db_session
):
    viaje, _ = viaje_con_admin

    response = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/documents/{documento.IdDocumento}",
        headers=auth_headers,
        data={"NombreArchivo": "Pasaje ida"},
    )

    assert response.status_code == 200
    db_session.refresh(documento)
    assert documento.NombreArchivo == "Pasaje ida.pdf"
    assert documento.FechaActualizacion == FECHA_ANTERIOR


def test_subir_documento_nuevo_tiene_fecha_actualizacion(
    client, auth_headers, viaje_con_admin, db_session
):
    viaje, _ = viaje_con_admin
    categoria = CategoriaDocumento(Nombre="Seguros")
    db_session.add(categoria)
    db_session.commit()
    db_session.refresh(categoria)

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={"archivo": ("poliza.pdf", io.BytesIO(b"contenido"), "application/pdf")},
        data={"IdCategoriaDocumento": categoria.IdCategoriaDocumento, "NombreArchivo": "Poliza"},
    )

    assert response.status_code == 200
    creado = db_session.get(DocumentoViaje, response.json()["IdDocumento"])
    assert creado.FechaActualizacion is not None