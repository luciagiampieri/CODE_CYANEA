from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from scripts.seed_demo_backoffice import generar, validar_destino
from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_gastos import CategoriasGastos
from app.models.gasto import Gasto
from app.models.participantes_gastos import ParticipantesGastos
from app.models.plan import Plan
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.pago_suscripcion import PagoSuscripcion, EstadoPagoSuscripcion
from app.models.solicitud_ia import SolicitudIA


def test_seed_coherente_no_duplica_ni_altera_usuarios(db_session, usuario_activo):
    db = db_session
    original = (usuario_activo.Email, usuario_activo.HashedPassword, usuario_activo.IdPlan)
    pro = db.get(Plan, 2)
    pro.PrecioMensualARS, pro.PrecioAnualARS = Decimal(4900), Decimal(49000)
    db.add_all([CategoriasGastos(Nombre="Comida"), CategoriasChecklist(Nombre="Preparativos")])
    db.commit()
    ahora = datetime(2026, 10, 24, 15, tzinfo=timezone.utc)
    resultado = generar(db, usuarios=100, viajes=30, ahora=ahora)
    db.commit()
    assert resultado["usuarios"] == 100
    assert resultado["viajes"] == 30
    assert resultado["suscripciones"] > 0
    assert resultado["votos"] > 0
    assert resultado["solicitudesIA"] > 0
    assert original == (usuario_activo.Email, usuario_activo.HashedPassword, usuario_activo.IdPlan)
    for gasto in db.scalars(select(Gasto)):
        total = db.scalar(
            select(func.sum(ParticipantesGastos.MontoAsignado)).where(
                ParticipantesGastos.IdGasto == gasto.IdGasto
            )
        )
        assert total == gasto.Monto
        assert gasto.FechaCreacion <= ahora
    for viaje in db.scalars(select(Viaje)):
        admin = db.get(Usuario, viaje.IdAdministrador)
        assert admin.FechaAlta <= viaje.FechaCreacion <= ahora
        assert viaje.FechaInicio <= viaje.FechaFin
    for sub in db.scalars(select(SuscripcionUsuario)):
        assert db.get(Usuario, sub.IdUsuario).FechaAlta <= sub.FechaInicio <= ahora
        assert sub.FechaFin > sub.FechaInicio
        pagos = list(
            db.scalars(
                select(PagoSuscripcion).where(
                    PagoSuscripcion.IdSuscripcionUsuario == sub.IdSuscripcionUsuario
                )
            )
        )
        assert pagos and all(
            p.MontoARS == sub.PrecioPeriodoARS and p.FechaPago <= ahora for p in pagos
        )
        assert all(p.IdOperacionPasarela.startswith("DEMO-CYANEA-") for p in pagos)
    assert set(db.scalars(select(EstadoPagoSuscripcion.Nombre))) == {
        "aprobado",
        "rechazado",
        "pendiente",
    }
    assert all(s.Modelo == "demo-sintetico" for s in db.scalars(select(SolicitudIA)))
    antes = db.scalar(select(func.count()).select_from(Usuario))
    assert generar(db, usuarios=100, viajes=30, ahora=ahora)["omitido"]
    assert db.scalar(select(func.count()).select_from(Usuario)) == antes


@pytest.mark.parametrize(
    "url,entorno",
    [
        ("postgresql://localhost/cyanea", "production"),
        ("postgresql://remote.example/cyanea", "development"),
        ("sqlite://", "development"),
    ],
)
def test_rechaza_destinos_no_locales(url, entorno):
    with pytest.raises(ValueError, match="solo admite"):
        validar_destino(make_url(url), entorno)


def test_admite_postgres_local():
    validar_destino(make_url("postgresql+psycopg://127.0.0.1/cyanea"), "development")
