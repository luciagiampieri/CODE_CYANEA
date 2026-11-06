import { FontAwesome6 } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import WebPickerOverlay from "./WebPickerOverlay";
import { colors, spacing } from "../../theme/tokens";
import { sheetFormStyles } from "./sheetFormStyles";

// Campo de hora de los formularios tipo hoja. En web usa el <input type="time"> del
// navegador; en el celular `onPress` abre `SelectorHora`. `compacto` es para usarlo dentro
// de una fila: no dibuja la etiqueta, que queda solo para accesibilidad.
export default function HoraField({
  label,
  value,
  onPress,
  onWebChange,
  placeholder = "Seleccionar hora",
  compacto = false,
}) {
  const caja = [sheetFormStyles.dateBox, compacto && styles.cajaCompacta];
  const contenido = (
    <>
      <FontAwesome6 name="clock" size={14} color={colors.overlay} />
      <Text style={value ? sheetFormStyles.timeText : sheetFormStyles.placeholderText}>
        {value || placeholder}
      </Text>
    </>
  );

  return (
    <View style={compacto ? styles.campoCompacto : sheetFormStyles.timeField}>
      {compacto ? null : <Text style={sheetFormStyles.label}>{label}</Text>}
      {Platform.OS === "web" ? (
        <View style={caja}>
          {contenido}
          <WebPickerOverlay type="time" label={label} value={value} onChange={onWebChange} />
        </View>
      ) : (
        <Pressable accessibilityLabel={label} onPress={onPress} style={caja}>
          {contenido}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  campoCompacto: {
    minWidth: 104,
  },
  cajaCompacta: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
});
