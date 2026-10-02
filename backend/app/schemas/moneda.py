from datetime import date
from decimal import Decimal

from pydantic import BaseModel

class MonedasRead(BaseModel):
    Codigo: str
    Nombre: str

    class Config:
        from_attributes = True

class CotizacionRead(BaseModel):
    """Conversión de un monto con la cotización vigente a la fecha indicada."""

    Origen: str
    Destino: str
    Fecha: date
    TipoCambio: Decimal
    MontoConvertido: Decimal
