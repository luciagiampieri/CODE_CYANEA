"""Secciones con locks dentro de endpoints `async def`.

Los endpoints async corren en el event loop y usan la Session síncrona. Si una consulta
del event loop espera un lock (SELECT ... FOR UPDATE o una fila escrita por otra
transacción) cuyo dueño necesita al event loop para terminar, el servidor entero queda
colgado. Por eso, en un endpoint async, toda sección que toma locks corre acá: la espera
bloquea un hilo del threadpool y no el event loop, y si falla se hace rollback en el mismo
hilo para liberar los locks antes de volver.
"""

from collections.abc import Callable
from typing import TypeVar

from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

T = TypeVar("T")


async def en_hilo_con_locks(db: Session, funcion: Callable[..., T], *args, **kwargs) -> T:
    def _correr() -> T:
        try:
            return funcion(*args, **kwargs)
        except Exception:
            db.rollback()
            raise

    return await run_in_threadpool(_correr)
