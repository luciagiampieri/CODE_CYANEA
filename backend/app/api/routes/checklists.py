from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.api.deps import get_current_user

from app.models import Usuario, Checklist, ParticipanteViaje
from app.models.categorias_checklist import CategoriasChecklist
from app.schemas.checklist import (
    ChecklistCreate,
    ChecklistUpdate,
    ChecklistRead,
    ResponsableRead,
)

from app.services.websocket_manager import manager
from app.services.trip_access import get_trip_with_relations, require_trip_access, require_trip_edit_access, require_trip_not_finished

router = APIRouter()


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
    )


def _resolver_responsables(db: Session, trip_id: int, ids_usuarios: list[int]) -> list[Usuario]:
    if not ids_usuarios:
        return []

    ids_participantes_validos = set(
        db.scalars(
            select(ParticipanteViaje.IdUsuario).where(
                ParticipanteViaje.IdViaje == trip_id,
                ParticipanteViaje.IdUsuario.in_(ids_usuarios),
            )
        ).all()
    )

    ids_invalidos = set(ids_usuarios) - ids_participantes_validos

    if ids_invalidos:
        raise HTTPException(
            status_code=400,
            detail="Uno o más responsables seleccionados no son participantes de este viaje."
        )

    return db.query(Usuario).filter(Usuario.IdUsuario.in_(ids_participantes_validos)).all()


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
            detail="El nombre de la tarea es obligatorio."
        )

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

    categoria_db = db.get(CategoriasChecklist, payload.IdCategoriaChecklist)
    checklist.CategoriaChecklist = categoria_db

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"}
    )

    return {
        "message": "Tarea creada correctamente.",
        "item": _serializar_checklist(checklist, current_user.IdUsuario)
    }


@router.get("/{trip_id}/checklists", response_model=list[ChecklistRead])
def listar_checklists(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = require_trip_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )


    checklists = (
        db.query(Checklist)
        .filter(Checklist.IdViaje == trip_id)
        .order_by(Checklist.FechaCreacion.desc())
        .all()
    )

    return [_serializar_checklist(c, current_user.IdUsuario) for c in checklists]


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
            detail="La tarea no existe."
        )

    if checklist.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó la tarea puede editarla."
        )


    if payload.Nombre is not None:
        nombre_limpio = payload.Nombre.strip()
        if not nombre_limpio:
            raise HTTPException(
                status_code=400,
                detail="El nombre de la tarea no puede estar vacío."
            )
        checklist.Nombre = nombre_limpio

    if payload.IdCategoriaChecklist is not None:
        checklist.IdCategoriaChecklist = payload.IdCategoriaChecklist
        checklist.CategoriaChecklist = db.get(CategoriasChecklist, payload.IdCategoriaChecklist)

    if payload.Completada is not None:
        checklist.Completada = payload.Completada

    if payload.IdsResponsables is not None:
        checklist.Responsables = _resolver_responsables(db, trip_id, payload.IdsResponsables)

    db.commit()
    db.refresh(checklist)

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"}
    )


    return {
        "message": "Tarea actualizada correctamente.",
        "item": _serializar_checklist(checklist, current_user.IdUsuario)
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
            detail="La tarea no existe."
        )

    if checklist.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó la tarea puede eliminarla."
        )


    db.delete(checklist)
    db.commit()

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"}
    )


    return {"message": "Tarea eliminada correctamente."}