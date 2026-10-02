"""Validaciones y reglas de negocio del escaneo de comprobantes (US 93).

Independientes del proveedor de IA: toda respuesta pasa por acá antes de
llegar al usuario (RNF-32).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from pydantic import ValidationError

from app.services.cover_ai import detect_image_mime
from app.services.receipt_ai.base import (
    AI_INVALID_RESPONSE,
    MENSAJE_NO_RECONOCIDO,
    MENSAJE_RESPUESTA_INVALIDA,
    RECEIPT_INVALID_FORMAT,
    RECEIPT_NOT_RECOGNIZED,
    RECEIPT_TOO_LARGE,
    ExtraccionComprobanteIA,
    ReceiptScanError,
)

MAX_RECEIPT_BYTES = 10 * 1024 * 1024  # AC3: 10 MB

# Gastos.Monto es Numeric(12, 2).
MONTO_MAXIMO = Decimal("9999999999.99")
LARGO_MAXIMO_NOMBRE = 150  # Gastos.Nombre es String(150)

# Una fecha más vieja que esto probablemente es un año mal leído: se precarga
# igual, pero se marca para revisión.
ANTIGUEDAD_SOSPECHOSA = timedelta(days=365)

# CUIT/CUIL (con o sin guiones): se quita del nombre por privacidad.
_PATRON_CUIT = re.compile(r"\b\d{2}-?\d{8}-?\d\b")

# Nombres de campo tal como los usa GastoCreate, para que el frontend los
# vuelque directo en el formulario.
CAMPO_NOMBRE = "Nombre"
CAMPO_MONTO = "MontoOriginal"
CAMPO_MONEDA = "MonedaOriginal"
CAMPO_FECHA = "FechaGasto"
CAMPO_CATEGORIA = "IdCategoria"


@dataclass
class ResultadoEscaneo:
    Nombre: str | None = None
    MontoOriginal: Decimal | None = None
    MonedaOriginal: str | None = None
    FechaGasto: date | None = None
    IdCategoria: int | None = None
    CamposBajaConfianza: list[str] = field(default_factory=list)


def validar_documento(contenido: bytes, nombre_archivo: str = "") -> str:
    """Valida tamaño y formato. Devuelve el tipo MIME."""
    if not contenido:
        raise ReceiptScanError("No se recibió ningún documento.", 400, RECEIPT_INVALID_FORMAT)
    if len(contenido) > MAX_RECEIPT_BYTES:
        raise ReceiptScanError(
            "El documento supera el tamaño máximo de 10 MB.", 413, RECEIPT_TOO_LARGE
        )
    
    # Verificamos si la firma de los bytes corresponde a un PDF (%PDF-)
    if contenido.startswith(b"%PDF-"):
        return "application/pdf"
    
    mime = detect_image_mime(contenido)
    if mime is None:
        raise ReceiptScanError(
            "Formato no soportado. Solo se permiten imágenes JPG, JPEG, PNG o documentos PDF.",
            415,
            RECEIPT_INVALID_FORMAT,
        )
    return mime


def validar_esquema(crudo: dict) -> ExtraccionComprobanteIA:
    try:
        return ExtraccionComprobanteIA.model_validate(crudo)
    except ValidationError:
        raise ReceiptScanError(MENSAJE_RESPUESTA_INVALIDA, 502, AI_INVALID_RESPONSE)


def _limpiar_nombre(comercio: str | None) -> str | None:
    if not comercio:
        return None
    limpio = _PATRON_CUIT.sub("", comercio)
    limpio = re.sub(r"\s+", " ", limpio).strip(" -·,.")
    if len(limpio) < 2:
        return None
    return limpio[:LARGO_MAXIMO_NOMBRE].strip()


def _normalizar_monto(monto: Decimal | None) -> Decimal | None:
    if monto is None:
        return None
    try:
        valor = monto.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, AttributeError):
        return None
    if valor <= 0 or valor > MONTO_MAXIMO:
        return None
    return valor


def construir_resultado(
    extraccion: ExtraccionComprobanteIA,
    categorias: dict[str, int],
    monedas: set[str],
    hoy: date | None = None,
) -> ResultadoEscaneo:
    """Aplica las reglas de negocio sobre una extracción ya validada.

    `categorias` mapea nombre -> IdCategoria (solo activas) y `monedas` son
    los códigos existentes en la tabla Monedas.

    Un campo que no se puede usar queda vacío (AC9); un campo usable pero
    dudoso se informa en `CamposBajaConfianza` (AC10).
    """
    if not extraccion.es_comprobante or not extraccion.legible:
        raise ReceiptScanError(MENSAJE_NO_RECONOCIDO, 422, RECEIPT_NOT_RECOGNIZED)

    hoy = hoy or date.today()
    conf = extraccion.confianza
    resultado = ResultadoEscaneo()
    dudosos: set[str] = set()

    # Nombre del gasto = nombre del comercio (AC11).
    resultado.Nombre = _limpiar_nombre(extraccion.comercio)
    if resultado.Nombre and conf.comercio == "baja":
        dudosos.add(CAMPO_NOMBRE)

    # Monto total (AC7, AC8).
    resultado.MontoOriginal = _normalizar_monto(extraccion.monto_total)
    if resultado.MontoOriginal is not None and conf.monto_total == "baja":
        dudosos.add(CAMPO_MONTO)

    # Fecha: nunca futura (misma regla que registrar gasto).
    if extraccion.fecha:
        try:
            fecha = date.fromisoformat(extraccion.fecha.strip()[:10])
        except ValueError:
            fecha = None
        if fecha is not None and fecha <= hoy:
            resultado.FechaGasto = fecha
            if conf.fecha == "baja" or hoy - fecha > ANTIGUEDAD_SOSPECHOSA:
                dudosos.add(CAMPO_FECHA)

    # Moneda: solo códigos que existen en el sistema.
    if extraccion.moneda:
        codigo = extraccion.moneda.strip().upper()
        if codigo in monedas:
            resultado.MonedaOriginal = codigo
            # Si la moneda se infirió (por ejemplo solo figuraba "$"), se pide revisarla.
            if conf.moneda == "baja" or not extraccion.moneda_explicita:
                dudosos.add(CAMPO_MONEDA)

    # Categoría sugerida entre las predefinidas.
    if extraccion.categoria:
        por_nombre = {nombre.casefold(): id_cat for nombre, id_cat in categorias.items()}
        id_categoria = por_nombre.get(extraccion.categoria.strip().casefold())
        if id_categoria is not None:
            resultado.IdCategoria = id_categoria
            if conf.categoria == "baja":
                dudosos.add(CAMPO_CATEGORIA)

    orden = [CAMPO_NOMBRE, CAMPO_MONTO, CAMPO_MONEDA, CAMPO_FECHA, CAMPO_CATEGORIA]
    resultado.CamposBajaConfianza = [campo for campo in orden if campo in dudosos]
    return resultado
