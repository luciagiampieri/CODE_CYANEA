from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def opciones_conexion(database_url: str) -> dict:
    """En PostgreSQL acota la espera por locks y la duración de las consultas.

    Sin estos topes, una transacción que espera un lock puede quedar colgada sin límite.
    """
    if not database_url.startswith("postgresql"):
        return {}
    return {
        "options": (
            f"-c lock_timeout={settings.db_lock_timeout} "
            f"-c statement_timeout={settings.db_statement_timeout}"
        )
    }


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
    pool_timeout=10,
    future=True,
    connect_args=opciones_conexion(settings.database_url),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
