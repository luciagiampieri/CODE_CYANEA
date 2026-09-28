import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Selector segmentado liviano para alternar vistas dentro de una misma card.
 * options: [{ id, label, badge? }] — `badge` es un número opcional que se
 * muestra como contador destacado (se oculta si es 0).
 */
export default function SegmentedControl({ options, value, onChange, testID }) {
  return (
    <View accessibilityRole="tablist" style={styles.shell} testID={testID}>
      {options.map((option) => {
        const selected = option.id === value;
        const showBadge = Number(option.badge) > 0;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.id}
            onPress={() => onChange?.(option.id)}
            style={[styles.option, selected && styles.optionSelected]}
            testID={testID ? `${testID}-${option.id}` : undefined}
          >
            <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
              {option.label}
            </Text>
            {showBadge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{option.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    padding: spacing.xxs,
  },
  option: {
    flex: 1,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  label: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  badgeText: {
    ...textStyles.meta,
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
});
