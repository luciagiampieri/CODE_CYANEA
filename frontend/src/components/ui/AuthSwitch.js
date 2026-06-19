import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

export default function AuthSwitch({ active = "login", onChange }) {
  const options = [
    { key: "login", label: "Iniciar sesión" },
    { key: "register", label: "Crear cuenta" },
  ];

  return (
    <View style={styles.shell}>
      {options.map((option) => {
        const selected = active === option.key;

        return (
          <Pressable
            key={option.key}
            onPress={() => onChange?.(option.key)}
            style={[styles.option, selected && styles.optionActive]}
          >
            <Text style={[styles.label, selected && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  option: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  optionActive: {
    backgroundColor: colors.primary,
  },
  label: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontSize: 15,
  },
  labelActive: {
    color: colors.textInverse,
  },
});
