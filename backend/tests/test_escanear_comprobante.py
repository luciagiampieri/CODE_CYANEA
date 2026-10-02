"""US 93 - Escanear comprobante de gasto mediante IA.

Los tests nunca llaman al servicio real (RNF-37): el proveedor se reemplaza
por un extractor falso mediante `dependency_overrides`, y el cliente de Gemini
se prueba con un transporte httpx simulado.
"""

import asyncio
import base64
import json
from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.gasto import Gasto
from app.models.moneda import Moneda
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.services.receipt_ai import (
    GeminiReceiptExtractor,
    MockReceiptExtractor,
    ReceiptScanError,
    construir_resultado,
    get_receipt_extractor,
    validar_esquema,
)
from app.services.receipt_ai.base import AI_UNAVAILABLE, ExtraccionComprobanteIA
from app.services.receipt_ai.prompt import construir_esquema_json, construir_prompt

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 256
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 256
PDF = b"%PDF-1.7\n" + b"\x00" * 256

CATEGORIAS = ["Comida y Bebida", "Transporte", "Alojamiento", "Otros"]


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


@pytest.fixture()
def datos_gastos(db_session):
    db_session.add_all([CategoriasGastos(Nombre=nombre, Activo=True) for nombre in CATEGORIAS])
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


def _escanear(client, viaje_id, headers, contenido=PNG, nombre="ticket.png", tipo="image/png"):
    return client.post(
        f"/api/v1/gastos/trips/{viaje_id}/escanear-comprobante",
        files={"archivo": (nombre, contenido, tipo)},
        headers=headers,
    )


def _usuario_en_viaje(db_session, viaje, nombre_usuario, estado):
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


# ---------------------------------------------------------------------------
# Casos de prueba de la US
# ---------------------------------------------------------------------------


def test_cp1_escanear_comprobante_legible_precarga_todos_los_datos(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["Nombre"] == "Café Martínez"
    assert Decimal(str(data["MontoOriginal"])) == Decimal("15230.50")
    assert data["MonedaOriginal"] == "ARS"
    assert data["FechaGasto"] == (date.today() - timedelta(days=2)).isoformat()
    assert data["IdCategoria"] == datos_gastos["Comida y Bebida"]
    assert data["CamposBajaConfianza"] == []


@pytest.mark.parametrize(
    "contenido,nombre,tipo",
    [
        (JPEG, "galeria.jpg", "image/jpeg"),
        (JPEG, "galeria.jpeg", "image/jpeg"),
        (PNG, "galeria.png", "image/png"),
    ],
)
def test_cp2_imagen_de_galeria_en_formatos_permitidos(
    client,
    auth_headers,
    viaje_con_admin,
    datos_gastos,
    con_consentimiento,
    extractor,
    contenido,
    nombre,
    tipo,
):
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers, contenido, nombre, tipo)

    assert response.status_code == 200
    assert extractor.llamadas[0]["mime_type"] == tipo


