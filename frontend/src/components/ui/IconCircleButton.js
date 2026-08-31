import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, shadows, spacing } from "../../theme/tokens";

export default function IconCircleButton({
  icon,
  onPress,
  size = 42,
  tone = "light",
  iconSize = 16,
  badgeCount = 0,
  style,
  testID,
  accessibilityLabel,
  ...rest
}) {
  const isLight = tone === "light";
  const isPrimary = tone === "primary";

  const backgroundColor = isPrimary
    ? colors.primary
    : isLight
    ? colors.iconSurface
    : colors.surface;

  const iconColor = isPrimary || isLight ? colors.textInverse : colors.primary;
  const showBadge = badgeCount > 0;
  const badgeLabel = badgeCount > 9 ? "9+" : String(badgeCount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        showBadge
          ? `${accessibilityLabel || ""} (${badgeCount} sin leer)`.trim()
          : accessibilityLabel
      }
      testID={testID}
      onPress={onPress}
      {...rest}
      style={({ pressed }) => [
        styles.wrapper,
        {
          width: size,
          height: size,
        },
        style,
      ]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.base,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor,
              },
              isLight && styles.lightTone,
              !isLight && !isPrimary && styles.solidTone,
              isPrimary && styles.primaryTone,
              pressed && styles.pressed,
            ]}
          >
            <FontAwesome6 color={iconColor} name={icon} size={iconSize} />
          </View>
          {showBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeLabel}</Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  base: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
  },
  lightTone: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  solidTone: {
    ...shadows.card,
  },
  primaryTone: {
    ...shadows.card,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});