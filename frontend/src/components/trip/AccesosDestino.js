import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

// Acceso a cada destino del recorrido. `activos`: posiciones de los destinos del día elegido.
export default function AccesosDestino({ accesos, activos = [], onPress }) {
  return (
    <ScrollView
      contentContainerStyle={styles.fila}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="accesos-destino"
    >
      {accesos.map((acceso) => {
        const activo = activos.includes(acceso.indice);
        return (
          <Pressable
            key={acceso.indice}
            accessibilityRole="button"
            accessibilityLabel={`${acceso.nombre}, ${acceso.rango}`}
            accessibilityState={{ selected: activo }}
            onPress={() => onPress?.(acceso)}
            style={({ pressed }) => [
              styles.chip,
              activo && { backgroundColor: acceso.color, borderColor: acceso.color },
              pressed && styles.presionado,
            ]}
            testID={`acceso-destino-${acceso.indice}`}
          >
            <View
              style={[styles.punto, { backgroundColor: activo ? colors.textInverse : acceso.color }]}
            />
            <Text style={[styles.nombre, activo && styles.textoActivo]}>{acceso.nombre}</Text>
            <Text style={[styles.rango, activo && styles.textoActivo]}>{acceso.rango}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fila: {
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  punto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nombre: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  rango: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  textoActivo: {
    color: colors.textInverse,
  },
  presionado: {
    opacity: 0.7,
  },
});
