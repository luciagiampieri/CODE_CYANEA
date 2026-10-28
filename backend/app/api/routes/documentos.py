import asyncio
import logging
import mimetypes
from urllib.parse import quote

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Response
from sqlalchemy import func, select
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
    CategoriasGastos,
    Checklist,
    Moneda,
)
from app.services import checklist_permisos
from app.schemas.documento_viaje import CategoriasDocumentosRead, DocumentoViajeRead
from app.services.registro_ia import SERVICIO_DETECCION_GASTOS_DOCUMENTOS, servicio_ia
from app.schemas.limite_plan import UsoLimiteRead

from app.services.supabase.storage import (
    subir_documento,
    obtener_url_publica,
    descargar_documento,
    eliminar_documento,
    eliminar_documento_storage
)

from app.services.limites_planes import presentar, uso_almacenamiento, validar_almacenamiento
from app.services.websocket_manager import manager
from app.services.trip_access import get_trip_with_relations, require_trip_access, require_trip_edit_access, require_trip_not_finished
from app.services.receipt_ai import (
    MAX_RECEIPT_BYTES,
    ReceiptExtractor,
    ReceiptScanError,
    construir_resultado,
    get_receipt_extractor,
    validar_esquema,
    validar_documento,
)
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

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
        FechaActualizacion=documento.FechaActualizacion,
        TamanoBytes=documento.TamanoBytes,
        NombreCategoria=documento.CategoriaDocumentoRelacion.Nombre,
        IconoCategoria=documento.CategoriaDocumentoRelacion.Icono,
        NombreUsuarioSubida=f"{documento.UsuarioSubida.Nombre} {documento.UsuarioSubida.Apellido}",
        EsPublico=documento.EsPublico,
        EsPropio=documento.IdUsuarioSubida == current_user_id,
    )


