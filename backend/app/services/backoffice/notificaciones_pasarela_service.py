"""Consulta de las notificaciones recibidas de la pasarela de pagos (US 117)."""
from math import ceil

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notificacion_pasarela import EstadoNotificacionPasarela, NotificacionPasarela

TAMANIO_PAGINA = 20


def listar(db: Session, *, estado: str | None, pagina: int) -> dict:
    base = select(NotificacionPasarela, EstadoNotificacionPasarela).join(
        EstadoNotificacionPasarela,
        EstadoNotificacionPasarela.IdEstadoNotificacionPasarela
        == NotificacionPasarela.IdEstadoNotificacionPasarela,
    )
    if estado:
        base = base.where(EstadoNotificacionPasarela.Nombre == estado)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    filas = db.execute(
        base.order_by(
            NotificacionPasarela.FechaRecepcion.desc(),
            NotificacionPasarela.IdNotificacionPasarela.desc(),
        )
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    ).all()

    # Totales por estado sobre todo el historial, independientes del filtro.
    conteos = dict(
        db.execute(
            select(EstadoNotificacionPasarela.Nombre, func.count(NotificacionPasarela.IdNotificacionPasarela))
            .join(
                NotificacionPasarela,
                NotificacionPasarela.IdEstadoNotificacionPasarela
                == EstadoNotificacionPasarela.IdEstadoNotificacionPasarela,
            )
            .group_by(EstadoNotificacionPasarela.Nombre)
        ).all()
    )
    return {
        "items": [
            {
                "id": notificacion.IdNotificacionPasarela,
                "tipo": notificacion.Tipo,
                "idRecurso": notificacion.IdRecurso,
                "idSolicitud": notificacion.IdSolicitudPasarela,
                "estado": estado_fila.Nombre,
                "error": notificacion.Error,
                "fechaRecepcion": notificacion.FechaRecepcion,
            }
            for notificacion, estado_fila in filas
        ],
        "total": total,
        "pagina": pagina,
        "tamanioPagina": TAMANIO_PAGINA,
        "totalPaginas": ceil(total / TAMANIO_PAGINA) if total else 0,
        "totalesPorEstado": {
            nombre: conteos.get(nombre, 0) for nombre in ("procesada", "ignorada", "error")
        },
    }
