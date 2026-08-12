from __future__ import annotations

from datetime import datetime
from pathlib import Path
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


def obtener_url_publica(ruta_archivo: str) -> str:
    return supabase.storage.from_(settings.supabase_bucket).get_public_url(ruta_archivo)
