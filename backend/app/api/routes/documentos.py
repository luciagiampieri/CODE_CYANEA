from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from pathlib import Path

from app.db.session import get_db
from app.api.deps import get_current_user
from sqlalchemy.exc import IntegrityError

from app.models import (
    Usuario,
    Viaje,
    CategoriaDocumento,
    DocumentoViaje,
    ParticipanteViaje,
    EstadoParticipacion,
)
from app.schemas.documento_viaje import DocumentoViajeRead

from app.services.supabase.storage import subir_documento, obtener_url_publica
from app.services.websocket_manager import manager

router = APIRouter()


def _verificar_participante_aceptado(
    db: Session,
    trip_id: int,
    current_user: Usuario,
) -> None:
    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True)
        )
    )

    if not estado_aceptado:
        raise HTTPException(
            status_code=500,
            detail="Estado aceptado no configurado"
        )

    participante = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion
        )
    )

    if not participante:
        raise HTTPException(
            status_code=403,
            detail="No formas parte de este viaje"
        )


def _serializar_documento(documento: DocumentoViaje) -> DocumentoViajeRead:
    return DocumentoViajeRead(
        IdDocumento=documento.IdDocumento,
        IdViaje=documento.IdViaje,
        IdCategoriaDocumento=documento.IdCategoriaDocumento,
        IdUsuarioSubida=documento.IdUsuarioSubida,
        NombreArchivo=documento.NombreArchivo,
        UrlArchivo=obtener_url_publica(documento.UrlArchivo),
        FechaSubida=documento.FechaSubida,
        NombreCategoria=documento.CategoriaDocumentoRelacion.Nombre,
        NombreUsuarioSubida=f"{documento.UsuarioSubida.Nombre} {documento.UsuarioSubida.Apellido}",
    )

@router.get("/documents/categories")
def obtener_categorias_documentos(db: Session = Depends(get_db)):
    categorias = (
        db.query(CategoriaDocumento)
        .all()
    )

    return categorias

@router.post("/{trip_id}/documents")
async def subir_documento_viaje(
    trip_id: int,
    archivo: UploadFile = File(...),
    IdCategoriaDocumento: int = Form(...),
    NombreArchivo: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    
    viaje = db.get(Viaje, trip_id)

    if not viaje:
        raise HTTPException(
            status_code=404,
            detail="Viaje no encontrado"
        )


    categoria = db.get(
        CategoriaDocumento,
        IdCategoriaDocumento
    )

    if not categoria:
        raise HTTPException(
            status_code=404,
            detail="Categoría de documento no encontrada"
        )


    _verificar_participante_aceptado(db, trip_id, current_user)

    extensiones_permitidas = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png"
    }

    extension = Path(archivo.filename).suffix.lower()

    if extension not in extensiones_permitidas:
        raise HTTPException(
            status_code=400,
            detail="Tipo de archivo no permitido. Solo se permiten PDF, JPG, JPEG y PNG."
        )

    nombre_final = NombreArchivo or archivo.filename

    if not nombre_final:
            raise HTTPException(
                status_code=400,
                detail="El nombre del documento es obligatorio."
            )

    nombre_final = nombre_final.strip()

    if not nombre_final:
        raise HTTPException(
            status_code=400,
            detail="El nombre del documento es obligatorio."
        )

    if not Path(nombre_final).suffix:
        nombre_final = f"{nombre_final}{extension}"

    ruta_archivo = (
        f"viajes/{trip_id}/"
        f"{categoria.Nombre}/"
        f"{nombre_final}"
    )

    documento_existente = db.scalar(
        select(DocumentoViaje).where(
            DocumentoViaje.IdViaje == trip_id,
            DocumentoViaje.NombreArchivo == nombre_final
        )
    )

    if documento_existente:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un documento con ese nombre en este viaje."
        )

    url_archivo = subir_documento(
        archivo,
        ruta_archivo
    )

    documento = DocumentoViaje(
        IdViaje=trip_id,
        IdCategoriaDocumento=IdCategoriaDocumento,
        IdUsuarioSubida=current_user.IdUsuario,
        NombreArchivo=nombre_final,
        UrlArchivo=url_archivo
    )

    db.add(documento)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un documento con ese nombre en este viaje."
        )

    db.refresh(documento)

    return {
        "message": "Documento subido correctamente",
        "IdDocumento": documento.IdDocumento
    }


@router.get("/{trip_id}/documents", response_model=list[DocumentoViajeRead])
def listar_documentos_viaje(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = db.get(Viaje, trip_id)

    if not viaje:
        raise HTTPException(
            status_code=404,
            detail="Viaje no encontrado"
        )

    _verificar_participante_aceptado(db, trip_id, current_user)

    documentos = (
        db.query(DocumentoViaje)
        .filter(DocumentoViaje.IdViaje == trip_id)
        .order_by(DocumentoViaje.FechaSubida.desc())
        .all()
    )

    return [_serializar_documento(documento) for documento in documentos]