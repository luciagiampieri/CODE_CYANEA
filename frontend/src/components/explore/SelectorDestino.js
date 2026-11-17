import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NumeroDestino } from "./HojaDestinos";
import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

/**
 * Fila del panel de Explorar, debajo de las pestañas, con el destino activo. Solo se
 * muestra con varios destinos. Siempre abre la hoja "Destinos del viaje":
 * - destino: "① Madrid · 3 noches ▾";
 * - `personalizada` (Descubrir, se buscó lejos del destino): "⌖ Zona del mapa ▾";
 * - `todos` (filtro de Guardados sin destino elegido): "Todos los destinos ▾".
 */
export default function SelectorDestino({ destino, personalizada = false, todos = false, onAbrir }) {
  let icono;
  let texto;
  if (todos) {
    icono = <FontAwesome6 name="layer-group" size={13} color={colors.primary} />;
    texto = "Todos los destinos";
  } else if (personalizada) {
    icono = <FontAwesome6 name="crosshairs" size={13} color={colors.primary} />;
    texto = "Zona del mapa";
  } else if (destino) {
    icono = <NumeroDestino chico indice={destino.indice} />;
    texto = [destino.nombre, destino.textoNoches].filter(Boolean).join(" · ");
  } else {
    return null;
  }

  return (
    <View style={styles.fila}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${texto}. Elegir destino`}
        onPress={onAbrir}
        style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
        testID="selector-destino"
      >
        {icono}
        <Text style={styles.texto}>{texto}</Text>
        <FontAwesome6 name="chevron-down" size={10} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    marginTop: spacing.sm,
    alignItems: "flex-start",
  },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    maxWidth: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm + 2,
    ...shadows.card,
  },
  texto: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    flexShrink: 1,
  },
  presionado: {
    opacity: 0.75,
  },
});
