"""Medición temporal de rendimiento, activada con DIAGNOSTICO_RENDIMIENTO=true.

- `MedicionRequestsMiddleware` loguea cada request HTTP: método, ruta, código,
  duración, consultas SQL (cantidad, tiempo total y la más lenta), conexiones nuevas
  a la base, estado del pool de conexiones y hilos del threadpool en uso.
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
from contextvars import ContextVar

import anyio.to_thread
from sqlalchemy import event

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


# Medición SQL del request en curso. El middleware la crea al empezar cada request y
# la descarta al terminar. Los endpoints `def` y las dependencias corren en el
# threadpool con una copia del contexto que apunta al mismo dict, así que suman a su
# request y no se mezclan con otros en paralelo. Fuera de un request (schedulers,
# WebSocket) vale None y no se cuenta nada.
_medicion_sql: ContextVar[dict | None] = ContextVar("cyanea_medicion_sql", default=None)
_CLAVE_INICIO = "cyanea_diagnostico_inicio"


def _nueva_medicion() -> dict:
    return {"consultas": 0, "ms": 0.0, "max_ms": 0.0, "conexiones_nuevas": 0}


def _antes_de_consulta(conn, cursor, statement, parameters, context, executemany):
    if _medicion_sql.get() is not None:
        conn.info[_CLAVE_INICIO] = time.perf_counter()


def _despues_de_consulta(conn, cursor, statement, parameters, context, executemany):
    medicion = _medicion_sql.get()
    inicio = conn.info.pop(_CLAVE_INICIO, None)
    if medicion is None or inicio is None:
        return
    duracion_ms = (time.perf_counter() - inicio) * 1000
    medicion["consultas"] += 1
    medicion["ms"] += duracion_ms
    medicion["max_ms"] = max(medicion["max_ms"], duracion_ms)


def _al_conectar(dbapi_connection, connection_record):
    medicion = _medicion_sql.get()
    if medicion is not None:
        medicion["conexiones_nuevas"] += 1


def instrumentar_engine(engine) -> None:
    """Registra (una sola vez por engine) los eventos que miden las consultas y las
    conexiones nuevas. El `SELECT 1` de `pool_pre_ping` no pasa por estos eventos."""
    if event.contains(engine, "after_cursor_execute", _despues_de_consulta):
        return
    event.listen(engine, "before_cursor_execute", _antes_de_consulta)
    event.listen(engine, "after_cursor_execute", _despues_de_consulta)
    event.listen(engine, "connect", _al_conectar)


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

    def __init__(self, app, engine=None):
        self.app = app
        _configurar_logger()
        if engine is None:
            from app.db.session import engine as engine_app

            engine = engine_app
        instrumentar_engine(engine)

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

        medicion = _nueva_medicion()
        token = _medicion_sql.set(medicion)
        try:
            await self.app(scope, receive, send_con_codigo)
        finally:
            _medicion_sql.reset(token)
            duracion_ms = (time.perf_counter() - inicio) * 1000
            logger.info(
                "%s %s %s %.0fms sql=%d sql_ms=%.0f sql_max_ms=%.0f conexiones_nuevas=%d "
                "pool=[%s] hilos=%s",
                scope.get("method", ""),
                _ruta(scope),
                codigo["valor"],
                duracion_ms,
                medicion["consultas"],
                medicion["ms"],
                medicion["max_ms"],
                medicion["conexiones_nuevas"],
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
