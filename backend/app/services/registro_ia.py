import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar
from decimal import Decimal

import app.db.session as session_module
from app.core.config import settings
from app.models.solicitud_ia import SolicitudIA

logger = logging.getLogger(__name__)

SERVICIO_SUGERENCIA_ACTIVIDADES = "sugerencia_actividades"
SERVICIO_ANALISIS_HORARIOS = "analisis_horarios"
SERVICIO_ESCANEO_COMPROBANTES = "escaneo_comprobantes"
SERVICIO_DETECCION_GASTOS_DOCUMENTOS = "deteccion_gastos_documentos"
SERVICIO_GENERACION_PORTADAS = "generacion_portadas"
SERVICIO_RECOMENDACION_ENTRADAS = "recomendacion_entradas"
SERVICIO_ASISTENTE_VIAJE = "asistente_viaje"
SERVICIO_DOCUMENTOS_TAREAS = "documentos_tareas"

UN_MILLON = Decimal(1_000_000)

# Funcionalidad que está usando al proveedor en este momento. El mismo lector de
# comprobantes sirve para el escaneo (US 93) y para detectar gastos al subir un
# documento (US 84): la ruta indica cuál es con `servicio_ia(...)`.
_servicio_actual: ContextVar[str | None] = ContextVar("servicio_ia_actual", default=None)


@contextmanager
def servicio_ia(servicio: str):
    token = _servicio_actual.set(servicio)
    try:
        yield
    finally:
        _servicio_actual.reset(token)


def servicio_actual(por_defecto: str) -> str:
    return _servicio_actual.get() or por_defecto


def _es_modelo_lite(modelo: str) -> bool:
    return "lite" in (modelo or "").lower()


def estimar_costo_usd(
    modelo: str | None,
    tokens_entrada: int | None = None,
    tokens_salida: int | None = None,
    imagenes: int | None = None,
) -> Decimal:
    """Costo estimado de una solicitud con los precios de referencia configurados."""
    if _es_modelo_lite(modelo or ""):
        precio_entrada = settings.ai_cost_lite_input_usd_per_million_tokens
        precio_salida = settings.ai_cost_lite_output_usd_per_million_tokens
    else:
        precio_entrada = settings.ai_cost_input_usd_per_million_tokens
        precio_salida = settings.ai_cost_output_usd_per_million_tokens

    costo = (
        Decimal(tokens_entrada or 0) * Decimal(str(precio_entrada))
        + Decimal(tokens_salida or 0) * Decimal(str(precio_salida))
    ) / UN_MILLON
    costo += Decimal(imagenes or 0) * Decimal(str(settings.ai_cost_image_usd))
    return costo.quantize(Decimal("0.000001"))


def tokens_de_respuesta(data: dict | None) -> tuple[int | None, int | None]:
    """Tokens de entrada y salida informados por Gemini en `usageMetadata`.
    El razonamiento (`thoughtsTokenCount`) se factura como salida."""
    uso = (data or {}).get("usageMetadata") if isinstance(data, dict) else None
    if not isinstance(uso, dict):
        return None, None

    def _entero(clave: str) -> int:
        valor = uso.get(clave)
        return valor if isinstance(valor, int) and valor > 0 else 0

    entrada = _entero("promptTokenCount")
    salida = _entero("candidatesTokenCount") + _entero("thoughtsTokenCount")
    return entrada or None, salida or None


def registrar_solicitud_ia(
    servicio: str,
    modelo: str | None,
    exitosa: bool,
    *,
    duracion_ms: int | None = None,
    tokens_entrada: int | None = None,
    tokens_salida: int | None = None,
    imagenes: int | None = None,
) -> None:
    try:
        with session_module.SessionLocal() as db:
            db.add(
                SolicitudIA(
                    Servicio=servicio,
                    Modelo=(modelo or "desconocido")[:100],
                    Exitosa=exitosa,
                    DuracionMs=duracion_ms,
                    TokensEntrada=tokens_entrada,
                    TokensSalida=tokens_salida,
                    Imagenes=imagenes,
                    CostoEstimadoUSD=estimar_costo_usd(modelo, tokens_entrada, tokens_salida, imagenes),
                )
            )
            db.commit()
    except Exception:
        logger.warning("No se pudo registrar la solicitud de IA (%s)", servicio, exc_info=True)
        return

    try:
        from app.services.backoffice.monitoreo_ia_service import verificar_umbral_costo

        with session_module.SessionLocal() as db:
            verificar_umbral_costo(db)
    except Exception:
        logger.warning("No se pudo verificar el umbral de costo de IA", exc_info=True)


class MedicionSolicitudIA:
    """Datos de una llamada en curso; ver `medir_solicitud_ia`."""

    def __init__(self, servicio: str, modelo: str | None):
        self.servicio = servicio
        self.modelo = modelo
        self.exitosa = False
        self.tokens_entrada: int | None = None
        self.tokens_salida: int | None = None
        self.imagenes: int | None = None

    def usar_respuesta(self, data: dict | None) -> None:
        """Toma los tokens consumidos de la respuesta de Gemini (aunque luego la
        respuesta resulte inválida, el consumo ya ocurrió)."""
        self.tokens_entrada, self.tokens_salida = tokens_de_respuesta(data)


@contextmanager
def medir_solicitud_ia(servicio: str, modelo: str | None):
    """Mide una llamada a un proveedor de IA y la registra al terminar.

    Uso:
        with medir_solicitud_ia(SERVICIO, modelo) as medicion:
            data = ...                 # llamada al proveedor
            medicion.usar_respuesta(data)
            medicion.exitosa = True
    """
    medicion = MedicionSolicitudIA(servicio, modelo)
    inicio = time.monotonic()
    try:
        yield medicion
    finally:
        registrar_solicitud_ia(
            medicion.servicio,
            medicion.modelo,
            medicion.exitosa,
            duracion_ms=int((time.monotonic() - inicio) * 1000),
            tokens_entrada=medicion.tokens_entrada,
            tokens_salida=medicion.tokens_salida,
            imagenes=medicion.imagenes,
        )
