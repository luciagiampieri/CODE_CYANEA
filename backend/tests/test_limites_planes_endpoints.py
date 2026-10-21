from app.main import app
from app.models.categorias_documento import CategoriaDocumento
from app.models.documento_viaje import DocumentoViaje
from app.models.escaneo_comprobante import EscaneoComprobante
from app.models.plan import PLAN_GRATUITO, Plan
from app.services.receipt_ai import get_receipt_extractor

from datetime import datetime, timezone

MB = 1024 * 1024


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _categoria(db):
    categoria = CategoriaDocumento(Nombre="Otros")
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria


def _sin_extractor():
    app.dependency_overrides[get_receipt_extractor] = lambda: object()


def test_escanear_superando_limite_semanal_por_api_falla(
    client, db_session, viaje_con_admin, usuario_activo, auth_headers
):
    _sin_extractor()
    viaje, _ = viaje_con_admin
    usuario_activo.ConsienteProcesamientoIA = True
    db_session.commit()
    _set_limites(db_session, PLAN_GRATUITO, MaxEscaneosSemanales=1)
    db_session.add(
        EscaneoComprobante(
            IdUsuario=usuario_activo.IdUsuario,
            IdViaje=viaje.IdViaje,
            FechaEscaneo=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    response = client.post(
        f"/api/v1/gastos/trips/{viaje.IdViaje}/escanear-comprobante",
        headers=auth_headers,
        files={"archivo": ("ticket.jpg", b"contenido", "image/jpeg")},
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "RECEIPT_SCAN_LIMIT_REACHED"
    assert response.json()["detail"]["tipoLimite"] == "escaneos_semanales"


def test_subir_documento_superando_almacenamiento_por_api_falla(
    client, db_session, viaje_con_admin, usuario_activo, auth_headers
):
    _sin_extractor()
    viaje, _ = viaje_con_admin
    categoria = _categoria(db_session)
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=1)
    db_session.add(
        DocumentoViaje(
            IdViaje=viaje.IdViaje,
            IdCategoriaDocumento=categoria.IdCategoriaDocumento,
            IdUsuarioSubida=usuario_activo.IdUsuario,
            NombreArchivo="existente.pdf",
            UrlArchivo="viajes/1/Otros/existente.pdf",
            TamanoBytes=MB,
        )
    )
    db_session.commit()

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/documents",
        headers=auth_headers,
        files={"archivo": ("nuevo.pdf", b"x" * 1024, "application/pdf")},
        data={"IdCategoriaDocumento": str(categoria.IdCategoriaDocumento)},
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "STORAGE_LIMIT_REACHED"
    assert response.json()["detail"]["tipoLimite"] == "almacenamiento"