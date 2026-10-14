"""Respaldo con la búsqueda de Google integrada en Gemini ("Grounding with Google Search").

Se usa solo cuando el sitio oficial no se pudo leer (por ejemplo, porque bloquea
pedidos automáticos o se arma con JavaScript) o no dejó una recomendación
confirmada. Gemini busca en Google si hace falta comprar entradas o reservar y
devuelve las fuentes que usó (`groundingMetadata.groundingChunks`).

La respuesta solo se acepta si alguna de esas fuentes es del dominio oficial del
lugar (el `websiteUri` de Google Places): una búsqueda que solo cita blogs,
agregadores o revendedores no genera recomendación. El enlace que se muestra es
siempre del sitio oficial.

Requiere facturación activa en la clave de Gemini (la búsqueda no está disponible
en el plan gratuito). Se activa con `AI_ENTRADAS_BUSQUEDA_GOOGLE`.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

import httpx

from app.core.config import settings
from app.services.entradas_ai import sitio_oficial
from app.services.entradas_ai.tipos import ErrorAnalisisEntradas
from app.services.receipt_ai.gemini import GEMINI_URL, _config_razonamiento

logger = logging.getLogger(__name__)

TIPOS_BUSQUEDA = ("RESERVA", "ENTRADAS_ANTICIPADAS", "ENTRADAS_PRESENCIALES", "SIN_INFORMACION")
NIVELES_RESERVA = ("obligatoria", "recomendada", "posible")


@dataclass
class ResultadoBusqueda:
    tipo: str
    nivel_reserva: str | None = None
    resumen_es: str | None = None
    url_entradas: str | None = None
    url_reserva: str | None = None
    # Dominios de las fuentes que usó Google (el título de cada fuente es su dominio).
    dominios_fuentes: list[str] = field(default_factory=list)


def construir_prompt(nombre_lugar: str, url_oficial: str) -> str:
    dominio = sitio_oficial.dominio_base(sitio_oficial._host(url_oficial) or "")
    return f"""Buscá en Google información oficial sobre cómo visitar este lugar:
Lugar: "{nombre_lugar}"
Sitio web oficial: {url_oficial} (dominio {dominio})

Quiero saber, según el sitio oficial del lugar, si para visitarlo:
- RESERVA: hay que reservar o conviene reservar (visita, turno o mesa);
- ENTRADAS_ANTICIPADAS: hay que comprar o conviene comprar las entradas antes, online;
- ENTRADAS_PRESENCIALES: las entradas se compran solo en el lugar (boletería);
- SIN_INFORMACION: no lo encontrás en fuentes oficiales.

Reglas:
1. Usá como fuente el sitio oficial ({dominio}). No uses blogs, foros, agregadores ni revendedores de entradas.
2. Si no lo podés confirmar con el sitio oficial, respondé SIN_INFORMACION.
3. "nivel_reserva" solo con RESERVA: "obligatoria", "recomendada" o "posible" (se puede reservar pero no hace falta).
4. "url_entradas" y "url_reserva": la página del sitio oficial para comprar entradas o reservar, si la encontrás. Nunca un enlace de otro dominio. Si no hay, null.
5. "resumen_es": una oración en español que diga qué indica el sitio oficial.

