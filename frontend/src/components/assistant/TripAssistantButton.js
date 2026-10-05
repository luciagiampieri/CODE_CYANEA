import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import { colors, radii, shadows, spacing } from "../../theme/tokens";

export default function TripAssistantButton({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Abrir asistente IA"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID="trip-assistant-button"
    >
      <FontAwesome6 name="wand-magic-sparkles" size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentStrong,
    zIndex: 20,
    ...shadows.floating,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});
