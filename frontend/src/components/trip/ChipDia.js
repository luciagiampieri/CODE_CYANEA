import { FontAwesome6 } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

// Chip del día. `chip` sale de `chipDelDia` o `chipDelDiaCalendario`: con `ruta` muestra los
// dos destinos del traslado y si no, un ícono opcional y un texto.
export default function ChipDia({ chip, alto = 26 }) {
  if (!chip) return null;
  const color = chip.color ?? colors.primary;

  return (
    <View
      style={[styles.chip, { height: alto, backgroundColor: chip.fondo ?? colors.surfaceAlt }]}
      testID="chip-dia"
    >
      {chip.ruta ? (
        <>
          <View style={[styles.punto, { backgroundColor: chip.ruta[0].color }]} />
          <Text style={styles.texto}>{chip.ruta[0].nombre}</Text>
          <FontAwesome6 name="arrow-right" size={9} color={colors.textSecondary} />
          <View style={[styles.punto, { backgroundColor: chip.ruta[1].color }]} />
          <Text style={styles.texto}>{chip.ruta[1].nombre}</Text>
        </>
      ) : (
        <>
          {chip.icono ? <FontAwesome6 name={chip.icono} size={10} color={color} /> : null}
          <Text style={[styles.texto, { color }]}>{chip.texto}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  punto: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  texto: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
});
