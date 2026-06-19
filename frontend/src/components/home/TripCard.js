import { FontAwesome6 } from "@expo/vector-icons";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";

import AvatarStack from "../ui/AvatarStack";
import StatusPill from "../ui/StatusPill";
import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

const STATUS_LABEL = {
  activo: "En curso",
  finalizado: "Finalizado",
  planificando: "Planificando",
};

export default function TripCard({ trip, onPress, compact = false }) {
  const statusKey = trip.status?.toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? trip.statusLabel ?? "Planificando";
  const progressValue = Math.max(8, Math.min(100, Number(trip.budgetProgress ?? 62)));

  return (
    <Pressable
      accessibilityLabel={`Ver detalle de ${trip.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, compact && styles.compactPressable, pressed && styles.pressed]}
    >
      <View style={styles.card}>
        <ImageBackground imageStyle={styles.image} source={{ uri: trip.image }} style={[styles.imageFrame, compact && styles.imageFrameCompact]}>
          <View style={styles.imageOverlay}>
            <View style={styles.topRow}>
              <View />
              <StatusPill
                style={styles.statusPill}
                textStyle={styles.statusText}
                tone={statusKey === "activo" ? "activo" : "planificando"}
              >
                {statusLabel}
              </StatusPill>
            </View>

            <View style={styles.heroCopy}>
              <Text numberOfLines={2} style={styles.title}>
                {trip.title}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {trip.destination}
              </Text>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <View style={styles.dateRow}>
              <FontAwesome6 color={colors.textSecondary} name="calendar" size={13} />
              <Text style={styles.dateText}>{trip.dateLabel}</Text>
            </View>
            <AvatarStack max={4} overflowLabel={trip.avatarOverflowLabel} participants={trip.participantsPreview ?? []} size={28} />
          </View>

          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Presupuesto</Text>
            <Text style={styles.budgetValue}>
              {trip.budgetLabel ?? "€4.800"} · {progressValue}% usado
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressValue}%` }]} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
  },
  compactPressable: {
    minWidth: 280,
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.992 }],
  },
  card: {
    ...surfaces.card,
    overflow: "hidden",
    borderRadius: radii.lg,
  },
  imageFrame: {
    minHeight: 236,
    justifyContent: "space-between",
  },
  imageFrameCompact: {
    minHeight: 220,
  },
  image: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  imageOverlay: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: "rgba(12, 24, 52, 0.18)",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  statusPill: {
    backgroundColor: "#d8ffd6",
  },
  statusText: {
    color: "#2b7d36",
  },
  heroCopy: {
    paddingTop: spacing.xxxl,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 20,
    lineHeight: 26,
  },
  subtitle: {
    ...textStyles.meta,
    color: "#f7f8fb",
    marginTop: spacing.xxs,
    fontSize: 15,
  },
  footer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  dateText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  budgetLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  budgetValue: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    flexShrink: 1,
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accentStrong,
    borderRadius: radii.pill,
  },
});
