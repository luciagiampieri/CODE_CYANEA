"""Armado del contexto que se envía a la IA (US 87).

Funciones puras (sin base de datos ni red): combinan las preferencias del grupo,
anonimizan textos (RNF-33) y calculan los huecos libres de la franja.
"""

from __future__ import annotations

import re
from collections import Counter
from decimal import Decimal
from typing import Iterable

MIN_DURACION_MINUTOS = 30

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_CUIT = re.compile(r"\b\d{2}-?\d{8}-?\d\b")
_TELEFONO = re.compile(r"(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)")
_HHMM = re.compile(r"^(\d{1,2}):(\d{2})$")
OMITIDO = "[dato omitido]"

# Horarios
def parsear_hhmm(texto: str | None) -> int | None:
    """'09:30' -> minutos desde medianoche. None si el formato no es válido."""
    if not texto:
        return None
    match = _HHMM.match(texto.strip())
    if not match:
        return None
    horas, minutos = int(match.group(1)), int(match.group(2))
    if horas > 23 or minutos > 59:
        return None
    return horas * 60 + minutos


def hhmm(minutos: int) -> str:
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def minutos_de(hora) -> int:
    return hora.hour * 60 + hora.minute


def superpone(a_inicio: int, a_fin: int, b_inicio: int, b_fin: int) -> bool:
    """Dos intervalos se superponen si comparten tiempo (que se toquen en un borde no cuenta)."""
    return a_inicio < b_fin and b_inicio < a_fin


def calcular_huecos(
    franja_inicio: int, franja_fin: int, ocupados: Iterable[tuple[int, int]]
) -> list[tuple[int, int]]:
    """Tramos libres de la franja (de al menos MIN_DURACION_MINUTOS) descontando lo ocupado."""
    recortados = sorted(
        (max(inicio, franja_inicio), min(fin, franja_fin))
        for inicio, fin in ocupados
        if superpone(inicio, fin, franja_inicio, franja_fin)
    )
    huecos: list[tuple[int, int]] = []
    cursor = franja_inicio
    for inicio, fin in recortados:
        if inicio > cursor:
            huecos.append((cursor, inicio))
        cursor = max(cursor, fin)
    if cursor < franja_fin:
        huecos.append((cursor, franja_fin))
    return [(i, f) for i, f in huecos if f - i >= MIN_DURACION_MINUTOS]

# Privaciadad
def sanitizar_texto(texto: str | None, nombres_prohibidos: Iterable[str] = ()) -> str:
    """Quita emails, teléfonos, URLs, CUIT y nombres de los participantes de un texto libre.

    El texto de "consideraciones" y los nombres de actividades los escriben los usuarios,
    por eso no se envían tal cual a un servicio externo.
    """
    if not texto:
        return ""
    limpio = _EMAIL.sub(OMITIDO, texto)
    limpio = _URL.sub(OMITIDO, limpio)
    limpio = _CUIT.sub(OMITIDO, limpio)
    limpio = _TELEFONO.sub(OMITIDO, limpio)
    for nombre in nombres_prohibidos:
        nombre = (nombre or "").strip()
        if len(nombre) >= 3:
            limpio = re.sub(
                rf"(?<!\w){re.escape(nombre)}(?!\w)", OMITIDO, limpio, flags=re.IGNORECASE
            )
    return re.sub(r"\s+", " ", limpio).strip()


def nombres_a_ocultar(usuarios: Iterable) -> list[str]:
    """Nombre, apellido, usuario y parte local del email de cada participante."""
    nombres: set[str] = set()
    for usuario in usuarios:
        if usuario is None:
            continue
        for valor in (usuario.Nombre, usuario.Apellido):
            if valor and len(valor.strip()) >= 4:
                nombres.add(valor.strip())
        if usuario.NombreUsuario and len(usuario.NombreUsuario.strip()) >= 3:
            nombres.add(usuario.NombreUsuario.strip())
        if usuario.Email and "@" in usuario.Email:
            local = usuario.Email.split("@")[0]
            if len(local) >= 3:
                nombres.add(local)
    return sorted(nombres, key=len, reverse=True)


# Preferencias del grupo
def combinar_preferencias(preferencias: list, nombres_prohibidos: Iterable[str] = ()) -> dict:
    """Combina las preferencias de todos los participantes que las configuraron.

    - Intereses: ordenados por cantidad de participantes que los eligieron.
    - Ritmo: el más frecuente (en empate, el de menor `Orden`, es decir el más tranquilo).
    - Presupuesto: promedio de los que lo cargaron (los demás se ignoran).
    - Consideraciones: textos anonimizados, sin repetir.
    """
    votos_intereses: Counter = Counter()
    orden_interes: dict[str, int] = {}
    votos_ritmo: Counter = Counter()
    orden_ritmo: dict[str, int] = {}
    presupuestos: list[Decimal] = []
    consideraciones: list[str] = []

    for pref in preferencias:
        for interes in pref.Intereses:
            votos_intereses[interes.Nombre] += 1
            orden_interes[interes.Nombre] = interes.Orden
        if pref.RitmoViaje is not None:
            votos_ritmo[pref.RitmoViaje.Nombre] += 1
            orden_ritmo[pref.RitmoViaje.Nombre] = pref.RitmoViaje.Orden
        if pref.PresupuestoDiarioARS is not None:
            presupuestos.append(Decimal(pref.PresupuestoDiarioARS))
        if pref.Consideraciones:
            texto = sanitizar_texto(pref.Consideraciones, nombres_prohibidos)[:300]
            if texto and texto not in consideraciones:
                consideraciones.append(texto)

    intereses = sorted(
        votos_intereses, key=lambda n: (-votos_intereses[n], orden_interes.get(n, 0))
    )
    ritmo = None
    if votos_ritmo:
        ritmo = sorted(votos_ritmo, key=lambda n: (-votos_ritmo[n], orden_ritmo.get(n, 0)))[0]

    promedio = None
    if presupuestos:
        promedio = (sum(presupuestos) / len(presupuestos)).quantize(Decimal("0.01"))

    return {
        "intereses": intereses,
        "ritmo": ritmo.lower() if ritmo else None,
        "presupuesto_promedio": promedio,
        "consideraciones": consideraciones,
    }