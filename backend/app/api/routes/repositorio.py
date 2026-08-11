from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.documentos import _verificar_participante_aceptado
from app.db.session import get_db
from app.models import ItemRepositorioViaje, Usuario, Viaje
from app.schemas.repositorio import (
    ItemRepositorioCreate,
    ItemRepositorioMutationResponse,
    ItemRepositorioRead,
    ItemRepositorioUpdate,
)

router = APIRouter()


def _serializar_item(item: ItemRepositorioViaje, current_user_id: int) -> ItemRepositorioRead:
    return ItemRepositorioRead(
        IdItemRepositorio=item.IdItemRepositorio,
        IdViaje=item.IdViaje,
        IdUsuarioCreador=item.IdUsuarioCreador,
        Titulo=item.Titulo,
        Tipo=item.Tipo.value if hasattr(item.Tipo, "value") else str(item.Tipo),
        Contenido=item.Contenido,
        Descripcion=item.Descripcion,
        EsPublico=item.EsPublico,
        FechaCreacion=item.FechaCreacion,
        FechaActualizacion=item.FechaActualizacion,
        NombreUsuarioCreador=f"{item.UsuarioCreador.Nombre} {item.UsuarioCreador.Apellido}",
        EsPropio=item.IdUsuarioCreador == current_user_id,
    )


def _obtener_item_visible(
    db: Session, trip_id: int, item_id: int, current_user: Usuario
) -> ItemRepositorioViaje:
    item = db.get(ItemRepositorioViaje, item_id)
    if item is None or item.IdViaje != trip_id:
        raise HTTPException(status_code=404, detail="El ítem no existe.")

    if not item.EsPublico and item.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(status_code=404, detail="El ítem no existe.")

    return item


@router.post(
    "/{trip_id}/repositorio",
    response_model=ItemRepositorioMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_item_repositorio(
    trip_id: int,
    payload: ItemRepositorioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ItemRepositorioMutationResponse:
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _verificar_participante_aceptado(db, trip_id, current_user)

    item = ItemRepositorioViaje(
        IdViaje=trip_id,
        IdUsuarioCreador=current_user.IdUsuario,
        Titulo=payload.titulo,
        Tipo=payload.tipo,
        Contenido=payload.contenido,
        Descripcion=payload.descripcion,
        EsPublico=payload.esPublico,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return ItemRepositorioMutationResponse(
        message="Información guardada correctamente en el repositorio.",
        item=_serializar_item(item, current_user.IdUsuario),
    )


@router.get("/{trip_id}/repositorio", response_model=list[ItemRepositorioRead])
def listar_items_repositorio(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[ItemRepositorioRead]:
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _verificar_participante_aceptado(db, trip_id, current_user)

    items = db.scalars(
        select(ItemRepositorioViaje)
        .where(
            ItemRepositorioViaje.IdViaje == trip_id,
            (ItemRepositorioViaje.EsPublico.is_(True))
            | (ItemRepositorioViaje.IdUsuarioCreador == current_user.IdUsuario),
        )
        .order_by(ItemRepositorioViaje.FechaCreacion.desc())
    ).all()

    return [_serializar_item(item, current_user.IdUsuario) for item in items]


@router.put("/{trip_id}/repositorio/{item_id}", response_model=ItemRepositorioMutationResponse)
def editar_item_repositorio(
    trip_id: int,
    item_id: int,
    payload: ItemRepositorioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ItemRepositorioMutationResponse:
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _verificar_participante_aceptado(db, trip_id, current_user)

    item = _obtener_item_visible(db, trip_id, item_id, current_user)

    if item.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó el ítem puede editarlo.",
        )

    item.Titulo = payload.titulo
    item.Tipo = payload.tipo
    item.Contenido = payload.contenido
    item.Descripcion = payload.descripcion
    item.EsPublico = payload.esPublico

    db.commit()
    db.refresh(item)

    return ItemRepositorioMutationResponse(
        message="Información actualizada correctamente.",
        item=_serializar_item(item, current_user.IdUsuario),
    )


@router.delete("/{trip_id}/repositorio/{item_id}")
def eliminar_item_repositorio(
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    viaje = db.get(Viaje, trip_id)
    if viaje is None:
        raise HTTPException(status_code=404, detail="Viaje no encontrado")

    _verificar_participante_aceptado(db, trip_id, current_user)

    item = _obtener_item_visible(db, trip_id, item_id, current_user)

    if item.IdUsuarioCreador != current_user.IdUsuario:
        raise HTTPException(
            status_code=403,
            detail="Solo quien creó el ítem puede eliminarlo.",
        )

    db.delete(item)
    db.commit()

    return {"message": "Ítem eliminado correctamente."}