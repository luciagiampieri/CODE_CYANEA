import { Pressable, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function ListRow({
  icon,
  iconColor = colors.primary,
  iconBackground = colors.surfaceAlt,
  title,
  subtitle,
  onPress,
  divider = false,
  right,
  testID,
  destructive = false,
  disabled = false,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.left}>
        {icon ? (
          <View style={[styles.icon, { backgroundColor: destructive ? colors.dangerSurface : iconBackground }]}>
            <FontAwesome6 name={icon} size={16} color={destructive ? colors.danger : iconColor} />
          </View>
        ) : null}
        <View style={styles.texts}>
          <Text style={[styles.title, destructive && styles.titleDestructive]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ?? <FontAwesome6 name="chevron-right" size={14} color={colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.md,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  disabled: {
    opacity: 0.6,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  titleDestructive: {
    color: colors.danger,
  },
  subtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
  },
});