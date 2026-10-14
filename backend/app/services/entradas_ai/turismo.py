"""Determina si un establecimiento es un lugar turístico.

Se decide con los tipos que Google Places (New) publica para el lugar
(`primaryType` y `types`), que son datos verificables del establecimiento. No
se infiere por el nombre de la actividad ni se le pregunta al modelo: un
restaurante, un hotel o un comercio no son lugares turísticos aunque el texto
de la actividad lo sugiera.
"""

from __future__ import annotations

from typing import Any

# Tipos de la tabla A de Places API (New) que representan lugares que se visitan
# como atracción y que suelen tener entradas, reservas o turnos de visita.
TIPOS_TURISTICOS = frozenset(
    {
        "tourist_attraction",
        "museum",
        "art_gallery",
        "amusement_park",
        "amusement_center",
        "aquarium",
        "zoo",
        "wildlife_park",
        "wildlife_refuge",
        "water_park",
        "planetarium",
        "observation_deck",
        "botanical_garden",
        "national_park",
        "state_park",
        "historical_landmark",
        "historical_place",
        "cultural_landmark",
        "monument",
        "castle",
        "palace",
        "opera_house",
        "visitor_center",
    }
)


def tipos_del_lugar(detalles: dict[str, Any] | None) -> set[str]:
    if not detalles:
        return set()
    tipos = {t for t in (detalles.get("types") or []) if isinstance(t, str)}
    primario = detalles.get("primary_type")
    if isinstance(primario, str) and primario:
        tipos.add(primario)
    return tipos


def es_lugar_turistico(detalles: dict[str, Any] | None) -> bool:
    """True si Google Places clasifica el lugar con algún tipo turístico."""
    return bool(tipos_del_lugar(detalles) & TIPOS_TURISTICOS)


# Restaurantes y bares (Places publica tipos como `restaurant`, `steak_house`,
# `american_restaurant`, `bar`). Se excluyen los de comida rápida y para llevar,
# que no toman reservas.
TIPOS_GASTRONOMICOS = frozenset(
    {"restaurant", "bar", "pub", "wine_bar", "cocktail_bar", "steak_house", "diner", "bistro", "gastropub", "brewpub"}
)
TIPOS_GASTRONOMICOS_EXCLUIDOS = frozenset({"fast_food_restaurant", "meal_takeaway", "meal_delivery"})


def es_lugar_gastronomico(detalles: dict[str, Any] | None) -> bool:
    """True si Google Places clasifica el lugar como restaurante o bar con servicio."""
    tipos = tipos_del_lugar(detalles)
    if (detalles or {}).get("primary_type") in TIPOS_GASTRONOMICOS_EXCLUIDOS:
        return False
    return any(
        tipo in TIPOS_GASTRONOMICOS or (tipo.endswith("_restaurant") and tipo not in TIPOS_GASTRONOMICOS_EXCLUIDOS)
        for tipo in tipos
    )
