"""Advertencia de horario que el usuario confirma al registrar una actividad (US 98).

Vive en un módulo propio porque la usan tanto las actividades (`schemas.trip`) como
el alta de una actividad desde un lugar guardado del viaje (`schemas.place`), y
`schemas.trip` ya importa `schemas.place`.
"""

from typing import Literal

from pydantic import BaseModel, Field

TipoAdvertenciaHorarioLiteral = Literal[
    "fuera_de_horario", "cerrado_dia", "cerrado_temporalmente", "cerrado_permanentemente"
]


class AdvertenciaHorarioAceptada(BaseModel):
    """Advertencia que el usuario vio y decidió ignorar (`ignorar_advertencia=true`).
    Se guarda en la actividad para marcarla en el itinerario."""

    tipo: TipoAdvertenciaHorarioLiteral
    resumen: str = Field(..., min_length=1, max_length=300)
