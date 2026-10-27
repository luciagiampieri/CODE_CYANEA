from __future__ import annotations

from fastapi import HTTPException

from app.models.checklist import Checklist
from app.models.usuario import Usuario
from app.services import tareas_entradas


def nombre_completo(usuario: Usuario | None) -> str | None:
    if usuario is None:
        return None
    return f"{usuario.Nombre} {usuario.Apellido}".strip() or usuario.NombreUsuario


def puede_ver(tarea: Checklist, id_usuario: int) -> bool:
    return not tarea.EsPrivada or tarea.IdUsuarioCreador == id_usuario


def puede_completar(tarea: Checklist, id_usuario: int) -> bool:
    if tarea.EsPrivada:
        return tarea.IdUsuarioCreador == id_usuario
    responsables = {u.IdUsuario for u in tarea.Responsables}
    return not responsables or id_usuario in responsables


def puede_ser_privada(tarea: Checklist) -> bool:
    return not tareas_entradas.es_tarea_de_recomendacion(tarea)


def nombres_responsables(tarea: Checklist) -> str:
    nombres = [nombre_completo(u) for u in tarea.Responsables]
    if len(nombres) <= 1:
        return "".join(nombres)
    return f"{', '.join(nombres[:-1])} y {nombres[-1]}"


def exigir_puede_completar(tarea: Checklist, usuario: Usuario) -> None:
    if puede_completar(tarea, usuario.IdUsuario):
        return
    raise HTTPException(
        status_code=403,
        detail=(
            f"Solo {nombres_responsables(tarea)} puede marcar esta tarea como hecha."
            if len(tarea.Responsables) == 1
            else f"Solo sus responsables ({nombres_responsables(tarea)}) pueden marcar esta tarea como hecha."
        ),
    )


def aplicar_completada(tarea: Checklist, completada: bool, usuario: Usuario) -> None:
    """Marca o desmarca la tarea. Validar antes con `exigir_puede_completar`.

    Una tarea del grupo sin responsables queda asignada a quien la marca."""
    if completada == tarea.Completada:
        return
    tarea.Completada = completada
    if completada:
        if not tarea.EsPrivada and not tarea.Responsables:
            tarea.Responsables = [usuario]
        tarea.IdUsuarioCompletada = usuario.IdUsuario
    else:
        tarea.IdUsuarioCompletada = None


def validar_privada(
    tarea_es_recordatorio: bool,
    ids_responsables: set[int],
    id_creador: int,
) -> None:
    """Una tarea privada no puede ser de "Recordármelo" ni tener otros responsables."""
    if tarea_es_recordatorio:
        raise HTTPException(
            status_code=400,
            detail="Las tareas creadas con «Recordármelo» son del grupo y no pueden ser privadas.",
        )
    if ids_responsables - {id_creador}:
        raise HTTPException(
            status_code=400,
            detail="Una tarea privada no se puede asignar a otros integrantes del viaje.",
        )
