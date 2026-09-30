"""Preferencias de planificación del viaje (US 86).

Cada participante configura sus propias preferencias para cada viaje. Estas
preferencias son la entrada del asistente de sugerencias de actividades
(US 87 y siguientes).
"""

import math
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.interes_planificacion import InteresPlanificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.preferencia_planificacion import PreferenciaPlanificacion
from app.models.ritmo_viaje import RitmoViaje
from app.models.usuario import Usuario
from app.models.destino_viaje import DestinoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.viaje import Viaje
from app.schemas.preferencia_planificacion import (
    InteresPlanificacionRead,
    OpcionesPlanificacionRead,
    PreferenciaPlanificacionRead,
    PreferenciaPlanificacionUpsert,
    PreferenciasPlanificacionResponse,
    RitmoViajeRead,
    ViajePreferenciasResumenRead,
)
from app.services.trip_access import (
    get_trip_with_relations,
    is_trip_finished,
    require_trip_access,
    require_trip_edit_access,
    require_trip_not_finished,
)

router = APIRouter()
# Rutas colgadas de /users (listado de la pantalla de Configuración).
router_usuario = APIRouter()

ESTADOS_VIAJE_EXCLUIDOS = {"eliminado", "cancelado"}

MAX_CARACTERES_CONSIDERACIONES = 300
# Tope técnico para no desbordar Numeric(12, 2); no es una regla de negocio.
MAX_PRESUPUESTO_ARS = Decimal("1000000000")


def _bad_request(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detalle)


def _participacion_actual(viaje: Viaje, usuario: Usuario) -> ParticipanteViaje | None:
    """Participación 'aceptada' del usuario en el viaje, si existe."""
    return next(
        (
            part
            for part in viaje.Participantes
            if part.IdUsuario == usuario.IdUsuario
            and part.EstadoParticipacion is not None
            and part.EstadoParticipacion.Nombre == "aceptado"
        ),
        None,
    )


def _obtener_preferencia(db: Session, participacion: ParticipanteViaje | None):
    if participacion is None:
        return None
    return db.scalar(
        select(PreferenciaPlanificacion)
        .options(selectinload(PreferenciaPlanificacion.Intereses))
        .where(PreferenciaPlanificacion.IdParticipanteViaje == participacion.IdParticipanteViaje)
    )


def _opciones(db: Session) -> OpcionesPlanificacionRead:
    intereses = db.scalars(
        select(InteresPlanificacion)
        .where(InteresPlanificacion.Activo.is_(True))
        .order_by(InteresPlanificacion.Orden)
    ).all()
    ritmos = db.scalars(
        select(RitmoViaje).where(RitmoViaje.Activo.is_(True)).order_by(RitmoViaje.Orden)
    ).all()
    return OpcionesPlanificacionRead(
        Intereses=[InteresPlanificacionRead.model_validate(i) for i in intereses],
        Ritmos=[RitmoViajeRead.model_validate(r) for r in ritmos],
        MaxCaracteresConsideraciones=MAX_CARACTERES_CONSIDERACIONES,
    )


def _serializar(preferencia: PreferenciaPlanificacion) -> PreferenciaPlanificacionRead:
    return PreferenciaPlanificacionRead(
        IdPreferenciaPlanificacion=preferencia.IdPreferenciaPlanificacion,
        IdsIntereses=[i.IdInteresPlanificacion for i in preferencia.Intereses],
        IdRitmoViaje=preferencia.IdRitmoViaje,
        PresupuestoDiarioARS=(
            float(preferencia.PresupuestoDiarioARS)
            if preferencia.PresupuestoDiarioARS is not None
            else None
        ),
        Consideraciones=preferencia.Consideraciones,
        FechaActualizacion=preferencia.FechaActualizacion,
    )


def _validar_intereses(db: Session, ids: list[int]) -> list[InteresPlanificacion]:
    ids_unicos = list(dict.fromkeys(ids))
    if not ids_unicos:
        raise _bad_request("Debés seleccionar al menos un interés.")

    intereses = db.scalars(
        select(InteresPlanificacion).where(
            InteresPlanificacion.IdInteresPlanificacion.in_(ids_unicos),
            InteresPlanificacion.Activo.is_(True),
        )
    ).all()
    if len(intereses) != len(ids_unicos):
        raise _bad_request("Uno o más intereses seleccionados no son válidos.")
    return list(intereses)


def _validar_ritmo(db: Session, id_ritmo: int | None) -> RitmoViaje:
    if id_ritmo is None:
        raise _bad_request("Debés seleccionar un ritmo de viaje.")
    ritmo = db.get(RitmoViaje, id_ritmo)
    if ritmo is None or not ritmo.Activo:
        raise _bad_request("El ritmo de viaje seleccionado no es válido.")
    return ritmo


