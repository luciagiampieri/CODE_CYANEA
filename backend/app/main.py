import os
import time


os.environ["TZ"] = "America/Argentina/Buenos_Aires"
if hasattr(time, "tzset"):
    time.tzset()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.itinerary import router as itinerary_router
from app.api.routes.offline import router as offline_router
from app.core.config import settings
from app.core.diagnostico import (
    MedicionRequestsMiddleware,
    detener_vigilancia_event_loop,
    iniciar_vigilancia_event_loop,
)
from app.services.notifications.activity_reminders import (
    start_activity_reminders_scheduler,
    stop_activity_reminders_scheduler,
)
from app.services.estado_viajes import (
    start_estado_viajes_scheduler,
    stop_estado_viajes_scheduler,
)
from app.services.fin_suscripciones import (
    start_fin_suscripciones_scheduler,
    stop_fin_suscripciones_scheduler,
)
from app.services.resolucion_votaciones import (
    start_resolucion_votaciones_scheduler,
    stop_resolucion_votaciones_scheduler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    activity_reminders_task = start_activity_reminders_scheduler()
    resolucion_votaciones_task = start_resolucion_votaciones_scheduler()
    estado_viajes_task = start_estado_viajes_scheduler()
    fin_suscripciones_task = start_fin_suscripciones_scheduler()
    vigilancia_task = iniciar_vigilancia_event_loop()
    try:
        yield
    finally:
        await detener_vigilancia_event_loop(vigilancia_task)
        await stop_fin_suscripciones_scheduler(fin_suscripciones_task)
        await stop_estado_viajes_scheduler(estado_viajes_task)
        await stop_resolucion_votaciones_scheduler(resolucion_votaciones_task)
        await stop_activity_reminders_scheduler(activity_reminders_task)


ENTORNOS_PRODUCCION = {"production", "produccion", "prod"}


def opciones_documentacion(app_env: str) -> dict:
    """En producción no se publican /docs, /redoc ni el openapi.json."""
    if app_env.strip().lower() in ENTORNOS_PRODUCCION:
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"openapi_url": f"{settings.api_v1_prefix}/openapi.json"}


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    **opciones_documentacion(settings.app_env),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        *settings.cors_origins_list
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Error-Code", "Retry-After"],
)

# Medición temporal (DIAGNOSTICO_RENDIMIENTO=true): se agrega último para quedar por
# fuera de CORS y medir el request completo.
if settings.diagnostico_rendimiento:
    app.add_middleware(MedicionRequestsMiddleware)


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(offline_router, prefix=settings.api_v1_prefix)
app.include_router(itinerary_router)