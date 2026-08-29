import { Pressable, StyleSheet } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, shadows, spacing } from "../../theme/tokens";

export default function IconCircleButton({
  icon,
  onPress,
  size = 42,
  tone = "light",
  iconSize = 16,
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      {...rest}
      style={({ pressed }) => [
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
        style,
      ]}
    >
      <FontAwesome6 color={iconColor} name={icon} size={iconSize} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});