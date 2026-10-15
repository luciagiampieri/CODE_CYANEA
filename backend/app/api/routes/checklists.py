from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import ActividadItinerario, Checklist, DiaCronograma, ParticipanteViaje, Usuario
from app.models.categorias_checklist import CategoriasChecklist
from app.schemas.checklist import (
    ChecklistCreate,
    ChecklistUpdate,
    ChecklistRead,
    ResponsableRead,
    TareaEntradasCreate,
)
from app.services import tareas_entradas
from app.services.websocket_manager import manager
from app.services.trip_access import (
    get_trip_with_relations,
    require_trip_access,
    require_trip_edit_access,
    require_trip_not_finished,
)

router = APIRouter()


class ChecklistCompletadaPayload(BaseModel):
    Completada: bool


@router.get("/checklists/categorias")
def listar_categorias_checklist(db: Session = Depends(get_db)):
    categorias = db.query(CategoriasChecklist).filter(CategoriasChecklist.Activo == True).order_by(CategoriasChecklist.Nombre).all()
    return categorias


def _serializar_checklist(checklist: Checklist, current_user_id: int) -> ChecklistRead:
    return ChecklistRead(
        IdChecklist=checklist.IdChecklist,
        IdViaje=checklist.IdViaje,
        IdUsuarioCreador=checklist.IdUsuarioCreador,
        Nombre=checklist.Nombre,
        CategoriaChecklist=checklist.CategoriaChecklist,
        Completada=checklist.Completada,
        FechaCreacion=checklist.FechaCreacion,
        NombreUsuarioCreador=f"{checklist.UsuarioCreador.Nombre} {checklist.UsuarioCreador.Apellido}",
        EsPropio=checklist.IdUsuarioCreador == current_user_id,
        Responsables=[
            ResponsableRead(
                IdUsuario=u.IdUsuario,
                NombreCompleto=f"{u.Nombre} {u.Apellido}",
            )
            for u in checklist.Responsables
        ],
        Enlace=checklist.Enlace,
        IdActividad=checklist.IdActividad,
    )


def _resolver_responsables(db: Session, trip_id: int, ids_usuarios: list[int]) -> list[Usuario]:
    if not ids_usuarios:
        return []

    ids_participantes_validos = set(
        db.scalars(
            select(ParticipanteViaje.IdUsuario)
            .join(ParticipanteViaje.EstadoParticipacion)
            .join(ParticipanteViaje.Usuario)
            .where(
                ParticipanteViaje.IdViaje == trip_id,
                ParticipanteViaje.IdUsuario.in_(ids_usuarios),
                ParticipanteViaje.EstadoParticipacion.has(Nombre="aceptado"),
                ParticipanteViaje.Usuario.has(Activo=True, EmailConfirmado=True),
            )
        ).all()
    )

    ids_invalidos = set(ids_usuarios) - ids_participantes_validos

    if ids_invalidos:
        raise HTTPException(
            status_code=400,
            detail="Uno o más responsables seleccionados no son participantes de este viaje.",
        )

    return db.query(Usuario).filter(Usuario.IdUsuario.in_(ids_participantes_validos)).all()


def _validar_nombre_unico(
    db: Session,
    trip_id: int,
    nombre: str,
    checklist_id: int | None = None,
) -> None:
    query = db.query(Checklist).filter(
        Checklist.IdViaje == trip_id,
        Checklist.Nombre == nombre,
    )
    if checklist_id is not None:
        query = query.filter(Checklist.IdChecklist != checklist_id)

    if query.first() is not None:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una tarea con ese nombre en este viaje.",
        )


def _obtener_categoria_activa(db: Session, categoria_id: int) -> CategoriasChecklist:
    categoria = db.get(CategoriasChecklist, categoria_id)
    if categoria is None or not categoria.Activo:
        raise HTTPException(
            status_code=400,
            detail="La categoría seleccionada no existe o está inactiva.",
        )
    return categoria


@router.post("/{trip_id}/checklists")
async def crear_checklist(
    trip_id: int,
    payload: ChecklistCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la checklist")

    nombre_limpio = payload.Nombre.strip()

    if not nombre_limpio:
        raise HTTPException(
            status_code=400,
            detail="El nombre de la tarea es obligatorio.",
        )

    _validar_nombre_unico(db, trip_id, nombre_limpio)
    categoria = _obtener_categoria_activa(db, payload.IdCategoriaChecklist)

    checklist = Checklist(
        IdViaje=trip_id,
        IdUsuarioCreador=current_user.IdUsuario,
        Nombre=nombre_limpio,
        IdCategoriaChecklist=payload.IdCategoriaChecklist,
    )
    checklist.Responsables = _resolver_responsables(db, trip_id, payload.IdsResponsables)

    db.add(checklist)
    db.commit()
    db.refresh(checklist)

    checklist.CategoriaChecklist = categoria

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )

    return {
        "message": "Tarea creada correctamente.",
        "item": _serializar_checklist(checklist, current_user.IdUsuario),
    }


@router.get("/{trip_id}/checklists", response_model=list[ChecklistRead])
def listar_checklists(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )

    query = db.query(Checklist).filter(Checklist.IdViaje == trip_id)

    if hasattr(Checklist, "EsPublico"):
        query = query.filter(
            (getattr(Checklist, "EsPublico") == True)
            | (Checklist.IdUsuarioCreador == current_user.IdUsuario)
        )

    checklists = query.order_by(Checklist.FechaCreacion.desc()).all()

    return [_serializar_checklist(c, current_user.IdUsuario) for c in checklists]


