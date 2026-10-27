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
    DocumentoTareaRead,
    ResponsableRead,
    SugerenciaDocumentoRead,
    TareaEntradasCreate,
)
from app.services import checklist_permisos, documentos_tareas, tareas_entradas
from app.services.supabase import storage
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


def documentos_visibles(checklist: Checklist, current_user_id: int) -> list[DocumentoTareaRead]:
    """Documentos de la tarea que el usuario puede ver: públicos o subidos por él."""
    return [
        DocumentoTareaRead(
            IdDocumento=documento.IdDocumento,
            NombreArchivo=documento.NombreArchivo,
            UrlArchivo=storage.obtener_url_publica(documento.UrlArchivo),
            IdCategoriaDocumento=documento.IdCategoriaDocumento,
            NombreCategoria=documento.CategoriaDocumentoRelacion.Nombre,
            IconoCategoria=documento.CategoriaDocumentoRelacion.Icono,
            EsPublico=documento.EsPublico,
            EsPropio=documento.IdUsuarioSubida == current_user_id,
            NombreUsuarioSubida=checklist_permisos.nombre_completo(documento.UsuarioSubida) or "",
        )
        for documento in (checklist.Documentos or [])
        if documento.EsPublico or documento.IdUsuarioSubida == current_user_id
    ]


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
        EsPrivada=checklist.EsPrivada,
        IdUsuarioCompletada=checklist.IdUsuarioCompletada if checklist.Completada else None,
        NombreUsuarioCompletada=(
            checklist_permisos.nombre_completo(checklist.UsuarioCompletada) if checklist.Completada else None
        ),
        PuedeCompletar=checklist_permisos.puede_completar(checklist, current_user_id),
        PuedeSerPrivada=checklist_permisos.puede_ser_privada(checklist),
        Documentos=documentos_visibles(checklist, current_user_id),
    )


