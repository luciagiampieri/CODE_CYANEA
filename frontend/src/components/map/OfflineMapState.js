import { FontAwesome6 } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function OfflineMapState({ compact = false }) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.iconWrap}>
        <FontAwesome6 color={colors.warning} name="wifi" size={16} />
      </View>
      <View style={styles.copyWrap}>
        <Text style={styles.title}>Sin conexión</Text>
        <Text style={styles.copy}>
          El mapa necesita conexión para cargar Google Maps y buscar lugares.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
  },
  cardCompact: {
    marginTop: spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  copyWrap: {
    flex: 1,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.warning,
  },
  copy: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
});
