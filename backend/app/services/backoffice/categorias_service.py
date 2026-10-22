"""Gestión de categorías predefinidas desde el backoffice (US 110).

Las categorías de gastos, documentos y tareas del checklist viven en tres tablas
maestras distintas; este servicio las administra con las mismas reglas:

- el nombre es único dentro de su tipo sin distinguir mayúsculas ni acentos;
- una categoría en uso no se elimina, se desactiva (los elementos existentes la
  conservan y deja de ofrecerse para elementos nuevos);
- las categorías de sistema ("Comprobantes") no se desactivan ni eliminan;
- cada tipo conserva al menos una categoría activa.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_documento import CategoriaDocumento
from app.models.categorias_gastos import CategoriasGastos
from app.models.checklist import Checklist
from app.models.documento_viaje import DocumentoViaje
from app.models.gasto import Gasto
from app.schemas.backoffice_categoria import (
    CategoriaBackofficeRead,
    CategoriasBackofficeListado,
)

TIPO_GASTOS = "gastos"
TIPO_DOCUMENTOS = "documentos"
TIPO_CHECKLIST = "checklist"

CATEGORY_NOT_FOUND = "CATEGORY_NOT_FOUND"
CATEGORY_NAME_DUPLICATED = "CATEGORY_NAME_DUPLICATED"
CATEGORY_IN_USE = "CATEGORY_IN_USE"
CATEGORY_SYSTEM_PROTECTED = "CATEGORY_SYSTEM_PROTECTED"
CATEGORY_LAST_ACTIVE = "CATEGORY_LAST_ACTIVE"


class CategoriaError(Exception):
    def __init__(self, mensaje: str, status_code: int, codigo: str):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status_code = status_code
        self.codigo = codigo


@dataclass(frozen=True)
class _Tipo:
    modelo: type
    columna_id: str
    modelo_uso: type
    columna_uso: str
    etiqueta: str


TIPOS: dict[str, _Tipo] = {
    TIPO_GASTOS: _Tipo(CategoriasGastos, "IdCategoria", Gasto, "IdCategoria", "gastos"),
    TIPO_DOCUMENTOS: _Tipo(
        CategoriaDocumento, "IdCategoriaDocumento", DocumentoViaje, "IdCategoriaDocumento", "documentos"
    ),
    TIPO_CHECKLIST: _Tipo(
        CategoriasChecklist, "IdCategoriaChecklist", Checklist, "IdCategoriaChecklist", "tareas del checklist"
    ),
}


def normalizar_nombre(nombre: str) -> str:
    """Clave de comparación: sin acentos, sin distinguir mayúsculas y con los
    espacios colapsados ("Documentación" == "DOCUMENTACION")."""
    descompuesto = unicodedata.normalize("NFKD", nombre or "")
    sin_acentos = "".join(c for c in descompuesto if not unicodedata.combining(c))
    return " ".join(sin_acentos.casefold().split())


def _es_sistema(categoria) -> bool:
    return bool(getattr(categoria, "EsSistema", False))


def _id(tipo: _Tipo, categoria) -> int:
    return getattr(categoria, tipo.columna_id)


def _tipo(clave_tipo: str) -> _Tipo:
    tipo = TIPOS.get(clave_tipo)
    if tipo is None:
        raise CategoriaError("Tipo de categoría inválido.", 404, CATEGORY_NOT_FOUND)
    return tipo


def _usos_por_categoria(db: Session, tipo: _Tipo) -> dict[int, int]:
    columna = getattr(tipo.modelo_uso, tipo.columna_uso)
    filas = db.execute(select(columna, func.count()).group_by(columna)).all()
    return {id_categoria: cantidad for id_categoria, cantidad in filas}


def _cantidad_usos(db: Session, tipo: _Tipo, id_categoria: int) -> int:
    columna = getattr(tipo.modelo_uso, tipo.columna_uso)
    return db.scalar(
        select(func.count()).select_from(tipo.modelo_uso).where(columna == id_categoria)
    ) or 0


def _serializar(clave_tipo: str, categoria, cantidad_usos: int) -> CategoriaBackofficeRead:
    return CategoriaBackofficeRead(
        id=_id(TIPOS[clave_tipo], categoria),
        tipo=clave_tipo,
        nombre=categoria.Nombre,
        icono=categoria.Icono,
        activa=bool(categoria.Activo),
        esSistema=_es_sistema(categoria),
        cantidadUsos=cantidad_usos,
    )


def _obtener(db: Session, tipo: _Tipo, id_categoria: int, bloquear: bool = False):
    consulta = select(tipo.modelo).where(getattr(tipo.modelo, tipo.columna_id) == id_categoria)
    if bloquear:
        consulta = consulta.with_for_update()
    categoria = db.scalar(consulta)
    if categoria is None:
        raise CategoriaError("La categoría no existe.", 404, CATEGORY_NOT_FOUND)
    return categoria


def _validar_nombre_unico(db: Session, tipo: _Tipo, nombre: str, excluir_id: int | None = None) -> None:
    clave = normalizar_nombre(nombre)
    for categoria in db.scalars(select(tipo.modelo)).all():
        if excluir_id is not None and _id(tipo, categoria) == excluir_id:
            continue
        if normalizar_nombre(categoria.Nombre) == clave:
            raise CategoriaError(
                f'Ya existe una categoría de {tipo.etiqueta} llamada "{categoria.Nombre}".',
                409,
                CATEGORY_NAME_DUPLICATED,
            )


def _validar_no_es_ultima_activa(db: Session, tipo: _Tipo, categoria) -> None:
    if not categoria.Activo:
        return
    # Se bloquean las activas del tipo para que dos desactivaciones simultáneas no
    # dejen el tipo sin categorías.
    activas = db.scalars(
        select(tipo.modelo).where(tipo.modelo.Activo.is_(True)).with_for_update()
    ).all()
    if len(activas) <= 1:
        raise CategoriaError(
            f"Debe quedar al menos una categoría activa de {tipo.etiqueta}.",
            409,
            CATEGORY_LAST_ACTIVE,
        )


def _validar_no_es_sistema(categoria, accion: str) -> None:
    if _es_sistema(categoria):
        raise CategoriaError(
            f'La categoría "{categoria.Nombre}" la usa el sistema y no se puede {accion}.',
            409,
            CATEGORY_SYSTEM_PROTECTED,
        )


def listar(db: Session) -> CategoriasBackofficeListado:
    agrupadas: dict[str, list[CategoriaBackofficeRead]] = {}
    for clave_tipo, tipo in TIPOS.items():
        usos = _usos_por_categoria(db, tipo)
        categorias = db.scalars(select(tipo.modelo)).all()
        agrupadas[clave_tipo] = sorted(
            (_serializar(clave_tipo, c, usos.get(_id(tipo, c), 0)) for c in categorias),
            key=lambda c: (not c.activa, normalizar_nombre(c.nombre)),
        )
    return CategoriasBackofficeListado(**agrupadas)


def crear(db: Session, clave_tipo: str, nombre: str, icono: str) -> CategoriaBackofficeRead:
    tipo = _tipo(clave_tipo)
    _validar_nombre_unico(db, tipo, nombre)
    categoria = tipo.modelo(Nombre=nombre, Icono=icono, Activo=True)
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return _serializar(clave_tipo, categoria, 0)


def actualizar(
    db: Session, clave_tipo: str, id_categoria: int, nombre: str | None, icono: str | None
) -> CategoriaBackofficeRead:
    tipo = _tipo(clave_tipo)
    categoria = _obtener(db, tipo, id_categoria)
    if nombre is not None and nombre != categoria.Nombre:
        _validar_nombre_unico(db, tipo, nombre, excluir_id=id_categoria)
        categoria.Nombre = nombre
    if icono is not None:
        categoria.Icono = icono
    db.commit()
    db.refresh(categoria)
    return _serializar(clave_tipo, categoria, _cantidad_usos(db, tipo, id_categoria))


def cambiar_estado(db: Session, clave_tipo: str, id_categoria: int, activa: bool) -> CategoriaBackofficeRead:
    tipo = _tipo(clave_tipo)
    categoria = _obtener(db, tipo, id_categoria, bloquear=True)
    if not activa and categoria.Activo:
        _validar_no_es_sistema(categoria, "desactivar")
        _validar_no_es_ultima_activa(db, tipo, categoria)
    categoria.Activo = activa
    db.commit()
    db.refresh(categoria)
    return _serializar(clave_tipo, categoria, _cantidad_usos(db, tipo, id_categoria))


def eliminar(db: Session, clave_tipo: str, id_categoria: int) -> None:
    tipo = _tipo(clave_tipo)
    categoria = _obtener(db, tipo, id_categoria, bloquear=True)
    _validar_no_es_sistema(categoria, "eliminar")

    usos = _cantidad_usos(db, tipo, id_categoria)
    if usos:
        elementos = "elemento" if usos == 1 else "elementos"
        raise CategoriaError(
            f'La categoría "{categoria.Nombre}" está en uso en {usos} {elementos} y no se puede '
            "eliminar. Podés desactivarla para que no se ofrezca en nuevos registros.",
            409,
            CATEGORY_IN_USE,
        )
    _validar_no_es_ultima_activa(db, tipo, categoria)

    db.delete(categoria)
    db.commit()
