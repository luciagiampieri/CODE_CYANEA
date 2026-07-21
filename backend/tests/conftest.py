import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from datetime import date as date_type
from app.main import app
from app.db.session import Base, get_db
from app.core.security import hash_password, create_access_token
from app.models.usuario import Usuario
from app.models.estado_viaje import EstadoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_invitacion import EstadoInvitacion
from app.models.rol_participante import RolParticipante
from app.models.viaje import Viaje
from app.models.categorias_gastos import CategoriasGastos
from app.models.participante_viaje import ParticipanteViaje

from sqlalchemy import BigInteger
from sqlalchemy.ext.compiler import compiles


@compiles(BigInteger, "sqlite")
def _compile_big_integer_as_integer_for_sqlite(type_, compiler, **kw):
    """SQLite solo autoincrementa PKs declaradas como INTEGER (no BIGINT).
    Esto es solo para que los tests con SQLite generen IDs automáticamente;
    en Postgres (producción) esto no aplica y el modelo sigue usando BIGINT."""
    return "INTEGER"


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture()
def db_session():
    """Crea todas las tablas, entrega una sesión, y limpia todo al final."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """TestClient de FastAPI con la DB real reemplazada por la de test."""
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def master_data(db_session):
    """Datos maestros que la mayoría de los endpoints dan por hecho que existen."""
    estados_viaje = [EstadoViaje(Nombre=n, Activo=True) for n in ("activo", "finalizado", "cancelado")]

    estados_participacion = [
        EstadoParticipacion(Nombre="invitado", Descripcion="Invitacion pendiente de respuesta.", Activo=True),
        EstadoParticipacion(Nombre="aceptado", Descripcion="Participacion aceptada.", Activo=True),
        EstadoParticipacion(Nombre="rechazado", Descripcion="Invitacion rechazada.", Activo=True),
        EstadoParticipacion(Nombre="expulsado", Descripcion="Participante removido del viaje.", Activo=True),
        EstadoParticipacion(Nombre="salio", Descripcion="Participante abandono voluntariamente el viaje.", Activo=True),
    ]

    estados_invitacion = [
        EstadoInvitacion(Nombre="pendiente", Descripcion="Invitacion externa enviada y aun no aceptada.", Activo=True),
        EstadoInvitacion(Nombre="aceptada", Descripcion="Invitacion aceptada por una cuenta registrada.", Activo=True),
        EstadoInvitacion(Nombre="vencida", Descripcion="Invitacion expirada sin aceptacion.", Activo=True),
        EstadoInvitacion(Nombre="cancelada", Descripcion="Invitacion anulada por el administrador.", Activo=True),
    ]

    roles = [
        RolParticipante(Nombre="administrador", Descripcion="Usuario responsable del viaje.", Activo=True),
        RolParticipante(Nombre="participante", Descripcion="Usuario invitado al viaje.", Activo=True),
    ]

    db_session.add_all(estados_viaje + estados_participacion + estados_invitacion + roles)
    db_session.commit()


@pytest.fixture()
def usuario_activo(db_session):
    """Un usuario con email confirmado, listo para loguear."""
    usuario = Usuario(
        Nombre="Ana", Apellido="Test", NombreUsuario="ana_test",
        Email="ana@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture()
def auth_headers(usuario_activo):
    token = create_access_token({"sub": usuario_activo.Email, "user_id": usuario_activo.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def viaje_con_admin(db_session, master_data, usuario_activo):
    """Viaje donde usuario_activo es admin y ya es participante 'aceptado'."""
    estado_activo = db_session.query(EstadoViaje).filter_by(Nombre="activo").first()
    rol_admin = db_session.query(RolParticipante).filter_by(Nombre="administrador").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    viaje = Viaje(
        Titulo="Viaje de test",
        FechaInicio=date_type(2026, 12, 1),
        FechaFin=date_type(2026, 12, 10),
        IdEstadoViaje=estado_activo.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )
    db_session.add(viaje)
    db_session.flush()

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario_activo.IdUsuario,
        IdRolParticipante=rol_admin.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(viaje)
    db_session.refresh(participante)
    return viaje, participante


@pytest.fixture()
def categoria_gasto(db_session):
    categoria = CategoriasGastos(Nombre="Comida", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    db_session.refresh(categoria)
    return categoria