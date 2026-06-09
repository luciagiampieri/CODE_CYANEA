import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, typography } from "../../theme/tokens";

export default function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false
}) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading ? styles.buttonPressed : null
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.primary : colors.surface} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  buttonPrimary: {
    backgroundColor: colors.accent
  },
  buttonSecondary: {
    backgroundColor: colors.primary
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }]
  },
  label: {
    fontSize: typography.body,
    fontWeight: "800"
  },
  labelPrimary: {
    color: colors.primary
  },
  labelSecondary: {
    color: colors.surface
  }
});