@router.patch("/{trip_id}/checklists/{checklist_id}/completada")
async def toggle_checklist_completada(
    trip_id: int,
    checklist_id: int,
    payload: ChecklistCompletadaPayload,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la checklist")

    checklist = db.get(Checklist, checklist_id)

    if not checklist or checklist.IdViaje != trip_id:
        raise HTTPException(
            status_code=404,
            detail="La tarea no existe.",
        )

    if hasattr(checklist, "EsPublico") and not checklist.EsPublico:
        if checklist.IdUsuarioCreador != current_user.IdUsuario:
            raise HTTPException(
                status_code=403,
                detail="Solo el creador puede modificar una tarea privada.",
            )

    checklist.Completada = payload.Completada
    db.commit()
    db.refresh(checklist)

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )

    return {
        "message": "Estado de la tarea actualizado correctamente.",
        "item": _serializar_checklist(checklist, current_user.IdUsuario),
    }


@router.put("/{trip_id}/checklists/{checklist_id}")
async def actualizar_checklist(
    trip_id: int,
    checklist_id: int,
    payload: ChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la checklist")

    checklist = db.get(Checklist, checklist_id)

    if not checklist or checklist.IdViaje != trip_id:
        raise HTTPException(
            status_code=404,
            detail="La tarea no existe.",
        )

    if checklist.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó la tarea puede editarla.",
        )

    if payload.Nombre is not None:
        nombre_limpio = payload.Nombre.strip()
        if not nombre_limpio:
            raise HTTPException(
                status_code=400,
                detail="El nombre de la tarea no puede estar vacío.",
            )
        _validar_nombre_unico(db, trip_id, nombre_limpio, checklist_id)
        checklist.Nombre = nombre_limpio

    if payload.IdCategoriaChecklist is not None:
        categoria = _obtener_categoria_activa(db, payload.IdCategoriaChecklist)
        checklist.IdCategoriaChecklist = payload.IdCategoriaChecklist
        checklist.CategoriaChecklist = categoria

    if payload.Completada is not None:
        checklist.Completada = payload.Completada

    responsables_antes = {u.IdUsuario for u in checklist.Responsables}
    if payload.IdsResponsables is not None:
        checklist.Responsables = _resolver_responsables(db, trip_id, payload.IdsResponsables)
    responsables_nuevos = {u.IdUsuario for u in checklist.Responsables} - responsables_antes

    db.commit()
    db.refresh(checklist)

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )

    # Tarea de "Recordármelo": se creó sin responsable y se avisó a todos; cuando
    # alguien queda asignado se le avisa solo a esa persona.
    if responsables_nuevos and tareas_entradas.es_tarea_de_recomendacion(checklist):
        await tareas_entradas.notificar_responsables_asignados(
            db, viaje, checklist, responsables_nuevos, current_user
        )

    return {
        "message": "Tarea actualizada correctamente.",
        "item": _serializar_checklist(checklist, current_user.IdUsuario),
    }


@router.delete("/{trip_id}/checklists/{checklist_id}")
async def eliminar_checklist(
    trip_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la checklist")

    checklist = db.get(Checklist, checklist_id)

    if not checklist or checklist.IdViaje != trip_id:
        raise HTTPException(
            status_code=404,
            detail="La tarea no existe.",
        )

    if checklist.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó la tarea puede eliminarla.",
        )

    db.delete(checklist)
    db.commit()

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )

    return {"message": "Tarea eliminada correctamente."}

@router.post("/{trip_id}/activities/{activity_id}/tarea-entradas")
async def crear_tarea_entradas(
    trip_id: int,
    activity_id: int,
    payload: TareaEntradasCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """"Recordármelo": crea en el checklist la tarea de reservar o comprar entradas
    para la actividad, con el enlace oficial y sin responsable."""
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la checklist")

    actividad = db.scalar(
        select(ActividadItinerario)
        .join(DiaCronograma, DiaCronograma.IdDiaCronograma == ActividadItinerario.IdDiaCronograma)
        .where(
            ActividadItinerario.IdActividad == activity_id,
            DiaCronograma.IdViaje == trip_id,
        )
    )
    if actividad is None:
        raise HTTPException(status_code=404, detail="La actividad no existe en este viaje.")

    existente = tareas_entradas.tarea_existente(db, actividad)
    if existente is not None:
        return {
            "message": "Ya habías agregado esta tarea al checklist.",
            "creada": False,
            "item": _serializar_checklist(existente, current_user.IdUsuario),
        }

    try:
        datos = tareas_entradas.resolver_datos_tarea(
            actividad, payload.tipo, payload.enlace, payload.nombreLugar
        )
        tarea = tareas_entradas.crear_tarea(db, viaje, actividad, current_user, datos)
    except tareas_entradas.ErrorTareaEntradas as error:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )
    await tareas_entradas.notificar_tarea_creada(db, viaje, tarea, current_user)

    return {
        "message": "Agregamos la tarea al checklist.",
        "creada": True,
        "item": _serializar_checklist(tarea, current_user.IdUsuario),
    }
