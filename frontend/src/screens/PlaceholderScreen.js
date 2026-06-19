import { StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import { colors, spacing, surfaces, textStyles } from "../theme/tokens";

export default function PlaceholderScreen({ route }) {
  const { title, message } = route.params ?? {};

  return (
    <ScreenContainer>
      <View style={styles.shell}>
        <Text style={styles.eyebrow}>Sección base</Text>
        <Text style={styles.title}>{title ?? "Pendiente"}</Text>
        <Text style={styles.copy}>{message ?? "Pantalla reservada para una próxima historia."}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  shell: {
    ...surfaces.card,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  eyebrow: {
    ...textStyles.sectionLabel,
    color: "#8b6c37",
    fontSize: 13,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 28,
    marginTop: spacing.sm,
  },
  copy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});
