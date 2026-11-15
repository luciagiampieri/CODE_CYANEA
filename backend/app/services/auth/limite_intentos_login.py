"""Freno a la fuerza bruta en POST /auth/login.

Se cuentan los intentos fallidos por IP + email en una ventana de 5 minutos: al llegar a
10, el login de esa combinación responde 429 hasta que el intento más viejo sale de la
ventana. Un login exitoso borra el contador.

Vive en memoria del proceso: con un solo worker de uvicorn (ver Dockerfile) alcanza. Si
se agregan workers, cada uno lleva su propia cuenta y el límite efectivo se multiplica.
"""

import math
import threading
import time
from collections import deque

from fastapi import HTTPException, status

MAX_INTENTOS_FALLIDOS = 10
VENTANA_SEGUNDOS = 5 * 60

_intentos: dict[tuple[str, str], deque[float]] = {}
_lock = threading.Lock()


def _clave(ip: str | None, email: str) -> tuple[str, str]:
    return (ip or "desconocida", email.strip().lower())


def _vigentes(clave: tuple[str, str], ahora: float) -> deque[float]:
    registro = _intentos.get(clave)
    if registro is None:
        return deque()
    while registro and registro[0] <= ahora - VENTANA_SEGUNDOS:
        registro.popleft()
    if not registro:
        _intentos.pop(clave, None)
    return registro


def _limpiar_vencidos(ahora: float) -> None:
    for clave in list(_intentos):
        _vigentes(clave, ahora)


def verificar(ip: str | None, email: str, ahora: float | None = None) -> None:
    """Responde 429 si esa IP + email ya agotó sus intentos en la ventana."""
    ahora = time.monotonic() if ahora is None else ahora
    with _lock:
        registro = _vigentes(_clave(ip, email), ahora)
        if len(registro) < MAX_INTENTOS_FALLIDOS:
            return
        espera = max(1, math.ceil(registro[0] + VENTANA_SEGUNDOS - ahora))
    minutos = math.ceil(espera / 60)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            "Demasiados intentos fallidos de inicio de sesión. "
            f"Probá de nuevo en {minutos} {'minuto' if minutos == 1 else 'minutos'}."
        ),
        headers={"Retry-After": str(espera), "X-Error-Code": "LOGIN_RATE_LIMITED"},
    )


def registrar_fallo(ip: str | None, email: str, ahora: float | None = None) -> None:
    ahora = time.monotonic() if ahora is None else ahora
    with _lock:
        _limpiar_vencidos(ahora)
        _intentos.setdefault(_clave(ip, email), deque()).append(ahora)


def registrar_exito(ip: str | None, email: str) -> None:
    with _lock:
        _intentos.pop(_clave(ip, email), None)


def reiniciar() -> None:
    """Para los tests."""
    with _lock:
        _intentos.clear()
