"""US 84 - Detectar gastos asociados a documentos.

Al subir un documento al repositorio del viaje, el backend lo analiza con IA
(si el usuario dio su consentimiento) y devuelve una `sugerencia_gasto`. Nunca
registra el gasto por su cuenta, y si el análisis falla el documento se
conserva igual.

Los tests nunca llaman al servicio real: el proveedor de IA se reemplaza por un
extractor falso mediante `dependency_overrides` y Supabase Storage se mockea
igual que en test_documentos.py.
"""

import asyncio
import io
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import (
    CategoriaDocumento,
    DocumentoViaje,
    ParticipanteViaje,
    Usuario,
)
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.gasto import Gasto
from app.models.moneda import Moneda
from app.models.rol_participante import RolParticipante
from app.services.receipt_ai import ReceiptScanError, get_receipt_extractor

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 256
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 256
PDF = b"%PDF-1.7\n" + b"\x00" * 256

CATEGORIAS_GASTO = ["Comida y Bebida", "Transporte", "Alojamiento", "Otros"]
CATEGORIAS_DOCUMENTO = ["Pasajes", "Reservas", "Seguros", "Documentación personal"]


def _respuesta_ia(**cambios):
    """Respuesta válida del modelo; `cambios` pisa campos puntuales."""
    base = {
        "es_comprobante": True,
        "legible": True,
        "monto_total": 15230.5,
        "fecha": (date.today() - timedelta(days=2)).isoformat(),
        "comercio": "Café Martínez",
        "moneda": "ARS",
        "moneda_explicita": True,
        "categoria": "Comida y Bebida",
        "confianza": {
            "monto_total": "alta",
            "fecha": "alta",
            "comercio": "alta",
            "moneda": "alta",
            "categoria": "alta",
        },
    }
    confianza = cambios.pop("confianza", None)
    base.update(cambios)
    if confianza:
        base["confianza"].update(confianza)
    return base


class ExtractorFalso:
    nombre = "falso"

    def __init__(self, respuesta=None, error=None, demora=0.0):
        self.respuesta = respuesta if respuesta is not None else _respuesta_ia()
        self.error = error
        self.demora = demora
        self.llamadas = []

    async def extraer(self, imagen, mime_type, categorias):
        self.llamadas.append({"imagen": imagen, "mime_type": mime_type, "categorias": categorias})
        if self.demora:
            await asyncio.sleep(self.demora)
        if self.error is not None:
            raise self.error
        return self.respuesta


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mock_storage(monkeypatch):
    """Mismo patrón que test_documentos.py. Devuelve las rutas subidas."""
    subidos = []

    def mock_subir(archivo, ruta):
        subidos.append(ruta)
        return ruta

    monkeypatch.setattr("app.api.routes.documentos.subir_documento", mock_subir)
    monkeypatch.setattr(
        "app.api.routes.documentos.obtener_url_publica",
        lambda ruta: f"https://fake-public-url/{ruta}",
    )
    monkeypatch.setattr(
        "app.api.routes.documentos.eliminar_documento_storage", lambda ruta: None
    )
    return subidos


@pytest.fixture()
def categorias_documento(db_session):
    categorias = [CategoriaDocumento(Nombre=nombre) for nombre in CATEGORIAS_DOCUMENTO]
    db_session.add_all(categorias)
    db_session.commit()
    return {c.Nombre: c.IdCategoriaDocumento for c in db_session.query(CategoriaDocumento).all()}


@pytest.fixture()
def datos_gastos(db_session):
    db_session.add_all([CategoriasGastos(Nombre=nombre, Activo=True) for nombre in CATEGORIAS_GASTO])
    db_session.add_all(
        [
            Moneda(Codigo="ARS", Nombre="Peso argentino"),
            Moneda(Codigo="USD", Nombre="Dólar estadounidense"),
            Moneda(Codigo="BRL", Nombre="Real brasileño"),
        ]
    )
    db_session.commit()
    return {c.Nombre: c.IdCategoria for c in db_session.query(CategoriasGastos).all()}


