from functools import lru_cache

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings


@lru_cache
def get_template_environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(settings.mail_templates_dir)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_template(template_name: str, context: dict[str, object]) -> str:
    environment = get_template_environment()
    template = environment.get_template(template_name)
    return template.render(**context)
