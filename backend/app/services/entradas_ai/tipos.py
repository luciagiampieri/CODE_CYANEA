"""Tipos y constantes de la recomendación de entradas y reservas (US: Sugerir
entradas y reservas para actividades)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Resultados posibles del análisis del sitio oficial.
RESERVA = "RESERVA"
ENTRADAS_ANTICIPADAS = "ENTRADAS_ANTICIPADAS"
ENTRADAS_PRESENCIALES = "ENTRADAS_PRESENCIALES"
SIN_INFORMACION = "SIN_INFORMACION"
# Restaurantes y bares: el sitio oficial permite reservar (sin afirmar que sea obligatorio).
RESERVA_DISPONIBLE = "RESERVA_DISPONIBLE"

TIPOS_CON_RECOMENDACION = (RESERVA, ENTRADAS_ANTICIPADAS, ENTRADAS_PRESENCIALES, RESERVA_DISPONIBLE)
# Lo que puede responder el intérprete (Gemini). RESERVA_DISPONIBLE lo decide el backend.
TIPOS_ANALISIS = (RESERVA, ENTRADAS_ANTICIPADAS, ENTRADAS_PRESENCIALES, SIN_INFORMACION)

MENSAJES = {
    RESERVA: (
        "Este lugar requiere o recomienda realizar una reserva antes de tu visita. "
        "Te recomendamos gestionarla con anticipación."
    ),
    ENTRADAS_ANTICIPADAS: (
        "Te recomendamos comprar las entradas antes de tu visita para asegurarte el ingreso."
    ),
    ENTRADAS_PRESENCIALES: (
        "Recordá que las entradas se compran en el lugar. Te recomendamos llegar con "
        "anticipación para adquirirlas antes de tu visita."
    ),
    RESERVA_DISPONIBLE: (
        "Este lugar acepta reservas desde su sitio oficial. Te recomendamos reservar con "
        "anticipación para asegurarte un lugar."
    ),
}

AVISO_SIN_ENLACE = "No fue posible obtener el enlace oficial."

# Estado de la identificación del lugar que deja el análisis de horarios (US 98).
LUGAR_IDENTIFICADO = "identificado"
# Gemini respondió que la actividad no se refiere a un lugar concreto.
LUGAR_INEXISTENTE = "sin_lugar"
# No se pudo determinar el lugar (error externo, sin resultados, búsqueda dudosa
# o el análisis no corrió): no se asume que el lugar cambió.
LUGAR_NO_DETERMINADO = "no_determinado"


class ErrorAnalisisEntradas(Exception):
    """Falla de un servicio externo durante el análisis (sitio oficial o Gemini).

    Nunca se traduce en una recomendación: la actividad se registra igual y el
    lugar no se marca como analizado, para poder reintentar en otra edición."""


@dataclass
class Pagina:
    """Página del sitio oficial ya descargada y convertida a texto."""

    url: str
    texto: str
    enlaces: list[dict[str, str]] = field(default_factory=list)


@dataclass
class Interpretacion:
    """Lo que devuelve el intérprete (Gemini) sobre el contenido del sitio oficial.
    Todavía no está verificado."""

    tipo: str
    evidencia: str | None = None
    url_fuente: str | None = None
    # Evidencia traducida al español por el modelo (el sitio puede estar en
    # cualquier idioma). Sirve para chequear que hable de lo que se recomienda y
    # para mostrársela al usuario; la verificación literal usa `evidencia`.
    evidencia_es: str | None = None
    # Solo con RESERVA: "obligatoria", "recomendada" o "posible" (el sitio permite
    # reservar pero no dice que haga falta).
    nivel_reserva: str | None = None
    # Enlaces que el modelo eligió de la lista del sitio, en cualquier idioma.
    url_entradas: str | None = None
    url_reserva: str | None = None


@dataclass
class ResultadoEntradas:
    """Resultado del análisis de un lugar.

    `completado` indica que el análisis terminó sin errores externos (aunque no
    haya recomendación): solo en ese caso el lugar queda marcado como analizado
    en la actividad."""

    place_id: str | None
    completado: bool
    tipo: str = SIN_INFORMACION
    es_turistico: bool = False
    nombre_lugar: str | None = None
    url_sitio_oficial: str | None = None
    url_accion: str | None = None
    evidencia: str | None = None
    url_fuente: str | None = None
    verificado: bool = False
    es_gastronomico: bool = False
    # Plataforma externa de reservas (OpenTable, Resy...) enlazada DESDE el sitio
    # oficial. Se informa como tercero, nunca como enlace oficial.
    url_reserva_externa: str | None = None
    plataforma_reserva: str | None = None
    # Evidencia en español para mostrar (traducción del modelo si el sitio está en otro idioma).
    evidencia_es: str | None = None

    @property
    def tiene_recomendacion(self) -> bool:
        return self.verificado and self.tipo in TIPOS_CON_RECOMENDACION

    def recomendacion(self) -> dict[str, Any] | None:
        """Datos que ve el usuario. None si no hay una recomendación verificada."""
        if not self.tiene_recomendacion:
            return None
        url_recomendada = self.url_accion or self.url_sitio_oficial
        return {
            "tipo": self.tipo,
            "mensaje": MENSAJES[self.tipo],
            "nombreLugar": self.nombre_lugar,
            "googlePlaceId": self.place_id,
            "urlSitioOficial": self.url_sitio_oficial,
            "urlAccion": self.url_accion,
            "urlRecomendada": url_recomendada,
            "avisoEnlace": None if url_recomendada else AVISO_SIN_ENLACE,
            "urlReservaExterna": self.url_reserva_externa,
            "plataformaReserva": self.plataforma_reserva,
            "evidencia": self.evidencia,
            "evidenciaEs": self.evidencia_es or self.evidencia,
            "fuenteEvidencia": self.url_fuente,
            "verificada": True,
        }
