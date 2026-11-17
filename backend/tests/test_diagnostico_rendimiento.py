"""Medición temporal de rendimiento (DIAGNOSTICO_RENDIMIENTO)."""

import asyncio
import logging
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import diagnostico
from app.core.diagnostico import NOMBRE_LOGGER, MedicionRequestsMiddleware, vigilar_event_loop


def _app_de_prueba() -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/trips/{trip_id}")
    def detalle(trip_id: int):
        return {"id": trip_id}

    app.add_middleware(MedicionRequestsMiddleware)
    return app


def test_middleware_loguea_metodo_ruta_codigo_duracion_y_pool(caplog):
    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        with TestClient(_app_de_prueba()) as client:
            response = client.get("/api/v1/trips/42?filtro=privado")

    assert response.status_code == 200
    lineas = [r.getMessage() for r in caplog.records if r.name == NOMBRE_LOGGER]
    assert len(lineas) == 1
    linea = lineas[0]
    # Plantilla de la ruta, sin el id ni la query string.
    assert linea.startswith("GET /api/v1/trips/{trip_id} 200 ")
    assert "42" not in linea.split(" ")[1]
    assert "filtro" not in linea
    assert "ms pool=[" in linea
    assert "hilos=" in linea


def test_middleware_loguea_el_codigo_de_error(caplog):
    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        with TestClient(_app_de_prueba()) as client:
            response = client.get("/no-existe")

    assert response.status_code == 404
    lineas = [r.getMessage() for r in caplog.records if r.name == NOMBRE_LOGGER]
    assert lineas and lineas[0].startswith("GET /no-existe 404 ")


def test_el_middleware_solo_se_monta_con_la_variable_activa():
    from app.core.config import settings
    from app.main import app

    montado = any(m.cls is MedicionRequestsMiddleware for m in app.user_middleware)
    assert montado is settings.diagnostico_rendimiento


def test_con_la_variable_apagada_no_arranca_la_vigilancia(monkeypatch):
    monkeypatch.setattr(diagnostico.settings, "diagnostico_rendimiento", False)

    async def iniciar():
        return diagnostico.iniciar_vigilancia_event_loop()

    assert asyncio.run(iniciar()) is None


def test_vigilancia_avisa_cuando_el_event_loop_se_bloquea(caplog):
    async def escenario():
        tarea = asyncio.create_task(vigilar_event_loop(intervalo=0.05, umbral=0.1))
        await asyncio.sleep(0.02)
        time.sleep(0.3)  # bloquea el event loop
        await asyncio.sleep(0.1)
        await diagnostico.detener_vigilancia_event_loop(tarea)

    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        asyncio.run(escenario())

    avisos = [
        r.getMessage()
        for r in caplog.records
        if r.name == NOMBRE_LOGGER and r.levelno == logging.WARNING
    ]
    assert avisos and "El event loop se demoró" in avisos[0]


def test_vigilancia_no_avisa_si_el_event_loop_responde(caplog):
    async def escenario():
        tarea = asyncio.create_task(vigilar_event_loop(intervalo=0.05, umbral=0.2))
        await asyncio.sleep(0.2)
        await diagnostico.detener_vigilancia_event_loop(tarea)

    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        asyncio.run(escenario())

    assert not [
        r for r in caplog.records if r.name == NOMBRE_LOGGER and r.levelno == logging.WARNING
    ]
