import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, textStyles } from "../../theme/tokens";

function Boton({ icono, etiqueta, tamano, color, deshabilitado, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: !!deshabilitado }}
      disabled={deshabilitado}
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.boton,
        { width: tamano, height: tamano },
        deshabilitado && styles.botonDeshabilitado,
      ]}
    >
      <FontAwesome6 name={icono} size={10} color={color} />
    </Pressable>
  );
}

// Píldora con − y +. Sin `valor` (o en 0) no se puede restar. `chica` es la de los
// traslados: botones de 26 px y borde gris claro.
export default function ContadorNoches({
  valor,
  texto,
  chica = false,
  color = colors.primary,
  etiquetaMenos,
  etiquetaMas,
  onCambiar,
}) {
  const tamano = chica ? 26 : 30;
  return (
    <View style={[styles.pildora, chica && styles.pildoraChica]}>
      <Boton
        icono="minus"
        etiqueta={etiquetaMenos}
        tamano={tamano}
        color={color}
        deshabilitado={!valor}
        onPress={() => onCambiar(-1)}
      />
      <Text style={[styles.texto, chica && styles.textoChico]}>{texto}</Text>
      <Boton
        icono="plus"
        etiqueta={etiquetaMas}
        tamano={tamano}
        color={color}
        onPress={() => onCambiar(1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pildora: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  pildoraChica: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  boton: {
    alignItems: "center",
    justifyContent: "center",
  },
  botonDeshabilitado: {
    opacity: 0.35,
  },
  texto: {
    ...textStyles.meta,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    minWidth: 18,
    textAlign: "center",
  },
  textoChico: {
    color: colors.textSecondary,
  },
});