def test_cp3_se_usa_el_total_y_el_prompt_exige_ignorar_subtotales(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    """La lectura del total depende del modelo (se mide con el script de
    evaluación sobre tickets reales, RNF-35). Acá se verifica que la regla esté
    en el prompt y que el sistema use el campo monto_total tal cual."""
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(monto_total=12100)

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert Decimal(str(response.json()["MontoOriginal"])) == Decimal("12100.00")
    prompt = construir_prompt(CATEGORIAS)
    assert "TOTAL FINAL" in prompt
    assert "subtotal" in prompt


def test_cp4_formato_soportado_pdf(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers, PDF, "ticket.pdf", "application/pdf")

    assert response.status_code == 200
    assert extractor.llamadas != []
    assert extractor.llamadas[0]["mime_type"] == "application/pdf"


def test_cp4_extension_con_contenido_pdf(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    """Si el archivo contiene bytes de PDF, ahora se procesa correctamente como PDF."""
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers, PDF, "archivo.jpg", "application/pdf")

    assert response.status_code == 200
    assert extractor.llamadas != []


def test_cp5_imagen_mayor_a_10_mb(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    grande = PNG + b"\x00" * (10 * 1024 * 1024)

    response = _escanear(client, viaje.IdViaje, auth_headers, grande)

    assert response.status_code == 413
    assert response.headers["X-Error-Code"] == "RECEIPT_TOO_LARGE"
    assert extractor.llamadas == []


def test_cp6_primer_uso_sin_consentimiento(
    client, auth_headers, viaje_con_admin, datos_gastos, extractor
):
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 403
    assert response.headers["X-Error-Code"] == "AI_CONSENT_REQUIRED"
    # Sin consentimiento la imagen nunca llega al servicio externo.
    assert extractor.llamadas == []


def test_cp7_imagen_que_no_es_comprobante(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
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

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 422
    assert response.headers["X-Error-Code"] == "RECEIPT_NOT_RECOGNIZED"
    assert "manualmente" in response.json()["detail"]


def test_cp7_comprobante_ilegible(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(legible=False, monto_total=None)

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 422
    assert response.headers["X-Error-Code"] == "RECEIPT_NOT_RECOGNIZED"


def test_cp8_comprobante_sin_fecha_visible(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = _respuesta_ia(fecha=None, confianza={"fecha": "baja"})

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["FechaGasto"] is None
    # Un campo vacío no se marca como "baja confianza": directamente no se completa.
    assert "FechaGasto" not in data["CamposBajaConfianza"]
    assert data["MontoOriginal"] is not None


def test_cp9_servicio_de_ia_no_disponible(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    extractor.error = ReceiptScanError("El servicio no está disponible.", 503, AI_UNAVAILABLE)

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 503
    assert response.headers["X-Error-Code"] == "AI_UNAVAILABLE"


def test_cp9_falla_inesperada_del_proveedor_degrada_a_no_disponible(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    extractor.error = RuntimeError("cambió la API del proveedor")

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 503
    assert response.headers["X-Error-Code"] == "AI_UNAVAILABLE"
    assert "manualmente" in response.json()["detail"]


def test_cp9_servicio_de_ia_demora_demasiado(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor, monkeypatch
):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(settings, "ai_receipt_timeout_seconds", 0.05)
    extractor.demora = 3

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 504
    assert response.headers["X-Error-Code"] == "AI_TIMEOUT"


def test_cp10_el_escaneo_no_registra_ningun_gasto(
    client, db_session, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 200
    assert db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).count() == 0


def test_cp11_viaje_finalizado(
    client, db_session, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    estado_finalizado = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first()
    viaje.IdEstadoViaje = estado_finalizado.IdEstadoViaje
    db_session.commit()

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_FINISHED"
    assert extractor.llamadas == []


# ---------------------------------------------------------------------------
# Acceso (AC1)
# ---------------------------------------------------------------------------


def test_participante_invitado_no_puede_escanear(
    client, db_session, viaje_con_admin, datos_gastos, extractor
):
    viaje, _ = viaje_con_admin
    headers = _usuario_en_viaje(db_session, viaje, "invitado", "invitado")

    response = _escanear(client, viaje.IdViaje, headers)

    assert response.status_code == 403
    assert extractor.llamadas == []


def test_participante_que_salio_no_puede_escanear(
    client, db_session, viaje_con_admin, datos_gastos, extractor
):
    viaje, _ = viaje_con_admin
    headers = _usuario_en_viaje(db_session, viaje, "exparticipante", "salio")

    response = _escanear(client, viaje.IdViaje, headers)

    assert response.status_code == 403
    assert extractor.llamadas == []


def test_participante_aceptado_no_admin_puede_escanear(
    client, db_session, viaje_con_admin, datos_gastos, extractor
):
    viaje, _ = viaje_con_admin
    headers = _usuario_en_viaje(db_session, viaje, "companero", "aceptado")

    response = _escanear(client, viaje.IdViaje, headers)

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Validación de la respuesta de la IA (AC6, AC9, AC10)
# ---------------------------------------------------------------------------


def test_respuesta_fuera_de_esquema_se_rechaza(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin
    extractor.respuesta = {"total": "1.234,56", "texto": "no respeta el esquema"}

    response = _escanear(client, viaje.IdViaje, auth_headers)

    assert response.status_code == 502
    assert response.headers["X-Error-Code"] == "AI_INVALID_RESPONSE"


def test_solo_se_envian_imagen_y_categorias_al_proveedor(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    """RNF-33: no viajan datos de los participantes."""
    viaje, _ = viaje_con_admin

    _escanear(client, viaje.IdViaje, auth_headers)

    llamada = extractor.llamadas[0]
    assert set(llamada.keys()) == {"imagen", "mime_type", "categorias"}
    assert sorted(llamada["categorias"]) == sorted(CATEGORIAS)


def _extraccion(**cambios) -> ExtraccionComprobanteIA:
    return validar_esquema(_respuesta_ia(**cambios))


CATEGORIAS_IDS = {"Comida y Bebida": 1, "Transporte": 2, "Otros": 7}
MONEDAS = {"ARS", "USD"}


def test_fecha_futura_queda_vacia():
    manana = (date.today() + timedelta(days=1)).isoformat()
    resultado = construir_resultado(_extraccion(fecha=manana), CATEGORIAS_IDS, MONEDAS)
    assert resultado.FechaGasto is None


def test_fecha_con_formato_invalido_queda_vacia():
    resultado = construir_resultado(_extraccion(fecha="03/05/26"), CATEGORIAS_IDS, MONEDAS)
    assert resultado.FechaGasto is None


def test_fecha_muy_antigua_se_marca_para_revision():
    hace_dos_anios = (date.today() - timedelta(days=800)).isoformat()
    resultado = construir_resultado(_extraccion(fecha=hace_dos_anios), CATEGORIAS_IDS, MONEDAS)
    assert resultado.FechaGasto is not None
    assert "FechaGasto" in resultado.CamposBajaConfianza


@pytest.mark.parametrize("monto", [0, -50, 99999999999])
def test_monto_invalido_queda_vacio(monto):
    resultado = construir_resultado(_extraccion(monto_total=monto), CATEGORIAS_IDS, MONEDAS)
    assert resultado.MontoOriginal is None


def test_monto_se_redondea_a_dos_decimales():
    resultado = construir_resultado(_extraccion(monto_total=100.005), CATEGORIAS_IDS, MONEDAS)
    assert resultado.MontoOriginal == Decimal("100.01")


def test_moneda_que_no_existe_en_el_sistema_queda_vacia():
    resultado = construir_resultado(_extraccion(moneda="XYZ"), CATEGORIAS_IDS, MONEDAS)
    assert resultado.MonedaOriginal is None


def test_moneda_inferida_se_marca_para_revision():
    resultado = construir_resultado(_extraccion(moneda_explicita=False), CATEGORIAS_IDS, MONEDAS)
    assert resultado.MonedaOriginal == "ARS"
    assert "MonedaOriginal" in resultado.CamposBajaConfianza


def test_moneda_en_minusculas_se_normaliza():
    resultado = construir_resultado(_extraccion(moneda="usd"), CATEGORIAS_IDS, MONEDAS)
    assert resultado.MonedaOriginal == "USD"


def test_categoria_desconocida_queda_vacia():
    resultado = construir_resultado(_extraccion(categoria="Souvenirs"), CATEGORIAS_IDS, MONEDAS)
    assert resultado.IdCategoria is None


def test_categoria_se_mapea_sin_importar_mayusculas():
    resultado = construir_resultado(_extraccion(categoria="transporte"), CATEGORIAS_IDS, MONEDAS)
    assert resultado.IdCategoria == 2


def test_campos_con_baja_confianza_se_informan_en_orden():
    extraccion = _extraccion(
        confianza={"monto_total": "baja", "comercio": "baja", "categoria": "baja"}
    )
    resultado = construir_resultado(extraccion, CATEGORIAS_IDS, MONEDAS)
    assert resultado.CamposBajaConfianza == ["Nombre", "MontoOriginal", "IdCategoria"]


def test_nombre_del_comercio_sin_cuit_y_con_largo_maximo():
    nombre = "Supermercado Día 30-12345678-9 " + "x" * 300
    resultado = construir_resultado(_extraccion(comercio=nombre), CATEGORIAS_IDS, MONEDAS)
    assert "30-12345678-9" not in resultado.Nombre
    assert len(resultado.Nombre) <= 150


def test_nombre_demasiado_corto_queda_vacio():
    resultado = construir_resultado(_extraccion(comercio=" - "), CATEGORIAS_IDS, MONEDAS)
    assert resultado.Nombre is None


# ---------------------------------------------------------------------------
# Consentimiento (AC5)
# ---------------------------------------------------------------------------


def test_otorgar_consentimiento_habilita_el_escaneo(
    client, auth_headers, viaje_con_admin, datos_gastos, extractor
):
    viaje, _ = viaje_con_admin

    response = client.put(
        "/api/v1/users/me/consentimiento-ia", json={"consiente": True}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["consienteProcesamientoIA"] is True
    assert response.json()["fechaConsentimientoIA"] is not None
    assert (
        client.get("/api/v1/users/me", headers=auth_headers).json()["consienteProcesamientoIA"]
        is True
    )
    assert _escanear(client, viaje.IdViaje, auth_headers).status_code == 200


def test_revocar_consentimiento_bloquea_el_escaneo(
    client, auth_headers, viaje_con_admin, datos_gastos, con_consentimiento, extractor
):
    viaje, _ = viaje_con_admin

    response = client.put(
        "/api/v1/users/me/consentimiento-ia", json={"consiente": False}, headers=auth_headers
    )

    assert response.json() == {"consienteProcesamientoIA": False, "fechaConsentimientoIA": None}
    assert _escanear(client, viaje.IdViaje, auth_headers).status_code == 403


# ---------------------------------------------------------------------------
# Proveedores (RNF-37)
# ---------------------------------------------------------------------------


def test_el_proveedor_se_elige_por_configuracion(monkeypatch):
    monkeypatch.setattr(settings, "ai_receipt_provider", "mock")
    assert isinstance(get_receipt_extractor(), MockReceiptExtractor)

    monkeypatch.setattr(settings, "ai_receipt_provider", "gemini")
    assert isinstance(get_receipt_extractor(), GeminiReceiptExtractor)


def test_la_respuesta_del_mock_cumple_el_esquema():
    crudo = asyncio.run(
        MockReceiptExtractor(demora_segundos=0).extraer(PNG, "image/png", CATEGORIAS)
    )
    resultado = construir_resultado(validar_esquema(crudo), {"Comida y Bebida": 1}, {"ARS"})
    assert resultado.MontoOriginal == Decimal("18450.50")


def _gemini(handler, model="gemini-2.5-flash", api_key="clave-de-prueba", fallback_model=None):
    return GeminiReceiptExtractor(
        api_key=api_key,
        model=model,
        timeout_seconds=5,
        fallback_model=fallback_model,
        transport=httpx.MockTransport(handler),
    )


def _respuesta_gemini(payload: dict) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}


def test_gemini_arma_el_pedido_con_imagen_esquema_y_sin_razonamiento():
    pedidos = []

    def handler(request):
        pedidos.append(request)
        return httpx.Response(200, json=_respuesta_gemini(_respuesta_ia()))

    resultado = asyncio.run(_gemini(handler).extraer(JPEG, "image/jpeg", CATEGORIAS))

    assert resultado["comercio"] == "Café Martínez"
    pedido = pedidos[0]
    assert "models/gemini-2.5-flash:generateContent" in str(pedido.url)
    assert pedido.headers["x-goog-api-key"] == "clave-de-prueba"
    cuerpo = json.loads(pedido.content)
    imagen = cuerpo["contents"][0]["parts"][0]["inlineData"]
    assert imagen["mimeType"] == "image/jpeg"
    assert base64.b64decode(imagen["data"]) == JPEG
    config = cuerpo["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseJsonSchema"] == construir_esquema_json(CATEGORIAS)
    assert config["thinkingConfig"] == {"thinkingBudget": 0}


@pytest.mark.parametrize(
    "modelo,esperado",
    [
        ("gemini-2.5-flash", {"thinkingBudget": 0}),
        ("gemini-3.8-flash", {"thinkingLevel": "low"}),
        ("gemini-3.5-flash-lite", {"thinkingLevel": "low"}),
        ("models/gemini-4-flash", {"thinkingLevel": "low"}),
        ("modelo-de-otra-familia", None),
    ],
)
def test_gemini_razonamiento_minimo_segun_familia(modelo, esperado):
    pedidos = []

    def handler(request):
        pedidos.append(json.loads(request.content))
        return httpx.Response(200, json=_respuesta_gemini(_respuesta_ia()))

    asyncio.run(_gemini(handler, model=modelo).extraer(PNG, "image/png", CATEGORIAS))

    assert pedidos[0]["generationConfig"].get("thinkingConfig") == esperado


def test_gemini_sin_api_key_no_llama_al_servicio():
    llamado = []

    def handler(request):
        llamado.append(request)
        return httpx.Response(200)

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(_gemini(handler, api_key=None).extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.status_code == 503
    assert llamado == []


@pytest.mark.parametrize(
    "status_code,esperado,codigo",
    [(429, 429, "AI_RATE_LIMITED"), (500, 503, "AI_UNAVAILABLE"), (403, 503, "AI_UNAVAILABLE")],
)
def test_gemini_errores_http(status_code, esperado, codigo):
    def handler(request):
        return httpx.Response(status_code, json={"error": {"message": "falla"}})

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(_gemini(handler).extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.status_code == esperado
    assert error.value.code == codigo


def test_gemini_timeout():
    def handler(request):
        raise httpx.ReadTimeout("demora", request=request)

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(_gemini(handler).extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.status_code == 504


def test_gemini_texto_que_no_es_json():
    def handler(request):
        return httpx.Response(
            200, json={"candidates": [{"content": {"parts": [{"text": "El total es $1.500"}]}}]}
        )

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(_gemini(handler).extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.code == "AI_INVALID_RESPONSE"


def test_gemini_imagen_bloqueada_por_seguridad():
    def handler(request):
        return httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(_gemini(handler).extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.code == "RECEIPT_NOT_RECOGNIZED"


def test_gemini_ignora_partes_de_razonamiento():
    def handler(request):
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "Pensando...", "thought": True},
                                {"text": json.dumps(_respuesta_ia())},
                            ]
                        }
                    }
                ]
            },
        )

    resultado = asyncio.run(_gemini(handler).extraer(PNG, "image/png", CATEGORIAS))
    assert resultado["es_comprobante"] is True


# ---------------------------------------------------------------------------
# Modelo de respaldo (RNF-30)
# ---------------------------------------------------------------------------

PRINCIPAL = "gemini-3.8-flash"
RESPALDO = "gemini-3.5-flash-lite"


def _handler_por_modelo(respuestas_principal, pedidos):
    """El principal responde según `respuestas_principal`; el respaldo, bien."""

    def handler(request):
        pedidos.append(str(request.url))
        if PRINCIPAL in str(request.url):
            return respuestas_principal(request)
        return httpx.Response(200, json=_respuesta_gemini(_respuesta_ia(comercio="Respaldo SA")))

    return handler


@pytest.mark.parametrize(
    "respuesta_principal",
    [
        lambda request: httpx.Response(503, json={"error": {"message": "high demand"}}),
        lambda request: httpx.Response(429, json={"error": {"message": "quota"}}),
        lambda request: httpx.Response(404, json={"error": {"message": "model retired"}}),
    ],
    ids=["saturado", "limite_de_uso", "modelo_retirado"],
)
def test_si_el_principal_no_esta_disponible_usa_el_respaldo(respuesta_principal):
    pedidos = []
    extractor = _gemini(
        _handler_por_modelo(respuesta_principal, pedidos), model=PRINCIPAL, fallback_model=RESPALDO
    )

    resultado = asyncio.run(extractor.extraer(PNG, "image/png", CATEGORIAS))

    assert resultado["comercio"] == "Respaldo SA"
    assert [PRINCIPAL in url for url in pedidos] == [True, False]
    assert RESPALDO in pedidos[1]


def test_si_el_principal_demora_usa_el_respaldo():
    def lento(request):
        raise httpx.ReadTimeout("demora", request=request)

    pedidos = []
    extractor = _gemini(
        _handler_por_modelo(lento, pedidos), model=PRINCIPAL, fallback_model=RESPALDO
    )

    resultado = asyncio.run(extractor.extraer(PNG, "image/png", CATEGORIAS))

    assert resultado["comercio"] == "Respaldo SA"


def test_el_respaldo_usa_su_propia_configuracion_de_razonamiento():
    cuerpos = {}

    def handler(request):
        cuerpos[str(request.url)] = json.loads(request.content)
        if PRINCIPAL in str(request.url):
            return httpx.Response(503)
        return httpx.Response(200, json=_respuesta_gemini(_respuesta_ia()))

    extractor = _gemini(handler, model=PRINCIPAL, fallback_model="gemini-2.5-flash")
    asyncio.run(extractor.extraer(PNG, "image/png", CATEGORIAS))

    configs = {url: cuerpo["generationConfig"]["thinkingConfig"] for url, cuerpo in cuerpos.items()}
    assert next(v for k, v in configs.items() if PRINCIPAL in k) == {"thinkingLevel": "low"}
    assert next(v for k, v in configs.items() if "2.5-flash" in k) == {"thinkingBudget": 0}


@pytest.mark.parametrize(
    "respuesta_principal,codigo",
    [
        (
            lambda request: httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}),
            "RECEIPT_NOT_RECOGNIZED",
        ),
        (
            lambda request: httpx.Response(
                200, json={"candidates": [{"content": {"parts": [{"text": "no es json"}]}}]}
            ),
            "AI_INVALID_RESPONSE",
        ),
    ],
    ids=["imagen_bloqueada", "json_invalido"],
)
def test_si_el_principal_respondio_no_se_usa_el_respaldo(respuesta_principal, codigo):
    pedidos = []
    extractor = _gemini(
        _handler_por_modelo(respuesta_principal, pedidos), model=PRINCIPAL, fallback_model=RESPALDO
    )

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(extractor.extraer(PNG, "image/png", CATEGORIAS))

    assert error.value.code == codigo
    assert len(pedidos) == 1


def test_si_ambos_modelos_fallan_informa_no_disponible():
    pedidos = []

    def handler(request):
        pedidos.append(str(request.url))
        return httpx.Response(503, json={"error": {"message": "high demand"}})

    with pytest.raises(ReceiptScanError) as error:
        asyncio.run(
            _gemini(handler, model=PRINCIPAL, fallback_model=RESPALDO).extraer(
                PNG, "image/png", CATEGORIAS
            )
        )

    assert error.value.code == "AI_UNAVAILABLE"
    assert len(pedidos) == 2


@pytest.mark.parametrize("respaldo", [None, "", "   ", PRINCIPAL])
def test_sin_respaldo_valido_hace_un_solo_intento(respaldo):
    pedidos = []

    def handler(request):
        pedidos.append(str(request.url))
        return httpx.Response(503)

    with pytest.raises(ReceiptScanError):
        asyncio.run(
            _gemini(handler, model=PRINCIPAL, fallback_model=respaldo).extraer(
                PNG, "image/png", CATEGORIAS
            )
        )

    assert len(pedidos) == 1


def test_el_respaldo_se_toma_de_la_configuracion(monkeypatch):
    monkeypatch.setattr(settings, "ai_receipt_provider", "gemini")
    monkeypatch.setattr(settings, "ai_receipt_model", PRINCIPAL)
    monkeypatch.setattr(settings, "ai_receipt_fallback_model", RESPALDO)

    extractor = get_receipt_extractor()

    assert extractor.model == PRINCIPAL
    assert extractor.fallback_model == RESPALDO
