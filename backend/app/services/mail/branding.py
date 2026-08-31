import base64
from functools import lru_cache
from pathlib import Path

_ICON_PATH = Path(__file__).resolve().parents[2] / "templates" / "emails" / "assets" / "cyanea_icon_manteca.png"


@lru_cache
def get_cyanea_icon_data_uri() -> str:
    """Devuelve el isotipo de Cyanea como data URI base64 para usar en
    templates de email (`<img src="{{ cyanea_icon_data_uri }}">`).

    Se incrusta en el propio correo (en vez de referenciar una URL publica)
    para no depender de hosting externo ni de que el cliente de mail
    descargue imagenes remotas.
    """
    data = _ICON_PATH.read_bytes()
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{encoded}"