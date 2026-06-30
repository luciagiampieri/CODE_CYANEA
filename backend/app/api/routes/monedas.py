from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.moneda import Moneda
from app.schemas.moneda import MonedasRead
from sqlalchemy import or_, func

router = APIRouter()

@router.get("/", response_model=list[MonedasRead])
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