@pytest.fixture()
def con_consentimiento(db_session, usuario_activo):
    usuario_activo.ConsienteProcesamientoIA = True
    db_session.commit()
    return usuario_activo


@pytest.fixture()
def extractor(client):
    falso = ExtractorFalso()
    app.dependency_overrides[get_receipt_extractor] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_receipt_extractor, None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _subir(
    client,
    viaje_id,
    headers,
    id_categoria,
    contenido=PNG,
    archivo="ticket.png",
    tipo="image/png",
    nombre=None,
    es_publico=None,
):
    data = {"IdCategoriaDocumento": id_categoria}
    if nombre is not None:
        data["NombreArchivo"] = nombre
    if es_publico is not None:
        data["EsPublico"] = es_publico
    return client.post(
        f"/api/v1/trips/{viaje_id}/documents",
        headers=headers,
        files={"archivo": (archivo, io.BytesIO(contenido), tipo)},
        data=data,
    )


def _documentos(db_session, viaje):
    return db_session.query(DocumentoViaje).filter_by(IdViaje=viaje.IdViaje).all()


def _cantidad_gastos(db_session, viaje):
    return db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).count()


def _usuario_externo(db_session, nombre_usuario):
    usuario = Usuario(
        Nombre="Pedro",
        Apellido="Test",
        NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com",
        HashedPassword="hashed",
        Activo=True,
        EmailConfirmado=True,
        ConsienteProcesamientoIA=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _usuario_en_viaje(db_session, viaje, nombre_usuario, estado):
    """Usuario con consentimiento de IA y participación en el `estado` indicado."""
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
        ConsienteProcesamientoIA=True,
    )
    db_session.add(usuario)
    db_session.flush()
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_part = db_session.query(EstadoParticipacion).filter_by(Nombre=estado).first()
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=rol.IdRolParticipante,
            IdEstadoParticipacion=estado_part.IdEstadoParticipacion,
        )
    )
    db_session.commit()
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _registrar_gasto(client, headers, viaje, sugerencia, **cambios):
    """POST /gastos con los datos de la sugerencia; `cambios` simula lo que el
    usuario edita o completa en el formulario."""
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": sugerencia["Nombre"],
        "MontoOriginal": sugerencia["MontoOriginal"],
        "MonedaOriginal": sugerencia["MonedaOriginal"],
        "IdCategoria": sugerencia["IdCategoria"],
        "FechaGasto": sugerencia["FechaGasto"],
        "EsCompartido": False,
    }
    payload.update(cambios)
    return client.post("/api/v1/gastos/", json=payload, headers=headers)


def _assert_documento_conservado(response, db_session, viaje, mock_storage):
    """El documento quedó guardado en la base y en el storage (CA 10)."""
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Documento subido correctamente"
    documentos = _documentos(db_session, viaje)
    assert len(documentos) == 1
    assert documentos[0].IdDocumento == data["IdDocumento"]
    assert len(mock_storage) == 1
    assert documentos[0].UrlArchivo == mock_storage[0]


# ---------------------------------------------------------------------------
# Detección positiva (CA 2, 4)
# ---------------------------------------------------------------------------


