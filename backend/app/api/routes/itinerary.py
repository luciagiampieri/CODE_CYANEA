import asyncio
import json
import logging
from collections import defaultdict

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.usuario import Usuario


from app.services.trip_access import get_trip_with_relations, require_trip_access

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._conexiones_por_viaje: dict[int, set[WebSocket]] = defaultdict(set)
        self._ediciones_activas: dict[tuple[int, int], int] = {}
        self._lock_ediciones = asyncio.Lock()


    async def connect(self, trip_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._conexiones_por_viaje[trip_id].add(websocket)

    def disconnect(self, trip_id: int, websocket: WebSocket) -> None:
        self._conexiones_por_viaje[trip_id].discard(websocket)
        if not self._conexiones_por_viaje[trip_id]:
            self._conexiones_por_viaje.pop(trip_id, None)

    async def broadcast(self, trip_id: int, evento: dict, exclude: WebSocket | None = None) -> None:
        conexiones = list(self._conexiones_por_viaje.get(trip_id, ()))
        payload = json.dumps(evento, default=str)
        for conexion in conexiones:
            if conexion is exclude:
                continue
            try:
                await conexion.send_text(payload)
            except Exception:
                logger.exception("No se pudo enviar evento WS, se descarta la conexión")
                self.disconnect(trip_id, conexion)


    async def iniciar_edicion(
        self,
        trip_id: int,
        activity_id: int,
        user_id: int,
    ) -> bool:
        clave = (trip_id, activity_id)

        async with self._lock_ediciones:
            usuario_actual = self._ediciones_activas.get(clave)

            if usuario_actual is not None:
                return False

            self._ediciones_activas[clave] = user_id

            return True

    def obtener_usuario_editando(self, trip_id: int, activity_id: int) -> int | None:
            return self._ediciones_activas.get((trip_id, activity_id))

    async def finalizar_edicion(
        self,
        trip_id: int,
        activity_id: int,
        user_id: int,
    ) -> bool:
        
        clave = (trip_id, activity_id)

        async with self._lock_ediciones:
            usuario_actual = self._ediciones_activas.get(clave)

            if usuario_actual != user_id:
                return False

            self._ediciones_activas.pop(clave, None)

            return True

    async def liberar_ediciones_usuario(
        self,
        user_id: int,
    ) -> None:
    
        async with self._lock_ediciones:
            claves_a_liberar = [
                clave
                for clave, usuario_id in self._ediciones_activas.items()
                if usuario_id == user_id
            ]

            for clave in claves_a_liberar:
                self._ediciones_activas.pop(clave, None)
    

manager = ConnectionManager()


def _autenticar_ws(token: str, db: Session) -> Usuario | None:

    try:
        payload = decode_access_token(token)
    except JWTError:
        return None

    user_id = payload.get("user_id")
    if user_id is None:
        return None

    usuario = db.get(Usuario, user_id)
    if usuario is None or not usuario.Activo:
        return None

    return usuario


@router.websocket("/ws/trips/{trip_id}/itinerary")
async def itinerary_ws(websocket: WebSocket, trip_id: int, token: str = Query(...)):
    db = SessionLocal()
    try:
        current_user = _autenticar_ws(token, db)
        if current_user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        viaje = get_trip_with_relations(db, trip_id)
        try:
            require_trip_access(viaje, current_user)
        except Exception as exc:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await manager.connect(trip_id, websocket)
        logger.info("Usuario %s conectado al itinerario del viaje %s", current_user.IdUsuario, trip_id)

        try:
            while True:
                mensaje = await websocket.receive_json()

                if mensaje.get("tipo") == "iniciar_edicion":
                    activity_id = mensaje.get("idActividad")

                    edicion_concedida = await manager.iniciar_edicion(
                        trip_id,
                        activity_id,
                        current_user.IdUsuario,
                    )

                    if edicion_concedida:
                        await websocket.send_json({
                            "tipo": "edicion_concedida",
                            "idActividad": activity_id,
                        })
                    else:

                        usuario_editando_id = manager.obtener_usuario_editando(trip_id, activity_id)

                        usuario_editando = db.get(Usuario, usuario_editando_id) 

                        nombre_usuario = (
                            usuario_editando.Nombre if usuario_editando else "Otro usuario"
                        )

                        apellido_usuario = (
                            usuario_editando.Apellido if usuario_editando else ""
                        )

                        await websocket.send_json({
                            "tipo": "edicion_rechazada",
                            "idActividad": activity_id,
                            "mensaje": f"{nombre_usuario} {apellido_usuario} está editando esta actividad.",
                        })
                        
                elif mensaje.get("tipo") == "finalizar_edicion":
                    activity_id = mensaje.get("idActividad")

                    edicion_finalizada = await manager.finalizar_edicion(
                        trip_id,
                        activity_id,
                        current_user.IdUsuario,
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
            await manager.liberar_ediciones_usuario(current_user.IdUsuario)
            manager.disconnect(trip_id, websocket)
    finally:
        db.close()