"""Medición temporal de rendimiento (DIAGNOSTICO_RENDIMIENTO)."""

import asyncio
import logging
import time

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.core import diagnostico
from app.core.diagnostico import (
    NOMBRE_LOGGER,
    MedicionRequestsMiddleware,
    instrumentar_engine,
    vigilar_event_loop,
)


def _engine_de_prueba():
    # SQLite en memoria con el pool por defecto (una conexión por hilo): los requests
    # en paralelo no comparten la conexión.
    return create_engine("sqlite://")


def _app_de_prueba(engine=None) -> FastAPI:
    engine = engine or _engine_de_prueba()
    app = FastAPI()

    @app.get("/api/v1/trips/{trip_id}")
    def detalle(trip_id: int):
        return {"id": trip_id}

    @app.get("/consultas/{cantidad}")
    def consultas(cantidad: int, espera: float = 0.0):
        # Endpoint `def`: corre en el threadpool, como los de la app.
        with engine.connect() as conn:
            for _ in range(cantidad):
                conn.execute(text("SELECT 1"))
                if espera:
                    time.sleep(espera)
        return {"ok": True}

    app.add_middleware(MedicionRequestsMiddleware, engine=engine)
    return app


def _lineas(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == NOMBRE_LOGGER]


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
    assert " sql=0 sql_ms=0 sql_max_ms=0 conexiones_nuevas=0 pool=[" in linea
    assert "hilos=" in linea


def test_middleware_cuenta_las_consultas_sql_del_request(caplog):
    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        with TestClient(_app_de_prueba()) as client:
            response = client.get("/consultas/3")

    assert response.status_code == 200
    lineas = _lineas(caplog)
    assert len(lineas) == 1
    assert lineas[0].startswith("GET /consultas/{cantidad} 200 ")
    assert " sql=3 " in lineas[0]
    assert " sql_ms=" in lineas[0] and " sql_max_ms=" in lineas[0]
    # El engine es nuevo: la primera consulta abre la conexión del hilo.
    assert " conexiones_nuevas=1 " in lineas[0]


def test_requests_en_paralelo_no_mezclan_sus_consultas(caplog):
    app = _app_de_prueba()

    async def escenario():
        transporte = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transporte, base_url="http://test") as client:
            return await asyncio.gather(
                client.get("/consultas/3", params={"espera": 0.05}),
                client.get("/consultas/1", params={"espera": 0.05}),
            )

    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        respuestas = asyncio.run(escenario())

    assert [r.status_code for r in respuestas] == [200, 200]
    lineas = _lineas(caplog)
    assert len(lineas) == 2
    assert sorted(" sql=3 " in linea for linea in lineas) == [False, True]
    assert sorted(" sql=1 " in linea for linea in lineas) == [False, True]


def test_consultas_fuera_de_un_request_no_se_cuentan_ni_fallan(caplog):
    engine = _engine_de_prueba()
    instrumentar_engine(engine)
    instrumentar_engine(engine)  # registrar dos veces no duplica los eventos

    with caplog.at_level(logging.INFO, logger=NOMBRE_LOGGER):
        with engine.connect() as conn:
            assert conn.execute(text("SELECT 1")).scalar() == 1

    assert _lineas(caplog) == []
    assert diagnostico._medicion_sql.get() is None


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