def test_cp1_documento_con_gasto_devuelve_sugerencia(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert response.json()["sugerencia_gasto"] == {
        "Nombre": "Café Martínez",
        "MontoOriginal": 15230.5,
        "MonedaOriginal": "ARS",
        "FechaGasto": (date.today() - timedelta(days=2)).isoformat(),
        "IdCategoria": datos_gastos["Comida y Bebida"],
        "CamposBajaConfianza": [],
    }
    assert len(extractor.llamadas) == 1


def test_sugerencia_tiene_solo_los_campos_necesarios_para_el_gasto(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """CA 9: la sugerencia no expone datos del documento fuera de los del gasto."""
    viaje, _ = viaje_con_admin

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    assert set(response.json()["sugerencia_gasto"].keys()) == {
        "Nombre",
        "MontoOriginal",
        "MonedaOriginal",
        "FechaGasto",
        "IdCategoria",
        "CamposBajaConfianza",
    }
    assert set(response.json().keys()) == {"message", "IdDocumento", "sugerencia_gasto"}


def test_monto_se_serializa_como_numero_y_fecha_como_iso(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(monto_total=1234.56, fecha="2026-05-03")

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert isinstance(sugerencia["MontoOriginal"], float)
    assert sugerencia["MontoOriginal"] == 1234.56
    assert sugerencia["FechaGasto"] == "2026-05-03"


@pytest.mark.parametrize(
    "contenido,archivo,tipo,mime_esperado",
    [
        (PNG, "doc.png", "image/png", "image/png"),
        (JPEG, "doc.jpg", "image/jpeg", "image/jpeg"),
        (JPEG, "doc.jpeg", "image/jpeg", "image/jpeg"),
        (PDF, "doc.pdf", "application/pdf", "application/pdf"),
    ],
)
def test_formatos_permitidos_se_analizan(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    contenido,
    archivo,
    tipo,
    mime_esperado,
):
    viaje, _ = viaje_con_admin

    response = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], contenido, archivo, tipo
    )

    assert response.status_code == 200
    assert "sugerencia_gasto" in response.json()
    assert len(extractor.llamadas) == 1
    assert extractor.llamadas[0]["mime_type"] == mime_esperado
    assert extractor.llamadas[0]["imagen"] == contenido


def test_pdf_con_extension_jpg_se_analiza_como_pdf(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """El tipo se detecta por el contenido, no por la extensión."""
    viaje, _ = viaje_con_admin

    response = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], PDF, "archivo.jpg", "image/jpeg"
    )

    assert response.status_code == 200
    assert extractor.llamadas[0]["mime_type"] == "application/pdf"


# ---------------------------------------------------------------------------
# Independencia de la categoría (CA 1)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nombre_categoria", CATEGORIAS_DOCUMENTO)
def test_cp2_se_analiza_sin_importar_la_categoria_del_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    nombre_categoria,
):
    viaje, _ = viaje_con_admin
    id_categoria = categorias_documento[nombre_categoria]

    response = _subir(client, viaje.IdViaje, auth_headers, id_categoria)

    assert response.status_code == 200
    assert response.json()["sugerencia_gasto"]["MontoOriginal"] == 15230.5
    assert len(extractor.llamadas) == 1
    assert sorted(extractor.llamadas[0]["categorias"]) == sorted(CATEGORIAS_GASTO)
    assert _documentos(db_session, viaje)[0].IdCategoriaDocumento == id_categoria


# ---------------------------------------------------------------------------
# Sin gasto (CA 7)
# ---------------------------------------------------------------------------