Respondé SOLO con un objeto JSON, sin texto adicional, con este formato:
{{"tipo": "...", "nivel_reserva": null, "resumen_es": "...", "url_entradas": null, "url_reserva": null}}
"""


def _extraer_json(texto: str) -> dict:
    """El modelo puede envolver el JSON en ```json ... ``` o agregar texto alrededor."""
    match = re.search(r"\{.*\}", texto or "", re.DOTALL)
    if not match:
        raise ErrorAnalisisEntradas("la búsqueda no devolvió JSON")
    try:
        datos = json.loads(match.group(0))
    except ValueError as error:
        raise ErrorAnalisisEntradas("JSON ilegible en la búsqueda") from error
    if not isinstance(datos, dict):
        raise ErrorAnalisisEntradas("JSON sin el formato esperado en la búsqueda")
    return datos


def _texto_opcional(valor) -> str | None:
    return valor.strip() if isinstance(valor, str) and valor.strip() else None


def interpretar_respuesta(data: dict) -> ResultadoBusqueda:
    candidatos = data.get("candidates") or []
    if not candidatos:
        raise ErrorAnalisisEntradas("la búsqueda no devolvió candidatos")
    candidato = candidatos[0]
    partes = (candidato.get("content") or {}).get("parts") or []
    texto = "".join(p.get("text", "") for p in partes if not p.get("thought"))
    crudo = _extraer_json(texto)

    tipo = crudo.get("tipo")
    if tipo not in TIPOS_BUSQUEDA:
        raise ErrorAnalisisEntradas(f"tipo desconocido en la búsqueda: {tipo!r}")
    nivel = crudo.get("nivel_reserva")

    dominios = []
    for chunk in (candidato.get("groundingMetadata") or {}).get("groundingChunks") or []:
        web = chunk.get("web") or {}
        titulo = (web.get("title") or "").strip().lower()
        # El título de la fuente es su dominio ("brooklynmuseum.org"); la URI es una
        # redirección de Google, así que no sirve para identificar el sitio.
        if titulo and "." in titulo and " " not in titulo:
            dominios.append(titulo.removeprefix("www."))
    return ResultadoBusqueda(
        tipo=tipo,
        nivel_reserva=nivel if nivel in NIVELES_RESERVA else None,
        resumen_es=_texto_opcional(crudo.get("resumen_es")),
        url_entradas=_texto_opcional(crudo.get("url_entradas")),
        url_reserva=_texto_opcional(crudo.get("url_reserva")),
        dominios_fuentes=dominios,
    )


def fuente_oficial(resultado: ResultadoBusqueda, url_oficial: str) -> str | None:
    """Dominio de una fuente de la búsqueda que pertenece al sitio oficial, o None."""
    base_oficial = sitio_oficial.dominio_base(sitio_oficial._host(url_oficial) or "")
    for dominio in resultado.dominios_fuentes:
        if base_oficial and sitio_oficial.dominio_base(dominio) == base_oficial:
            return dominio
    return None


class BuscadorGoogleEntradas:
    def __init__(
        self,
        api_key: str | None,
        model: str,
        timeout_seconds: float,
        verify_ssl: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.verify_ssl = verify_ssl
        self.transport = transport

    async def buscar(self, nombre_lugar: str, url_oficial: str) -> ResultadoBusqueda:
        if not self.api_key:
            raise ErrorAnalisisEntradas("GEMINI_API_KEY no configurada")
        generation_config: dict = {"temperature": 0}
        razonamiento = _config_razonamiento(self.model)
        if razonamiento:
            generation_config["thinkingConfig"] = razonamiento
        pedido = {
            "contents": [{"role": "user", "parts": [{"text": construir_prompt(nombre_lugar, url_oficial)}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": generation_config,
        }
        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout_seconds, connect=min(5.0, self.timeout_seconds)),
                verify=self.verify_ssl,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    GEMINI_URL.format(model=self.model),
                    headers={"x-goog-api-key": self.api_key},
                    json=pedido,
                )
        except httpx.HTTPError as error:
            raise ErrorAnalisisEntradas(f"búsqueda: error de red o tiempo agotado ({type(error).__name__})") from error
        if response.status_code != 200:
            # 400/403 suele ser la búsqueda no habilitada (plan gratuito); 429, cuota.
            raise ErrorAnalisisEntradas(f"búsqueda: HTTP {response.status_code}")
        try:
            data = response.json()
        except ValueError as error:
            raise ErrorAnalisisEntradas("búsqueda: respuesta ilegible") from error
        return interpretar_respuesta(data)


def construir_buscador() -> BuscadorGoogleEntradas:
    return BuscadorGoogleEntradas(
        api_key=settings.gemini_api_key,
        model=settings.ai_entradas_model or settings.ai_receipt_model,
        timeout_seconds=settings.ai_entradas_busqueda_timeout_seconds,
        verify_ssl=settings.gemini_verify_ssl,
    )
