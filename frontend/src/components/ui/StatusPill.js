import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../../theme/tokens";

const toneMap = {
  conectada: { backgroundColor: "#e5f5ed", color: colors.success },
  cargando: { backgroundColor: "#eef2fb", color: colors.textSecondary },
  "sin-conexion": { backgroundColor: "#fff1f1", color: colors.danger },
  note: { backgroundColor: "#fff8da", color: colors.warning }
};

export default function StatusPill({ tone = "note", children }) {
  const palette = toneMap[tone] ?? toneMap.note;

  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.label, { color: palette.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8
  },
  label: {
    fontSize: typography.micro,
    fontWeight: "800"
  }
});
