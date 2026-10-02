import base64
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_ICON_PATH = Path(__file__).resolve().parents[2] / "templates" / "emails" / "assets" / "cyanea_icon_manteca.png"


@lru_cache
def get_cyanea_icon_data_uri() -> str:
    """Devuelve el isotipo de Cyanea como data URI base64 para usar en
    templates de email (`<img src="{{ cyanea_icon_data_uri }}">`).

    Se incrusta en el propio correo (en vez de referenciar una URL publica)
    para no depender de hosting externo ni de que el cliente de mail
    descargue imagenes remotas.

    Si el archivo no existe, devuelve un string vacio para que el envio del
    correo no falle.
    """
    try:
        data = _ICON_PATH.read_bytes()
    except FileNotFoundError:
        logger.warning("No se encontro el icono de email en %s", _ICON_PATH)
        return ""
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{encoded}"