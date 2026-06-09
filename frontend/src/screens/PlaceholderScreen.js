import { StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";

export default function PlaceholderScreen({ route }) {
  const { title, message } = route.params ?? {};

  return (
    <ScreenContainer>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Seccion base</Text>
        <Text style={styles.title}>{title ?? "Pendiente"}</Text>
        <Text style={styles.copy}>{message ?? "Pantalla reservada para una proxima historia."}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.card
  },
  eyebrow: {
    color: colors.primary,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: typography.micro,
    letterSpacing: 1.1
  },
  title: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: typography.title,
    marginTop: spacing.sm
  },
  copy: {
    color: colors.textSecondary,
    marginTop: spacing.md
  }
});
