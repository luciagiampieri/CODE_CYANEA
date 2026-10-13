import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";


export default function TripAssistantButton({
  onPress,
  label,
  accessibilityLabel = "Abrir asistente IA",
  testID = "trip-assistant-button",
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        label ? styles.extended : styles.round,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <FontAwesome6 name="wand-magic-sparkles" size={label ? 16 : 22} color={colors.primary} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentStrong,
    zIndex: 20,
    ...shadows.floating,
  },
  round: {
    width: 58,
    height: 58,
  },
  extended: {
    height: 52,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...textStyles.button,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});