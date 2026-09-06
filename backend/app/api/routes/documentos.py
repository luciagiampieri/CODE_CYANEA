import mimetypes
from urllib.parse import quote

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response
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

from app.services.supabase.storage import (
    subir_documento,
    obtener_url_publica,
    descargar_documento,
    eliminar_documento,
    eliminar_documento_storage
)

from app.services.websocket_manager import manager
from app.services.trip_access import get_trip_with_relations, require_trip_access, require_trip_edit_access

router = APIRouter()

def _serializar_documento(
    documento: DocumentoViaje, current_user_id: int
) -> DocumentoViajeRead:
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
        EsPublico=documento.EsPublico,
        EsPropio=documento.IdUsuarioSubida == current_user_id,
    )


def _obtener_documento_del_viaje(
    db: Session, trip_id: int, document_id: int, current_user: Usuario
) -> DocumentoViaje:
    documento = db.get(DocumentoViaje, document_id)

    if not documento or documento.IdViaje != trip_id:
        raise HTTPException(
            status_code=404,
            detail="El documento no existe."
        )
    
    if not documento.EsPublico and documento.IdUsuarioSubida != current_user.IdUsuario:
        raise HTTPException(
            status_code=404,
            detail="El documento no existe o no tenés permiso para verlo."
        )
    return documento

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
    EsPublico: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
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
        UrlArchivo=url_archivo,
        EsPublico=EsPublico
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

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "documento_actualizado"}
    )

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
    viaje = require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )

    participacion = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
        )
    )

    consulta = db.query(DocumentoViaje).filter(
        DocumentoViaje.IdViaje == trip_id
    ).filter(
        (DocumentoViaje.EsPublico.is_(True)) | 
        (DocumentoViaje.IdUsuarioSubida == current_user.IdUsuario)
    )

    if (
        participacion is not None
        and participacion.EstadoParticipacion.Nombre == "salio"
    ):
        consulta = consulta.filter(
            DocumentoViaje.FechaSubida <= participacion.FechaSalida
        )

    documentos = (
        consulta
        .filter(DocumentoViaje.IdViaje == trip_id)
        .order_by(DocumentoViaje.FechaSubida.desc())
        .all()
    )

    return [_serializar_documento(documento, current_user.IdUsuario) for documento in documentos]


@router.put("/{trip_id}/documents/{document_id}")
async def editar_o_reemplazar_documento_viaje(
    trip_id: int,
    document_id: int,
    archivo: UploadFile | None = File(None),
    IdCategoriaDocumento: int | None = Form(None),
    NombreArchivo: str | None = Form(None),
    EsPublico: bool | None = Form(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )

    documento = _obtener_documento_del_viaje(db, trip_id, document_id, current_user)

    if documento.IdUsuarioSubida != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo el usuario que cargó el documento puede modificarlo."
        )
    
    if IdCategoriaDocumento is not None:
        categoria = db.get(CategoriaDocumento, IdCategoriaDocumento)
        if not categoria:
            raise HTTPException(
                status_code=404,
                detail="Categoría de documento no encontrada"
            )
        
        documento.IdCategoriaDocumento = IdCategoriaDocumento
        
    categoria_actual = db.get(CategoriaDocumento, documento.IdCategoriaDocumento)
    
    if NombreArchivo is not None:
        nombre_limpio = NombreArchivo.strip()

        if not nombre_limpio:
            raise HTTPException(
                status_code=400,
                detail="El nombre del documento no puede estar vacío."
            )
        
        extension_actual = Path(documento.NombreArchivo).suffix

        if not Path(nombre_limpio).suffix:
            nombre_limpio = f"{nombre_limpio}{extension_actual}"

        documento.NombreArchivo = nombre_limpio
    
    if EsPublico is not None:
        documento.EsPublico = EsPublico

    if archivo is not None and archivo.filename:

        extensiones_permitidas = {".pdf", ".jpg", ".jpeg", ".png"}
        nueva_extension = Path(archivo.filename).suffix.lower()
    
        if nueva_extension not in extensiones_permitidas:
            raise HTTPException(
                status_code=400,
                detail="Tipo de archivo no permitido. Solo se permiten PDF, JPG, JPEG y PNG."
            )
            
        ruta_archivo_vieja = documento.UrlArchivo
    
        stem_nombre_actual = Path(documento.NombreArchivo).stem
        documento.NombreArchivo = f"{stem_nombre_actual}{nueva_extension}"
    
        ruta_archivo = (
            f"viajes/{trip_id}/"
            f"{categoria_actual.Nombre}/"
            f"{documento.NombreArchivo}"
        )
    
        if ruta_archivo_vieja:
            try:
                eliminar_documento_storage(ruta_archivo_vieja)        
            except Exception as e:
                    print("ERROR CRÍTICO AL ELIMINAR EN SUPABASE:", e)
                    
        url_archivo = subir_documento(archivo, ruta_archivo)
        documento.UrlArchivo = url_archivo

    duplicado = db.scalar(
        select(DocumentoViaje).where(
            DocumentoViaje.IdViaje == trip_id,
            DocumentoViaje.NombreArchivo == documento.NombreArchivo,
            DocumentoViaje.IdDocumento != document_id
        )
    )

    if duplicado:
        raise HTTPException(
            status_code=409,
            detail="Ya existe otro documento con ese nombre en este viaje."
        )
    
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Error de integridad al actualizar el documento."
        )
    
    db.refresh(documento)
    
    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "documento_actualizado"}
    )
    
    return {
        "message": "Documento actualizado correctamente.",
        "IdDocumento": documento.IdDocumento,
        "item": _serializar_documento(documento, current_user.IdUsuario)
    }


@router.get("/{trip_id}/documents/{document_id}/download")
def descargar_documento_viaje(
    trip_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )  

    documento = _obtener_documento_del_viaje(db, trip_id, document_id, current_user)

    participacion = db.scalar(
        select(ParticipanteViaje).where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
        )
    )

    if (
        participacion is not None
        and participacion.EstadoParticipacion.Nombre == "salio"
        and participacion.FechaSalida is not None
        and documento.FechaSubida > participacion.FechaSalida
    ):
        raise HTTPException(
            status_code=403,
            detail="No puedes acceder a documentos subidos después de abandonar el viaje.",
        )

    try:
        contenido = descargar_documento(documento.UrlArchivo)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail="El documento ya no está disponible para descargar."
        )

    tipo_contenido, _ = mimetypes.guess_type(documento.NombreArchivo)
    nombre_codificado = quote(documento.NombreArchivo)

    return Response(
        content=contenido,
        media_type=tipo_contenido or "application/octet-stream",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{documento.NombreArchivo}"; '
                f"filename*=UTF-8''{nombre_codificado}"
            )
        },
    )


@router.delete("/{trip_id}/documents/{document_id}")
async def eliminar_documento_viaje(
    trip_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )

    documento = _obtener_documento_del_viaje(db, trip_id, document_id, current_user)

    if documento.IdUsuarioSubida != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien subió el documento puede eliminarlo."
        )

    try:
        eliminar_documento(documento.UrlArchivo)
    except Exception:
        # No bloqueamos la eliminación del registro si el archivo ya no
        # está en el storage (por ejemplo, borrado manualmente antes).
        pass

    db.delete(documento)
    db.commit()

    await manager.broadcast_to_trip(
            trip_id,
            {"tipo": "documento_actualizado"}
        )

    return {"message": "Documento eliminado correctamente."}