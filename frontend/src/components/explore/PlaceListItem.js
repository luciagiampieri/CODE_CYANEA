import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { formatRatingCount } from "./exploreUtils";

/**
 * Fila compacta de un lugar. Todo el renglón abre el detalle; las acciones
 * (guardar, agendar) viven en el detalle para no duplicarlas en cada fila.
 */
export default function PlaceListItem({
  place,
  rank = null,
  icon = "location-dot",
  detail = null,
  badge = null,
  highlighted = false,
  onPress,
  action = null,
}) {
  const ratingCount = formatRatingCount(place.userRatingsTotal);
  const hasRating = typeof place.rating === "number";
  const isSaved = place.kind === "savedPlace";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${place.name}`}
      onPress={() => onPress?.(place)}
      style={({ pressed }) => [
        styles.row,
        highlighted && styles.rowHighlighted,
        pressed && styles.rowPressed,
      ]}
    >
      {rank !== null ? (
        <View style={[styles.leading, styles.rankLeading]}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
      ) : (
        <View style={[styles.leading, isSaved && styles.savedLeading]}>
          <FontAwesome6
            color={isSaved ? colors.textInverse : colors.primary}
            name={isSaved ? "bookmark" : icon}
            size={13}
          />
        </View>
      )}

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>
          {place.name}
        </Text>

        <View style={styles.metaRow}>
          {hasRating ? (
            <Text style={styles.rating}>
              <FontAwesome6 color={colors.warning} name="star" size={11} /> {place.rating.toFixed(1)}
              {ratingCount ? <Text style={styles.metaMuted}>{` (${ratingCount})`}</Text> : null}
            </Text>
          ) : null}
          {detail ? (
            <Text numberOfLines={1} style={styles.metaMuted}>
              {detail}
            </Text>
          ) : null}
          {!hasRating && !detail && place.address ? (
            <Text numberOfLines={1} style={styles.metaMuted}>
              {place.address}
            </Text>
          ) : null}
        </View>
      </View>

      {badge ? (
        <View style={[styles.badge, badge.tone === "pending" && styles.badgePending]}>
          <Text style={[styles.badgeText, badge.tone === "pending" && styles.badgeTextPending]}>
            {badge.label}
          </Text>
        </View>
      ) : null}

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.label} ${place.name}`}
          hitSlop={6}
          onPress={() => action.onPress(place)}
          style={({ pressed }) => [styles.action, pressed && styles.rowPressed]}
        >
          <FontAwesome6 color={colors.textInverse} name="calendar-plus" size={12} />
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}

      {!badge && !action ? (
        <FontAwesome6 color={colors.borderStrong} name="chevron-right" size={12} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  rowHighlighted: {
    backgroundColor: colors.accentMuted,
  },
  rowPressed: {
    opacity: 0.7,
  },
  leading: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  savedLeading: {
    backgroundColor: colors.primarySoft,
  },
  rankLeading: {
    backgroundColor: colors.accentStrong,
  },
  rankText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 15,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  rating: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textPrimary,
  },
  metaMuted: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    backgroundColor: colors.surfaceAlt,
  },
  badgePending: {
    backgroundColor: colors.warningSurface,
  },
  badgeText: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  badgeTextPending: {
    color: colors.warning,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  actionText: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
