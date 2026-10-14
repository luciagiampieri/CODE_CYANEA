"""Orquesta la recomendación de entradas y reservas de una actividad.

Flujo (después de la validación de horarios de la US 98, que ya identificó el
establecimiento y consultó sus detalles en Google Places):

1. `decidir_analisis`: compara el lugar identificado con el que la actividad ya
   tiene analizado (`ActividadesItinerario.GooglePlaceIdEntradas`). Si es el
   mismo lugar no se vuelve a analizar ni a recomendar.
2. `analizar_entradas`: si el lugar es turístico o un restaurante/bar (tipos de
   Google Places) y tiene sitio oficial (`websiteUri`), descarga el sitio (pidiendo
   la versión en español si existe) y Gemini lo interpreta en cualquier idioma:
   devuelve la evidencia textual (y su traducción), el nivel de la reserva y elige
   de la lista de enlaces del sitio el de entradas y el de reservas.
3. `verificar_interpretacion`: la evidencia tiene que estar literal en el sitio, no
   ser el texto de un enlace y hablar de lo que se recomienda. Los enlaces elegidos
   se aceptan solo si aparecen en el sitio y son oficiales (o, para reservas, de
   una plataforma conocida como OpenTable, que se informa como tercero).
4. Sin evidencia verificada: si el sitio oficial vende entradas o publica dónde
   reservar se recomienda con ese enlace (`_completar_con_entradas`,
   `_completar_con_reserva`). Si Gemini no responde, se usan reglas de vocabulario
   (`vocabulario.py`) como respaldo.
5. `ResultadoEntradas.recomendacion()`: solo hay recomendación si quedó
   verificada con una fuente oficial.

Cualquier error externo deja la actividad registrarse sin recomendación.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from app.core.config import settings
from app.services.entradas_ai import busqueda_google, sitio_oficial, vocabulario
from app.services.entradas_ai.gemini import construir_interprete
from app.services.entradas_ai.tipos import (
    ENTRADAS_ANTICIPADAS,
    ENTRADAS_PRESENCIALES,
    LUGAR_IDENTIFICADO,
    LUGAR_INEXISTENTE,
    RESERVA,
    RESERVA_DISPONIBLE,
    SIN_INFORMACION,
    ErrorAnalisisEntradas,
    Interpretacion,
    Pagina,
    ResultadoEntradas,
)
from app.services.entradas_ai.turismo import es_lugar_gastronomico, es_lugar_turistico

logger = logging.getLogger(__name__)

MIN_CARACTERES_EVIDENCIA = 15
MIN_PALABRAS_EVIDENCIA = 4
MIN_CARACTERES_SIN_ESPACIOS = 8

# La evidencia tiene que hablar de lo que se recomienda, en cualquier idioma
# (vocabulario multilingüe, comparado sin tildes).
_PALABRAS_POR_TIPO = {
    RESERVA: vocabulario.RESERVAS,
    ENTRADAS_ANTICIPADAS: (*vocabulario.ENTRADAS, *vocabulario.COMPRA, "online", "anticip", "advance", "vorab", "in anticipo"),
    ENTRADAS_PRESENCIALES: vocabulario.VENTA_PRESENCIAL,
}

# Página oficial de venta de entradas: la dirección tiene que hablar de entradas,
# y el texto, de entradas y de comprarlas (o mostrar precios).
_PRECIO = re.compile(r"(us\$|r\$|\$|€|£|\b(usd|ars|eur|brl))\s?\d|\d\s?(€|£|(usd|eur|ars|brl)\b)")
MAX_EVIDENCIA_TIENDA = 200


# Caché en memoria por lugar: evita repetir la descarga del sitio y la llamada a
# Gemini cuando el mismo lugar se analiza varias veces seguidas (por ejemplo al
# corregir el horario después de una advertencia o en varias actividades).
_cache: dict[str, tuple[float, ResultadoEntradas]] = {}


def limpiar_cache() -> None:
    _cache.clear()


def normalizar_place_id(place_id: str | None) -> str | None:
    """Identificador estable de Google Places sin el prefijo `google:`.

    Los ids sintéticos (por ejemplo `assistant:...`) no son estables y se descartan."""
    if not isinstance(place_id, str):
        return None
    valor = place_id.strip()
    valor = valor.removeprefix("google:")
    if not valor or ":" in valor or len(valor) > 255:
        return None
    return valor


# ---------------------------------------------------------------------------
# Decisión: ¿cambió el lugar turístico de la actividad?
# ---------------------------------------------------------------------------

ANALIZAR = "analizar"
MISMO_LUGAR = "mismo_lugar"
SIN_LUGAR = "sin_lugar"
INDETERMINADO = "indeterminado"


@dataclass
class Decision:
    accion: str
    place_id_guardado: str | None

    @property
    def analizar(self) -> bool:
        return self.accion == ANALIZAR


def decidir_analisis(place_id_guardado: str | None, contexto_lugar: dict | None) -> Decision:
    """Compara el lugar identificado ahora con el último lugar analizado.

    - Mismo `place_id`: el lugar no cambió (nombre equivalente, ubicación del mismo
      lugar, cambio de horario o categoría) -> no se analiza ni se recomienda.
    - Otro `place_id` (o ninguno analizado antes): se analiza el nuevo lugar.
    - La actividad dejó de referirse a un lugar concreto: se olvida el lugar.
    - No se pudo determinar el lugar: no se asume que cambió y se conserva el dato."""
    guardado = normalizar_place_id(place_id_guardado)
    contexto = contexto_lugar or {}
    estado = contexto.get("estado")
    actual = normalizar_place_id(contexto.get("place_id"))

    if estado == LUGAR_IDENTIFICADO and actual:
        if actual == guardado:
            return Decision(MISMO_LUGAR, guardado)
        return Decision(ANALIZAR, guardado)
    if estado == LUGAR_INEXISTENTE:
        return Decision(SIN_LUGAR, None)
    return Decision(INDETERMINADO, guardado)


# ---------------------------------------------------------------------------
# Verificación de la interpretación
# ---------------------------------------------------------------------------

def _normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize("NFKC", texto or "").casefold()
    texto = texto.translate(str.maketrans({"“": '"', "”": '"', "’": "'", "‘": "'", "«": '"', "»": '"'}))
    return re.sub(r"\s+", " ", texto).strip()


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )


def _limpiar_evidencia(evidencia: str) -> str:
    return _normalizar_texto(evidencia).strip(" .…\"'")


def _clave_url(url: str) -> str:
    return url.strip().rstrip("/")


def _evidencia_suficiente(buscada: str) -> bool:
    """Una oración, no una etiqueta suelta. En idiomas que separan palabras con
    espacios se piden al menos 4 palabras; en los que no (japonés, chino, tailandés)
    se mide en caracteres."""
    if len(buscada.split()) == 1:
        return len(buscada) >= MIN_CARACTERES_SIN_ESPACIOS and not buscada.isascii()
    return len(buscada) >= MIN_CARACTERES_EVIDENCIA and len(buscada.split()) >= MIN_PALABRAS_EVIDENCIA


def _buscar_evidencia(evidencia: str, url_fuente: str | None, paginas: list[Pagina]) -> str | None:
    """Devuelve la URL de la página que contiene la evidencia literal, o None."""
    buscada = _limpiar_evidencia(evidencia)
    if not _evidencia_suficiente(buscada):
        return None
    # El texto de un enlace o de un ítem de menú ("Eventos con Tickets Especiales",
    # "Comprar entradas") no afirma que haga falta comprar ni reservar.
    if _es_texto_de_enlace(buscada, paginas):
        return None
    ordenadas = sorted(
        paginas, key=lambda p: 0 if url_fuente and _clave_url(p.url) == _clave_url(url_fuente) else 1
    )
    for pagina in ordenadas:
        if buscada in _normalizar_texto(pagina.texto):
            return pagina.url
    return None


def _es_texto_de_enlace(buscada: str, paginas: list[Pagina]) -> bool:
    for pagina in paginas:
        for enlace in pagina.enlaces:
            texto = _limpiar_evidencia(enlace.get("texto") or "")
            if texto and buscada in texto:
                return True
    return False


def _enlaces_del_sitio(paginas: list[Pagina]) -> set[str]:
    enlaces = {_clave_url(p.url) for p in paginas}
    for pagina in paginas:
        enlaces.update(_clave_url(e["url"]) for e in pagina.enlaces)
    return enlaces


def _evidencia_coherente(tipo: str, interpretacion: Interpretacion) -> bool:
    """La evidencia tiene que hablar de lo que se recomienda. Se revisa la traducción
    al español que da el modelo y también el original, así alcanza con el vocabulario
    de los idiomas más comunes aunque el sitio esté en cualquier otro."""
    palabras = _PALABRAS_POR_TIPO.get(tipo, ())
    return any(
        vocabulario.menciona(texto, palabras)
        for texto in (interpretacion.evidencia_es, interpretacion.evidencia)
        if texto
    )


def _enlace_del_sitio(url: str | None, paginas: list[Pagina]) -> bool:
    return bool(url) and _clave_url(url) in _enlaces_del_sitio(paginas)


def _texto_del_enlace(url: str, paginas: list[Pagina]) -> str:
    for pagina in paginas:
        for enlace in pagina.enlaces:
            if _clave_url(enlace["url"]) == _clave_url(url):
                return (enlace.get("texto") or "").strip()
    return ""


def _pagina_del_enlace(url: str, paginas: list[Pagina]) -> str | None:
    for pagina in paginas:
        if any(_clave_url(e["url"]) == _clave_url(url) for e in pagina.enlaces):
            return pagina.url
    return None


def enlace_oficial_de_entradas(url: str | None, paginas: list[Pagina], url_oficial: str) -> str | None:
    """Enlace de entradas elegido por el modelo: se acepta solo si aparece en el sitio y
    es del dominio oficial."""
    if _enlace_del_sitio(url, paginas) and sitio_oficial.es_url_oficial_valida(url, url_oficial):
        return url
    if url:
        logger.info("Entradas: se descarta el enlace de entradas %s (no está en el sitio o no es oficial).", url)
    return None


def enlace_de_reserva(url: str | None, paginas: list[Pagina], url_oficial: str) -> tuple[str, str | None] | None:
    """Enlace de reserva elegido por el modelo: (url, plataforma). Se acepta si aparece en
    el sitio y es del dominio oficial (plataforma None) o de una plataforma de reservas
    conocida. Cualquier otro tercero se descarta."""
    if not _enlace_del_sitio(url, paginas):
        if url:
            logger.info("Entradas: se descarta el enlace de reserva %s (no está en el sitio).", url)
        return None
    if sitio_oficial.es_url_oficial_valida(url, url_oficial):
        return url, None
    plataforma = sitio_oficial.plataforma_de_reserva(url)
    if plataforma:
        return url, plataforma
    logger.info("Entradas: se descarta el enlace de reserva %s (tercero no reconocido).", url)
    return None


def verificar_interpretacion(
    interpretacion: Interpretacion,
    paginas: list[Pagina],
    url_oficial: str,
    resultado: ResultadoEntradas,
) -> ResultadoEntradas:
    """Solo marca la recomendación como verificada si la evidencia está textual en
    una página del sitio oficial (en su idioma original), no es el texto de un enlace
    y habla de lo que se recomienda. Una reserva solo "posible" se informa como
    RESERVA_DISPONIBLE, sin afirmar que sea necesaria."""
    resultado.tipo = interpretacion.tipo
    if interpretacion.tipo == SIN_INFORMACION:
        return resultado

    evidencia = interpretacion.evidencia or ""
    fuente = _buscar_evidencia(evidencia, interpretacion.url_fuente, paginas)
    if fuente is None:
        logger.info(
            "Entradas: se descarta %s para %s porque la evidencia no aparece en el sitio oficial.",
            interpretacion.tipo,
            resultado.place_id,
        )
        resultado.tipo = SIN_INFORMACION
        return resultado

    if not _evidencia_coherente(interpretacion.tipo, interpretacion):
        logger.info(
            "Entradas: se descarta %s para %s porque la evidencia no habla de eso.",
            interpretacion.tipo,
            resultado.place_id,
        )
        resultado.tipo = SIN_INFORMACION
        return resultado

    if interpretacion.tipo == RESERVA and interpretacion.nivel_reserva == "posible":
        resultado.tipo = RESERVA_DISPONIBLE
    resultado.verificado = True
    resultado.evidencia = evidencia.strip()[:500]
    resultado.evidencia_es = (interpretacion.evidencia_es or "").strip()[:500] or None
    resultado.url_fuente = fuente
    return resultado


def buscar_tienda_oficial(paginas: list[Pagina], url_oficial: str) -> tuple[str, str] | None:
    """Página del sitio oficial donde se venden las entradas: (url, fragmento del texto).

    Respaldo por vocabulario para cuando el modelo no responde. La URL debe ser del
    dominio oficial y hablar de entradas; el texto debe mencionar entradas y la compra
    (o precios). El fragmento devuelto es literal de la página."""
    for pagina in paginas:
        if not sitio_oficial.es_url_oficial_valida(pagina.url, url_oficial):
            continue
        if not vocabulario.menciona(urlsplit(pagina.url).path, vocabulario.RUTA_ENTRADAS):
            continue
        texto = vocabulario.normalizar(pagina.texto)
        if not vocabulario.menciona(texto, vocabulario.ENTRADAS):
            continue
        tiene_precio = bool(_PRECIO.search(texto))
        if not (vocabulario.menciona(texto, vocabulario.COMPRA) or tiene_precio):
            continue
        if vocabulario.menciona(texto, vocabulario.GRATUITO) and not tiene_precio:
            continue
        evidencia = next(
            (linea.strip() for linea in pagina.texto.splitlines() if vocabulario.menciona(linea, vocabulario.ENTRADAS)),
            "",
        )
        return pagina.url, evidencia[:MAX_EVIDENCIA_TIENDA]
    return None


def buscar_enlace_entradas(paginas: list[Pagina], url_oficial: str) -> tuple[str, str, str] | None:
    """Respaldo por vocabulario: enlace del sitio oficial a su página de entradas, aunque
    esa página no se haya podido leer. El texto y la dirección del enlace deben hablar
    de entradas. Devuelve (url, texto del enlace, página donde aparece)."""
    for pagina in paginas:
        if not sitio_oficial.es_url_oficial_valida(pagina.url, url_oficial):
            continue
        for enlace in pagina.enlaces:
            url = enlace["url"]
            texto = enlace.get("texto") or ""
            if not sitio_oficial.es_url_oficial_valida(url, url_oficial):
                continue
            partes = urlsplit(url)
            if vocabulario.menciona(texto, vocabulario.ENTRADAS) and vocabulario.menciona(
                f"{partes.path}?{partes.query}", vocabulario.RUTA_ENTRADAS
            ):
                return url, texto.strip(), pagina.url
    return None


def _completar_con_entradas(
    resultado: ResultadoEntradas,
    paginas: list[Pagina],
    url_oficial: str,
    interpretacion: Interpretacion | None,
) -> ResultadoEntradas:
    """Lugares turísticos. Agrega el enlace de compra a una recomendación de entradas y,
    si no hay otra evidencia verificada, recomienda comprar entradas cuando el sitio
    oficial las vende: primero con el enlace que eligió el modelo (cualquier idioma) y,
    si el modelo no respondió o no eligió ninguno, con las reglas de vocabulario."""
    necesita_evidencia = not resultado.verificado
    necesita_enlace = (
        resultado.verificado and resultado.tipo == ENTRADAS_ANTICIPADAS and not resultado.url_accion
    )
    if not (necesita_evidencia or necesita_enlace):
        return resultado

    url = None
    evidencia = ""
    fuente = None
    elegido = enlace_oficial_de_entradas(interpretacion.url_entradas if interpretacion else None, paginas, url_oficial)
    if elegido:
        url, evidencia, fuente = elegido, _texto_del_enlace(elegido, paginas), _pagina_del_enlace(elegido, paginas)
    else:
        tienda = buscar_tienda_oficial(paginas, url_oficial)
        if tienda:
            url, evidencia = tienda
            fuente = url
        else:
            enlace = buscar_enlace_entradas(paginas, url_oficial)
            if enlace:
                url, evidencia, fuente = enlace
    if url is None:
        return resultado

    if necesita_evidencia:
        logger.info("Entradas: %s vende entradas en su sitio oficial (%s).", resultado.place_id, url)
        resultado.tipo = ENTRADAS_ANTICIPADAS
        resultado.verificado = True
        resultado.evidencia = evidencia or None
        resultado.url_fuente = fuente
    resultado.url_accion = url
    return resultado


# Respaldo por vocabulario: texto de un enlace para reservar mesa o visita
# ("Book your table", "Reservar", "Réserver", "Prenota", "Tisch reservieren").
_TEXTO_RESERVA = (*vocabulario.RESERVAS, *vocabulario.MESA)


def buscar_enlace_reserva(paginas: list[Pagina], url_oficial: str) -> tuple[str, str | None, str, str] | None:
    """Respaldo por vocabulario: enlace para reservar publicado en el sitio oficial.

    Devuelve (url, plataforma, texto del enlace, página donde aparece). La URL es del
    propio sitio oficial (plataforma None) o de una plataforma de reservas conocida
    (OpenTable, Resy...). Se prefiere el enlace del sitio oficial y, entre los de una
    plataforma, el que apunta a reservas generales y no a una experiencia puntual."""
    candidatos: list[tuple[int, int, str, str | None, str, str]] = []
    orden = 0
    for pagina in paginas:
        if not sitio_oficial.es_url_oficial_valida(pagina.url, url_oficial):
            continue
        for enlace in pagina.enlaces:
            orden += 1
            texto = vocabulario.normalizar(enlace.get("texto") or "")
            url = enlace["url"]
            ruta = vocabulario.normalizar(urlsplit(url).path + "?" + urlsplit(url).query)
            ruta_de_reserva = vocabulario.menciona(ruta, vocabulario.RUTA_RESERVAS)
            if not vocabulario.menciona(texto, _TEXTO_RESERVA) and not ruta_de_reserva:
                continue
            if sitio_oficial.es_url_oficial_valida(url, url_oficial):
                if ruta_de_reserva:
                    candidatos.append((0, orden, url, None, enlace.get("texto") or "", pagina.url))
                continue
            plataforma = sitio_oficial.plataforma_de_reserva(url)
            if plataforma:
                prioridad = 1 if "reserv" in ruta else 2  # reservas generales antes que experiencias
                candidatos.append((prioridad, orden, url, plataforma, enlace.get("texto") or "", pagina.url))
    if not candidatos:
        return None
    _, _, url, plataforma, texto, pagina_url = min(candidatos)
    return url, plataforma, texto, pagina_url


def _completar_con_reserva(
    resultado: ResultadoEntradas,
    paginas: list[Pagina],
    url_oficial: str,
    interpretacion: Interpretacion | None,
) -> ResultadoEntradas:
    """Agrega el enlace de reserva a una recomendación de reserva y, si no hay otra
    evidencia verificada, informa que el lugar acepta reservas cuando el sitio oficial
    publica dónde hacerlas (sin afirmar que sea obligatorio). Primero se usa el enlace
    que eligió el modelo (cualquier idioma); si no, las reglas de vocabulario."""
    necesita_evidencia = not resultado.verificado
    necesita_enlace = (
        resultado.verificado and resultado.tipo in (RESERVA, RESERVA_DISPONIBLE) and not resultado.url_accion
    )
    if not (necesita_evidencia or necesita_enlace):
        return resultado

    elegido = enlace_de_reserva(interpretacion.url_reserva if interpretacion else None, paginas, url_oficial)
    if elegido:
        url, plataforma = elegido
        texto, pagina_url = _texto_del_enlace(url, paginas), _pagina_del_enlace(url, paginas)
    else:
        enlace = buscar_enlace_reserva(paginas, url_oficial)
        if enlace is None:
            return resultado
        url, plataforma, texto, pagina_url = enlace

    if necesita_evidencia:
        logger.info("Entradas: %s acepta reservas desde su sitio oficial (%s).", resultado.place_id, url)
        resultado.tipo = RESERVA_DISPONIBLE
        resultado.verificado = True
        resultado.evidencia = texto.strip()[:MAX_EVIDENCIA_TIENDA] or None
        resultado.url_fuente = pagina_url
    if plataforma:
        # Nunca como enlace oficial: se muestra aparte, aclarando la plataforma.
        resultado.url_reserva_externa = url
        resultado.plataforma_reserva = plataforma
    else:
        resultado.url_accion = url
    return resultado


# ---------------------------------------------------------------------------
# Análisis
# ---------------------------------------------------------------------------

def _desde_cache(place_id: str) -> ResultadoEntradas | None:
    entrada = _cache.get(place_id)
    if not entrada:
        return None
    expira, resultado = entrada
    if expira < time.monotonic():
        _cache.pop(place_id, None)
        return None
    return resultado


def _guardar_cache(resultado: ResultadoEntradas) -> ResultadoEntradas:
    if resultado.completado and resultado.place_id and settings.entradas_cache_ttl_seconds > 0:
        _cache[resultado.place_id] = (time.monotonic() + settings.entradas_cache_ttl_seconds, resultado)
    return resultado


async def _consultar_sitio(
    nombre: str, url_oficial: str
) -> tuple[list[Pagina], Interpretacion | None, ErrorAnalisisEntradas | None]:
    """Descarga el sitio (si falla, lanza) y lo hace interpretar. Si falla Gemini se
    devuelven igual las páginas, para poder buscar la tienda oficial de entradas."""
    paginas = await sitio_oficial.recolectar_sitio(
        url_oficial,
        max_paginas=settings.entradas_sitio_max_paginas,
        timeout_seconds=settings.entradas_sitio_timeout_seconds,
    )
    try:
        return paginas, await construir_interprete().interpretar(nombre, paginas), None
    except ErrorAnalisisEntradas as error:
        return paginas, None, error


async def analizar_entradas(contexto_lugar: dict[str, Any] | None) -> ResultadoEntradas | None:
    """Analiza el lugar identificado por la US 98. None si no hay lugar analizable."""
    contexto = contexto_lugar or {}
    place_id = normalizar_place_id(contexto.get("place_id"))
    detalles = contexto.get("detalles")
    if contexto.get("estado") != LUGAR_IDENTIFICADO or not place_id or not detalles:
        return None
    if not settings.ai_entradas_enabled:
        return None

    en_cache = _desde_cache(place_id)
    if en_cache is not None:
        return en_cache

    nombre = detalles.get("name") or "el lugar"
    resultado = ResultadoEntradas(place_id=place_id, completado=True, nombre_lugar=detalles.get("name"))

    # (1) Ni turístico ni restaurante/bar: se registra sin análisis adicional.
    resultado.es_turistico = es_lugar_turistico(detalles)
    resultado.es_gastronomico = es_lugar_gastronomico(detalles)
    if not (resultado.es_turistico or resultado.es_gastronomico):
        return _guardar_cache(resultado)

    # (2) Sin sitio oficial utilizable: sin recomendación.
    url_oficial = sitio_oficial.normalizar_url_oficial(detalles.get("website_uri"))
    if url_oficial is None:
        if detalles.get("website_uri"):
            logger.info("Entradas: el sitio %s de %s no se considera oficial.", detalles.get("website_uri"), place_id)
        return _guardar_cache(resultado)
    resultado.url_sitio_oficial = url_oficial

    # (3) Consulta e interpretación del sitio oficial.
    error_sitio = None
    paginas: list[Pagina] = []
    interpretacion = error_interprete = None
    try:
        paginas, interpretacion, error_interprete = await asyncio.wait_for(
            _consultar_sitio(nombre, url_oficial),
            timeout=settings.entradas_timeout_total_seconds,
        )
    except (TimeoutError, ErrorAnalisisEntradas) as error:
        error_sitio = error or "tiempo agotado"
        logger.warning("Entradas: no se pudo analizar el sitio oficial de %s: %s", place_id, error_sitio)
    except Exception as error:  # cualquier otra falla externa no debe impedir registrar la actividad
        error_sitio = error
        logger.exception("Entradas: error inesperado analizando el sitio oficial de %s", place_id)

    if paginas:
        if interpretacion is not None:
            verificar_interpretacion(interpretacion, paginas, url_oficial, resultado)
        if resultado.es_turistico:
            _completar_con_entradas(resultado, paginas, url_oficial, interpretacion)
        _completar_con_reserva(resultado, paginas, url_oficial, interpretacion)

    # (4) Respaldo: búsqueda de Google, aceptada solo con una fuente del sitio oficial.
    busqueda_respondio = False
    if not resultado.verificado and settings.ai_entradas_busqueda_google:
        busqueda_respondio = await _completar_con_busqueda(resultado, nombre, url_oficial)

    if not resultado.verificado and not busqueda_respondio and (error_sitio or error_interprete):
        # Ni el sitio ni la búsqueda dieron una respuesta: no se sabe nada; se puede reintentar.
        if error_interprete is not None:
            logger.warning("Entradas: no se pudo interpretar el sitio oficial de %s: %s", place_id, error_interprete)
        resultado.completado = False
        return resultado
    return _guardar_cache(resultado)


async def _completar_con_busqueda(resultado: ResultadoEntradas, nombre: str, url_oficial: str) -> bool:
    """Busca en Google (vía Gemini) si hace falta comprar entradas o reservar. Devuelve
    True si la búsqueda respondió, aunque no haya recomendación."""
    try:
        encontrado = await busqueda_google.construir_buscador().buscar(nombre, url_oficial)
    except ErrorAnalisisEntradas as error:
        logger.warning("Entradas: la búsqueda de Google no respondió para %s: %s", resultado.place_id, error)
        return False
    except Exception:
        logger.exception("Entradas: error inesperado en la búsqueda de Google para %s", resultado.place_id)
        return False

    if encontrado.tipo == SIN_INFORMACION:
        return True
    if encontrado.tipo == ENTRADAS_ANTICIPADAS and not resultado.es_turistico:
        return True
    dominio = busqueda_google.fuente_oficial(encontrado, url_oficial)
    if dominio is None:
        logger.info(
            "Entradas: se descarta la búsqueda de %s porque no cita el sitio oficial (fuentes: %s).",
            resultado.place_id,
            ", ".join(encontrado.dominios_fuentes) or "ninguna",
        )
        return True

    tipo = encontrado.tipo
    if tipo == RESERVA and encontrado.nivel_reserva == "posible":
        tipo = RESERVA_DISPONIBLE
    url = encontrado.url_reserva if tipo in (RESERVA, RESERVA_DISPONIBLE) else encontrado.url_entradas
    resultado.tipo = tipo
    resultado.verificado = True
    resultado.evidencia = encontrado.resumen_es
    resultado.evidencia_es = encontrado.resumen_es
    resultado.url_fuente = f"https://{dominio}/"
    # Solo enlaces del sitio oficial: si no hay, se ofrece el sitio oficial.
    if tipo != ENTRADAS_PRESENCIALES and url and sitio_oficial.es_url_oficial_valida(url, url_oficial):
        resultado.url_accion = url
    logger.info("Entradas: %s confirmado con la búsqueda de Google en %s.", tipo, dominio)
    return True


@dataclass
class EvaluacionEntradas:
    """Lo que necesita la ruta: la recomendación a mostrar (si hay) y el lugar que
    queda registrado como analizado en la actividad."""

    recomendacion: dict[str, Any] | None
    place_id_guardado: str | None


async def evaluar_entradas(
    place_id_guardado: str | None, contexto_lugar: dict[str, Any] | None
) -> EvaluacionEntradas:
    """Punto de entrada para crear y modificar actividades. Nunca lanza excepciones."""
    try:
        decision = decidir_analisis(place_id_guardado, contexto_lugar)
        if not decision.analizar:
            return EvaluacionEntradas(None, decision.place_id_guardado)
        resultado = await analizar_entradas(contexto_lugar)
        if resultado is None or not resultado.completado:
            # No se pudo analizar: se conserva lo anterior para reintentar en otra edición.
            return EvaluacionEntradas(None, decision.place_id_guardado)
        return EvaluacionEntradas(resultado.recomendacion(), resultado.place_id)
    except Exception:
        logger.exception("Entradas: error inesperado evaluando la recomendación")
        return EvaluacionEntradas(None, normalizar_place_id(place_id_guardado))
