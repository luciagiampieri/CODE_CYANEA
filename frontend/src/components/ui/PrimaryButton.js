import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

export default function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
  iconPosition = "right",
}) {
  const isPrimary = variant === "primary";
  const indicatorColor = isPrimary ? colors.textInverse : colors.primary;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading ? styles.buttonPressed : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <>
          {icon && iconPosition === "left" ? (
            <FontAwesome6 color={indicatorColor} name={icon} size={14} style={styles.iconLeft} />
          ) : null}
          <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary, textStyle]}>
            {label}
          </Text>
          {icon && iconPosition === "right" ? (
            <FontAwesome6 color={indicatorColor} name={icon} size={14} style={styles.iconRight} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    ...shadows.card,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
  },
  label: {
    ...textStyles.button,
  },
  labelPrimary: {
    color: colors.textInverse,
  },
  labelSecondary: {
    color: colors.primary,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
