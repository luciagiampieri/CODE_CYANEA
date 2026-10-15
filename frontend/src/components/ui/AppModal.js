/**
 * Reemplazo directo de `Modal` de react-native, con las mismas props.
 *
 * Agrega un <DialogHost /> dentro del modal: mientras está visible, los
 * diálogos de `appAlert` se dibujan anidados en él y quedan ENCIMA de su
 * contenido. Con el Modal de react-native, un diálogo abierto desde App.js
 * queda detrás del modal visible.
 *
 * Además avisa cuándo el modal se está cerrando: en iOS no se puede presentar
 * otro Modal hasta que termina la animación de cierre (`onDismiss`), así que el
 * diálogo que se pida en ese momento (por ejemplo, la recomendación de entradas
 * después de guardar una actividad) espera y aparece recién después.
 *
 *   import Modal from "../components/ui/AppModal";
 */
import { useEffect, useRef } from "react";
import { Modal, Platform } from "react-native";

import { DialogHost, registrarCierreModal } from "./AppDialog";

// Respaldo por si `onDismiss` no llega (Android, web o un modal que se desmonta).
const ESPERA_SIN_ON_DISMISS_MS = Platform.OS === "ios" ? 900 : 350;

export default function AppModal({ children, onDismiss, ...props }) {
  const visible = props.visible !== false;
  const anterior = useRef(visible);
  const terminarCierre = useRef(null);

  function terminar() {
    if (terminarCierre.current) {
      terminarCierre.current();
      terminarCierre.current = null;
    }
  }

  useEffect(() => {
    const estabaVisible = anterior.current;
    anterior.current = visible;
    if (!estabaVisible || visible) return undefined;
    // Pasó de visible a oculto: empieza la animación de cierre.
    terminar();
    terminarCierre.current = registrarCierreModal();
    const respaldo = setTimeout(terminar, ESPERA_SIN_ON_DISMISS_MS);
    return () => clearTimeout(respaldo);
  }, [visible]);

  // Si el componente se desmonta mientras se cierra, no queda el cierre pendiente.
  useEffect(() => () => terminar(), []);

  return (
    <Modal
      {...props}
      onDismiss={() => {
        terminar();
        onDismiss?.();
      }}
    >
      {children}
      {/* Solo existe mientras el modal es visible: RN no monta el contenido oculto */}
      {props.visible === false ? null : <DialogHost />}
    </Modal>
  );
}
