from __future__ import annotations

from datetime import datetime
from pathlib import Path
import textwrap
import unicodedata

from fastapi import UploadFile

from app.core.config import settings
from app.services.supabase.client import supabase


def limpiar_nombre_ruta(texto: str) -> str:
    if not texto:
        return ""

    nfkd_form = unicodedata.normalize("NFKD", texto)
    solo_ascii = "".join([char for char in nfkd_form if not unicodedata.combining(char)])
    return solo_ascii.replace(" ", "_")


def _normalizar_ruta(ruta_archivo: str) -> str:
    partes = ruta_archivo.split("/")
    partes_limpias = [limpiar_nombre_ruta(parte) for parte in partes]
    return "/".join(partes_limpias)


def subir_documento(archivo: UploadFile, ruta_archivo: str) -> str:
    contenido = archivo.file.read()
    ruta_limpia = _normalizar_ruta(ruta_archivo)

    supabase.storage.from_(settings.supabase_bucket).upload(
        path=ruta_limpia,
        file=contenido,
        file_options={"content-type": archivo.content_type},
    )

    return ruta_limpia


def subir_foto_perfil(archivo: UploadFile, user_id: int) -> str:
    extension = Path(archivo.filename or "foto.jpg").suffix.lower() or ".jpg"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    nombre_base = Path(archivo.filename or "foto").stem or "foto"
    ruta_archivo = f"profile-photos/{user_id}/{timestamp}-{nombre_base}{extension}"
    return subir_documento(archivo, ruta_archivo)


def subir_portada_viaje(archivo: UploadFile, trip_id: int) -> str:
    extension = Path(archivo.filename or "portada.jpg").suffix.lower() or ".jpg"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    nombre_base = Path(archivo.filename or "portada").stem or "portada"

    ruta_archivo = (
        f"trip-covers/{trip_id}/"
        f"{timestamp}-{nombre_base}{extension}"
    )

    return subir_documento(archivo, ruta_archivo)


def obtener_url_publica(ruta_archivo: str) -> str:
    return supabase.storage.from_(settings.supabase_bucket).get_public_url(ruta_archivo)


def eliminar_documento_storage(ruta_archivo: str) -> None:

    if not ruta_archivo:
        return
    
    try:
        ruta_limpia = ruta_archivo.strip("/")

        if "object/public/" in ruta_limpia:
            ruta_limpia = ruta_limpia.split("trip-documents/")[1]
        
        supabase.storage.from_("trip-documents").remove([ruta_limpia])
    except Exception as e:
        print(f"Error al eliminar documento en Supabase Storage: {e}")


def descargar_documento(ruta_archivo: str) -> bytes:
    """Descarga el contenido binario de un documento desde el bucket.

    Se usa desde el backend (en vez de redirigir a la URL pública) para
    poder validar que quien pide el archivo es realmente un integrante
    del viaje antes de entregar los bytes (AC3 de "Descargar documento").
    """
    return supabase.storage.from_(settings.supabase_bucket).download(ruta_archivo)


def eliminar_documento(ruta_archivo: str) -> None:
    """Elimina un documento del bucket de Supabase Storage."""
    supabase.storage.from_(settings.supabase_bucket).remove([ruta_archivo])

