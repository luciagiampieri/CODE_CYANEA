from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.models.sugerencia_actividad import EstadoSugerenciaActividad, SugerenciaActividad
from app.models.votacion import Votacion

ESTADO_PENDIENTE = "pendiente"
ESTADO_EN_VOTACION = "en_votacion"

MINIMO_SUGERENCIAS = 2
MAXIMO_SUGERENCIAS = 5
LARGO_MAXIMO_TITULO = 150
LARGO_MAXIMO_PROPUESTA = 255

_DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass
class VotacionDesdeSugerencias:
    """Datos ya validados para crear la votación."""

    sugerencias: list[SugerenciaActividad]
    titulo: str
    fecha_cierre: datetime


def _rechazar(mensaje: str, codigo: int = status.HTTP_400_BAD_REQUEST) -> None:
    raise HTTPException(status_code=codigo, detail=mensaje)


def _aware(fecha: datetime) -> datetime:
    return fecha if fecha.tzinfo is not None else fecha.replace(tzinfo=timezone.utc)


def _hhmm(hora: time) -> str:
    return hora.strftime("%H:%M")


def _nombre_estado(sugerencia: SugerenciaActividad) -> str:
    return (sugerencia.Estado.Nombre if sugerencia.Estado else "").strip().lower()


def obtener_estado(db: Session, nombre: str) -> EstadoSugerenciaActividad:
    estado = db.scalar(
        select(EstadoSugerenciaActividad).where(
            func.lower(EstadoSugerenciaActividad.Nombre) == nombre
        )
    )
    if estado is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falta el estado de sugerencia '{nombre}' en la tabla maestra.",
        )
    return estado


def obtener_fecha_dia(db: Session, id_dia: int) -> date | None:
    valor = db.execute(
        text('SELECT "Fecha" FROM "DiasCronogramas" WHERE "IdDiaCronograma" = :id'),
        {"id": id_dia},
    ).scalar()
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return date.fromisoformat(str(valor)[:10])


def formatear_ars(monto: Decimal | float | int | None) -> str:
    entero = int(round(float(monto or 0)))
    return f"{entero:,}".replace(",", ".")


def texto_propuesta(sugerencia: SugerenciaActividad) -> str:
    costo = float(sugerencia.CostoEstimadoARS or 0)
    costo_texto = "Gratis" if costo <= 0 else f"ARS $ {formatear_ars(costo)} por persona"
    detalle = (
        f" — {sugerencia.LugarNombre} · "
        f"{_hhmm(sugerencia.HoraInicio)}–{_hhmm(sugerencia.HoraFin)} · {costo_texto}"
    )
    nombre = (sugerencia.Nombre or "").strip()
    disponible = LARGO_MAXIMO_PROPUESTA - len(detalle)
    if disponible < len(nombre):
        nombre = nombre[: max(disponible - 1, 1)].rstrip() + "…"
    return f"{nombre}{detalle}"[:LARGO_MAXIMO_PROPUESTA]


def titulo_predefinido(fecha: date | None, hora_inicio: time, hora_fin: time) -> str:
    """Título por defecto con el día y la franja horaria (CA 3)."""
    franja = f"de {_hhmm(hora_inicio)} a {_hhmm(hora_fin)}"
    if fecha is None:
        return f"¿Qué hacemos {franja}?"
    return f"¿Qué hacemos el {_DIAS[fecha.weekday()]} {fecha.day} de {_MESES[fecha.month - 1]} {franja}?"


def validar_fecha_cierre(
    fecha_cierre: datetime, fecha_dia: date | None, hora_inicio_franja: time
) -> datetime:
    cierre = _aware(fecha_cierre)
    if cierre <= datetime.now(timezone.utc):
        _rechazar("La fecha y hora de cierre debe ser posterior a la fecha y hora actual.")

    if fecha_dia is not None:
        inicio_franja = datetime.combine(fecha_dia, hora_inicio_franja, tzinfo=cierre.tzinfo)
        if cierre >= inicio_franja:
            _rechazar(
                "La votación tiene que cerrar antes del inicio de la franja horaria "
                f"({_hhmm(hora_inicio_franja)} del {fecha_dia.strftime('%d/%m/%Y')})."
            )
    return cierre


