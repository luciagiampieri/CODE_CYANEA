from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.itinerary import router as itinerary_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
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
)


@app.get("/health", tags=["health"])
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(itinerary_router)