import re
from pathlib import Path

import pytest

from app.services.mail.templates import render_template

APP = Path(__file__).resolve().parents[1] / "app"
# Solo los nombres literales; los que se arman en tiempo de ejecución no se pueden verificar así.
_REFERENCIA = re.compile(r'template_name\s*=\s*"([^"]+)"')


def _plantillas_referenciadas() -> list[str]:
    nombres = {
        nombre
        for archivo in APP.rglob("*.py")
        for nombre in _REFERENCIA.findall(archivo.read_text(encoding="utf-8"))
    }
    return sorted(nombres)


def test_se_encuentran_plantillas_referenciadas():
    assert len(_plantillas_referenciadas()) > 10


@pytest.mark.parametrize("nombre", _plantillas_referenciadas())
def test_toda_plantilla_referenciada_existe_y_se_renderiza(nombre):
    # Un correo con una plantilla inexistente falla en silencio: el envío se
    # registra como warning y el usuario nunca lo recibe.
    assert render_template(nombre, {}).strip()