def test_cp3_documento_que_no_es_comprobante_se_guarda_sin_sugerencia(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(
        es_comprobante=False,
        monto_total=None,
        fecha=None,
        comercio=None,
        moneda=None,
        categoria=None,
    )

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()
    assert len(extractor.llamadas) == 1


def test_documento_ilegible_se_guarda_sin_sugerencia(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(legible=False, monto_total=None)

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()


@pytest.mark.parametrize("monto", [None, 0, -50, 99999999999])
def test_comprobante_sin_monto_valido_no_genera_sugerencia(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
    monto,
):
    """Sin un monto utilizable no hay gasto que sugerir, aunque lo demás se lea."""
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(monto_total=monto)

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()


# ---------------------------------------------------------------------------
# Datos parciales o faltantes (CA 8)
# ---------------------------------------------------------------------------


def test_cp4_sugerencia_sin_fecha_visible(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(fecha=None, confianza={"fecha": "baja"})

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["FechaGasto"] is None
    assert sugerencia["MontoOriginal"] == 15230.5
    assert "FechaGasto" not in sugerencia["CamposBajaConfianza"]


def test_sugerencia_con_fecha_futura_deja_la_fecha_vacia(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    manana = (date.today() + timedelta(days=1)).isoformat()
    extractor.respuesta = _respuesta_ia(fecha=manana)

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["FechaGasto"] is None
    assert sugerencia["MontoOriginal"] == 15230.5


def test_sugerencia_con_moneda_desconocida_deja_la_moneda_vacia(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(moneda="XYZ")

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["MonedaOriginal"] is None
    assert sugerencia["MontoOriginal"] == 15230.5


def test_sugerencia_con_categoria_desconocida_deja_la_categoria_vacia(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(categoria="Souvenirs")

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["IdCategoria"] is None
    assert sugerencia["MontoOriginal"] == 15230.5


def test_sugerencia_con_nombre_invalido_deja_el_nombre_vacio(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(comercio=" - ")

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["Nombre"] is None
    assert sugerencia["MontoOriginal"] == 15230.5


def test_sugerencia_con_solo_el_monto_igual_se_ofrece(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """Todo lo demás se puede completar a mano (CA 8): alcanza con el monto."""
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(fecha=None, comercio=None, moneda=None, categoria=None)

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia == {
        "Nombre": None,
        "MontoOriginal": 15230.5,
        "MonedaOriginal": None,
        "FechaGasto": None,
        "IdCategoria": None,
        "CamposBajaConfianza": [],
    }


def test_campos_de_baja_confianza_se_informan_en_la_sugerencia(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(
        moneda_explicita=False, confianza={"monto_total": "baja", "categoria": "baja"}
    )

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["CamposBajaConfianza"] == ["MontoOriginal", "MonedaOriginal", "IdCategoria"]


# ---------------------------------------------------------------------------
# No se registra ningún gasto automáticamente (CA 6)
# ---------------------------------------------------------------------------


def test_cp5_detectar_un_gasto_no_lo_registra_automaticamente(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    assert "sugerencia_gasto" in response.json()
    assert _cantidad_gastos(db_session, viaje) == 0


def test_cp6_ignorar_la_sugerencia_deja_el_documento_y_ningun_gasto(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """Cancelar la sugerencia es no llamar a POST /gastos: no queda ningún gasto."""
    viaje, _ = viaje_con_admin

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])
    listado = client.get(f"/api/v1/trips/{viaje.IdViaje}/documents", headers=auth_headers)

    assert response.status_code == 200
    assert listado.status_code == 200
    assert len(listado.json()) == 1
    assert _cantidad_gastos(db_session, viaje) == 0


# ---------------------------------------------------------------------------
# Consentimiento y privacidad (CA 9)
# ---------------------------------------------------------------------------


def test_sin_consentimiento_no_se_analiza_el_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()
    # Sin consentimiento el documento nunca llega al servicio externo.
    assert extractor.llamadas == []


def test_solo_se_envian_contenido_mime_y_categorias_de_gasto_al_proveedor(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """No viajan datos de los participantes ni del documento (nombre, categoría)."""
    viaje, _ = viaje_con_admin

    _subir(
        client,
        viaje.IdViaje,
        auth_headers,
        categorias_documento["Pasajes"],
        nombre="Pasaje a Mendoza",
    )

    llamada = extractor.llamadas[0]
    assert set(llamada.keys()) == {"imagen", "mime_type", "categorias"}
    assert llamada["imagen"] == PNG
    assert sorted(llamada["categorias"]) == sorted(CATEGORIAS_GASTO)
    assert "Pasajes" not in llamada["categorias"]


def test_nombre_de_la_sugerencia_no_incluye_el_cuit(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(comercio="Supermercado Día 30-12345678-9")

    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    assert sugerencia["Nombre"] == "Supermercado Día"
    assert "30-12345678-9" not in sugerencia["Nombre"]


# ---------------------------------------------------------------------------
# Errores durante el análisis (CA 10)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "error",
    [
        ReceiptScanError("Servicio no disponible.", 503, "AI_UNAVAILABLE"),
        ReceiptScanError("Límite de uso alcanzado.", 429, "AI_RATE_LIMITED"),
        ReceiptScanError("Respuesta inválida.", 502, "AI_INVALID_RESPONSE"),
        ReceiptScanError("No es un comprobante.", 422, "RECEIPT_NOT_RECOGNIZED"),
        RuntimeError("cambió la API del proveedor"),
        ValueError("error inesperado"),
    ],
    ids=[
        "no_disponible",
        "limite_de_uso",
        "respuesta_invalida",
        "no_reconocido",
        "falla_inesperada",
        "value_error",
    ],
)
def test_cp7_error_del_servicio_no_impide_guardar_el_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
    error,
):
    viaje, _ = viaje_con_admin
    extractor.error = error

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()
    assert len(extractor.llamadas) == 1
    assert _cantidad_gastos(db_session, viaje) == 0


def test_documento_con_error_de_analisis_aparece_en_el_listado(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.error = RuntimeError("falla del proveedor")

    _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], nombre="Factura")
    listado = client.get(f"/api/v1/trips/{viaje.IdViaje}/documents", headers=auth_headers)

    assert listado.status_code == 200
    assert [d["NombreArchivo"] for d in listado.json()] == ["Factura.png"]


def test_documento_sin_gasto_aparece_en_el_listado(
    client,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(es_comprobante=False)

    _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], nombre="Foto")
    listado = client.get(f"/api/v1/trips/{viaje.IdViaje}/documents", headers=auth_headers)

    assert listado.status_code == 200
    assert [d["NombreArchivo"] for d in listado.json()] == ["Foto.png"]


def test_timeout_del_analisis_conserva_el_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
    monkeypatch,
):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(settings, "ai_receipt_timeout_seconds", 0.05)
    extractor.demora = 3

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()


def test_respuesta_fuera_de_esquema_conserva_el_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = {"total": "1.234,56", "texto": "no respeta el esquema"}

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()


def test_documento_mayor_a_10_mb_se_guarda_sin_analizar(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    grande = PNG + b"\x00" * (10 * 1024 * 1024)

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], grande)

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()
    assert extractor.llamadas == []


def test_contenido_que_no_corresponde_al_formato_se_guarda_sin_analizar(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    """Extensión .png pero los bytes no son ni imagen ni PDF."""
    viaje, _ = viaje_con_admin

    response = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"], b"contenido de texto"
    )

    _assert_documento_conservado(response, db_session, viaje, mock_storage)
    assert "sugerencia_gasto" not in response.json()
    assert extractor.llamadas == []


# ---------------------------------------------------------------------------
# Casos en los que no se llega a analizar
# ---------------------------------------------------------------------------


def test_extension_no_permitida_no_guarda_ni_analiza(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin

    response = _subir(
        client,
        viaje.IdViaje,
        auth_headers,
        categorias_documento["Pasajes"],
        b"contenido ejecutable",
        "virus.exe",
        "application/octet-stream",
    )

    assert response.status_code == 400
    assert _documentos(db_session, viaje) == []
    assert mock_storage == []
    assert extractor.llamadas == []


def test_nombre_duplicado_no_analiza_el_segundo_documento(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    id_categoria = categorias_documento["Pasajes"]

    primero = _subir(client, viaje.IdViaje, auth_headers, id_categoria, nombre="Factura")
    segundo = _subir(client, viaje.IdViaje, auth_headers, id_categoria, nombre="Factura")

    assert primero.status_code == 200
    assert segundo.status_code == 409
    assert "sugerencia_gasto" not in segundo.json()
    assert len(extractor.llamadas) == 1
    assert len(_documentos(db_session, viaje)) == 1


def test_viaje_finalizado_no_sube_ni_analiza(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    estado_finalizado = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first()
    viaje.IdEstadoViaje = estado_finalizado.IdEstadoViaje
    db_session.commit()

    response = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_FINISHED"
    assert _documentos(db_session, viaje) == []
    assert mock_storage == []
    assert extractor.llamadas == []


def test_usuario_ajeno_al_viaje_no_sube_ni_analiza(
    client,
    db_session,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    extractor,
    mock_storage,
):
    viaje, _ = viaje_con_admin
    headers = _usuario_externo(db_session, "pedro_us84")

    response = _subir(client, viaje.IdViaje, headers, categorias_documento["Pasajes"])

    assert response.status_code == 403
    assert _documentos(db_session, viaje) == []
    assert mock_storage == []
    assert extractor.llamadas == []


def test_participante_aceptado_no_admin_recibe_sugerencia(
    client,
    db_session,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    extractor,
):
    viaje, _ = viaje_con_admin
    headers = _usuario_en_viaje(db_session, viaje, "companero_us84", "aceptado")

    response = _subir(client, viaje.IdViaje, headers, categorias_documento["Pasajes"])

    assert response.status_code == 200
    assert response.json()["sugerencia_gasto"]["MontoOriginal"] == 15230.5
    assert len(extractor.llamadas) == 1


@pytest.mark.parametrize("estado", ["invitado", "salio"])
def test_participante_sin_permiso_de_edicion_no_sube_ni_analiza(
    client,
    db_session,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    extractor,
    mock_storage,
    estado,
):
    viaje, _ = viaje_con_admin
    headers = _usuario_en_viaje(db_session, viaje, f"{estado}_us84", estado)

    response = _subir(client, viaje.IdViaje, headers, categorias_documento["Pasajes"])

    assert response.status_code == 403
    assert _documentos(db_session, viaje) == []
    assert mock_storage == []
    assert extractor.llamadas == []


def test_documento_privado_tambien_se_analiza(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin

    response = _subir(
        client,
        viaje.IdViaje,
        auth_headers,
        categorias_documento["Pasajes"],
        nombre="Doc privado",
        es_publico=False,
    )

    assert response.status_code == 200
    assert response.json()["sugerencia_gasto"]["MontoOriginal"] == 15230.5
    assert _documentos(db_session, viaje)[0].EsPublico is False
    assert len(extractor.llamadas) == 1


# ---------------------------------------------------------------------------
# Aceptar, editar y completar la sugerencia (CA 3, 4, 5, 8)
#
# La sugerencia solo precarga el formulario: el gasto existe recién cuando el
# usuario lo confirma con POST /gastos, con los datos que él decida.
# ---------------------------------------------------------------------------


def test_cp8_aceptar_la_sugerencia_registra_el_gasto_con_los_datos_extraidos(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]
    assert _cantidad_gastos(db_session, viaje) == 0

    response = _registrar_gasto(client, auth_headers, viaje, sugerencia)

    assert response.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdGasto=response.json()["IdGasto"]).first()
    assert _cantidad_gastos(db_session, viaje) == 1
    assert gasto.Nombre == "Café Martínez"
    assert gasto.MontoOriginal == Decimal("15230.50")
    assert gasto.Monto == Decimal("15230.50")
    assert gasto.MonedaOriginal == "ARS"
    assert gasto.FechaGasto == date.today() - timedelta(days=2)
    assert gasto.IdCategoria == datos_gastos["Comida y Bebida"]


def test_cp9_el_gasto_registrado_usa_los_datos_editados_por_el_usuario(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]
    fecha_editada = date.today() - timedelta(days=5)

    response = _registrar_gasto(
        client,
        auth_headers,
        viaje,
        sugerencia,
        Nombre="Almuerzo del equipo",
        MontoOriginal="18000.00",
        FechaGasto=str(fecha_editada),
        IdCategoria=datos_gastos["Transporte"],
    )

    assert response.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdGasto=response.json()["IdGasto"]).first()
    assert gasto.Nombre == "Almuerzo del equipo"
    assert gasto.MontoOriginal == Decimal("18000.00")
    assert gasto.FechaGasto == fecha_editada
    assert gasto.IdCategoria == datos_gastos["Transporte"]
    assert _cantidad_gastos(db_session, viaje) == 1


def test_cp10_sugerencia_incompleta_se_completa_manualmente_antes_de_registrar(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(fecha=None, comercio=None, moneda=None, categoria=None)
    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]

    # Con los datos faltantes en null, el gasto no se puede registrar todavía.
    incompleto = _registrar_gasto(client, auth_headers, viaje, sugerencia)
    assert incompleto.status_code == 422
    assert _cantidad_gastos(db_session, viaje) == 0

    # El usuario completa lo que faltaba y recién ahí se registra.
    completo = _registrar_gasto(
        client,
        auth_headers,
        viaje,
        sugerencia,
        Nombre="Peaje",
        MonedaOriginal="ARS",
        FechaGasto=str(date.today()),
        IdCategoria=datos_gastos["Transporte"],
    )

    assert completo.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdGasto=completo.json()["IdGasto"]).first()
    assert gasto.Nombre == "Peaje"
    assert gasto.MontoOriginal == Decimal("15230.50")
    assert gasto.MonedaOriginal == "ARS"
    assert gasto.FechaGasto == date.today()
    assert gasto.IdCategoria == datos_gastos["Transporte"]
    assert _cantidad_gastos(db_session, viaje) == 1


def test_gasto_manual_se_puede_cargar_aunque_el_analisis_haya_fallado(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """CA 10 + CA 8: sin sugerencia, el usuario igual puede registrar el gasto a mano."""
    viaje, _ = viaje_con_admin
    extractor.error = RuntimeError("falla del proveedor")
    respuesta = _subir(client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"])
    assert "sugerencia_gasto" not in respuesta.json()

    manual = client.post(
        "/api/v1/gastos/",
        json={
            "IdViaje": viaje.IdViaje,
            "Nombre": "Cena",
            "MontoOriginal": "1000.00",
            "MonedaOriginal": viaje.Moneda,
            "IdCategoria": datos_gastos["Comida y Bebida"],
            "FechaGasto": str(date.today()),
            "EsCompartido": False,
        },
        headers=auth_headers,
    )

    assert manual.status_code == 200
    assert _cantidad_gastos(db_session, viaje) == 1


def test_sugerencia_en_otra_moneda_exige_el_monto_en_ars_si_se_confirma_como_comprobante(
    client,
    db_session,
    auth_headers,
    viaje_con_admin,
    categorias_documento,
    datos_gastos,
    con_consentimiento,
    extractor,
):
    """Si el front confirma la sugerencia con DesdeComprobante (RN-39), una
    moneda distinta de ARS no se registra sin la conversión a pesos."""
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(monto_total=100, moneda="USD")
    sugerencia = _subir(
        client, viaje.IdViaje, auth_headers, categorias_documento["Pasajes"]
    ).json()["sugerencia_gasto"]
    assert sugerencia["MonedaOriginal"] == "USD"

    sin_conversion = _registrar_gasto(
        client, auth_headers, viaje, sugerencia, DesdeComprobante=True
    )
    assert sin_conversion.status_code == 400
    assert sin_conversion.headers["X-Error-Code"] == "CONVERSION_REQUIRED"
    assert _cantidad_gastos(db_session, viaje) == 0

    con_conversion = _registrar_gasto(
        client,
        auth_headers,
        viaje,
        sugerencia,
        DesdeComprobante=True,
        MontoConvertidoARS="100000.00",
    )
    assert con_conversion.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdGasto=con_conversion.json()["IdGasto"]).first()
    assert gasto.MontoOriginal == Decimal("100.00")
    assert gasto.MonedaOriginal == "USD"
    assert gasto.Monto == Decimal("100000.00")
    assert gasto.TipoCambio == Decimal("1000")