def _subir_al_almacenamiento(archivo: UploadFile, ruta_archivo: str) -> str:
    """Sube el archivo al bucket; si el almacenamiento lo rechaza se informa un
    error claro en lugar de un 500."""
    try:
        return subir_documento(archivo, ruta_archivo)
    except Exception:
        logger.exception("No se pudo subir el documento al almacenamiento (%s)", ruta_archivo)
        raise HTTPException(
            status_code=502,
            detail="No se pudo subir el archivo. Intentá nuevamente en unos minutos.",
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

@router.get("/documents/categories", response_model=list[CategoriasDocumentosRead])
def obtener_categorias_documentos(db: Session = Depends(get_db)):
    return (
        db.query(CategoriaDocumento)
        .filter(CategoriaDocumento.Activo.is_(True))
        .order_by(CategoriaDocumento.Nombre)
        .all()
    )

@router.post("/{trip_id}/documents")
async def subir_documento_viaje(
    trip_id: int,
    archivo: UploadFile = File(...),
    IdCategoriaDocumento: int = Form(...),
    NombreArchivo: str | None = Form(None),
    EsPublico: bool = Form(True),
    IdChecklist: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    extractor: ReceiptExtractor = Depends(get_receipt_extractor),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la documentación")

    tarea = None
    if IdChecklist is not None:
        tarea = db.get(Checklist, IdChecklist)
        if (
            tarea is None
            or tarea.IdViaje != trip_id
            or not checklist_permisos.puede_ver(tarea, current_user.IdUsuario)
        ):
            raise HTTPException(status_code=404, detail="La tarea no existe.")

    categoria = db.get(
        CategoriaDocumento,
        IdCategoriaDocumento
    )

    if not categoria:
        raise HTTPException(
            status_code=404,
            detail="Categoría de documento no encontrada"
        )
    if not categoria.Activo:
        raise HTTPException(
            status_code=400,
            detail="La categoría seleccionada está inactiva."
        )

    extensiones_permitidas = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png"
    }

    contenido = await archivo.read()
    tamano_bytes = len(contenido)
    
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

    validar_almacenamiento(db, viaje, tamano_bytes)

    await archivo.seek(0)

    url_archivo = _subir_al_almacenamiento(archivo, ruta_archivo)

    documento = DocumentoViaje(
        IdViaje=trip_id,
        IdCategoriaDocumento=IdCategoriaDocumento,
        IdUsuarioSubida=current_user.IdUsuario,
        NombreArchivo=nombre_final,
        UrlArchivo=url_archivo,
        TamanoBytes=tamano_bytes,
        EsPublico=EsPublico
    )

    db.add(documento)
    if tarea is not None:
        tarea.Documentos.append(documento)

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
    if tarea is not None:
        await manager.broadcast_to_trip(trip_id, {"tipo": "checklist_actualizado"})

    sugerencia_gasto = None
    try:
        if current_user.ConsienteProcesamientoIA and extension in {".jpg", ".jpeg", ".png", ".pdf"}:
            
            mime = validar_documento(contenido, archivo.filename)
            
            categorias_gastos = {
                cat.Nombre: cat.IdCategoria
                for cat in db.scalars(select(CategoriasGastos).where(CategoriasGastos.Activo.is_(True))).all()
            }
            monedas = {codigo.upper() for codigo in db.scalars(select(Moneda.Codigo)).all()}

            with servicio_ia(SERVICIO_DETECCION_GASTOS_DOCUMENTOS):
                crudo = await asyncio.wait_for(
                    extractor.extraer(contenido, mime, list(categorias_gastos.keys())),
                    timeout=settings.ai_receipt_timeout_seconds + 1,
                )
            resultado_ia = construir_resultado(validar_esquema(crudo), categorias_gastos, monedas)
            
            if resultado_ia and resultado_ia.MontoOriginal is not None:
                sugerencia_gasto = {
                    "Nombre": resultado_ia.Nombre,
                    "MontoOriginal": float(resultado_ia.MontoOriginal) if resultado_ia.MontoOriginal else None,
                    "MonedaOriginal": resultado_ia.MonedaOriginal,
                    "FechaGasto": resultado_ia.FechaGasto.isoformat() if resultado_ia.FechaGasto else None,
                    "IdCategoria": resultado_ia.IdCategoria,
                    "CamposBajaConfianza": resultado_ia.CamposBajaConfianza,
                }
    except Exception as e:
        logger.warning("No se pudo realizar la detección automática de gasto en el documento subido: %s", e)

    response_data = {
        "message": "Documento subido correctamente",
        "IdDocumento": documento.IdDocumento,
    }
    if tarea is not None:
        response_data["IdChecklist"] = tarea.IdChecklist
    if sugerencia_gasto:
        response_data["sugerencia_gasto"] = sugerencia_gasto

    return response_data


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


@router.get("/{trip_id}/documents/almacenamiento", response_model=UsoLimiteRead)
def obtener_almacenamiento_viaje(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> UsoLimiteRead:
    viaje = require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    return UsoLimiteRead(**presentar(uso_almacenamiento(db, viaje)))


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
    require_trip_not_finished(viaje, "la documentación")

    documento = _obtener_documento_del_viaje(db, trip_id, document_id, current_user)

    if documento.IdUsuarioSubida != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo el usuario que cargó el documento puede modificarlo."
        )
    
    if IdCategoriaDocumento is not None and IdCategoriaDocumento != documento.IdCategoriaDocumento:
        categoria = db.get(CategoriaDocumento, IdCategoriaDocumento)
        if not categoria:
            raise HTTPException(
                status_code=404,
                detail="Categoría de documento no encontrada"
            )
        if not categoria.Activo:
            raise HTTPException(
                status_code=400,
                detail="La categoría seleccionada está inactiva."
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

        contenido_nuevo = await archivo.read()
        tamano_nuevo = len(contenido_nuevo)
        diferencia = tamano_nuevo - (documento.TamanoBytes or 0)
        if diferencia > 0:
            validar_almacenamiento(db, viaje, diferencia)
        await archivo.seek(0)
            
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
                    
        url_archivo = _subir_al_almacenamiento(archivo, ruta_archivo)
        documento.UrlArchivo = url_archivo
        documento.TamanoBytes = tamano_nuevo
        documento.FechaActualizacion = func.now()

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
    if documento.Checklists:
        await manager.broadcast_to_trip(trip_id, {"tipo": "checklist_actualizado"})
    
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
    require_trip_not_finished(viaje, "la documentación")

    documento = _obtener_documento_del_viaje(db, trip_id, document_id, current_user)

    if documento.IdUsuarioSubida != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien subió el documento puede eliminarlo."
        )

    try:
        eliminar_documento(documento.UrlArchivo)
    except Exception:
        pass

    estaba_en_tareas = bool(documento.Checklists)
    db.delete(documento)
    db.commit()

    await manager.broadcast_to_trip(
            trip_id,
            {"tipo": "documento_actualizado"}
        )
    if estaba_en_tareas:
        await manager.broadcast_to_trip(trip_id, {"tipo": "checklist_actualizado"})

    return {"message": "Documento eliminado correctamente."}