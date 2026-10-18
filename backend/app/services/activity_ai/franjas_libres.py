"""Detección de días y franjas libres del itinerario (US 92).

Funciones puras (sin base de datos) para poder probarlas directamente:
- un día del cronograma sin actividades es un día libre completo (09:00 a 22:00);
- en un día con actividades, es franja libre todo tramo sin actividades de al
  menos tres horas dentro de la ventana 09:00 a 22:00;
- solo cuentan los días posteriores a la fecha actual.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from typing import Iterable

INICIO_VENTANA_MINUTOS = 9 * 60
FIN_VENTANA_MINUTOS = 22 * 60
DURACION_MINIMA_FRANJA_LIBRE_MINUTOS = 3 * 60


@dataclass(frozen=True)
class FranjaLibre:
    id_dia: int
    fecha: date
    indice_dia: int | None
    inicio: int
    fin: int
    dia_completo: bool

    @property
    def duracion(self) -> int:
        return self.fin - self.inicio


def _minutos(hora: time) -> int:
    return hora.hour * 60 + hora.minute


def tramos_libres(
    ocupados: Iterable[tuple[int, int]],
    inicio_ventana: int = INICIO_VENTANA_MINUTOS,
    fin_ventana: int = FIN_VENTANA_MINUTOS,
    minimo: int = DURACION_MINIMA_FRANJA_LIBRE_MINUTOS,
) -> list[tuple[int, int]]:
    """Tramos de la ventana sin actividades que duran al menos `minimo` minutos.

    Las actividades que se salen de la ventana se recortan; las que se superponen
    entre sí se tratan como un único bloque ocupado."""
    bloques = sorted(
        (max(inicio, inicio_ventana), min(fin, fin_ventana))
        for inicio, fin in ocupados
        if fin > inicio and inicio < fin_ventana and fin > inicio_ventana
    )
    libres: list[tuple[int, int]] = []
    cursor = inicio_ventana
    for inicio, fin in bloques:
        if inicio - cursor >= minimo:
            libres.append((cursor, inicio))
        cursor = max(cursor, fin)
    if fin_ventana - cursor >= minimo:
        libres.append((cursor, fin_ventana))
    return libres


def detectar_franjas_libres(dias: Iterable, actividades_por_dia: dict[int, list], hoy: date) -> list[FranjaLibre]:
    """Días libres y franjas libres de los días posteriores a `hoy`, en orden cronológico.

    `dias` son objetos con `IdDiaCronograma`, `Fecha` e `IndiceDia`; las actividades,
    objetos con `HoraInicio` y `HoraFin`."""
    franjas: list[FranjaLibre] = []
    for dia in sorted(dias, key=lambda d: d.Fecha):
        if dia.Fecha <= hoy:
            continue
        actividades = actividades_por_dia.get(dia.IdDiaCronograma, [])
        ocupados = [(_minutos(a.HoraInicio), _minutos(a.HoraFin)) for a in actividades]
        for inicio, fin in tramos_libres(ocupados):
            franjas.append(
                FranjaLibre(
                    id_dia=dia.IdDiaCronograma,
                    fecha=dia.Fecha,
                    indice_dia=getattr(dia, "IndiceDia", None),
                    inicio=inicio,
                    fin=fin,
                    dia_completo=not actividades,
                )
            )
    return franjas
