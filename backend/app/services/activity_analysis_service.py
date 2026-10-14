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
from app.services.entradas_ai.tipos import (
    LUGAR_IDENTIFICADO,
    LUGAR_INEXISTENTE,
    LUGAR_NO_DETERMINADO,
)

logger = logging.getLogger(__name__)

MENSAJE_NO_VERIFICADO = (
    "No fue posible verificar los horarios de apertura de este lugar. "
    "Podés agregar la actividad igualmente."
)

_MINUTOS_DIA = 1440
_MINUTOS_SEMANA = 7 * _MINUTOS_DIA
# Google Places (New) cubre los próximos 7 días (hoy incluido) en currentOpeningHours.
_DIAS_VENTANA_HORARIO_ACTUAL = 7

_DIAS_SEMANA_ES = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")

# Tipos de advertencia de horario. Se devuelven al frontend y se persisten en
# `ActividadesItinerario.TipoAdvertenciaHorario` cuando el usuario la confirma.
TIPO_FUERA_DE_HORARIO = "fuera_de_horario"
TIPO_CERRADO_DIA = "cerrado_dia"
TIPO_CERRADO_TEMPORALMENTE = "cerrado_temporalmente"
TIPO_CERRADO_PERMANENTEMENTE = "cerrado_permanentemente"
TIPOS_ADVERTENCIA = (
    TIPO_FUERA_DE_HORARIO,
    TIPO_CERRADO_DIA,
    TIPO_CERRADO_TEMPORALMENTE,
    TIPO_CERRADO_PERMANENTEMENTE,
)

# `businessStatus` de Google Places (New).
_ESTADOS_CERRADO = {
    "CLOSED_TEMPORARILY": TIPO_CERRADO_TEMPORALMENTE,
    "CLOSED_PERMANENTLY": TIPO_CERRADO_PERMANENTEMENTE,
}


class GeminiNoDisponible(Exception):
    """Gemini no pudo responder (sin API key, error HTTP como 503, red o respuesta ilegible).

    Se distingue de la respuesta válida "no es un lugar concreto" (que devuelve None)
    para que el análisis pueda buscar el lugar por otra vía."""


# Palabras genéricas de actividades que no sirven para confirmar que el lugar
# encontrado en Google Places corresponde a la actividad.
_PALABRAS_GENERICAS = {
    "visita", "visitar", "ir", "al", "a", "la", "el", "los", "las", "de", "del", "en", "con", "y",
    "cena", "cenar", "almuerzo", "almorzar", "desayuno", "desayunar", "merienda", "comida", "comer",
    "paseo", "pasear", "recorrido", "recorrer", "tour", "excursion", "salida", "entrada", "compras",
    "noche", "tarde", "manana", "dia", "amigos", "grupo", "familia", "por", "para", "un", "una",
}


def _normalizar_palabras(texto: str) -> set[str]:
    import unicodedata

    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    palabras = "".join(c if c.isalnum() else " " for c in sin_tildes).split()
    return {p for p in palabras if len(p) >= 3 and p not in _PALABRAS_GENERICAS}


def _nombre_coincide_con_actividad(nombre_lugar: Optional[str], nombre_actividad: str) -> bool:
    """La búsqueda directa por el nombre de la actividad puede devolver cualquier
    lugar (p. ej. "Cena con amigos" -> un restaurante al azar). Solo se acepta si
    comparte al menos una palabra significativa con la actividad."""
    if not nombre_lugar:
        return False
    return bool(_normalizar_palabras(nombre_lugar) & _normalizar_palabras(nombre_actividad))


def obtener_dia_semana(fecha_str: str) -> int:
    dt = datetime.strptime(fecha_str, "%Y-%m-%d")
    return dt.weekday()


async def extraer_nombre_lugar_con_gemini(
    nombre_actividad: str,
    contexto_destino: Optional[str] = None,
    lanzar_si_falla: bool = False,
) -> Optional[str]:
    """Extrae el nombre de un lugar concreto usando Gemini a través de la API REST oficial de Google AI Studio.

    `contexto_destino` (por ejemplo "Orlando, Estados Unidos") ayuda a desambiguar
    nombres como "Animal Kingdom".

    Devuelve None si la actividad no se refiere a un lugar concreto. Si Gemini
    falla devuelve None, salvo con `lanzar_si_falla=True`, que lanza
    `GeminiNoDisponible` para que quien llama pueda usar otra vía."""

    def _fallo(motivo: str) -> None:
        if lanzar_si_falla:
            raise GeminiNoDisponible(motivo)
        return None

    api_key = getattr(settings, "gemini_api_key", None) or getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        logger.warning("Análisis de horarios: GEMINI_API_KEY no configurada.")
        return _fallo("GEMINI_API_KEY no configurada")

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
            # 503 = modelo saturado, 429 = cuota; ambos son temporales del lado de Google.
            logger.warning("Gemini respondió %s al extraer el lugar de la actividad.", response.status_code)
            return _fallo(f"HTTP {response.status_code}")
        data = response.json()
        candidatos = data.get("candidates") or []
        if not candidatos:
            return _fallo("respuesta sin candidatos")
        partes = (candidatos[0].get("content") or {}).get("parts") or []
        texto = "".join(p.get("text", "") for p in partes if not p.get("thought")).strip()

        resultado = json.loads(texto)
    except Exception as error:
        logger.warning("No se pudo extraer el lugar de la actividad con Gemini: %s", error)
        return _fallo(str(error))

    if isinstance(resultado, dict) and resultado.get("es_lugar_concreto"):
        nombre = resultado.get("nombre_lugar")
        return nombre.strip() if isinstance(nombre, str) and nombre.strip() else None
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


def _tramos_del_dia(intervalos: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Tramos de apertura que se solapan con el día (eje 0 = medianoche)."""
    return [
        (max(apertura, 0), cierre)
        for apertura, cierre in intervalos
        if cierre > 0 and apertura < _MINUTOS_DIA
    ]


def _texto_tramos(tramos: list[tuple[int, int]]) -> str:
    return ", ".join(f"{_fmt(apertura)} - {_fmt(cierre)}" for apertura, cierre in tramos)


def _texto_tramos_legible(tramos: list[tuple[int, int]]) -> str:
    partes = [f"de {_fmt(apertura)} a {_fmt(cierre)}" for apertura, cierre in tramos]
    if len(partes) == 1:
        return partes[0]
    return ", ".join(partes[:-1]) + " y " + partes[-1]


def _texto_dia(dia_semana: int, fecha: Optional[date]) -> str:
    nombre = _DIAS_SEMANA_ES[dia_semana % 7]
    return f"{nombre} {fecha:%d/%m}" if fecha is not None else nombre


def _proxima_apertura(
    periods: list[dict],
    dia_semana: int,
    fecha: Optional[date],
    usa_fechas: bool,
    hoy: Optional[date] = None,
) -> Optional[Dict[str, Any]]:
    """Busca el primer día posterior a la actividad en el que el lugar abre.

    Con horarios regulares alcanza con recorrer la semana siguiente. Con
    horarios actuales (fechados) solo se puede mirar dentro de la ventana de
    7 días que publica Google."""
    for desfase in range(1, 8):
        dia = (dia_semana + desfase) % 7
        fecha_dia = fecha + timedelta(days=desfase) if fecha is not None else None
        if usa_fechas:
            hoy_ref = hoy or date.today()
            if fecha_dia is None or fecha_dia >= hoy_ref + timedelta(days=_DIAS_VENTANA_HORARIO_ACTUAL):
                return None
        intervalos = _intervalos_en_eje(periods, dia, fecha_dia if usa_fechas else None)
        if intervalos is None:
            return None
        tramos = _tramos_del_dia(intervalos)
        if tramos:
            return {
                "dia_semana": dia,
                "fecha": fecha_dia,
                "dia_texto": _texto_dia(dia, fecha_dia),
                "horarios": _texto_tramos(tramos),
                "horarios_legibles": _texto_tramos_legible(tramos),
            }
    return None


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
    del_dia = _tramos_del_dia(intervalos)

    if not del_dia:
        # El lugar no abre ese día: se informa cuándo vuelve a abrir.
        return {
            "verificado": True,
            "incompatible": True,
            "tipo": TIPO_CERRADO_DIA,
            "proxima_apertura": _proxima_apertura(
                periods, dia_semana, fecha, fecha_efectiva is not None, hoy
            ),
            "mensaje": (
                "El establecimiento no cuenta con horarios de apertura "
                "para este día."
            ),
        }

    horarios_str = _texto_tramos(del_dia)

    return {
        "verificado": True,
        "incompatible": True,
        "tipo": TIPO_FUERA_DE_HORARIO,
        "horarios_apertura": horarios_str,
        "mensaje": (
            "El horario planificado se encuentra fuera del horario de apertura. "
            f"Horarios disponibles: {horarios_str}. "
            "Se sugiere modificar el horario de la actividad."
        ),
    }


def construir_advertencia(
    resultado: Dict[str, Any],
    nombre_lugar: Optional[str],
    fecha: date,
) -> Dict[str, Any]:
    """Arma la advertencia que ve el usuario.

    - `mensaje`: texto completo para el diálogo de confirmación.
    - `resumen`: texto corto que queda marcado en el itinerario si el usuario
      registra la actividad igualmente.
    """
    tipo = resultado.get("tipo") or TIPO_FUERA_DE_HORARIO
    lugar = nombre_lugar or "El lugar"
    dia_actividad = _texto_dia(fecha.weekday(), fecha)
    advertencia: Dict[str, Any] = {
        "advertencia": True,
        "tipo": tipo,
        "nombre_lugar": nombre_lugar,
        "horarios_apertura": resultado.get("horarios_apertura", ""),
    }

    if tipo == TIPO_CERRADO_TEMPORALMENTE:
        advertencia["mensaje"] = (
            f"{lugar} figura como cerrado temporalmente (por ejemplo, por reformas o "
            "mantenimiento). Puede que reabra antes de tu visita, pero conviene "
            "confirmarlo antes de ir."
        )
        advertencia["resumen"] = "Cerrado temporalmente (reformas u otro motivo)"
        return advertencia

    if tipo == TIPO_CERRADO_PERMANENTEMENTE:
        advertencia["mensaje"] = (
            f"{lugar} figura como cerrado definitivamente. "
            "Te sugerimos elegir otro lugar para esta actividad."
        )
        advertencia["resumen"] = "Cerrado definitivamente"
        return advertencia

    if tipo == TIPO_CERRADO_DIA:
        proxima = resultado.get("proxima_apertura")
        mensaje = f"{lugar} está cerrado el {dia_actividad}."
        resumen = f"Cerrado el {dia_actividad}"
        if proxima:
            mensaje += f" Vuelve a abrir el {proxima['dia_texto']} {proxima['horarios_legibles']}."
            resumen += f" · abre el {proxima['dia_texto']} ({proxima['horarios_legibles']})"
            advertencia["proxima_apertura"] = f"{proxima['dia_texto']} {proxima['horarios_legibles']}"
        else:
            mensaje += " No encontramos cuándo vuelve a abrir."
        mensaje += " Se sugiere cambiar el día de la actividad."
        advertencia["mensaje"] = mensaje
        advertencia["resumen"] = resumen
        return advertencia

    # Fuera de horario: se conserva el mensaje del validador (incluye horarios).
    advertencia["mensaje"] = resultado.get("mensaje") or ""
    horarios = advertencia["horarios_apertura"]
    advertencia["resumen"] = (
        f"Fuera del horario del lugar ({horarios.replace(' - ', ' a ')})"
        if horarios
        else "Fuera del horario del lugar"
    )
    return advertencia


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
    contexto_lugar: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Analiza si el horario de la actividad es compatible con el del lugar.

    Devuelve siempre un dict. `advertencia=True` solo ante una incompatibilidad
    comprobada; cualquier error o falta de datos permite registrar normalmente.
    `aviso` (opcional) informa que no se pudo verificar la disponibilidad horaria.

    Si se pasa `contexto_lugar` (un dict), se completa con el establecimiento
    identificado para que otros análisis lo reutilicen sin repetir las llamadas
    a Gemini y Google Places (recomendación de entradas y reservas):
    - `estado`: `identificado`, `sin_lugar` (Gemini indicó que la actividad no es
      un lugar concreto) o `no_determinado` (error, sin resultados o sin análisis).
    - `place_id` y `detalles` (lo que devolvió `obtener_detalles_lugar`) cuando
      el lugar quedó identificado.
    """
    if contexto_lugar is not None:
        contexto_lugar["estado"] = LUGAR_NO_DETERMINADO

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
    # True cuando Gemini no respondió y se buscó el lugar directamente con el nombre
    # de la actividad. En ese caso, si no se consiguen los horarios, se registra
    # normalmente informando que no se pudieron verificar.
    busqueda_directa = False
    no_verificado = {"advertencia": False, "aviso": MENSAJE_NO_VERIFICADO}

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
                try:
                    nombre_busqueda = await extraer_nombre_lugar_con_gemini(
                        nombre_actividad, _contexto_destino_texto(destinos), lanzar_si_falla=True
                    )
                    if not nombre_busqueda and contexto_lugar is not None and id_lugar_interes is None:
                        # Respuesta válida de Gemini: la actividad no es un lugar concreto.
                        contexto_lugar["estado"] = LUGAR_INEXISTENTE
                except Exception as error:
                    # Gemini no disponible (p. ej. 503): se busca en Google Places con
                    # el nombre de la actividad tal cual.
                    logger.warning(
                        "Gemini no disponible (%s); se busca el lugar en Google Places con el nombre de la actividad.",
                        error,
                    )
                    busqueda_directa = True
                    nombre_busqueda = (nombre_actividad or "").strip() or None
            if nombre_busqueda:
                if destinos:
                    place_id = await place_search.buscar_lugar_en_destinos(nombre_busqueda, destinos)
                else:
                    place_id = await buscar_lugar_por_nombre(nombre_busqueda)
    except Exception as error:
        logger.warning("Error identificando el lugar de la actividad: %s", error)
        return no_verificado if busqueda_directa else {"advertencia": False}  # Criterio 12

    if not place_id:
        # Criterio 10: lugar no identificado.
        return no_verificado if busqueda_directa else {"advertencia": False}

    try:
        details = await obtener_detalles_lugar(place_id)
        if not details:
            # Criterio 12 (error/sin respuesta de Google)
            return no_verificado if busqueda_directa else {"advertencia": False}

        dia_sem = fecha_obj.weekday()
        nombre_lugar = details.get("name")

        if busqueda_directa and not _nombre_coincide_con_actividad(nombre_lugar, nombre_actividad):
            # Sin Gemini no hay certeza de que el resultado sea el lugar de la actividad:
            # mejor no advertir sobre un lugar equivocado.
            logger.info(
                "Búsqueda directa descartada: '%s' no coincide con la actividad '%s'.",
                nombre_lugar,
                nombre_actividad,
            )
            return no_verificado

        if contexto_lugar is not None:
            contexto_lugar.update(estado=LUGAR_IDENTIFICADO, place_id=place_id, detalles=details)

        # (4) Lugar cerrado temporal (reformas, mantenimiento, etc.) o definitivamente:
        # se avisa antes de mirar horarios, que Google suele seguir publicando.
        tipo_cierre = _ESTADOS_CERRADO.get(details.get("business_status") or "")
        if tipo_cierre:
            return construir_advertencia({"tipo": tipo_cierre}, nombre_lugar, fecha_obj)

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
            if resultado.get("tipo") == TIPO_CERRADO_DIA and not resultado.get("proxima_apertura"):
                # Los horarios actuales solo cubren 7 días: si no alcanzan para saber
                # cuándo reabre, se busca en los horarios regulares.
                regulares = details.get("opening_hours") or {}
                if regulares.get("periods"):
                    try:
                        resultado["proxima_apertura"] = _proxima_apertura(
                            regulares["periods"], dia_sem, fecha_obj, False
                        )
                    except Exception:  # pragma: no cover - dato opcional
                        pass
            return construir_advertencia(resultado, nombre_lugar, fecha_obj)
    except Exception as error:
        logger.warning("Error consultando los horarios del lugar: %s", error)
        return no_verificado if busqueda_directa else {"advertencia": False}  # Criterio 12

    # Horario verificado y compatible: permite limpiar una advertencia previa.
    return {"advertencia": False, "compatible": True}
