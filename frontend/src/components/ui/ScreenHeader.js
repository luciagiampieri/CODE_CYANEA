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
    <View style={styles.hero}>
      <View style={styles.topRow}>
        {onBack ? (
          <IconCircleButton
            icon="arrow-left"
            onPress={onBack}
            tone="light"
            testID={backTestID}
            accessibilityLabel={backLabel}
          />
        ) : (
          <View style={styles.placeholder} />
        )}
        {right ?? <View style={styles.placeholder} />}
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  topRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 26,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    ...textStyles.meta,
    color: "rgba(255,255,255,0.82)",
    textAlign: "center",
    marginTop: spacing.xxs,
    maxWidth: 460,
  },
});