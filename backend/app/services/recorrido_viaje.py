"""Recorrido del viaje (US A): orden, noches de cada destino y noches en viaje.

Las fechas de cada destino no se persisten: se calculan desde estos valores.
Un recorrido sin armar se guarda con `Noches` en NULL; cualquier NULL en un viaje
de varios destinos significa que todavía no hay recorrido.
"""

from dataclasses import dataclass
from datetime import date
from typing import Sequence

from fastapi import HTTPException, status

from app.models.destino_viaje import DestinoViaje
from app.schemas.trip import DestinationCreate

ROUTE_INVALID_NIGHTS_CODE = "ROUTE_INVALID_NIGHTS"
ROUTE_INCOMPLETE_CODE = "ROUTE_INCOMPLETE"
ROUTE_DESTINATION_WITHOUT_NIGHTS_CODE = "ROUTE_DESTINATION_WITHOUT_NIGHTS"
ROUTE_NIGHTS_EXCEEDED_CODE = "ROUTE_NIGHTS_EXCEEDED"
ROUTE_INVALID_TRANSFER_CODE = "ROUTE_INVALID_TRANSFER"


@dataclass(frozen=True)
class ValoresRecorrido:
    orden: int
    noches: int | None
    noches_en_viaje: int


def _rechazar(codigo: str, mensaje: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=mensaje,
        headers={"X-Error-Code": codigo},
    )


def _noches_del_viaje(fecha_inicio: date | None, fecha_fin: date | None) -> int | None:
    if fecha_inicio is None or fecha_fin is None:
        return None
    return (fecha_fin - fecha_inicio).days


def validar_recorrido(
    destinos: Sequence[DestinationCreate],
    fecha_inicio: date | None,
    fecha_fin: date | None,
) -> None:
    """Aplica las mismas reglas que la app. Con un destino no se piden noches."""
    if len(destinos) <= 1:
        return

    if any(
        (d.noches is not None and d.noches < 0)
        or (d.nochesEnViaje is not None and d.nochesEnViaje < 0)
        for d in destinos
    ):
        _rechazar(ROUTE_INVALID_NIGHTS_CODE, "Las noches no pueden ser negativas.")

    con_noches = [d for d in destinos if d.noches is not None]
    if not con_noches:
        return
    if len(con_noches) != len(destinos):
        _rechazar(ROUTE_INCOMPLETE_CODE, "Indicá las noches de todos los destinos.")

    sin_noches = next((d for d in destinos if d.noches == 0), None)
    if sin_noches is not None:
        _rechazar(
            ROUTE_DESTINATION_WITHOUT_NIGHTS_CODE,
            f"{sin_noches.name} todavía no tiene noches.",
        )

    if destinos[-1].nochesEnViaje:
        _rechazar(
            ROUTE_INVALID_TRANSFER_CODE,
            "El último destino no puede tener noches en viaje.",
        )

    total_viaje = _noches_del_viaje(fecha_inicio, fecha_fin)
    asignadas = sum(d.noches + (d.nochesEnViaje or 0) for d in destinos)
    if total_viaje is not None and asignadas > total_viaje:
        exceso = asignadas - total_viaje
        _rechazar(
            ROUTE_NIGHTS_EXCEEDED_CODE,
            f"Hay {exceso} {'noche' if exceso == 1 else 'noches'} de más en el recorrido.",
        )


def _cliente_sin_recorrido(destinos: Sequence[DestinationCreate]) -> bool:
    """Las versiones anteriores de la app no envían estos campos. Un `null` explícito
    no cuenta: es la app actual indicando que el recorrido queda sin armar."""
    return not any({"noches", "nochesEnViaje"} & d.model_fields_set for d in destinos)


def _conservar_recorrido(
    destinos: Sequence[DestinationCreate],
    actuales: dict[tuple[str, str], DestinoViaje],
    fecha_inicio: date | None,
    fecha_fin: date | None,
) -> list[ValoresRecorrido]:
    valores: list[ValoresRecorrido] = []
    for orden, destino in enumerate(destinos):
        rel = actuales.get((destino.name, destino.country))
        es_ultimo = orden == len(destinos) - 1
        valores.append(
            ValoresRecorrido(
                orden=orden,
                noches=rel.Noches if rel else None,
                noches_en_viaje=0 if es_ultimo or rel is None else rel.NochesEnViaje,
            )
        )

    total_viaje = _noches_del_viaje(fecha_inicio, fecha_fin)
    asignadas = sum((v.noches or 0) + v.noches_en_viaje for v in valores)
    if total_viaje is not None and asignadas > total_viaje:
        # Ese cliente no puede corregirlo: se evita guardar un recorrido inválido.
        return [ValoresRecorrido(v.orden, None, 0) for v in valores]
    return valores


def resolver_recorrido(
    destinos: Sequence[DestinationCreate],
    fecha_inicio: date | None,
    fecha_fin: date | None,
    actuales: dict[tuple[str, str], DestinoViaje] | None = None,
) -> list[ValoresRecorrido]:
    """Valores a persistir para cada destino, en el orden recibido."""
    if len(destinos) == 1:
        return [ValoresRecorrido(0, None, 0)]

    if actuales and _cliente_sin_recorrido(destinos):
        return _conservar_recorrido(destinos, actuales, fecha_inicio, fecha_fin)

    if all(d.noches is None for d in destinos):
        return [ValoresRecorrido(orden, None, 0) for orden in range(len(destinos))]

    return [
        ValoresRecorrido(orden, d.noches, d.nochesEnViaje or 0)
        for orden, d in enumerate(destinos)
    ]


def aplicar_recorrido(rel: DestinoViaje, valores: ValoresRecorrido) -> None:
    rel.Orden = valores.orden
    rel.Noches = valores.noches
    rel.NochesEnViaje = valores.noches_en_viaje
