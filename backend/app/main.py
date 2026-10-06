import os
import time

# El servidor corre en UTC: forzamos hora argentina para que date.today()
# y datetime.now() den la fecha local en todo el backend.
os.environ["TZ"] = "America/Argentina/Buenos_Aires"
if hasattr(time, "tzset"):
    time.tzset()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.itinerary import router as itinerary_router
from app.core.config import settings
from app.services.notifications.activity_reminders import (
    start_activity_reminders_scheduler,
    stop_activity_reminders_scheduler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    activity_reminders_task = start_activity_reminders_scheduler()
    try:
        yield
    finally:
        await stop_activity_reminders_scheduler(activity_reminders_task)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    lifespan=lifespan,
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
    # Permite que el front web lea el código de error (p. ej. TRIP_FINISHED).
    expose_headers=["X-Error-Code"],
)


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(itinerary_router)
