"""Medición temporal de rendimiento, activada con DIAGNOSTICO_RENDIMIENTO=true.

- `MedicionRequestsMiddleware` loguea cada request HTTP: método, ruta, código,
  duración, estado del pool de conexiones y hilos del threadpool en uso.
- `vigilar_event_loop` avisa cuando el event loop se demora más de lo esperado, lo
  que indica trabajo bloqueante (consultas sincrónicas, llamadas sin await) en él.

Está apagada por defecto y es para diagnosticar en producción: no deja datos de
usuarios, solo la plantilla de la ruta (`/trips/{trip_id}`), sin query string.
"""

import asyncio
import logging
import os
import sys
import time

import anyio.to_thread

from app.core.config import settings

NOMBRE_LOGGER = "cyanea.diagnostico"
INTERVALO_VIGILANCIA_SEGUNDOS = 1.0
UMBRAL_DEMORA_SEGUNDOS = 0.2

logger = logging.getLogger(NOMBRE_LOGGER)


def _configurar_logger() -> None:
    """uvicorn solo configura sus propios loggers: sin un handler propio, los
    mensajes de la app no aparecen en los logs de Railway."""
    if any(getattr(h, "_cyanea_diagnostico", False) for h in logger.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [diagnostico] %(message)s"))
    handler._cyanea_diagnostico = True
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def diagnostico_activo() -> bool:
    return settings.diagnostico_rendimiento


def _estado_pool() -> str:
    from app.db.session import engine

    try:
        return engine.pool.status()
    except Exception:
        return "no disponible"


def _hilos_en_uso() -> str:
    try:
        limitador = anyio.to_thread.current_default_thread_limiter()
        return f"{limitador.borrowed_tokens}/{int(limitador.total_tokens)}"
    except Exception:
        return "no disponible"


def _ruta(scope) -> str:
    route = scope.get("route")
    plantilla = getattr(route, "path", None)
    if plantilla:
        return f"{scope.get('root_path', '')}{plantilla}"
    return scope.get("path", "")


class MedicionRequestsMiddleware:
    """Middleware ASGI puro: no envuelve la respuesta como BaseHTTPMiddleware ni toca
    los WebSocket."""

    def __init__(self, app):
        self.app = app
        _configurar_logger()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inicio = time.perf_counter()
        codigo = {"valor": 500}

        async def send_con_codigo(mensaje):
            if mensaje["type"] == "http.response.start":
                codigo["valor"] = mensaje["status"]
            await send(mensaje)

        try:
            await self.app(scope, receive, send_con_codigo)
        finally:
            duracion_ms = (time.perf_counter() - inicio) * 1000
            logger.info(
                "%s %s %s %.0fms pool=[%s] hilos=%s",
                scope.get("method", ""),
                _ruta(scope),
                codigo["valor"],
                duracion_ms,
                _estado_pool(),
                _hilos_en_uso(),
            )


async def vigilar_event_loop(
    intervalo: float = INTERVALO_VIGILANCIA_SEGUNDOS,
    umbral: float = UMBRAL_DEMORA_SEGUNDOS,
) -> None:
    """Duerme `intervalo` segundos y mide cuánto tardó en volver: si el loop estuvo
    bloqueado, `asyncio.sleep` vuelve tarde y se registra la demora."""
    _configurar_logger()
    loop = asyncio.get_running_loop()
    while True:
        inicio = loop.time()
        await asyncio.sleep(intervalo)
        demora = loop.time() - inicio - intervalo
        if demora > umbral:
            logger.warning(
                "El event loop se demoró %.0fms (pool=[%s] hilos=%s)",
                demora * 1000,
                _estado_pool(),
                _hilos_en_uso(),
            )


def iniciar_vigilancia_event_loop() -> asyncio.Task | None:
    if not diagnostico_activo() or "PYTEST_CURRENT_TEST" in os.environ:
        return None
    return asyncio.create_task(vigilar_event_loop(), name="vigilancia_event_loop")


async def detener_vigilancia_event_loop(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
