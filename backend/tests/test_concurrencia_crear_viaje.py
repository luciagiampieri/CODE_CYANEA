"""Creaciones de viaje concurrentes del mismo usuario (QA: deadlock que colgaba el backend).

`create_trip` es `async def` y usa la Session síncrona. Antes bloqueaba al usuario
(`validar_viajes_activos`, SELECT ... FOR UPDATE) y después hacía `await` para resolver la
portada: un segundo request esperaba ese lock dentro del event loop y el primero ya no
podía terminar.

SQLite no tiene FOR UPDATE, así que el lock del usuario se simula con un `threading.Lock`
que se libera al terminar la transacción de la sesión, igual que en PostgreSQL. La espera
tiene un tope (como `lock_timeout`): si el event loop queda trabado, el request que espera
falla y el test lo detecta.
"""

import asyncio
import threading
from collections import defaultdict
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from app.api.routes import trips as trips_routes
from app.core.security import create_access_token, hash_password
from app.db.session import Base, get_db
from app.main import app
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.moneda import Moneda
from app.models.plan import Plan
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes
from app.services.mail import get_mail_service

ESPERA_MAXIMA_LOCK = 5  # segundos, como el lock_timeout del engine


class _MailFalso:
    def send_template(self, **kwargs):
        pass

    def send_html(self, **kwargs):
        pass


@pytest.fixture()
def sesiones(tmp_path):
    """Base SQLite en archivo: cada request concurrente usa su propia conexión."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'concurrencia.db'}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    Base.metadata.create_all(bind=engine)
    fabrica = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with fabrica() as db:
        db.add_all(
            [
                Plan(IdPlan=1, Nombre="gratuito", MaxParticipantesViaje=3, MaxViajesActivos=5,
                     MaxSugerenciasDiarias=10, MaxEscaneosMensuales=3, MaxAlmacenamientoMb=100,
                     Activo=True),
                *[EstadoViaje(Nombre=n, Activo=True) for n in ("activo", "finalizado", "cancelado", "eliminado")],
                *[
                    EstadoParticipacion(Nombre=n, Descripcion=n, Activo=True)
                    for n in ("invitado", "aceptado", "rechazado", "expulsado", "salio", "cancelada")
                ],
                *[
                    EstadoInvitacion(Nombre=n, Descripcion=n, Activo=True)
                    for n in ("pendiente", "aceptada", "vencida", "cancelada")
                ],
                Moneda(Codigo="ARS", Nombre="Peso argentino"),
                RolParticipante(Nombre="administrador", Descripcion="admin", Activo=True),
                RolParticipante(Nombre="participante", Descripcion="part", Activo=True),
                Usuario(
                    Nombre="Ana",
                    Apellido="Concurrente",
                    NombreUsuario="ana_concurrente",
                    Email="ana@concurrente.com",
                    HashedPassword=hash_password("Password123!"),
                    Activo=True,
                    EmailConfirmado=True,
                ),
            ]
        )
        db.commit()

    yield fabrica
    engine.dispose()


@pytest.fixture()
def lock_de_usuario_simulado(sesiones, monkeypatch):
    """Reemplaza el FOR UPDATE del usuario por un lock que dura hasta el fin de la transacción."""
    locks: dict[int, threading.Lock] = defaultdict(threading.Lock)

    def bloquear_usuario(db, id_usuario):
        lock = locks[id_usuario]
        if not lock.acquire(timeout=ESPERA_MAXIMA_LOCK):
            raise TimeoutError("lock_timeout: el lock del usuario no se liberó a tiempo")
        db.info.setdefault("locks_simulados", []).append(lock)

    def liberar(session, transaccion):
        if transaccion.parent is None:
            for lock in session.info.pop("locks_simulados", []):
                lock.release()

    event.listen(sesiones, "after_transaction_end", liberar)
    monkeypatch.setattr(limites_planes, "_bloquear_usuario", bloquear_usuario)
    yield
    event.remove(sesiones, "after_transaction_end", liberar)


@pytest.fixture()
def app_concurrente(sesiones, lock_de_usuario_simulado, monkeypatch):
    def get_db_test():
        db = sesiones()
        try:
            yield db
        finally:
            db.close()

    async def portada_lenta(destinations):
        # Simula la consulta a Google Places: cede el event loop un rato.
        await asyncio.sleep(0.2)
        return "place-portada"

    monkeypatch.setattr(trips_routes, "_resolve_cover_place_id", portada_lenta)
    app.dependency_overrides[get_db] = get_db_test
    app.dependency_overrides[get_mail_service] = lambda: _MailFalso()
    yield
    app.dependency_overrides.clear()


def _payload(numero: int) -> dict:
    inicio = date.today() + timedelta(days=30)
    return {
        "title": f"Viaje {numero}",
        "destinations": [{"name": "Córdoba", "country": "Argentina"}],
        "startDate": inicio.isoformat(),
        "endDate": (inicio + timedelta(days=3)).isoformat(),
        "currency": "ARS",
    }


async def _crear_en_paralelo(cantidad: int, desde: int = 0) -> list[httpx.Response]:
    headers = {
        "Authorization": "Bearer "
        + create_access_token({"sub": "ana@concurrente.com", "user_id": 1})
    }
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://test") as cliente:
        pedidos = [
            cliente.post("/api/v1/trips", json=_payload(desde + i), headers=headers)
            for i in range(cantidad)
        ]
        return await asyncio.wait_for(asyncio.gather(*pedidos), timeout=30)


def _viajes_activos(sesiones) -> int:
    with sesiones() as db:
        return db.scalar(
            select(func.count(Viaje.IdViaje))
            .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
            .where(Viaje.IdAdministrador == 1, EstadoViaje.Nombre == "activo")
        )


def test_creaciones_concurrentes_terminan_todas(app_concurrente, sesiones):
    respuestas = asyncio.run(_crear_en_paralelo(4))

    estados = sorted(r.status_code for r in respuestas)
    assert estados == [201, 201, 201, 201], [r.text for r in respuestas]
    assert _viajes_activos(sesiones) == 4


def test_creaciones_concurrentes_respetan_el_limite_del_plan(app_concurrente, sesiones):
    # Con 3 viajes activos, de 4 creaciones en paralelo solo 2 entran en el cupo de 5.
    asyncio.run(_crear_en_paralelo(3))
    assert _viajes_activos(sesiones) == 3

    respuestas = asyncio.run(_crear_en_paralelo(4, desde=3))

    estados = sorted(r.status_code for r in respuestas)
    assert estados == [201, 201, 409, 409], [r.text for r in respuestas]
    for respuesta in respuestas:
        if respuesta.status_code == 409:
            assert respuesta.headers["X-Error-Code"] == "ACTIVE_TRIP_LIMIT_REACHED"
    assert _viajes_activos(sesiones) == 5


def test_la_portada_se_resuelve_antes_de_bloquear_al_usuario(app_concurrente, sesiones, monkeypatch):
    eventos: list[str] = []
    bloquear_original = limites_planes._bloquear_usuario

    def bloquear_registrando(db, id_usuario):
        eventos.append("lock")
        bloquear_original(db, id_usuario)

    async def portada_registrando(destinations):
        eventos.append("portada")
        return "place-portada"

    monkeypatch.setattr(limites_planes, "_bloquear_usuario", bloquear_registrando)
    monkeypatch.setattr(trips_routes, "_resolve_cover_place_id", portada_registrando)

    respuestas = asyncio.run(_crear_en_paralelo(1))

    assert respuestas[0].status_code == 201
    assert eventos == ["portada", "lock"]
