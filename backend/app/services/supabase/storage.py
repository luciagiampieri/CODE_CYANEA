import unicodedata
from fastapi import UploadFile
from app.services.supabase.client import supabase
from app.core.config import settings


def limpiar_nombre_ruta(texto: str) -> str:
    """Remueve tildes, acentos y espacios para que Supabase Storage no devuelva error 400."""
    if not texto:
        return ""
    # Normaliza caracteres Unicode (separa la letra de su tilde) y descarta la tilde
    nfkd_form = unicodedata.normalize('NFKD', texto)
    solo_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    # Reemplaza espacios por guiones bajos por seguridad
    return solo_ascii.replace(" ", "_")


def subir_documento(
    archivo: UploadFile,
    ruta_archivo: str
) -> str:
    contenido = archivo.file.read()

    # Sanitizamos cada segmento de la ruta o la ruta entera para limpiar tildes (ej: Documentación -> Documentacion)
    partes = ruta_archivo.split("/")
    partes_limpias = [limpiar_nombre_ruta(parte) for parte in partes]
    ruta_limpia = "/".join(partes_limpias)

    supabase.storage.from_(settings.supabase_bucket).upload(
        path=ruta_limpia,
        file=contenido,
        file_options={
            "content-type": archivo.content_type
        }
    )

    return ruta_limpia


def obtener_url_publica(ruta_archivo: str) -> str:
    """Arma la URL pública completa a partir de la ruta guardada en el bucket.

    Asume que el bucket 'trip-documents' está configurado como público en
    Supabase. Si en algún momento pasa a ser privado, esta función debería
    reemplazarse por supabase.storage.from_(...).create_signed_url(...),
    que genera URLs temporales en vez de permanentes.
    """
    return supabase.storage.from_(settings.supabase_bucket).get_public_url(ruta_archivo)