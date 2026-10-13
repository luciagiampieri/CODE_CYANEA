import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const MINUTOS_MINIMOS = 60;


export default function GapSuggestChip({ etiqueta, minutos, onPress, textStyle, style, testID }) {
  const sugerible = typeof onPress === "function" && minutos >= MINUTOS_MINIMOS;

  if (!sugerible) {
    return <Text style={textStyle}>{etiqueta}</Text>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${etiqueta}. Sugerir actividades con IA`}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, style, pressed && styles.pressed]}
      testID={testID}
    >
      <FontAwesome6 name="wand-magic-sparkles" size={11} color={colors.primary} />
      <Text numberOfLines={1} style={styles.texto}>
        {etiqueta}
      </Text>
      <Text style={styles.accion}>Sugerir</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentMuted,
  },
  texto: {
    ...textStyles.meta,
    flex: 1,
    color: colors.primary,
    fontSize: 12,
  },
  accion: {
    ...textStyles.meta,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});