def preparar_votacion(
    db: Session,
    *,
    id_viaje: int,
    ids_sugerencias: list[int],
    titulo: str | None,
    fecha_cierre: datetime,
) -> VotacionDesdeSugerencias:
    """Valida los CA 2, 3 y 5 y devuelve los datos listos para crear la votación."""
    ids_unicos = list(dict.fromkeys(ids_sugerencias or []))
    if not MINIMO_SUGERENCIAS <= len(ids_unicos) <= MAXIMO_SUGERENCIAS:
        _rechazar("Seleccioná entre dos y cinco sugerencias para proponer a votación.")


    sugerencias = db.scalars(
        select(SugerenciaActividad)
        .options(
            selectinload(SugerenciaActividad.Estado),
            selectinload(SugerenciaActividad.Solicitud),
        )
        .where(
            SugerenciaActividad.IdSugerenciaActividad.in_(ids_unicos),
            SugerenciaActividad.IdViaje == id_viaje,
        )
        .with_for_update()
    ).all()

    if len(sugerencias) != len(ids_unicos):
        _rechazar(
            "Alguna de las sugerencias seleccionadas no existe o no pertenece a este viaje.",
            status.HTTP_404_NOT_FOUND,
        )

    por_id = {s.IdSugerenciaActividad: s for s in sugerencias}
    ordenadas = [por_id[id_sugerencia] for id_sugerencia in ids_unicos]

    if any(_nombre_estado(s) != ESTADO_PENDIENTE for s in ordenadas):
        _rechazar('Solo se pueden proponer sugerencias en estado "Pendiente".')

    franjas = {
        (s.IdDiaCronograma, s.Solicitud.HoraInicio, s.Solicitud.HoraFin) for s in ordenadas
    }
    if len(franjas) > 1:
        _rechazar("Las sugerencias tienen que ser del mismo día y de la misma franja horaria.")

    id_dia, hora_inicio, hora_fin = next(iter(franjas))
    fecha_dia = obtener_fecha_dia(db, id_dia)
    cierre = validar_fecha_cierre(fecha_cierre, fecha_dia, hora_inicio)

    titulo_final = (titulo or "").strip() or titulo_predefinido(fecha_dia, hora_inicio, hora_fin)
    if len(titulo_final) > LARGO_MAXIMO_TITULO:
        _rechazar("El título de la votación no puede superar los 150 caracteres.")

    return VotacionDesdeSugerencias(sugerencias=ordenadas, titulo=titulo_final, fecha_cierre=cierre)


def marcar_en_votacion(db: Session, sugerencias: list[SugerenciaActividad]) -> None:
    estado = obtener_estado(db, ESTADO_EN_VOTACION)
    for sugerencia in sugerencias:
        sugerencia.IdEstadoSugerenciaActividad = estado.IdEstadoSugerenciaActividad


def ids_sugerencias_de(votacion: Votacion) -> list[int]:
    return [p.IdSugerenciaActividad for p in votacion.Propuestas if p.IdSugerenciaActividad]


def es_votacion_de_sugerencias(votacion: Votacion) -> bool:
    return bool(ids_sugerencias_de(votacion))


def liberar_sugerencias(db: Session, votacion: Votacion) -> int:
    ids = ids_sugerencias_de(votacion)
    if not ids:
        return 0

    pendiente = obtener_estado(db, ESTADO_PENDIENTE)
    en_votacion = obtener_estado(db, ESTADO_EN_VOTACION)
    sugerencias = db.scalars(
        select(SugerenciaActividad).where(
            SugerenciaActividad.IdSugerenciaActividad.in_(ids),
            SugerenciaActividad.IdEstadoSugerenciaActividad
            == en_votacion.IdEstadoSugerenciaActividad,
        )
    ).all()
    for sugerencia in sugerencias:
        sugerencia.IdEstadoSugerenciaActividad = pendiente.IdEstadoSugerenciaActividad
    return len(sugerencias)


def validar_cierre_editado(db: Session, votacion: Votacion, fecha_cierre: datetime) -> None:
    ids = ids_sugerencias_de(votacion)
    if not ids:
        return
    sugerencia = db.get(SugerenciaActividad, ids[0])
    if sugerencia is None or sugerencia.Solicitud is None:
        return
    fecha_dia = obtener_fecha_dia(db, sugerencia.IdDiaCronograma)
    validar_fecha_cierre(fecha_cierre, fecha_dia, sugerencia.Solicitud.HoraInicio)


def asegurar_sugerencia_modificable(sugerencia: SugerenciaActividad) -> None:

    if _nombre_estado(sugerencia) == ESTADO_EN_VOTACION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Esta sugerencia está en votación: no se puede aceptar ni descartar "
                "hasta que la votación termine o se cancele."
            ),
        )