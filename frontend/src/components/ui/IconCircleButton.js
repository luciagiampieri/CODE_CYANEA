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
}) {
  const isLight = tone === "light";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isLight ? colors.iconSurface : colors.surface,
        },
        isLight ? styles.lightTone : styles.solidTone,
        pressed && styles.pressed,
        style,
      ]}
    >
      <FontAwesome6
        color={isLight ? colors.textInverse : colors.primary}
        name={icon}
        size={iconSize}
      />
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
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
