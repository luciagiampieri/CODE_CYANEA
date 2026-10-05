"""Comprobante escaneado asociado a un gasto y guardado en el repositorio (US 96).

Reglas:
- Se guarda como DocumentoViaje en la categoría "Comprobantes" (se crea si falta).
- Nombre: "Comprobante - [nombre del gasto] - [dd-mm-aaaa]", con sufijo
    " (2)", " (3)"... si ya existe (la unicidad de nombres es por viaje).
- Se crea público: lo ven todos los participantes, igual que el gasto.
- Se rige por las reglas de acceso de los documentos del viaje (RN-28, RNF-14).
"""

from __future__ import annotations

import io
import re
from datetime import date

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from app.models import CategoriaDocumento, DocumentoViaje, Gasto, Usuario
from app.services.supabase.storage import subir_documento

CATEGORIA_COMPROBANTES = "Comprobantes"
LARGO_MAXIMO_NOMBRE_GASTO = 100  

EXTENSION_POR_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
}

_CARACTERES_NO_PERMITIDOS = re.compile(r"[^\w\s\-\.\(\),]", re.UNICODE)


def sanitizar_texto(texto: str | None) -> str:
    limpio = (texto or "").replace("/", "-").replace("\\", "-")
    limpio = _CARACTERES_NO_PERMITIDOS.sub("", limpio)
    limpio = re.sub(r"\s+", " ", limpio).strip()
    return limpio or "Gasto"


def construir_nombre_base(nombre_gasto: str, fecha_gasto: date) -> str:
    nombre = sanitizar_texto(nombre_gasto)[:LARGO_MAXIMO_NOMBRE_GASTO].strip()
    return f"Comprobante - {nombre} - {fecha_gasto.strftime('%d-%m-%Y')}"


def generar_nombre_unico(db: Session, viaje_id: int, base: str, extension: str) -> str:
    existentes = set(
        db.scalars(
            select(DocumentoViaje.NombreArchivo).where(DocumentoViaje.IdViaje == viaje_id)
        ).all()
    )
    candidato = f"{base}{extension}"
    numero = 2
    while candidato in existentes:
        candidato = f"{base} ({numero}){extension}"
        numero += 1
    return candidato


def obtener_o_crear_categoria(db: Session) -> CategoriaDocumento:
    categoria = db.scalar(
        select(CategoriaDocumento).where(CategoriaDocumento.Nombre == CATEGORIA_COMPROBANTES)
    )
    if categoria is None:
        categoria = CategoriaDocumento(Nombre=CATEGORIA_COMPROBANTES)
        db.add(categoria)
        db.flush()
    return categoria


def guardar_comprobante(
    db: Session,
    gasto: Gasto,
    usuario: Usuario,
    contenido: bytes,
    mime: str,
) -> DocumentoViaje:
    extension = EXTENSION_POR_MIME[mime]
    categoria = obtener_o_crear_categoria(db)
    nombre = generar_nombre_unico(
        db,
        gasto.IdViaje,
        construir_nombre_base(gasto.Nombre, gasto.FechaGasto),
        extension,
    )
    ruta = f"viajes/{gasto.IdViaje}/{categoria.Nombre}/{nombre}"

    archivo = UploadFile(
        file=io.BytesIO(contenido),
        filename=nombre,
        headers=Headers({"content-type": mime}),
    )
    url_archivo = subir_documento(archivo, ruta)

    documento = DocumentoViaje(
        IdViaje=gasto.IdViaje,
        IdCategoriaDocumento=categoria.IdCategoriaDocumento,
        IdUsuarioSubida=usuario.IdUsuario,
        NombreArchivo=nombre,
        UrlArchivo=url_archivo,
        EsPublico=True,
    )
    db.add(documento)
    db.flush()

    gasto.IdDocumentoComprobante = documento.IdDocumento
    return documento