import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket


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