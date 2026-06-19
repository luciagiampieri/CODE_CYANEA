import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const toneMap = {
  conectada: { backgroundColor: colors.successSurface, color: colors.success },
  cargando: { backgroundColor: colors.surfaceAlt, color: colors.textSecondary },
  "sin-conexion": { backgroundColor: colors.dangerSurface, color: colors.danger },
  activo: { backgroundColor: "#d7fad8", color: colors.success },
  finalizado: { backgroundColor: colors.surfaceAlt, color: colors.textSecondary },
  planificando: { backgroundColor: colors.warningSurface, color: colors.warning },
  pendiente: { backgroundColor: colors.warningSurface, color: colors.warning },
  note: { backgroundColor: colors.accentMuted, color: colors.primary },
};

export default function StatusPill({ tone = "note", children, style, textStyle }) {
  const palette = toneMap[tone] ?? toneMap.note;

  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }, style]}>
      <Text style={[styles.label, { color: palette.color }, textStyle]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  label: {
    ...textStyles.meta,
    fontWeight: "700",
  },
});
