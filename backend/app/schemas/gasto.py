from pydantic import BaseModel, Field
from decimal import Decimal
from datetime import date
from typing import Optional

from app.models.gasto import TipoDivisionEnum

class CategoriasGastosRead(BaseModel):
    IdCategoria: int
    Nombre: str
    
    model_config = {
        "from_attributes": True
    }


class ParticipantesGastosRead(BaseModel):
    IdParticipanteViaje: int
    Nombre: str
    Apellido: str
    NombreUsuario: str
    MontoAsignado: Optional[Decimal] = None
    # Permite precargar al usuario actual como pagador (US 94, AC4).
    EsUsuarioActual: bool = False
    
    model_config = {
        "from_attributes": True
    }


class ParticipanteDivisionCreate(BaseModel):
    IdParticipanteViaje: int
    MontoAsignado: Decimal | None = None


class GastoCreate(BaseModel):
    IdViaje: int
    Nombre: str
    Monto: Optional[Decimal] = None
    MontoOriginal: Decimal
    MonedaOriginal: str
    IdCategoria: int
    IdPagador: Optional[int] = None
    FechaGasto: date
    EsCompartido: bool = True
    DividirEntreTodos: bool = True
    TipoDivision: Optional[TipoDivisionEnum] = None
    IdParticipantes: Optional[list[int]] = []
    DetalleMontosPersonalizados: Optional[list[ParticipanteDivisionCreate]] = []
    # Confirmación de un gasto precargado desde un comprobante (US 94).
    # Si la moneda del comprobante no es ARS, el usuario debe ingresar el
    # monto convertido a pesos argentinos (RN-39).
    DesdeComprobante: bool = False
    MontoConvertidoARS: Optional[Decimal] = None


class GastoListItemRead(BaseModel):
    """Gasto tal como se muestra en el listado del viaje."""

    IdGasto: int
    Nombre: str
    Monto: Decimal
    MontoOriginal: Decimal
    MonedaOriginal: str
    FechaGasto: date
    IdCategoria: int
    NombreCategoria: str
    IdPagador: int
    IdUsuarioPagador: int
    NombrePagador: str
    IdDocumentoComprobante: Optional[int] = None
    EsPropioComprobante: bool = False


class GastoRead(BaseModel):
    IdGasto: int
    IdViaje: int
    Nombre: str

    Monto: Decimal
    MontoOriginal: Decimal
    MonedaOriginal: str
    TipoCambio: Decimal

    NombreCategoria: str

    NombrePagador: str
    ApellidoPagador: str
    NombreUsuarioPagador: str

    DividirEntreTodos: bool
    FechaGasto: date

    Participantes: list[str]

    model_config = {
        "from_attributes": True
    }

class EscaneoComprobanteRead(BaseModel):
    """Datos extraídos de un comprobante para precargar el formulario (US 93).

    No representa un gasto guardado: el usuario debe confirmarlo (RNF-31).
    Los campos que no se pudieron identificar vienen en null (AC9) y los
    dudosos se listan en `CamposBajaConfianza` para resaltarlos (AC10).
    """

    Nombre: Optional[str] = None
    MontoOriginal: Optional[Decimal] = None
    MonedaOriginal: Optional[str] = None
    FechaGasto: Optional[date] = None
    IdCategoria: Optional[int] = None
    CamposBajaConfianza: list[str] = Field(default_factory=list)