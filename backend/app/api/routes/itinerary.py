import logging

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import autenticar_usuario_ws
from app.db import session as session_module
from app.models.usuario import Usuario
from app.services.trip_access import get_trip_with_relations, require_trip_access
from app.services.websocket_manager import manager


router = APIRouter()
logger = logging.getLogger(__name__)


def _validar_acceso(token: str, trip_id: int) -> int | None:
    """Autentica al usuario y verifica que tenga acceso al viaje.

    Usa una sesión corta: la conexión vuelve al pool apenas termina la validación,
    en lugar de quedar tomada mientras el WebSocket esté abierto.
    Devuelve el id del usuario, o None si no está autorizado.
    """
    with session_module.SessionLocal() as db:
        usuario = autenticar_usuario_ws(token, db)
        if usuario is None:
            return None

        try:
            viaje = get_trip_with_relations(db, trip_id)
            require_trip_access(viaje, usuario)
        except HTTPException:
            return None

        return usuario.IdUsuario


def _nombre_completo(id_usuario: int | None) -> str:
    """Nombre del usuario que está editando, con una sesión corta."""
    if id_usuario is None:
        return "Otro usuario"

    with session_module.SessionLocal() as db:
        usuario = db.get(Usuario, id_usuario)
        if usuario is None:
            return "Otro usuario"
        return f"{usuario.Nombre} {usuario.Apellido or ''}".strip()


@router.websocket("/ws/trips/{trip_id}/itinerary")
async def itinerary_ws(websocket: WebSocket, trip_id: int, token: str = Query(...)):
    # Las consultas a la base son sincrónicas: se corren en un thread aparte
    # para no bloquear el event loop (y con él, el resto de las peticiones).
    try:
        id_usuario = await run_in_threadpool(_validar_acceso, token, trip_id)
    except Exception:
        logger.exception("No se pudo validar el acceso al WebSocket del viaje %s", trip_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    if id_usuario is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(trip_id, websocket)
    logger.info("Usuario %s conectado al itinerario del viaje %s", id_usuario, trip_id)

    try:
        while True:
            mensaje = await websocket.receive_json()

            if mensaje.get("tipo") == "iniciar_edicion":
                activity_id = mensaje.get("idActividad")

                edicion_concedida = await manager.iniciar_edicion(
                    trip_id,
                    activity_id,
                    id_usuario,
                )

                if edicion_concedida:
                    await websocket.send_json({
                        "tipo": "edicion_concedida",
                        "idActividad": activity_id,
                    })
                else:
                    usuario_editando_id = manager.obtener_usuario_editando(trip_id, activity_id)
                    nombre = await run_in_threadpool(_nombre_completo, usuario_editando_id)

                    await websocket.send_json({
                        "tipo": "edicion_rechazada",
                        "idActividad": activity_id,
                        "mensaje": f"{nombre} está editando esta actividad.",
                    })

            elif mensaje.get("tipo") == "finalizar_edicion":
                activity_id = mensaje.get("idActividad")

                edicion_finalizada = await manager.finalizar_edicion(
                    trip_id,
                    activity_id,
                    id_usuario,
                )

                if edicion_finalizada:
                    await manager.broadcast(
                        trip_id,
                        {
                            "tipo": "edicion_finalizada",
                            "idActividad": activity_id,
                        },
                    )

    except WebSocketDisconnect:
        pass
    finally:
        await manager.liberar_ediciones_usuario(id_usuario)
        manager.disconnect(trip_id, websocket)