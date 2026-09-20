"""Generación de imágenes de portada de viaje mediante IA (US 57).

Proveedor: Cloudflare Workers AI (modelo FLUX.1 schnell), que ofrece una
asignación diaria gratuita. Con AI_COVER_MOCK=true no se llama a ningún
servicio externo y se devuelve una imagen de prueba, útil para desarrollar y
probar el flujo completo sin consumir cuota.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import re
import struct
import zlib
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

CLOUDFLARE_RUN_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"

MAX_COVER_BYTES = 5 * 1024 * 1024


class CoverGenerationError(Exception):
    """Error al generar la imagen. `message` es apto para mostrar al usuario."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class GeneratedCover:
    content: bytes
    mime_type: str


def detect_image_mime(content: bytes) -> str | None:
    """Devuelve el tipo MIME según la firma real del archivo (solo PNG y JPEG)."""
    if content.startswith(PNG_SIGNATURE):
        return "image/png"
    if content.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    return None


def extension_for_mime(mime_type: str) -> str:
    return "png" if mime_type == "image/png" else "jpg"


def build_cover_prompt(title: str, destinations: list[str], extra: str | None = None) -> str:
    """Arma el prompt a partir de los destinos y/o el nombre del viaje (AC1) y
    la indicación adicional opcional (AC2)."""
    lugares = ", ".join(d.strip() for d in destinations if d and d.strip())
    # Se quitan años del título (p. ej. "Miami 2027"): el modelo tiende a dibujarlos como texto.
    titulo = re.sub(r"\b(19|20)\d{2}\b", "", title or "").strip(" -+·,")
    tema = lugares or titulo or "a beautiful travel destination"

    partes = [
        f"Beautiful travel cover photograph of {tema}.",
        "Iconic scenery, wide landscape composition, natural light, vivid colors,",
        "professional travel photography, high detail.",
        "No text, no letters, no watermark, no logos.",
    ]
    if lugares and titulo:
        partes.insert(1, f"Theme of the trip: {titulo}.")
    if extra and extra.strip():
        partes.append(f"Additional guidance from the user: {extra.strip()}.")

    return " ".join(partes)[:2000]


def _mock_png(seed: str, width: int = 768, height: int = 432) -> bytes:
    """PNG de degradado vertical generado solo con la librería estándar."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    c1 = digest[0:3]
    c2 = digest[3:6]

    filas = bytearray()
    for y in range(height):
        t = y / (height - 1)
        pixel = bytes(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
        filas.append(0)  # filtro "None" de la fila
        filas.extend(pixel * width)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        PNG_SIGNATURE
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(filas), 6))
        + chunk(b"IEND", b"")
    )


async def _generate_mock(prompt: str) -> GeneratedCover:
    await asyncio.sleep(1.5)  # simula la demora para poder ver el indicador de carga
    # Se agrega la hora para que cada "regeneración" cambie de color.
    semilla = f"{prompt}|{asyncio.get_running_loop().time()}"
    return GeneratedCover(content=_mock_png(semilla), mime_type="image/png")


async def _generate_cloudflare(prompt: str) -> GeneratedCover:
    if not settings.cloudflare_account_id or not settings.cloudflare_api_token:
        raise CoverGenerationError(
            "La generación de imágenes con IA no está configurada.",
            status_code=503,
        )

    url = CLOUDFLARE_RUN_URL.format(
        account_id=settings.cloudflare_account_id,
        model=settings.ai_image_model,
    )

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {settings.cloudflare_api_token}"},
                json={"prompt": prompt, "steps": 4},
            )
    except httpx.TimeoutException:
        raise CoverGenerationError(
            "El servicio de generación tardó demasiado en responder. Intenta nuevamente.",
            status_code=504,
        )
    except httpx.HTTPError as error:
        logger.warning("Error de red al generar portada con IA: %s", error)
        raise CoverGenerationError(
            "No se pudo conectar con el servicio de generación de imágenes."
        )

    if response.status_code != 200:
        detalle = response.text[:300]
        logger.warning(
            "Cloudflare Workers AI respondió %s al generar portada: %s",
            response.status_code,
            detalle,
        )
        limite_agotado = response.status_code == 429 or "neurons" in detalle.lower()
        if limite_agotado:
            raise CoverGenerationError(
                "Se alcanzó el límite diario de generación de imágenes. Intenta nuevamente mañana.",
                status_code=429,
            )
        raise CoverGenerationError("No se pudo generar la imagen. Intenta nuevamente.")

    try:
        imagen_b64 = response.json()["result"]["image"]
        contenido = base64.b64decode(imagen_b64, validate=True)
    except Exception:
        logger.warning("Respuesta inesperada de Cloudflare Workers AI al generar portada")
        raise CoverGenerationError("El servicio devolvió una respuesta inválida.")

    mime = detect_image_mime(contenido)
    if mime is None or len(contenido) > MAX_COVER_BYTES:
        raise CoverGenerationError("El servicio devolvió una imagen inválida.")

    return GeneratedCover(content=contenido, mime_type=mime)


async def generate_cover_image(prompt: str) -> GeneratedCover:
    if settings.ai_cover_mock:
        return await _generate_mock(prompt)
    return await _generate_cloudflare(prompt)
