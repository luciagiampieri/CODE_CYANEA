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
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.left}>
        {icon ? (
          <View style={[styles.icon, { backgroundColor: iconBackground }]}>
            <FontAwesome6 name={icon} size={16} color={iconColor} />
          </View>
        ) : null}
        <View style={styles.texts}>
          <Text style={styles.title}>{title}</Text>
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
  subtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
  },
});