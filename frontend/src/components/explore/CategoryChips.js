import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

/**
 * Chips flotantes sobre el mapa. Tocar el chip activo lo desactiva y
 * vuelve a la vista de imperdibles.
 */
export default function CategoryChips({ categories, activeKey, onPress }) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      {categories.map((category) => {
        const active = category.key === activeKey;
        return (
          <Pressable
            key={category.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onPress(category.key)}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
          >
            <FontAwesome6
              color={active ? colors.textInverse : colors.primary}
              name={category.icon}
              size={12}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{category.label}</Text>
            {active ? <FontAwesome6 color={colors.textInverse} name="xmark" size={11} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  labelActive: {
    color: colors.textInverse,
  },
});