def _validar_presupuesto(valor) -> Decimal | None:
    """Presupuesto opcional; si se ingresa debe ser numérico y mayor a cero (RN-39: ARS)."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    if isinstance(valor, bool):
        raise _bad_request("El presupuesto diario debe ser un valor numérico.")

    try:
        texto = valor.strip().replace(",", ".") if isinstance(valor, str) else str(valor)
        monto = Decimal(texto)
    except (InvalidOperation, ValueError):
        raise _bad_request("El presupuesto diario debe ser un valor numérico.")

    if not monto.is_finite() or (isinstance(valor, float) and not math.isfinite(valor)):
        raise _bad_request("El presupuesto diario debe ser un valor numérico.")
    if monto <= 0:
        raise _bad_request("El presupuesto diario debe ser mayor a cero.")
    if monto >= MAX_PRESUPUESTO_ARS:
        raise _bad_request("El presupuesto diario ingresado es demasiado alto.")
    return monto.quantize(Decimal("0.01"))


def _validar_consideraciones(texto: str | None) -> str | None:
    if texto is None:
        return None
    limpio = texto.strip()
    if not limpio:
        return None
    if len(limpio) > MAX_CARACTERES_CONSIDERACIONES:
        raise _bad_request(
            f"Las consideraciones adicionales no pueden superar los "
            f"{MAX_CARACTERES_CONSIDERACIONES} caracteres."
        )
    return limpio


@router.get(
    "/{trip_id}/preferencias-planificacion",
    response_model=PreferenciasPlanificacionResponse,
)
def obtener_preferencias_planificacion(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Devuelve las preferencias propias del usuario en el viaje y las opciones disponibles."""
    viaje = require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    participacion = _participacion_actual(viaje, current_user)
    preferencia = _obtener_preferencia(db, participacion)

    return PreferenciasPlanificacionResponse(
        Configurada=preferencia is not None,
        PuedeEditar=participacion is not None and not is_trip_finished(viaje),
        Preferencias=_serializar(preferencia) if preferencia is not None else None,
        Opciones=_opciones(db),
    )


@router.put(
    "/{trip_id}/preferencias-planificacion",
    response_model=PreferenciasPlanificacionResponse,
)
def guardar_preferencias_planificacion(
    trip_id: int,
    payload: PreferenciaPlanificacionUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crea o modifica las preferencias propias del usuario para el viaje."""
    viaje = require_trip_edit_access(get_trip_with_relations(db, trip_id), current_user)
    require_trip_not_finished(viaje, "la configuración de preferencias")

    participacion = _participacion_actual(viaje, current_user)
    if participacion is None:
        # require_trip_edit_access ya lo cubre; se deja como defensa explícita.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los participantes actuales del viaje pueden configurar preferencias.",
        )

    intereses = _validar_intereses(db, payload.IdsIntereses)
    ritmo = _validar_ritmo(db, payload.IdRitmoViaje)
    presupuesto = _validar_presupuesto(payload.PresupuestoDiarioARS)
    consideraciones = _validar_consideraciones(payload.Consideraciones)

    preferencia = _obtener_preferencia(db, participacion)
    if preferencia is None:
        preferencia = PreferenciaPlanificacion(IdParticipanteViaje=participacion.IdParticipanteViaje)
        db.add(preferencia)

    preferencia.IdRitmoViaje = ritmo.IdRitmoViaje
    preferencia.PresupuestoDiarioARS = presupuesto
    preferencia.Consideraciones = consideraciones
    preferencia.Intereses = intereses
    # Se fija a mano: si solo cambian los intereses (tabla intermedia) el
    # onupdate de la columna no se dispara.
    preferencia.FechaActualizacion = datetime.now(timezone.utc)

    db.commit()
    db.refresh(preferencia)

    return PreferenciasPlanificacionResponse(
        Configurada=True,
        PuedeEditar=True,
        Preferencias=_serializar(preferencia),
        Opciones=_opciones(db),
    )


@router_usuario.get(
    "/me/preferencias-planificacion",
    response_model=list[ViajePreferenciasResumenRead],
)
def listar_mis_preferencias_planificacion(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Viajes vigentes del usuario con el estado de sus preferencias de planificación.

    Solo incluye viajes donde el usuario es participante actual (aceptado) y que
    todavía se pueden planificar (no finalizados, cancelados ni eliminados).
    Las preferencias siguen siendo por viaje (RNF-14): esta vista solo las agrupa.
    """
    participaciones = db.scalars(
        select(ParticipanteViaje)
        .join(ParticipanteViaje.EstadoParticipacion)
        .options(
            selectinload(ParticipanteViaje.Viaje).selectinload(Viaje.EstadoViaje),
            selectinload(ParticipanteViaje.Viaje)
            .selectinload(Viaje.Destinos)
            .selectinload(DestinoViaje.Destino),
        )
        .where(
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
            EstadoParticipacion.Nombre == "aceptado",
        )
    ).all()

    vigentes = [
        part
        for part in participaciones
        if part.Viaje is not None
        and (part.Viaje.EstadoViaje is None or part.Viaje.EstadoViaje.Nombre not in ESTADOS_VIAJE_EXCLUIDOS)
        and not is_trip_finished(part.Viaje)
    ]
    if not vigentes:
        return []

    preferencias = {
        pref.IdParticipanteViaje: pref
        for pref in db.scalars(
            select(PreferenciaPlanificacion)
            .options(
                selectinload(PreferenciaPlanificacion.Intereses),
                selectinload(PreferenciaPlanificacion.RitmoViaje),
            )
            .where(
                PreferenciaPlanificacion.IdParticipanteViaje.in_(
                    [part.IdParticipanteViaje for part in vigentes]
                )
            )
        ).all()
    }

    resultado = []
    for part in sorted(vigentes, key=lambda p: (p.Viaje.FechaInicio, p.Viaje.IdViaje)):
        viaje = part.Viaje
        pref = preferencias.get(part.IdParticipanteViaje)
        resultado.append(
            ViajePreferenciasResumenRead(
                IdViaje=viaje.IdViaje,
                Titulo=viaje.Titulo,
                FechaInicio=viaje.FechaInicio,
                FechaFin=viaje.FechaFin,
                Destinos=[rel.Destino.Nombre for rel in viaje.Destinos if rel.Destino is not None],
                Configurada=pref is not None,
                Intereses=[i.Nombre for i in pref.Intereses] if pref else [],
                Ritmo=pref.RitmoViaje.Nombre if pref and pref.RitmoViaje else None,
            )
        )
    return resultado
