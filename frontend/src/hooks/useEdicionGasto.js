import { useCallback, useEffect, useRef, useState } from "react";

import { getExpenseEditSocketUrl } from "../services/api";

// Estados de la edición activa de un gasto (US 79).
export const EDICION_GASTO = {
  INACTIVA: "inactiva", // no se pidió editar
  CONECTANDO: "conectando", // esperando respuesta del servidor
  CONCEDIDA: "concedida", // este usuario tiene la edición activa
  RECHAZADA: "rechazada", // otro la está editando o no tiene permiso
  PERDIDA: "perdida", // venció por inactividad y la tomó otro usuario
  DESCONECTADA: "desconectada", // se cortó la conexión mientras editaba
};

const SEGUNDOS_RENOVACION_POR_DEFECTO = 30;
const MENSAJE_SIN_CONEXION =
  "No se pudo verificar si otro usuario está editando el gasto. Revisá tu conexión e intentá nuevamente.";
const MENSAJE_PERDIDA =
  "Otro usuario tomó la edición del gasto porque la tuya estuvo inactiva. Cerrá el formulario y volvé a intentarlo.";

const ESTADO_INICIAL = { estado: EDICION_GASTO.INACTIVA, mensaje: null, codigo: null };

/**
 * Edición activa de un gasto por WebSocket (US 79).
 *
 * Mientras `activo` sea true se conecta a /api/v1/gastos/ws/{idGasto}:
 * - si el servidor concede la edición, la renueva cada `segundosRenovacion`;
 * - si la rechaza (otro usuario la tiene, sin permiso, viaje cancelado...),
 *   expone el `mensaje` para mostrar;
 * - al pasar `activo` a false o desmontar el componente, cierra la conexión y
 *   el servidor libera la edición.
 *
 * `puedeGuardar` es true si la edición fue concedida. También lo es si la
 * conexión se cortó después: el PUT vuelve a validar en el servidor que nadie
 * más tenga la edición.
 */
export function useEdicionGasto(idGasto, activo) {
  const [edicion, setEdicion] = useState(ESTADO_INICIAL);
  const socketRef = useRef(null);

  const cerrar = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      // Se descarta lo que llegue después: el cierre es intencional.
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!activo || !idGasto) {
      setEdicion(ESTADO_INICIAL);
      return undefined;
    }

    let cancelado = false;
    let renovacion = null;
    let concedida = false;
    setEdicion({ estado: EDICION_GASTO.CONECTANDO, mensaje: null, codigo: null });

    async function conectar() {
      let url;
      try {
        url = await getExpenseEditSocketUrl(idGasto);
      } catch {
        if (!cancelado) {
          setEdicion({ estado: EDICION_GASTO.RECHAZADA, mensaje: MENSAJE_SIN_CONEXION, codigo: null });
        }
        return;
      }
      if (cancelado) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        let mensaje;
        try {
          mensaje = JSON.parse(event.data);
        } catch {
          return;
        }

        if (mensaje.tipo === "edicion_gasto_concedida") {
          concedida = true;
          setEdicion({ estado: EDICION_GASTO.CONCEDIDA, mensaje: null, codigo: null });
          const segundos = Number(mensaje.segundosRenovacion) || SEGUNDOS_RENOVACION_POR_DEFECTO;
          renovacion = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ tipo: "renovar" }));
            }
          }, segundos * 1000);
          return;
        }

        if (mensaje.tipo === "edicion_gasto_rechazada") {
          setEdicion({
            estado: EDICION_GASTO.RECHAZADA,
            mensaje: mensaje.mensaje || "No podés editar este gasto en este momento.",
            codigo: mensaje.codigo || null,
          });
          return;
        }

        if (mensaje.tipo === "edicion_gasto_perdida") {
          concedida = false;
          clearInterval(renovacion);
          setEdicion({ estado: EDICION_GASTO.PERDIDA, mensaje: MENSAJE_PERDIDA, codigo: null });
        }
      };

      socket.onclose = () => {
        clearInterval(renovacion);
        if (cancelado) return;
        setEdicion((actual) => {
          // Ya se informó un rechazo o la pérdida: se conserva ese mensaje.
          if (actual.estado === EDICION_GASTO.RECHAZADA || actual.estado === EDICION_GASTO.PERDIDA) {
            return actual;
          }
          if (concedida) {
            return { estado: EDICION_GASTO.DESCONECTADA, mensaje: null, codigo: null };
          }
          return { estado: EDICION_GASTO.RECHAZADA, mensaje: MENSAJE_SIN_CONEXION, codigo: null };
        });
      };
    }

    conectar();

    return () => {
      cancelado = true;
      clearInterval(renovacion);
      cerrar();
    };
  }, [idGasto, activo, cerrar]);

  const puedeGuardar =
    edicion.estado === EDICION_GASTO.CONCEDIDA || edicion.estado === EDICION_GASTO.DESCONECTADA;

  return { ...edicion, puedeGuardar, liberar: cerrar };
}