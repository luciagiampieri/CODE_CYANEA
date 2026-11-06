import { useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text } from "react-native";

import Modal from "./AppModal";
import { sheetFormStyles as styles } from "./sheetFormStyles";

// Estado del reloj nativo. `alConfirmar(tipo, fecha)` recibe la hora elegida; `tipo`
// identifica el campo que lo abrió.
export function useSelectorHora(alConfirmar) {
  const [tipo, setTipo] = useState(null);
  const [fecha, setFecha] = useState(new Date());

  return {
    tipo,
    fecha,
    abrir(nuevoTipo, fechaInicial) {
      setFecha(fechaInicial);
      setTipo(nuevoTipo);
    },
    cerrar() {
      setTipo(null);
    },
    alCambiar(evento, elegida) {
      if (Platform.OS === "android") {
        const tipoActual = tipo;
        setTipo(null);
        if (evento.type === "set" && elegida) alConfirmar(tipoActual, elegida);
        return;
      }
      if (elegida) setFecha(elegida);
    },
    confirmar() {
      alConfirmar(tipo, fecha);
      setTipo(null);
    },
  };
}

// Spinner con "Listo" en iOS y diálogo del sistema en Android. En web no dibuja nada.
export default function SelectorHora({ selector }) {
  if (Platform.OS === "web" || selector.tipo === null) return null;

  if (Platform.OS === "ios") {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={selector.cerrar}>
        <Pressable style={styles.timePickerOverlay} onPress={selector.cerrar}>
          <Pressable style={styles.timePickerContainer} onPress={(e) => e.stopPropagation()}>
            <DateTimePicker
              mode="time"
              value={selector.fecha}
              onChange={selector.alCambiar}
              is24Hour={true}
              display="spinner"
              style={{ width: 220, height: 160 }}
            />
            <Pressable style={styles.timePickerDone} onPress={selector.confirmar}>
              <Text style={styles.timePickerDoneText}>Listo</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <DateTimePicker
      mode="time"
      value={selector.fecha}
      onChange={selector.alCambiar}
      is24Hour={true}
      display="default"
    />
  );
}