def _obtener_tarea_visible(db: Session, trip_id: int, checklist_id: int, current_user: Usuario) -> Checklist:
    """La tarea del viaje, si el usuario puede verla. Una tarea privada de otro
    integrante no existe para él (404, no 403, para no revelar que existe)."""
    checklist = db.get(Checklist, checklist_id)
    if (
        not checklist
        or checklist.IdViaje != trip_id
        or not checklist_permisos.puede_ver(checklist, current_user.IdUsuario)
    ):
        raise HTTPException(
            status_code=404,
            detail="La tarea no existe.",
        )
    return checklist


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
    id_usuario: int,
    checklist_id: int | None = None,
) -> None:
    # Las tareas privadas de otros integrantes no cuentan: el usuario no las ve.
    query = db.query(Checklist).filter(
        Checklist.IdViaje == trip_id,
        Checklist.Nombre == nombre,
        (Checklist.EsPrivada.is_(False)) | (Checklist.IdUsuarioCreador == id_usuario),
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

    _validar_nombre_unico(db, trip_id, nombre_limpio, current_user.IdUsuario)
    categoria = _obtener_categoria_activa(db, payload.IdCategoriaChecklist)

    checklist = Checklist(
        IdViaje=trip_id,
        IdUsuarioCreador=current_user.IdUsuario,
        Nombre=nombre_limpio,
        IdCategoriaChecklist=payload.IdCategoriaChecklist,
        EsPrivada=payload.EsPrivada,
    )
    if payload.EsPrivada:
        # "Solo para mí": queda asignada a quien la crea y a nadie más.
        checklist_permisos.validar_privada(False, set(payload.IdsResponsables), current_user.IdUsuario)
        checklist.Responsables = [current_user]
    else:
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

    # Las tareas privadas solo las ve quien las creó.
    query = db.query(Checklist).filter(
        Checklist.IdViaje == trip_id,
        (Checklist.EsPrivada.is_(False)) | (Checklist.IdUsuarioCreador == current_user.IdUsuario),
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

    checklist = _obtener_tarea_visible(db, trip_id, checklist_id, current_user)

    # Solo sus responsables (o cualquiera si no tiene; quien la marca queda asignado).
    checklist_permisos.exigir_puede_completar(checklist, current_user)
    checklist_permisos.aplicar_completada(checklist, payload.Completada, current_user)
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


@router.post(
    "/{trip_id}/checklists/{checklist_id}/sugerencia-documento",
    response_model=SugerenciaDocumentoRead,
    response_model_exclude_none=True,
)
async def sugerir_documento_tarea(
    trip_id: int,
    checklist_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    clasificador: documentos_tareas.ClasificadorTareas = Depends(documentos_tareas.get_clasificador_tareas),
):
    """Después de marcar una tarea como hecha: si es de compra o reserva, sugiere
    subir las entradas o la reserva (una sola vez por tarea, a quien la marcó y
    solo si todavía no tiene documentos). Se pide aparte para no demorar la casilla."""
    viaje = require_trip_edit_access(
        get_trip_with_relations(db, trip_id),
        current_user,
    )
    require_trip_not_finished(viaje, "la documentación")

    checklist = _obtener_tarea_visible(db, trip_id, checklist_id, current_user)
    if not documentos_tareas.puede_sugerirse(checklist, current_user.IdUsuario):
        return documentos_tareas.SIN_SUGERENCIA

    tipo = await documentos_tareas.tipo_de_tarea(
        checklist, bool(current_user.ConsienteProcesamientoIA), clasificador
    )
    # Mientras se analizaba pudo haberse desmarcado o mostrado a otro integrante.
    db.refresh(checklist)
    if tipo is None or not documentos_tareas.puede_sugerirse(checklist, current_user.IdUsuario):
        return documentos_tareas.SIN_SUGERENCIA

    sugerencia = documentos_tareas.armar_sugerencia(db, checklist, tipo)
    checklist.SugerenciaDocumentoMostrada = True
    db.commit()
    return sugerencia


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

    checklist = _obtener_tarea_visible(db, trip_id, checklist_id, current_user)

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
        _validar_nombre_unico(db, trip_id, nombre_limpio, current_user.IdUsuario, checklist_id)
        checklist.Nombre = nombre_limpio

    # Una tarea conserva su categoría aunque se haya desactivado (US 110); solo
    # se exige que esté activa si se la cambia por otra.
    if (
        payload.IdCategoriaChecklist is not None
        and payload.IdCategoriaChecklist != checklist.IdCategoriaChecklist
    ):
        categoria = _obtener_categoria_activa(db, payload.IdCategoriaChecklist)
        checklist.IdCategoriaChecklist = payload.IdCategoriaChecklist
        checklist.CategoriaChecklist = categoria

    responsables_antes = {u.IdUsuario for u in checklist.Responsables}
    es_privada = checklist.EsPrivada if payload.EsPrivada is None else payload.EsPrivada
    if es_privada:
        # Privada: solo puede tener como responsable a quien la creó.
        ids_finales = (
            set(payload.IdsResponsables) if payload.IdsResponsables is not None else responsables_antes
        )
        checklist_permisos.validar_privada(
            tareas_entradas.es_tarea_de_recomendacion(checklist), ids_finales, checklist.IdUsuarioCreador
        )
        checklist.EsPrivada = True
        checklist.Responsables = [current_user]
    else:
        checklist.EsPrivada = False
        if payload.IdsResponsables is not None:
            checklist.Responsables = _resolver_responsables(db, trip_id, payload.IdsResponsables)
    responsables_nuevos = {u.IdUsuario for u in checklist.Responsables} - responsables_antes

    # Marcarla como hecha al editar sigue las mismas reglas que la casilla.
    if payload.Completada is not None and payload.Completada != checklist.Completada:
        checklist_permisos.exigir_puede_completar(checklist, current_user)
        checklist_permisos.aplicar_completada(checklist, payload.Completada, current_user)

    db.commit()
    db.refresh(checklist)

    await manager.broadcast_to_trip(
        trip_id,
        {"tipo": "checklist_actualizado"},
    )

    # Tarea de "Recordármelo": se creó sin responsable y se avisó a todos; cuando
    # alguien queda asignado se le avisa solo a esa persona.
    if (
        responsables_nuevos
        and not checklist.EsPrivada
        and tareas_entradas.es_tarea_de_recomendacion(checklist)
    ):
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

    checklist = _obtener_tarea_visible(db, trip_id, checklist_id, current_user)

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
