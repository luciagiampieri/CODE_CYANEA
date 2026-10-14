"""Vocabulario multilingüe para reconocer entradas y reservas en sitios oficiales.

Los sitios oficiales pueden estar en cualquier idioma. Gemini interpreta el texto
en cualquier idioma, pero las reglas deterministas del backend (qué páginas leer,
qué enlace es de entradas o de reservas, qué evidencia es coherente con lo que se
recomienda) comparan palabras: por eso todas usan este vocabulario común.

Idiomas cubiertos: español, inglés, portugués, francés, italiano, alemán y
neerlandés. Los términos se comparan en minúsculas y sin tildes (ver `normalizar`)
y como raíces ("reserv" cubre reserva, reservar, reservation, réservation,
reservieren, reserveren...).
"""

from __future__ import annotations

import unicodedata


def normalizar(texto: str | None) -> str:
    """Minúsculas y sin tildes: "Réservez vos BILLETS" -> "reservez vos billets"."""
    return "".join(
        c for c in unicodedata.normalize("NFD", (texto or "").lower()) if unicodedata.category(c) != "Mn"
    )


def menciona(texto: str | None, terminos: tuple[str, ...]) -> bool:
    normalizado = normalizar(texto)
    return any(termino in normalizado for termino in terminos)


# Entradas / tickets.
ENTRADAS = (
    # es
    "entrada", "boleto", "admision", "ticket",
    # en
    "admission",
    # pt
    "ingresso", "bilhete",
    # fr
    "billet",
    # it
    "biglietti", "biglietto",
    # de
    "eintritt", "eintrittskarte",
    # nl
    "kaartje", "toegangsbewijs",
)

# Reservas (de visita, turno o mesa).
RESERVAS = (
    # es / pt / fr / de / nl ("reservar", "reserve", "reservieren", "reserveren"...)
    "reserv",
    # en
    "book", "rsvp", "appointment",
    # es
    "turno", "cita previa", "agend",
    # it
    "prenot",
    # de
    "buchen", "buchung",
    # nl
    "boeken",
    # fr
    "rendez-vous",
)

# Mesa (restaurantes): "reservar mesa", "book a table", "réserver une table".
MESA = ("mesa", "table", "tavolo", "tisch", "tafel")

# Comprar / precio / carrito.
COMPRA = (
    # es
    "comprar", "compra", "precio", "tarifa", "seleccionar", "carrito", "anadir", "agregar al carrito",
    # en
    "buy", "purchase", "price", "select", "add to cart", "checkout", "shop",
    # pt
    "preco", "adquir",
    # fr
    "acheter", "achat", "tarif", "panier",
    # it
    "acquista", "prezzo", "carrello",
    # de
    "kaufen", "preis", "warenkorb",
    # nl
    "kopen", "prijs", "winkelwagen",
)

# Venta en el lugar (boletería).
VENTA_PRESENCIAL = (
    # es
    "taquilla", "boleteria", "ventanilla", "en el lugar", "en la puerta", "en la entrada", "presencial",
    # en
    "box office", "ticket office", "on site", "on-site", "in person", "at the door", "at the gate",
    # pt
    "bilheteria", "bilheteira", "no local",
    # fr
    "billetterie", "sur place", "guichet",
    # it
    "biglietteria", "in loco",
    # de
    "kasse", "vor ort",
    # nl
    "kassa", "ter plaatse",
    # varios
    "in situ",
)

# Entrada gratuita.
GRATUITO = (
    "gratuit", "gratis", "free admission", "free entry", "entrada libre", "ingreso libre", "sin cargo",
    "entree libre", "ingresso libero", "eintritt frei", "kostenlos", "entrada franca",
)

# Rutas (path de la URL) de páginas de entradas o tiendas oficiales.
RUTA_ENTRADAS = (
    "ticket", "entrada", "admission", "admision", "billet", "boleto", "biglietti", "ingresso",
    "bilhete", "eintritt", "kaartje", "tarifa", "tarif", "precio", "pricing", "prices", "preise",
)

# Rutas de páginas de reservas.
RUTA_RESERVAS = ("reserv", "book", "prenot", "buchen", "boeken", "rsvp")

# Palabras que hacen que una página interna valga la pena leerla.
PAGINAS_RELEVANTES = (
    *ENTRADAS, *RESERVAS, *VENTA_PRESENCIAL,
    "visit", "visita", "besuch", "bezoek", "planifica", "plan-your", "info",
    "horario", "hours", "horaire", "orari", "offnungszeit", "openingstijden",
    "comprar", "buy", "precio", "price", "tarif", "preis", "prijs", "prezzo", "preco",
)
