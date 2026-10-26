import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";


export default function SectionCard({ label, children, padded = false, style, testID }) {
  return (
    <View style={styles.section} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.card, padded && styles.padded, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  label: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  padded: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
});