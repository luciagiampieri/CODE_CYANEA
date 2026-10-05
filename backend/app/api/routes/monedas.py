from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.moneda import Moneda
from app.api.deps import get_current_user
from app.models.usuario import Usuario
from app.schemas.moneda import CotizacionRead, MonedasRead
from app.services.currency import obtener_tipo_cambio
from sqlalchemy import or_, func

router = APIRouter()

@router.get("", response_model=list[MonedasRead])
def get_monedas(db: Session = Depends(get_db)):
    return db.query(Moneda).order_by(Moneda.Codigo).all()


@router.get("/search", response_model=list[MonedasRead])
def search_monedas(q: str = "", db: Session = Depends(get_db)):

    query = db.query(Moneda)

    if q:
        search = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Moneda.Codigo).like(search),
                func.lower(Moneda.Nombre).like(search),
            )
        )

    return query.order_by(Moneda.Codigo).limit(20).all()

COTIZACION_NO_DISPONIBLE = (
    "No pudimos obtener la cotización en este momento. Ingresá el monto convertido manualmente."
)


@router.get("/cotizacion", response_model=CotizacionRead)
def get_cotizacion(
    origen: str = Query(..., min_length=3, max_length=3),
    destino: str = Query("ARS", min_length=3, max_length=3),
    monto: Decimal = Query(..., gt=0),
    fecha: date | None = None,
    _: Usuario = Depends(get_current_user),
):
    """Convierte un monto con la misma cotización que usa el registro de gastos (US-85).

    El formulario de gasto precargado desde un comprobante (US 94) la usa para
    completar automáticamente el monto en ARS, que el usuario puede corregir.
    Requiere sesión porque consulta un servicio externo.
    """
    hoy = date.today()
    fecha_cotizacion = min(fecha or hoy, hoy)  # no hay cotizaciones futuras
    try:
        tasa = Decimal(str(obtener_tipo_cambio(origen, destino, fecha=fecha_cotizacion)))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail=COTIZACION_NO_DISPONIBLE,
            headers={"X-Error-Code": "EXCHANGE_RATE_UNAVAILABLE"},
        )

    return CotizacionRead(
        Origen=origen.upper(),
        Destino=destino.upper(),
        Fecha=fecha_cotizacion,
        TipoCambio=tasa,
        MontoConvertido=(monto * tasa).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )
