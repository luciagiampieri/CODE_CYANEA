"""Tareas del checklist creadas desde la recomendación de entradas o reservas.

Cuando el sistema recomienda reservar o comprar entradas por anticipado para una
actividad, el usuario puede tocar "Recordármelo" y se crea una tarea en el
checklist del viaje:

- Título «Comprar entradas – <lugar>» o «Reservar – <lugar>». Si ya hay una tarea
  con ese nombre en el viaje (otra actividad en el mismo lugar), se agrega el día
  de la actividad: «Comprar entradas – Museo del Prado (jue 14/11)».
- Categoría "Reservas y entradas", sin responsable y con el enlace oficial.
- Vinculada a la actividad y al lugar de Google Places para el que se creó.
- Se avisa a todos los participantes; si después se le asigna un responsable,
  se le avisa solo a esa persona.

Si la actividad cambia de lugar o se elimina, las tareas pendientes vinculadas se
eliminan (previa confirmación del usuario) y se avisa al responsable o, si no hay,
a todos. Las tareas ya hechas se conservan.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.actividad_itinerario import ActividadItinerario
from app.models.categorias_checklist import CategoriasChecklist
from app.models.checklist import Checklist
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services.entradas_ai.analisis import (
    INDETERMINADO,
    MISMO_LUGAR,
    decidir_analisis,
    normalizar_place_id,
)
from app.services.notifications import (
    NotificationType,
    TripNotificationEvent,
    dispatch_trip_notification,
    dispatch_user_notification,
)
from app.services.privacidad import nombre_para_otros

logger = logging.getLogger(__name__)

CATEGORIA_RESERVAS_ENTRADAS = "Reservas y entradas"
NOMBRE_MAX = 150
ENLACE_MAX = 500

# Tipos de recomendación para los que se ofrece "Recordármelo". Comprar en el lugar
# no tiene nada que hacer antes, así que no genera tarea.
TIPOS_RESERVA = {"RESERVA", "RESERVA_DISPONIBLE"}
TIPOS_RECORDABLES = TIPOS_RESERVA | {"ENTRADAS_ANTICIPADAS"}

_DIAS = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")


class ErrorTareaEntradas(ValueError):
    """Datos inválidos para crear la tarea (se responde 400)."""


# ---------------------------------------------------------------------------
# Datos de la tarea
# ---------------------------------------------------------------------------

def accion_de_tipo(tipo: str) -> str:
    return "Reservar" if tipo in TIPOS_RESERVA else "Comprar entradas"


def url_valida(url: Any) -> str | None:
    """Solo enlaces web (http/https), sin espacios y de largo razonable."""
    if not isinstance(url, str):
        return None
    limpia = url.strip()
    if len(limpia) > ENLACE_MAX or not re.match(r"^https?://[^\s/$.?#][^\s]*$", limpia, re.IGNORECASE):
        return None
    return limpia


def enlace_de_recomendacion(recomendacion: dict[str, Any]) -> str | None:
    """El mismo enlace que ofrece el diálogo: la página para comprar o reservar; si
    no hay, la plataforma de reservas enlazada desde el sitio oficial; si no, el
    sitio oficial."""
    candidatos = [recomendacion.get("urlAccion")]
    if recomendacion.get("tipo") in TIPOS_RESERVA:
        candidatos.append(recomendacion.get("urlReservaExterna"))
    candidatos.append(recomendacion.get("urlSitioOficial"))
    for candidato in candidatos:
        valida = url_valida(candidato)
        if valida:
            return valida
    return None


def etiqueta_dia(fecha: date) -> str:
    """date(2026, 11, 14) -> "sáb 14/11"."""
    return f"{_DIAS[fecha.weekday()]} {fecha.day:02d}/{fecha.month:02d}"


def _recortar(texto: str, largo: int) -> str:
    texto = re.sub(r"\s+", " ", texto or "").strip()
    return texto if len(texto) <= largo else texto[: largo - 1].rstrip() + "…"


def _nombre_existe(db: Session, trip_id: int, nombre: str) -> bool:
    return (
        db.scalar(
            select(Checklist.IdChecklist).where(
                Checklist.IdViaje == trip_id, Checklist.Nombre == nombre
            )
        )
        is not None
    )


def titulo_disponible(db: Session, trip_id: int, tipo: str, nombre_lugar: str, fecha: date | None) -> str:
    """Título de la tarea, sin repetir el de otra tarea del viaje.

    Si ya existe, se agrega el día de la actividad; si también existe (dos
    actividades en el mismo lugar el mismo día), se numera."""
    accion = accion_de_tipo(tipo)
    sufijos = [""]
    if fecha is not None:
        dia = etiqueta_dia(fecha)
        sufijos.append(f" ({dia})")
        sufijos.extend(f" ({dia}, {n})" for n in range(2, 50))
    else:
        sufijos.extend(f" ({n})" for n in range(2, 50))

    for sufijo in sufijos:
        base = f"{accion} – "
        lugar = _recortar(nombre_lugar, NOMBRE_MAX - len(base) - len(sufijo))
        titulo = f"{base}{lugar}{sufijo}"
        if not _nombre_existe(db, trip_id, titulo):
            return titulo
    raise ErrorTareaEntradas("Ya hay demasiadas tareas con ese nombre en el viaje.")


def obtener_categoria(db: Session) -> CategoriasChecklist:
    """Categoría "Reservas y entradas" (la crea la migración; si falta, se agrega)."""
    categoria = db.scalar(
        select(CategoriasChecklist).where(CategoriasChecklist.Nombre == CATEGORIA_RESERVAS_ENTRADAS)
    )
    if categoria is None:
        categoria = CategoriasChecklist(Nombre=CATEGORIA_RESERVAS_ENTRADAS, Activo=True)
        db.add(categoria)
        db.flush()
    elif not categoria.Activo:
        categoria.Activo = True
    return categoria


def recomendacion_confiable(place_id: str | None) -> dict[str, Any] | None:
    """Recomendación que calculó el backend para el lugar (caché del análisis).

    Si está, manda sobre lo que envía la app: el enlace guardado siempre es el que
    se verificó en el sitio oficial."""
    if not place_id:
        return None
    try:
        from app.services.entradas_ai.analisis import _desde_cache

        resultado = _desde_cache(place_id)
        return resultado.recomendacion() if resultado is not None else None
    except Exception:
        logger.exception("Entradas: no se pudo leer la recomendación en caché de %s", place_id)
        return None


@dataclass
class DatosTarea:
    tipo: str
    enlace: str | None
    nombre_lugar: str


def resolver_datos_tarea(
    actividad: ActividadItinerario,
    tipo: str,
    enlace: str | None,
    nombre_lugar: str | None,
) -> DatosTarea:
    """Combina la recomendación verificada (si está en caché) con lo que envía la app."""
    confiable = recomendacion_confiable(actividad.GooglePlaceIdEntradas)
    if confiable is not None:
        tipo = confiable.get("tipo") or tipo
        enlace_final = enlace_de_recomendacion(confiable)
        nombre = confiable.get("nombreLugar") or nombre_lugar
    else:
        enlace_final = url_valida(enlace) if enlace else None
        if enlace and enlace_final is None:
            raise ErrorTareaEntradas("El enlace de la recomendación no es válido.")
        nombre = nombre_lugar

    if tipo not in TIPOS_RECORDABLES:
        raise ErrorTareaEntradas(
            "Solo se pueden recordar las recomendaciones de reservar o comprar entradas por anticipado."
        )
    nombre = (nombre or "").strip() or actividad.Nombre
    return DatosTarea(tipo=tipo, enlace=enlace_final, nombre_lugar=nombre)


def tarea_existente(db: Session, actividad: ActividadItinerario) -> Checklist | None:
    """Tarea ya creada para la misma actividad y el mismo lugar."""
    query = select(Checklist).where(Checklist.IdActividad == actividad.IdActividad)
    place_id = normalizar_place_id(actividad.GooglePlaceIdEntradas)
    if place_id:
        query = query.where(Checklist.GooglePlaceIdEntradas == place_id)
    else:
        query = query.where(Checklist.GooglePlaceIdEntradas.is_(None))
    return db.scalars(query.order_by(Checklist.IdChecklist)).first()


def crear_tarea(
    db: Session,
    viaje: Viaje,
    actividad: ActividadItinerario,
    actor: Usuario,
    datos: DatosTarea,
) -> Checklist:
    fecha = actividad.DiaCronograma.Fecha if actividad.DiaCronograma is not None else None
    titulo = titulo_disponible(db, viaje.IdViaje, datos.tipo, datos.nombre_lugar, fecha)
    categoria = obtener_categoria(db)
    tarea = Checklist(
        IdViaje=viaje.IdViaje,
        IdUsuarioCreador=actor.IdUsuario,
        Nombre=titulo,
        IdCategoriaChecklist=categoria.IdCategoriaChecklist,
        Enlace=datos.enlace,
        IdActividad=actividad.IdActividad,
        GooglePlaceIdEntradas=normalizar_place_id(actividad.GooglePlaceIdEntradas),
    )
    tarea.Responsables = []
    db.add(tarea)
    db.commit()
    db.refresh(tarea)
    return tarea


def es_tarea_de_recomendacion(tarea: Checklist) -> bool:
    return tarea.IdActividad is not None or tarea.GooglePlaceIdEntradas is not None


# ---------------------------------------------------------------------------
# Cambio de lugar y eliminación de la actividad
# ---------------------------------------------------------------------------

def tareas_pendientes(db: Session, id_actividad: int) -> list[Checklist]:
    return list(
        db.scalars(
            select(Checklist)
            .where(Checklist.IdActividad == id_actividad, Checklist.Completada.is_(False))
            .order_by(Checklist.IdChecklist)
        ).all()
    )


def tareas_hechas(db: Session, id_actividad: int) -> list[Checklist]:
    return list(
        db.scalars(
            select(Checklist).where(
                Checklist.IdActividad == id_actividad, Checklist.Completada.is_(True)
            )
        ).all()
    )


def lugar_de_tarea_cambia(
    tarea: Checklist,
    contexto_lugar: dict | None,
    *,
    cambia_lugar_aparente: bool,
    place_id_confirmado: str | None = None,
    analisis_corrio: bool = True,
) -> bool:
    """¿La edición cambia el lugar para el que se creó la tarea?

    - Con el lugar identificado por la validación de horarios (US 98) se compara el
      `place_id`: mismo lugar -> no cambia; otro lugar o ninguno -> cambia.
    - Al confirmar una advertencia de horario el análisis no se repite: se usa el
      lugar que devolvió esa advertencia (`place_id_confirmado`).
    - Si no se pudo identificar el lugar, se usa el cambio aparente (otra ubicación,
      o otro nombre cuando la actividad no tiene ubicación).
    """
    decision = decidir_analisis(tarea.GooglePlaceIdEntradas, contexto_lugar)
    if decision.accion == MISMO_LUGAR:
        return False
    if decision.accion != INDETERMINADO:
        return True  # Otro lugar identificado, o la actividad ya no es un lugar.
    confirmado = normalizar_place_id(place_id_confirmado)
    if confirmado:
        return confirmado != normalizar_place_id(tarea.GooglePlaceIdEntradas)
    if not analisis_corrio:
        return False
    return cambia_lugar_aparente


def resumen_tareas(tareas: list[Checklist]) -> list[dict[str, Any]]:
    return [{"idChecklist": t.IdChecklist, "nombre": t.Nombre} for t in tareas]


def resumen_tareas_read(tareas: list[Checklist]):
    from app.schemas.trip import TareaEntradasResumen

    return [TareaEntradasResumen(idChecklist=t.IdChecklist, nombre=t.Nombre) for t in tareas]


def mensaje_confirmacion(tareas: list[Checklist], motivo: str) -> str:
    if len(tareas) == 1:
        return f"{motivo}, se eliminará la tarea «{tareas[0].Nombre}» del checklist."
    nombres = ", ".join(f"«{t.Nombre}»" for t in tareas)
    return f"{motivo}, se eliminarán estas tareas del checklist: {nombres}."


@dataclass
class TareaEliminada:
    nombre: str
    ids_responsables: list[int] = field(default_factory=list)


def eliminar_tareas(db: Session, tareas: list[Checklist]) -> list[TareaEliminada]:
    """Elimina las tareas (sin commit) y devuelve lo necesario para avisar."""
    eliminadas = []
    for tarea in tareas:
        eliminadas.append(
            TareaEliminada(
                nombre=tarea.Nombre,
                ids_responsables=[u.IdUsuario for u in tarea.Responsables],
            )
        )
        db.delete(tarea)
    return eliminadas


def desvincular_tareas_hechas(db: Session, id_actividad: int) -> None:
    """Al borrar la actividad, las tareas ya hechas se conservan sin vínculo
    (en PostgreSQL lo hace también ON DELETE SET NULL)."""
    for tarea in tareas_hechas(db, id_actividad):
        tarea.IdActividad = None


# ---------------------------------------------------------------------------
# Notificaciones
# ---------------------------------------------------------------------------

def _usuarios(db: Session, ids: set[int]) -> list[Usuario]:
    if not ids:
        return []
    return list(db.scalars(select(Usuario).where(Usuario.IdUsuario.in_(ids))).all())


async def notificar_tarea_creada(db: Session, viaje: Viaje, tarea: Checklist, actor: Usuario) -> None:
    """La tarea queda sin responsable: se avisa a todos para que alguien se encargue."""
    await dispatch_trip_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.TAREA_RESERVA_ENTRADAS,
            tipo="tarea_entradas_creada",
            titulo=f"Nueva tarea en {viaje.Titulo}",
            mensaje=(
                f"{nombre_para_otros(actor)} agregó «{tarea.Nombre}» al checklist. "
                "Todavía nadie se encargó."
            ),
            id_viaje=viaje.IdViaje,
            id_usuario_actor=actor.IdUsuario,
            data={"eventType": "checklist_task_created", "checklistId": tarea.IdChecklist},
        ),
    )


async def notificar_responsables_asignados(
    db: Session,
    viaje: Viaje,
    tarea: Checklist,
    ids_nuevos: set[int],
    actor: Usuario,
) -> None:
    """Solo a quienes se agregaron como responsables (y no a quien se asignó a sí mismo)."""
    destinatarios = _usuarios(db, set(ids_nuevos) - {actor.IdUsuario})
    if not destinatarios:
        return
    await dispatch_user_notification(
        db,
        TripNotificationEvent(
            notification_type=NotificationType.TAREA_RESERVA_ENTRADAS,
            tipo="tarea_entradas_asignada",
            titulo=f"Te asignaron una tarea en {viaje.Titulo}",
            mensaje=f"{nombre_para_otros(actor)} te asignó «{tarea.Nombre}».",
            id_viaje=viaje.IdViaje,
            id_usuario_actor=actor.IdUsuario,
            data={"eventType": "checklist_task_assigned", "checklistId": tarea.IdChecklist},
        ),
        destinatarios,
    )


async def notificar_tareas_eliminadas(
    db: Session,
    viaje: Viaje,
    eliminadas: list[TareaEliminada],
    actor: Usuario,
    motivo: str,
) -> None:
    """Al responsable de cada tarea; si no tenía, a todos los participantes.

    `motivo`: "cambió el lugar de la actividad" o "eliminó la actividad"."""
    for tarea in eliminadas:
        evento = TripNotificationEvent(
            notification_type=NotificationType.TAREA_RESERVA_ENTRADAS,
            tipo="tarea_entradas_eliminada",
            titulo=f"Se eliminó una tarea en {viaje.Titulo}",
            mensaje=(
                f"{nombre_para_otros(actor)} {motivo}, así que se eliminó la tarea "
                f"«{tarea.nombre}» del checklist."
            ),
            id_viaje=viaje.IdViaje,
            id_usuario_actor=actor.IdUsuario,
            data={"eventType": "checklist_task_deleted"},
        )
        if tarea.ids_responsables:
            destinatarios = _usuarios(db, set(tarea.ids_responsables) - {actor.IdUsuario})
            if destinatarios:
                await dispatch_user_notification(db, evento, destinatarios)
        else:
            await dispatch_trip_notification(db, evento)
