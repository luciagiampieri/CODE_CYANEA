import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

// Aviso con el aspecto de `appToast`, que no admite botones. `flotante` lo apoya
// abajo de la pantalla cuando los botones de acción están dentro del scroll.
export default function AvisoDeshacer({ nombre, onDeshacer, flotante = false }) {
  return (
    <View style={flotante ? styles.flotante : styles.enLinea} pointerEvents="box-none">
      <View style={styles.aviso} accessibilityLiveRegion="polite">
        <Text style={styles.texto} numberOfLines={2}>
          {`Quitaste ${nombre} de tu viaje`}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onDeshacer}>
          <Text style={styles.accion}>Deshacer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  enLinea: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  flotante: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    zIndex: 100,
    elevation: 100,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    ...shadows.floating,
  },
  texto: {
    ...textStyles.meta,
    flex: 1,
    color: colors.textInverse,
  },
  accion: {
    ...textStyles.bodyStrong,
    color: colors.accent,
  },
});
