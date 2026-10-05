/**
 * Reemplazo directo de `Modal` de react-native, con las mismas props.
 *
 * Agrega un <DialogHost /> dentro del modal: mientras está visible, los
 * diálogos de `appAlert` se dibujan anidados en él y quedan ENCIMA de su
 * contenido. Con el Modal de react-native, un diálogo abierto desde App.js
 * queda detrás del modal visible.
 *
 *   import Modal from "../components/ui/AppModal";
 */
import { Modal } from "react-native";

import { DialogHost } from "./AppDialog";

export default function AppModal({ children, ...props }) {
  return (
    <Modal {...props}>
      {children}
      {/* Solo existe mientras el modal es visible: RN no monta el contenido oculto */}
      {props.visible === false ? null : <DialogHost />}
    </Modal>
  );
}
