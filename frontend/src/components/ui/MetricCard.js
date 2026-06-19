import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

export default function MetricCard({ value, label }) {
  return (
    <View style={styles.card}>
      <Text numberOfLines={1} style={styles.value}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    flex: 1,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  value: {
    ...textStyles.kpiValue,
    color: colors.primary,
  },
  label: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    textAlign: "center",
  },
});
