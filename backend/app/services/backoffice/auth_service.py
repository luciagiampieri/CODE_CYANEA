import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import create_backoffice_token, hash_password, verify_password
from app.models.auditoria_acceso_backoffice import AuditoriaAccesoBackoffice as Auditoria
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.sesion_backoffice import SesionBackoffice
from app.models.usuario import Usuario

MAX_INTENTOS_FALLIDOS = 5
DURACION_BLOQUEO = timedelta(minutes=15)
INACTIVIDAD_MAXIMA = timedelta(minutes=30)
MENSAJE_GENERICO = "Correo electrónico o contraseña incorrectos"

MOTIVO_EXITO = "EXITO"
MOTIVO_CREDENCIALES = "CREDENCIALES_INVALIDAS"
MOTIVO_BLOQUEO = "BLOQUEO_APLICADO"
MOTIVO_INTENTO_BLOQUEADO = "INTENTO_DURANTE_BLOQUEO"

_HASH_DUMMY = hash_password("cyanea-backoffice-dummy")


class CredencialesInvalidas(Exception):
    pass


class AccesoBloqueado(Exception):
    def __init__(self, hasta: datetime):
        self.hasta = hasta


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def a_utc(valor: datetime | None) -> datetime | None:
    if valor is None:
        return None
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


def _ultima_fecha(db: Session, email: str, *condiciones) -> datetime | None:
    return a_utc(
        db.scalar(
            select(func.max(Auditoria.FechaHora)).where(
                Auditoria.Email == email, *condiciones
            )
        )
    )


def _bloqueado_hasta(db: Session, email: str) -> datetime | None:
    ultimo_bloqueo = _ultima_fecha(db, email, Auditoria.Motivo == MOTIVO_BLOQUEO)
    if ultimo_bloqueo and ultimo_bloqueo + DURACION_BLOQUEO > ahora():
        return ultimo_bloqueo + DURACION_BLOQUEO
    return None


def _fallos_consecutivos(db: Session, email: str) -> int:
    reinicio = max(
        filter(
            None,
            [
                _ultima_fecha(db, email, Auditoria.Exitoso.is_(True)),
                _ultima_fecha(db, email, Auditoria.Motivo == MOTIVO_BLOQUEO),
            ],
        ),
        default=None,
    )
    consulta = select(func.count()).where(
        Auditoria.Email == email,
        Auditoria.Motivo == MOTIVO_CREDENCIALES,
    )
    if reinicio:
        consulta = consulta.where(Auditoria.FechaHora > reinicio)
    return db.scalar(consulta) or 0


def _auditar(
    db: Session,
    email: str,
    usuario: Usuario | None,
    exitoso: bool,
    motivo: str,
    ip: str | None,
    user_agent: str | None,
) -> None:
    db.add(
        Auditoria(
            Email=email,
            IdUsuario=usuario.IdUsuario if usuario else None,
            Exitoso=exitoso,
            Motivo=motivo,
            DireccionIp=ip,
            UserAgent=(user_agent or "")[:255] or None,
            FechaHora=ahora(),
        )
    )


def _es_admin_habilitado(usuario: Usuario) -> bool:
    return (
        usuario.Activo
        and usuario.EmailConfirmado
        and usuario.ProveedorAutenticacion == "local"
        and usuario.IdRolSistema == ROL_ADMIN_SISTEMA
    )


def iniciar_sesion(
    db: Session,
    email: str,
    password: str,
    ip: str | None,
    user_agent: str | None,
) -> str:
    email = email.strip().lower()

    bloqueado_hasta = _bloqueado_hasta(db, email)
    if bloqueado_hasta:
        _auditar(db, email, None, False, MOTIVO_INTENTO_BLOQUEADO, ip, user_agent)
        db.commit()
        raise AccesoBloqueado(bloqueado_hasta)

    usuario = db.scalar(select(Usuario).where(Usuario.Email == email))
    hash_guardado = (
        usuario.HashedPassword if usuario and usuario.HashedPassword else _HASH_DUMMY
    )
    password_ok = verify_password(password, hash_guardado)

    if not (usuario and password_ok and _es_admin_habilitado(usuario)):
        _auditar(db, email, usuario, False, MOTIVO_CREDENCIALES, ip, user_agent)
        db.flush()
        if _fallos_consecutivos(db, email) >= MAX_INTENTOS_FALLIDOS:
            _auditar(db, email, usuario, False, MOTIVO_BLOQUEO, ip, user_agent)
        db.commit()
        raise CredencialesInvalidas()

    sesion = SesionBackoffice(
        IdSesionBackoffice=str(uuid.uuid4()),
        IdUsuario=usuario.IdUsuario,
        FechaInicio=ahora(),
        UltimaActividad=ahora(),
    )
    db.add(sesion)
    _auditar(db, email, usuario, True, MOTIVO_EXITO, ip, user_agent)
    db.commit()
    return create_backoffice_token(usuario.IdUsuario, sesion.IdSesionBackoffice)


def cerrar_sesion(db: Session, sesion: SesionBackoffice) -> None:
    if sesion.FechaCierre is None:
        sesion.FechaCierre = ahora()
        db.commit()