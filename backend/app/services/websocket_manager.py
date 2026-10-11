import asyncio
import json
import logging
import time
from dataclasses import dataclass
from collections import defaultdict

from fastapi import WebSocket


logger = logging.getLogger(__name__)

@dataclass(slots=True)
class EdicionGasto:
    """Edición activa de un gasto (US 79)."""

    id_usuario: int
    ultima_actividad: float


def _tiempo_inactividad_edicion_gasto() -> int:
    # Import diferido para no acoplar el manager a la configuración al importarlo.
    from app.core.config import settings

    return settings.expense_edit_lock_ttl_seconds

class ConnectionManager:
    def __init__(self) -> None:
        self._conexiones_por_viaje: dict[int, set[WebSocket]] = defaultdict(set)
        self._conexiones_por_usuario: dict[int, set[WebSocket]] = defaultdict(set)
        self._ediciones_activas: dict[tuple[int, int], int] = {}
        self._ediciones_gastos: dict[int, EdicionGasto] = {}
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


    # Edición de gastos (US 79)

    def _ahora(self) -> float:
        return time.monotonic()

    def _edicion_gasto_vigente(self, id_gasto: int) -> EdicionGasto | None:
        edicion = self._ediciones_gastos.get(id_gasto)
        if edicion is None:
            return None
        if self._ahora() - edicion.ultima_actividad > _tiempo_inactividad_edicion_gasto():
            # Vencida por inactividad: se descarta.
            self._ediciones_gastos.pop(id_gasto, None)
            return None
        return edicion

    async def iniciar_edicion_gasto(self, id_gasto: int, user_id: int) -> bool:
        """Toma la edición del gasto. Si ya la tiene el mismo usuario, la renueva."""
        async with self._lock_ediciones:
            edicion = self._edicion_gasto_vigente(id_gasto)
            if edicion is not None and edicion.id_usuario != user_id:
                return False
            self._ediciones_gastos[id_gasto] = EdicionGasto(
                id_usuario=user_id,
                ultima_actividad=self._ahora(),
            )
            return True

    async def renovar_edicion_gasto(self, id_gasto: int, user_id: int) -> bool:
        """Señal periódica del editor. Devuelve False si ya no tiene la edición."""
        async with self._lock_ediciones:
            edicion = self._edicion_gasto_vigente(id_gasto)
            if edicion is None or edicion.id_usuario != user_id:
                return False
            edicion.ultima_actividad = self._ahora()
            return True

    async def finalizar_edicion_gasto(self, id_gasto: int, user_id: int) -> bool:
        """Libera la edición si la tiene `user_id` (guardar, cancelar o salir)."""
        async with self._lock_ediciones:
            edicion = self._ediciones_gastos.get(id_gasto)
            if edicion is None or edicion.id_usuario != user_id:
                return False
            self._ediciones_gastos.pop(id_gasto, None)
            return True

    def obtener_editor_gasto(self, id_gasto: int) -> int | None:
        """Usuario con la edición activa del gasto, o None si está libre."""
        edicion = self._edicion_gasto_vigente(id_gasto)
        return edicion.id_usuario if edicion is not None else None
    
    async def broadcast_to_trip(self, trip_id: int, evento: dict) -> None:
        
        conexiones = list(self._conexiones_por_viaje.get(trip_id, ()))
        payload = json.dumps(evento, default=str)
        for conexion in conexiones:
            try:
                await conexion.send_text(payload)
            except Exception:
                logger.exception("No se pudo enviar evento WS al viaje, se descarta la conexión")
                self.disconnect(trip_id, conexion)

    async def connect_user(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self._conexiones_por_usuario:
            self._conexiones_por_usuario[user_id] = set()
        self._conexiones_por_usuario[user_id].add(websocket)

    def disconnect_user(self, user_id: int, websocket: WebSocket):
        if user_id in self._conexiones_por_usuario:
            self._conexiones_por_usuario[user_id].discard(websocket)
            if not self._conexiones_por_usuario[user_id]:
                del self._conexiones_por_usuario[user_id]

    async def broadcast_to_user(self, user_id: int, evento: dict) -> None:
    
        conexiones = list(self._conexiones_por_usuario.get(user_id, ()))
        payload = json.dumps(evento, default=str)
        for conexion in conexiones:
            try:
                await conexion.send_text(payload)
            except Exception:
                logger.exception("No se pudo enviar evento WS al usuario, se descarta la conexión")
                self.disconnect_user(user_id, conexion)

manager = ConnectionManager()