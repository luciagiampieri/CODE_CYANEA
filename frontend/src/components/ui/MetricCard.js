import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

export default function MetricCard({ value, label, style, valueStyle, labelStyle }) {
  return (
    <View style={[styles.card, style]}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[styles.value, valueStyle]}
      >
        {value}
      </Text>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
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
