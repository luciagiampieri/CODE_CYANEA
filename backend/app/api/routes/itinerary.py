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
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(trip_id, websocket)
    finally:
        db.close()