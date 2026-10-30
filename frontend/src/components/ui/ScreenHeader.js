import { StyleSheet, Text, View } from "react-native";

import IconCircleButton from "./IconCircleButton";
import { colors, spacing, textStyles } from "../../theme/tokens";

export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  backTestID,
  backLabel = "Volver",
  right,
}) {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={[styles.side, styles.sideLeft]}>
          {onBack ? (
            <IconCircleButton
              icon="arrow-left"
              onPress={onBack}
              tone="light"
              testID={backTestID}
              accessibilityLabel={backLabel}
              hitSlop={10}
            />
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.side, styles.sideRight]}>{right ?? null}</View>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  // Ranuras del mismo ancho a ambos lados para que el título quede centrado.
  side: {
    width: 52,
  },
  sideLeft: {
    alignItems: "flex-start",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  title: {
    ...textStyles.tripTitle,
    flex: 1,
    color: colors.textInverse,
    fontSize: 20,
    lineHeight: 24,
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.meta,
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    marginTop: spacing.xxs,
    alignSelf: "center",
    maxWidth: 460,
  },
});
