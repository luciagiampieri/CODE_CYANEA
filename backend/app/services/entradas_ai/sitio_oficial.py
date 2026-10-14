"""Consulta del sitio web oficial de un establecimiento.

El sitio oficial es el `websiteUri` que Google Places publica para el lugar
(dato del perfil del establecimiento). Desde el backend se descarga la página de
inicio y, como máximo, algunas páginas internas del mismo sitio que por su
dirección o su texto hablan de entradas, reservas o la visita. El contenido se
convierte a texto plano y a una lista de enlaces para que el intérprete (Gemini)
lo analice; luego se verifica que la evidencia exista literalmente en ese texto.

Medidas de seguridad:
- Solo http/https, sin credenciales en la URL ni puertos no estándar.
- El host debe resolver a direcciones públicas (evita SSRF a la red interna).
- Las redirecciones se siguen a mano, validando cada salto y sin salir del sitio.
- Se limita el tamaño descargado y solo se aceptan respuestas HTML/texto.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import re
import socket
import unicodedata
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlsplit

import httpx

from app.services.entradas_ai import vocabulario
from app.services.entradas_ai.tipos import ErrorAnalisisEntradas, Pagina

logger = logging.getLogger(__name__)

MAX_BYTES_PAGINA = 1_500_000
MAX_TEXTO_PAGINA = 8_000
MAX_ENLACES_PAGINA = 80
MAX_REDIRECCIONES = 3
# Menos texto que esto se considera una página vacía (armada con JavaScript o bloqueada).
MIN_TEXTO_UTIL = 300
ACCEPT_LANGUAGE = "es-AR,es;q=0.9,en;q=0.6,*;q=0.3"
USER_AGENT = "CyaneaBot/1.0 (+https://cyanea.app; planificador de viajes)"

# Sufijos de segundo nivel habituales en dominios de país (museo.gob.ar, x.com.br).
_SEGUNDO_NIVEL = {"com", "org", "gob", "gov", "edu", "net", "co", "ac", "gub", "go", "or", "ne", "mil", "nic"}

# Sitios que no pueden ser el sitio oficial de un establecimiento: redes sociales,
# buscadores, enciclopedias, agregadores de reseñas y revendedores de entradas.
_TERCEROS_NOMBRE = {
    "facebook", "instagram", "twitter", "tiktok", "youtube", "linkedin", "whatsapp",
    "pinterest", "threads", "linktr", "google", "wikipedia", "wikimedia", "tripadvisor",
    "booking", "expedia", "despegar", "airbnb", "getyourguide", "viator", "civitatis",
    "tiqets", "musement", "headout", "klook", "eventbrite", "ticketmaster", "yelp",
    "foursquare", "trip", "hotels", "kayak", "trivago", "groupon",
}
_TERCEROS_DOMINIO = {"x.com", "fb.com", "wa.me", "goo.gl", "t.co", "bit.ly", "g.page", "maps.app.goo.gl"}

_PALABRAS_CANDIDATAS = vocabulario.PAGINAS_RELEVANTES
_EXTENSIONES_DESCARTADAS = (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".zip", ".mp4", ".mp3", ".doc", ".docx")


# ---------------------------------------------------------------------------
# URLs y dominios
# ---------------------------------------------------------------------------

def _host(url: str) -> str | None:
    try:
        host = urlsplit(url).hostname
    except ValueError:
        return None
    return host.lower().rstrip(".") if host else None


def dominio_base(host: str) -> str:
    """Dominio registrable aproximado: `www.museodelprado.es` -> `museodelprado.es`,
    `entradas.museo.gob.ar` -> `museo.gob.ar`."""
    partes = [p for p in host.lower().rstrip(".").split(".") if p]
    if len(partes) <= 2:
        return ".".join(partes)
    if len(partes[-1]) == 2 and partes[-2] in _SEGUNDO_NIVEL:
        return ".".join(partes[-3:])
    return ".".join(partes[-2:])


def es_dominio_de_terceros(url: str) -> bool:
    host = _host(url)
    if not host:
        return True
    base = dominio_base(host)
    if base in _TERCEROS_DOMINIO or host in _TERCEROS_DOMINIO:
        return True
    return base.split(".")[0] in _TERCEROS_NOMBRE


def _es_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        return False


def normalizar_url_oficial(url: str | None) -> str | None:
    """Valida el sitio web informado por Google Places. Devuelve None si no puede
    considerarse un sitio oficial consultable."""
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    try:
        partes = urlsplit(url)
        puerto = partes.port
    except ValueError:
        return None
    if partes.scheme not in ("http", "https") or not partes.hostname:
        return None
    if partes.username or partes.password or puerto not in (None, 80, 443):
        return None
    host = partes.hostname.lower()
    if _es_ip_literal(host) or "." not in host or host.endswith(".local") or host == "localhost":
        return None
    if es_dominio_de_terceros(url):
        return None
    return urldefrag(url)[0]


def mismo_sitio(url: str | None, url_oficial: str) -> bool:
    """True si `url` pertenece al mismo dominio registrable que el sitio oficial."""
    if not url:
        return False
    host, host_oficial = _host(url), _host(url_oficial)
    if not host or not host_oficial:
        return False
    try:
        if urlsplit(url).scheme not in ("http", "https"):
            return False
    except ValueError:
        return False
    return dominio_base(host) == dominio_base(host_oficial)


# Plataformas de reservas que los restaurantes enlazan desde su sitio oficial.
PLATAFORMAS_RESERVA = {
    "opentable": "OpenTable",
    "resy": "Resy",
    "sevenrooms": "SevenRooms",
    "exploretock": "Tock",
    "tock": "Tock",
    "thefork": "TheFork",
    "eltenedor": "ElTenedor",
    "covermanager": "CoverManager",
    "quandoo": "Quandoo",
    "tablecheck": "TableCheck",
    "meitre": "Meitre",
    "woki": "Woki",
}


def plataforma_de_reserva(url: str | None) -> str | None:
    """Nombre de la plataforma de reservas si `url` es de una conocida."""
    host = _host(url or "")
    if not host:
        return None
    return PLATAFORMAS_RESERVA.get(dominio_base(host).split(".")[0])


def es_url_oficial_valida(url: str | None, url_oficial: str) -> bool:
    """Un enlace se presenta como oficial solo si es del mismo sitio oficial."""
    return mismo_sitio(url, url_oficial) and not es_dominio_de_terceros(url)


# ---------------------------------------------------------------------------
# Red (SSRF)
# ---------------------------------------------------------------------------

async def _resolver_ips(host: str) -> list[str]:
    infos = await asyncio.to_thread(socket.getaddrinfo, host, None, proto=socket.IPPROTO_TCP)
    return [info[4][0] for info in infos]


async def _validar_host_publico(url: str) -> None:
    host = _host(url)
    if not host or _es_ip_literal(host):
        raise ErrorAnalisisEntradas("host inválido")
    try:
        ips = await _resolver_ips(host)
    except OSError as error:
        raise ErrorAnalisisEntradas(f"no se pudo resolver {host}: {error}") from error
    if not ips:
        raise ErrorAnalisisEntradas(f"{host} no resuelve")
    for ip in ips:
        direccion = ipaddress.ip_address(ip.split("%")[0])
        if not direccion.is_global:
            raise ErrorAnalisisEntradas(f"{host} resuelve a una dirección no pública")


# ---------------------------------------------------------------------------
# HTML -> texto + enlaces
# ---------------------------------------------------------------------------

_ETIQUETAS_OCULTAS = {"script", "style", "noscript", "svg", "template", "iframe", "head"}
_ETIQUETAS_BLOQUE = {
    "p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "table", "section", "article",
    "header", "footer", "nav", "main", "aside", "h1", "h2", "h3", "h4", "h5", "h6",
    "dt", "dd", "button", "form", "label", "option",
}


class _ExtractorHTML(HTMLParser):
    def __init__(self, url_base: str):
        super().__init__(convert_charrefs=True)
        self.url_base = url_base
        self.partes: list[str] = []
        self.enlaces: list[dict[str, str]] = []
        self._oculto = 0
        self._enlace_href: str | None = None
        self._enlace_texto: list[str] = []
        self._titulo: list[str] = []
        self._en_titulo = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._en_titulo = True
            return
        if tag in _ETIQUETAS_OCULTAS:
            self._oculto += 1
            return
        if tag in _ETIQUETAS_BLOQUE:
            self.partes.append("\n")
        if tag == "a" and not self._oculto:
            href = dict(attrs).get("href")
            self._enlace_href = href
            self._enlace_texto = []
            etiqueta = dict(attrs).get("aria-label") or dict(attrs).get("title")
            if etiqueta:
                self._enlace_texto.append(etiqueta)

    def handle_endtag(self, tag):
        if tag == "title":
            self._en_titulo = False
            return
        if tag in _ETIQUETAS_OCULTAS:
            self._oculto = max(0, self._oculto - 1)
            return
        if tag in _ETIQUETAS_BLOQUE:
            self.partes.append("\n")
        if tag == "a" and self._enlace_href is not None:
            self._registrar_enlace()

    def handle_data(self, data):
        if self._en_titulo:
            self._titulo.append(data)
            return
        if self._oculto:
            return
        self.partes.append(data)
        if self._enlace_href is not None:
            self._enlace_texto.append(data)

    def _registrar_enlace(self):
        href = (self._enlace_href or "").strip()
        texto = _colapsar(" ".join(self._enlace_texto))
        self._enlace_href = None
        self._enlace_texto = []
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            return
        absoluta = urldefrag(urljoin(self.url_base, href))[0]
        if urlsplit(absoluta).scheme not in ("http", "https"):
            return
        if any(e["url"] == absoluta for e in self.enlaces):
            return
        if len(self.enlaces) < MAX_ENLACES_PAGINA:
            self.enlaces.append({"url": absoluta, "texto": texto[:120]})

    @property
    def titulo(self) -> str:
        return _colapsar(" ".join(self._titulo))


def _colapsar(texto: str) -> str:
    return re.sub(r"\s+", " ", texto or "").strip()


def extraer_pagina(url: str, html: str) -> Pagina:
    parser = _ExtractorHTML(url)
    try:
        parser.feed(html)
        parser.close()
    except Exception as error:  # HTML muy roto: se usa lo que se pudo leer
        logger.info("HTML ilegible parcialmente en %s: %s", url, error)
    lineas = [_colapsar(linea) for linea in "".join(parser.partes).split("\n")]
    texto = "\n".join(linea for linea in lineas if linea)
    if parser.titulo:
        texto = f"{parser.titulo}\n{texto}"
    return Pagina(url=url, texto=texto[:MAX_TEXTO_PAGINA], enlaces=parser.enlaces)


# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------

async def descargar_pagina(url: str, url_oficial: str, timeout_seconds: float) -> Pagina:
    """Descarga una página del sitio oficial siguiendo redirecciones dentro del sitio."""
    actual = url
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds, connect=min(5.0, timeout_seconds)),
        follow_redirects=False,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            # Muchos sitios internacionales devuelven su versión en español si existe.
            "Accept-Language": ACCEPT_LANGUAGE,
        },
    ) as client:
        for _ in range(MAX_REDIRECCIONES + 1):
            if not mismo_sitio(actual, url_oficial):
                raise ErrorAnalisisEntradas("la página redirige fuera del sitio oficial")
            await _validar_host_publico(actual)
            try:
                async with client.stream("GET", actual) as response:
                    if response.is_redirect:
                        destino = response.headers.get("location")
                        if not destino:
                            raise ErrorAnalisisEntradas("redirección sin destino")
                        actual = urldefrag(urljoin(actual, destino))[0]
                        continue
                    if response.status_code != 200:
                        raise ErrorAnalisisEntradas(f"HTTP {response.status_code}")
                    tipo = (response.headers.get("content-type") or "").lower()
                    if tipo and "html" not in tipo and "text/plain" not in tipo:
                        raise ErrorAnalisisEntradas(f"contenido no HTML ({tipo})")
                    contenido = bytearray()
                    async for bloque in response.aiter_bytes():
                        contenido.extend(bloque)
                        if len(contenido) > MAX_BYTES_PAGINA:
                            break
                    codificacion = response.charset_encoding or "utf-8"
            except httpx.HTTPError as error:
                raise ErrorAnalisisEntradas(f"error de red: {error}") from error
            try:
                html = bytes(contenido[:MAX_BYTES_PAGINA]).decode(codificacion, errors="replace")
            except LookupError:
                html = bytes(contenido[:MAX_BYTES_PAGINA]).decode("utf-8", errors="replace")
            return extraer_pagina(actual, html)
    raise ErrorAnalisisEntradas("demasiadas redirecciones")


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )


def seleccionar_paginas_candidatas(inicio: Pagina, url_oficial: str, maximo: int) -> list[str]:
    """Páginas internas del sitio oficial que probablemente hablen de entradas o reservas."""
    if maximo <= 0:
        return []
    puntuadas: list[tuple[int, int, str]] = []
    visitadas = {urldefrag(inicio.url)[0].rstrip("/"), urldefrag(url_oficial)[0].rstrip("/")}
    for orden, enlace in enumerate(inicio.enlaces):
        url = enlace["url"]
        if url.rstrip("/") in visitadas or not es_url_oficial_valida(url, url_oficial):
            continue
        if urlsplit(url).path.lower().endswith(_EXTENSIONES_DESCARTADAS):
            continue
        texto = _sin_tildes(f"{urlsplit(url).path} {enlace.get('texto', '')}")
        puntos = sum(1 for palabra in _PALABRAS_CANDIDATAS if palabra in texto)
        if puntos:
            puntuadas.append((-puntos, orden, url))
            visitadas.add(url.rstrip("/"))
    puntuadas.sort()
    return [url for _, _, url in puntuadas[:maximo]]


def pagina_principal(url_oficial: str) -> str:
    """Portada del sitio oficial: `https://host/`."""
    partes = urlsplit(url_oficial)
    return f"{partes.scheme}://{partes.netloc}/"


async def recolectar_sitio(url_oficial: str, max_paginas: int, timeout_seconds: float) -> list[Pagina]:
    """Página del lugar + hasta `max_paginas - 1` páginas internas relevantes.

    Muchos sitios publican una página por lugar (por ejemplo, un parque dentro de
    un complejo) que a veces llega sin contenido. Si la página del lugar no se
    puede leer o casi no tiene texto, se usa como respaldo la portada del mismo
    sitio oficial para encontrar las páginas de entradas o reservas. Si ninguna
    de las dos se puede leer se lanza `ErrorAnalisisEntradas`; las páginas
    internas que fallan simplemente se omiten."""
    paginas: list[Pagina] = []
    error_inicio: ErrorAnalisisEntradas | None = None
    try:
        paginas.append(await descargar_pagina(url_oficial, url_oficial, timeout_seconds))
    except ErrorAnalisisEntradas as error:
        error_inicio = error

    portada = pagina_principal(url_oficial)
    pagina_util = paginas and len(paginas[0].texto) >= MIN_TEXTO_UTIL
    if not pagina_util and portada.rstrip("/") != urldefrag(url_oficial)[0].rstrip("/"):
        logger.info("Entradas: la página %s no trae contenido; se usa la portada %s", url_oficial, portada)
        try:
            paginas.append(await descargar_pagina(portada, url_oficial, timeout_seconds))
        except ErrorAnalisisEntradas as error:
            logger.info("Entradas: no se pudo leer la portada %s: %s", portada, error)

    if not paginas:
        raise error_inicio or ErrorAnalisisEntradas("no se pudo leer el sitio oficial")

    candidatas: list[str] = []
    ya_descargadas = {p.url.rstrip("/") for p in paginas}
    for pagina in paginas:
        for url in seleccionar_paginas_candidatas(pagina, url_oficial, max_paginas - 1):
            if url.rstrip("/") not in ya_descargadas and url not in candidatas:
                candidatas.append(url)
    candidatas = candidatas[: max(0, max_paginas - 1)]
    if not candidatas:
        return paginas

    resultados = await asyncio.gather(
        *(descargar_pagina(url, url_oficial, timeout_seconds) for url in candidatas),
        return_exceptions=True,
    )
    for url, resultado in zip(candidatas, resultados, strict=True):
        if isinstance(resultado, Pagina):
            paginas.append(resultado)
        else:
            logger.info("No se pudo leer %s del sitio oficial: %s", url, resultado)
    return paginas
