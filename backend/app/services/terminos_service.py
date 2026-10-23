from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auditoria_terminos import ACCION_PUBLICACION, AuditoriaTerminos
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.usuario import Usuario
from app.models.version_terminos import (
    ESTADO_BORRADOR,
    ESTADO_HISTORICA,
    ESTADO_VIGENTE,
    VersionTerminos,
)
from app.schemas.backoffice_terminos import (
    ListadoTerminos,
    VersionTerminosDetalle,
    VersionTerminosItem,
)
from app.schemas.legal import EstadoAceptacionTerminos
from app.services.terminos_iniciales import TERMINOS_INICIALES, TITULO_INICIAL

logger = logging.getLogger(__name__)

VERSION_NOT_FOUND = "TERMS_VERSION_NOT_FOUND"
VERSION_NUMBER_DUPLICATED = "TERMS_VERSION_NUMBER_DUPLICATED"
VERSION_NOT_DRAFT = "TERMS_VERSION_NOT_DRAFT"
NO_CURRENT_VERSION = "TERMS_NO_CURRENT_VERSION"
PUBLISH_CONFLICT = "TERMS_PUBLISH_CONFLICT"

_ORDEN_ESTADO = {ESTADO_VIGENTE: 0, ESTADO_BORRADOR: 1, ESTADO_HISTORICA: 2}


class TerminosError(Exception):
    def __init__(self, mensaje: str, status_code: int, codigo: str):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status_code = status_code
        self.codigo = codigo


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _a_utc(valor: datetime | None) -> datetime:
    if valor is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


