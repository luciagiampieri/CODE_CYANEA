import importlib.util
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import text

from app.models.plan import PLAN_PRO, Plan


def test_semilla_completa_precios_y_conserva_ediciones_del_administrador(db_session, monkeypatch):
    archivo = Path(__file__).parents[1] / "alembic/versions/f112b2c3d4e5_precios_base_pro.py"
    spec = importlib.util.spec_from_file_location("precios_base_pro", archivo)
    migracion = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migracion)
    monkeypatch.setattr(
        migracion, "op", SimpleNamespace(execute=lambda sql: db_session.execute(text(sql)))
    )
    migracion.upgrade()
    db_session.commit()
    pro = db_session.get(Plan, PLAN_PRO)
    assert pro.PrecioMensualARS == Decimal("4900.00")
    assert pro.PrecioAnualARS == Decimal("49000.00")
    pro.PrecioMensualARS = Decimal("5900.00")
    db_session.commit()
    migracion.upgrade()
    db_session.commit()
    db_session.refresh(pro)
    assert pro.PrecioMensualARS == Decimal("5900.00")
    assert pro.PrecioAnualARS == Decimal("49000.00")
