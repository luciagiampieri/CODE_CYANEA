from __future__ import annotations

import json
import logging
from datetime import time, datetime, date, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select
import httpx

from app.models.lugar_interes import LugarInteres
from app.services import place_search
from app.services.place_search import obtener_detalles_lugar, buscar_lugar_por_nombre
from app.core.config import settings

logger = logging.getLogger(__name__)

MENSAJE_NO_VERIFICADO = (
    "No fue posible verificar los horarios de apertura de este lugar. "
    "Podés agregar la actividad igualmente."
)

_MINUTOS_DIA = 1440
_MINUTOS_SEMANA = 7 * _MINUTOS_DIA
# Google Places (New) cubre los próximos 7 días (hoy incluido) en currentOpeningHours.
_DIAS_VENTANA_HORARIO_ACTUAL = 7


def obtener_dia_semana(fecha_str: str) -> int:
    dt = datetime.strptime(fecha_str, "%Y-%m-%d")
    return dt.weekday()


async def extraer_nombre_lugar_con_gemini(
    nombre_actividad: str,
    contexto_destino: Optional[str] = None,
) -> Optional[str]:
    """Extrae el nombre de un lugar concreto usando Gemini a través de la API REST oficial de Google AI Studio.

    `contexto_destino` (por ejemplo "Orlando, Estados Unidos") ayuda a desambiguar
    nombres como "Animal Kingdom"."""
    api_key = getattr(settings, "gemini_api_key", None) or getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        logger.warning("Análisis de horarios: GEMINI_API_KEY no configurada.")
        return None

    model = getattr(settings, "ai_receipt_model", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    contexto = (
        f'\n    El viaje tiene como destino: "{contexto_destino}". Usalo solo para desambiguar el lugar.'
        if contexto_destino
        else ""
    )
    prompt = f"""
    Analiza el siguiente nombre de actividad de un itinerario de viaje: "{nombre_actividad}".{contexto}
    Determina si hace referencia a un establecimiento, atracción turística, restaurante, museo o lugar concreto que tenga ubicación física y horarios de apertura.
    Responde estrictamente en formato JSON con la siguiente estructura:
    {{
      "es_lugar_concreto": true/false,
      "nombre_lugar": "Nombre comercial o del establecimiento detectado, o null si no aplica"
    }}
    """

    generation_config: dict = {"responseMimeType": "application/json", "temperature": 0}
    # Sin razonamiento la respuesta tarda mucho menos (antes se agotaba el timeout y fallaba en silencio).
    try:
        from app.services.receipt_ai.gemini import _config_razonamiento

        razonamiento = _config_razonamiento(model)
        if razonamiento:
            generation_config["thinkingConfig"] = razonamiento
    except Exception:  # pragma: no cover - el módulo de recibos no debe ser requisito
        pass

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            response = await client.post(url, headers={"x-goog-api-key": api_key}, json=payload)
        if response.status_code != 200:
            logger.warning("Gemini respondió %s al extraer el lugar de la actividad.", response.status_code)
            return None
        data = response.json()
        candidatos = data.get("candidates") or []
        if not candidatos:
            return None
        partes = (candidatos[0].get("content") or {}).get("parts") or []
        texto = "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()

        resultado = json.loads(texto)
        if isinstance(resultado, dict) and resultado.get("es_lugar_concreto"):
            nombre = resultado.get("nombre_lugar")
            return nombre.strip() if isinstance(nombre, str) and nombre.strip() else None
    except Exception as error:
        logger.warning("No se pudo extraer el lugar de la actividad con Gemini: %s", error)
    return None


# ---------------------------------------------------------------------------
# Horarios de apertura
# ---------------------------------------------------------------------------

def _hora_minuto(punto: dict) -> Optional[tuple[int, int]]:
    """Lee la hora de un `open`/`close`. Soporta Places API (New): {hour, minute}
    y el formato legacy: {time: "0900"}."""
    if punto.get("hour") is not None:
        return int(punto["hour"]), int(punto.get("minute") or 0)
    texto = punto.get("time")
    if isinstance(texto, str) and len(texto) >= 4 and texto[:4].isdigit():
        return int(texto[:2]), int(texto[2:4])
    return None


def _fecha_de(punto: dict) -> Optional[date]:
    d = punto.get("date")
    if isinstance(d, dict) and d.get("year") and d.get("month") and d.get("day"):
        try:
            return date(int(d["year"]), int(d["month"]), int(d["day"]))
        except ValueError:
            return None
    return None


def _intervalos_en_eje(
    periods: list[dict], dia_semana: int, fecha: Optional[date]
) -> Optional[list[tuple[int, int]]]:
    """Convierte los períodos en intervalos (minutos) sobre un eje cuyo 0 es la
    medianoche del día de la actividad. Devuelve None si algún período es
    ilegible; [] si el lugar no abre ese día."""
    intervalos: list[tuple[int, int]] = []
    for period in periods:
        abre = period.get("open") or {}
        cierra = period.get("close")
        hm_abre = _hora_minuto(abre)
        g_dia = abre.get("day")
        if hm_abre is None or g_dia is None:
            return None

        if not cierra:
            # Google representa "abierto 24 horas" con un único período sin `close`.
            return [(-_MINUTOS_SEMANA, 2 * _MINUTOS_SEMANA)]

        hm_cierra = _hora_minuto(cierra)
        if hm_cierra is None:
            return None

        f_abre, f_cierra = _fecha_de(abre), _fecha_de(cierra)
        if f_abre is not None and fecha is not None:
            # Horario "actual": el período trae su fecha exacta (incluye feriados/horarios especiales).
            d_abre = (f_abre - fecha).days
            d_cierra = (f_cierra - fecha).days if f_cierra else d_abre
            o = d_abre * _MINUTOS_DIA + hm_abre[0] * 60 + hm_abre[1]
            c = d_cierra * _MINUTOS_DIA + hm_cierra[0] * 60 + hm_cierra[1]
            if c <= o:
                c += _MINUTOS_DIA
            intervalos.append((o, c))
            continue

        # Horario regular semanal. Google: 0 = domingo; Python: 0 = lunes.
        py_abre = (int(g_dia) - 1) % 7
        py_cierra = (int(cierra.get("day", g_dia)) - 1) % 7
        for semanas in (-1, 0, 1):
            o = (py_abre - dia_semana + 7 * semanas) * _MINUTOS_DIA + hm_abre[0] * 60 + hm_abre[1]
            c = (py_cierra - dia_semana + 7 * semanas) * _MINUTOS_DIA + hm_cierra[0] * 60 + hm_cierra[1]
            if c <= o:
                c += _MINUTOS_SEMANA
            intervalos.append((o, c))

    # Unimos períodos contiguos o solapados (p. ej. 18:00-24:00 + 00:00-02:00).
    intervalos.sort()
    fusionados: list[tuple[int, int]] = []
    for o, c in intervalos:
        if fusionados and o <= fusionados[-1][1]:
            fusionados[-1] = (fusionados[-1][0], max(fusionados[-1][1], c))
        else:
            fusionados.append((o, c))
    return fusionados


def _fmt(minutos: int) -> str:
    minutos %= _MINUTOS_DIA
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def validar_intervalo_horario(
    hora_inicio_act: time,
    hora_fin_act: time,
    dia_semana: int,
    opening_hours_data: Optional[Dict[str, Any]],
    fecha: Optional[date] = None,
    hoy: Optional[date] = None,
) -> Dict[str, Any]:
    no_verificado = {
        "verificado": False,
        "incompatible": False,
        "mensaje": "No se dispone de información confiable sobre los horarios de apertura.",
    }

    if not opening_hours_data or not opening_hours_data.get("periods"):
        return no_verificado

    periods = opening_hours_data["periods"]

    # `currentOpeningHours` trae fechas concretas para los próximos 7 días.
    # Si la actividad cae fuera de esa ventana, ese dato no aplica.
    fecha_efectiva = fecha

    if fecha is not None and any(
        _fecha_de(p.get("open") or {}) for p in periods
    ):
        hoy = hoy or date.today()

        if not (hoy <= fecha < hoy + timedelta(days=_DIAS_VENTANA_HORARIO_ACTUAL)):
            return no_verificado
    else:
        fecha_efectiva = None

    intervalos = _intervalos_en_eje(
        periods,
        dia_semana,
        fecha_efectiva,
    )

    if intervalos is None:
        return no_verificado

    inicio = hora_inicio_act.hour * 60 + hora_inicio_act.minute
    fin = hora_fin_act.hour * 60 + hora_fin_act.minute

    # La actividad debe quedar COMPLETAMENTE dentro de un mismo
    # intervalo de apertura.
    #
    # Ejemplo:
    # Apertura: 09:00 - 18:00
    #
    # 17:00 - 18:00 -> compatible
    # 17:00 - 18:30 -> incompatible
    # 18:00 - 19:00 -> incompatible
    # 08:00 - 10:00 -> incompatible
    #
    # No alcanza con que la hora de inicio esté dentro del horario:
    # también se debe verificar que la hora de finalización
    # no supere la hora de cierre.
    compatible = any(
        apertura <= inicio and fin <= cierre
        for apertura, cierre in intervalos
    )

    if compatible:
        return {
            "verificado": True,
            "incompatible": False,
            "mensaje": "Horario compatible.",
        }

    # Tramos que se solapan con el día de la actividad,
    # para poder mostrarlos al usuario.
    del_dia = [
        (max(apertura, 0), cierre)
        for apertura, cierre in intervalos
        if cierre > 0 and apertura < _MINUTOS_DIA
    ]

    if not del_dia:
        return {
            "verificado": True,
            "incompatible": True,
            "mensaje": (
                "El establecimiento no cuenta con horarios de apertura "
                "para este día."
            ),
        }

    horarios_str = ", ".join(
        f"{_fmt(apertura)} - {_fmt(cierre)}"
        for apertura, cierre in del_dia
    )

    return {
        "verificado": True,
        "incompatible": True,
        "horarios_apertura": horarios_str,
        "mensaje": (
            "El horario planificado se encuentra fuera del horario de apertura. "
            f"Horarios disponibles: {horarios_str}. "
            "Se sugiere modificar el horario de la actividad."
        ),
    }


def _contexto_destino_texto(destinos: Optional[list[dict]]) -> Optional[str]:
    if not destinos:
        return None
    partes = []
    for d in destinos:
        nombre = ", ".join(str(x) for x in (d.get("name"), d.get("country")) if x)
        if nombre:
            partes.append(nombre)
    return " / ".join(partes) or None


async def analizar_horario_actividad(
    db: Session,
    nombre_actividad: str,
    fecha: date | str,
    hora_inicio: time,
    hora_fin: time,
    id_lugar_interes: int | None = None,
    ignorar_advertencia: bool = False,
    destinos: Optional[list[dict]] = None,
) -> Dict[str, Any]:
    """Analiza si el horario de la actividad es compatible con el del lugar.

    Devuelve siempre un dict. `advertencia=True` solo ante una incompatibilidad
    comprobada; cualquier error o falta de datos permite registrar normalmente.
    `aviso` (opcional) informa que no se pudo verificar la disponibilidad horaria.
    """
    if ignorar_advertencia:
        return {"advertencia": False}

    try:
        fecha_obj = fecha if isinstance(fecha, date) else datetime.strptime(fecha, "%Y-%m-%d").date()
        if isinstance(fecha_obj, datetime):
            fecha_obj = fecha_obj.date()
    except Exception as error:
        logger.warning("Fecha inválida en el análisis de horarios: %s", error)
        return {"advertencia": False}

    place_id = None
    nombre_busqueda = None

    try:
        # (2) La ubicación asociada manualmente es la referencia principal.
        if id_lugar_interes is not None:
            lugar = db.scalar(select(LugarInteres).where(LugarInteres.IdLugarInteres == id_lugar_interes))
            if lugar is not None:
                if lugar.GooglePlaceId:
                    place_id = lugar.GooglePlaceId
                else:
                    nombre_busqueda = lugar.Nombre

        # (3) Sin ubicación utilizable: se infiere el lugar desde el nombre de la actividad.
        if not place_id:
            if not nombre_busqueda:
                nombre_busqueda = await extraer_nombre_lugar_con_gemini(
                    nombre_actividad, _contexto_destino_texto(destinos)
                )
            if nombre_busqueda:
                if destinos:
                    place_id = await place_search.buscar_lugar_en_destinos(nombre_busqueda, destinos)
                else:
                    place_id = await buscar_lugar_por_nombre(nombre_busqueda)
    except Exception as error:
        logger.warning("Error identificando el lugar de la actividad: %s", error)
        return {"advertencia": False}  # Criterio 12

    if not place_id:
        return {"advertencia": False}  # Criterio 10: lugar no identificado

    try:
        details = await obtener_detalles_lugar(place_id)
        if not details:
            return {"advertencia": False}  # Criterio 12 (error/sin respuesta de Google)

        dia_sem = fecha_obj.weekday()
        nombre_lugar = details.get("name")

        # (5) Primero los horarios actuales (con fechas especiales); si no cubren
        # la fecha o no existen, los regulares.
        resultado = None
        for clave in ("current_opening_hours", "opening_hours"):
            horarios = details.get(clave)
            if not horarios:
                continue
            candidato = validar_intervalo_horario(hora_inicio, hora_fin, dia_sem, horarios, fecha=fecha_obj)
            if candidato.get("verificado"):
                resultado = candidato
                break

        if resultado is None:
            # (11) Sin información confiable: se informa, sin asumir que está cerrado.
            return {"advertencia": False, "aviso": MENSAJE_NO_VERIFICADO}

        if resultado.get("incompatible"):
            return {
                "advertencia": True,
                "mensaje": resultado.get("mensaje"),
                "horarios_apertura": resultado.get("horarios_apertura", ""),
                "nombre_lugar": nombre_lugar,
            }
    except Exception as error:
        logger.warning("Error consultando los horarios del lugar: %s", error)
        return {"advertencia": False}  # Criterio 12

    return {"advertencia": False}