def contenido_a_parrafos(contenido: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", contenido or "") if p.strip()]


def _item(version: VersionTerminos) -> VersionTerminosItem:
    return VersionTerminosItem(
        id=version.IdVersionTerminos,
        numero=version.Numero,
        titulo=version.Titulo,
        estado=version.Estado,
        fechaCreacion=version.FechaCreacion,
        fechaPublicacion=version.FechaPublicacion,
    )


def _detalle(version: VersionTerminos) -> VersionTerminosDetalle:
    return VersionTerminosDetalle(**_item(version).model_dump(), contenido=version.Contenido)


def _por_id(db: Session, id_version: int, bloquear: bool = False) -> VersionTerminos:
    consulta = select(VersionTerminos).where(VersionTerminos.IdVersionTerminos == id_version)
    if bloquear:
        consulta = consulta.with_for_update()
    version = db.scalar(consulta)
    if version is None:
        raise TerminosError("La versión no existe.", 404, VERSION_NOT_FOUND)
    return version


def _exigir_borrador(version: VersionTerminos, accion: str) -> None:
    if version.Estado != ESTADO_BORRADOR:
        raise TerminosError(
            f"Solo se puede {accion} una versión en estado Borrador.", 409, VERSION_NOT_DRAFT
        )


def _validar_numero_unico(db: Session, numero: str, excluir_id: int | None = None) -> None:
    clave = numero.strip().casefold()
    filas = db.execute(
        select(VersionTerminos.IdVersionTerminos, VersionTerminos.Numero)
    ).all()
    for id_version, existente in filas:
        if excluir_id is not None and id_version == excluir_id:
            continue
        if existente.strip().casefold() == clave:
            raise TerminosError(
                f'Ya existe una versión con el número "{existente}".',
                409,
                VERSION_NUMBER_DUPLICATED,
            )


def asegurar_version_inicial(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(VersionTerminos)):
        return
    ahora = _ahora()
    db.add(
        VersionTerminos(
            Numero=settings.terms_version,
            Titulo=TITULO_INICIAL,
            Contenido="\n\n".join(TERMINOS_INICIALES),
            Estado=ESTADO_VIGENTE,
            FechaCreacion=ahora,
            FechaPublicacion=ahora,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def obtener_vigente(db: Session) -> VersionTerminos:
    asegurar_version_inicial(db)
    version = db.scalar(select(VersionTerminos).where(VersionTerminos.Estado == ESTADO_VIGENTE))
    if version is None:
        raise TerminosError("No hay una versión vigente.", 404, NO_CURRENT_VERSION)
    return version


def cantidad_que_aceptaron(db: Session, numero: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Usuario)
            .where(
                Usuario.AceptaTerminos.is_(True),
                Usuario.VersionTerminosAceptada == numero,
                Usuario.FechaBaja.is_(None),
                Usuario.IdRolSistema.is_distinct_from(ROL_ADMIN_SISTEMA),
            )
        )
        or 0
    )


def listar(db: Session) -> ListadoTerminos:
    asegurar_version_inicial(db)
    versiones = db.scalars(select(VersionTerminos)).all()
    versiones = sorted(
        versiones,
        key=lambda v: (
            _ORDEN_ESTADO.get(v.Estado, 9),
            -_a_utc(v.FechaPublicacion or v.FechaCreacion).timestamp(),
        ),
    )
    vigente = next((v for v in versiones if v.Estado == ESTADO_VIGENTE), None)
    return ListadoTerminos(
        versiones=[_item(v) for v in versiones],
        versionVigente=vigente.Numero if vigente else None,
        usuariosAceptaronVigente=cantidad_que_aceptaron(db, vigente.Numero) if vigente else 0,
    )


def obtener(db: Session, id_version: int) -> VersionTerminosDetalle:
    return _detalle(_por_id(db, id_version))


def crear(
    db: Session, numero: str, titulo: str, contenido: str, id_admin: int
) -> VersionTerminosDetalle:
    asegurar_version_inicial(db)
    _validar_numero_unico(db, numero)
    version = VersionTerminos(
        Numero=numero,
        Titulo=titulo,
        Contenido=contenido,
        Estado=ESTADO_BORRADOR,
        FechaCreacion=_ahora(),
        IdAdministradorCreacion=id_admin,
    )
    db.add(version)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TerminosError(
            f'Ya existe una versión con el número "{numero}".', 409, VERSION_NUMBER_DUPLICATED
        )
    db.refresh(version)
    return _detalle(version)


def actualizar(
    db: Session, id_version: int, numero: str, titulo: str, contenido: str
) -> VersionTerminosDetalle:
    version = _por_id(db, id_version, bloquear=True)
    _exigir_borrador(version, "editar")
    _validar_numero_unico(db, numero, excluir_id=id_version)
    version.Numero = numero
    version.Titulo = titulo
    version.Contenido = contenido
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TerminosError(
            f'Ya existe una versión con el número "{numero}".', 409, VERSION_NUMBER_DUPLICATED
        )
    db.refresh(version)
    return _detalle(version)


def eliminar(db: Session, id_version: int) -> None:
    version = _por_id(db, id_version, bloquear=True)
    _exigir_borrador(version, "eliminar")
    db.delete(version)
    db.commit()


def publicar(
    db: Session, id_version: int, id_admin: int, ip: str | None = None
) -> VersionTerminosDetalle:
    version = _por_id(db, id_version, bloquear=True)
    _exigir_borrador(version, "publicar")

    ahora = _ahora()
    anterior = db.scalar(
        select(VersionTerminos).where(VersionTerminos.Estado == ESTADO_VIGENTE).with_for_update()
    )
    if anterior is not None:
        anterior.Estado = ESTADO_HISTORICA
        db.flush()

    version.Estado = ESTADO_VIGENTE
    version.FechaPublicacion = ahora
    version.IdAdministradorPublicacion = id_admin
    db.add(
        AuditoriaTerminos(
            IdVersionTerminos=version.IdVersionTerminos,
            NumeroVersion=version.Numero,
            IdAdministrador=id_admin,
            Accion=ACCION_PUBLICACION,
            DireccionIp=ip,
            FechaHora=ahora,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TerminosError(
            "Se está publicando otra versión al mismo tiempo. Volvé a intentarlo.",
            409,
            PUBLISH_CONFLICT,
        )
    db.refresh(version)
    logger.info("Versión de términos publicada", extra={"version": version.Numero, "admin_id": id_admin})
    return _detalle(version)


def estado_aceptacion(db: Session, usuario: Usuario) -> EstadoAceptacionTerminos:
    vigente = obtener_vigente(db)
    aceptada = usuario.VersionTerminosAceptada if usuario.AceptaTerminos else None
    return EstadoAceptacionTerminos(
        versionVigente=vigente.Numero,
        versionAceptada=aceptada,
        requiereAceptacion=aceptada != vigente.Numero,
    )


def aceptar_vigente(db: Session, usuario: Usuario) -> EstadoAceptacionTerminos:
    vigente = obtener_vigente(db)
    usuario.AceptaTerminos = True
    usuario.FechaAceptacionTerminos = _ahora()
    usuario.VersionTerminosAceptada = vigente.Numero
    db.commit()
    db.refresh(usuario)
    return estado_aceptacion(db, usuario)