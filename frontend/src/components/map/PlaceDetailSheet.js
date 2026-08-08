import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "../ui/PrimaryButton";
import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

function buildStatus(place) {
  if (place.kind === "savedPlace") {
    if (place.scheduledDays?.length) {
      return `Agendado en ${place.scheduledDays.map((day) => `Día ${day.dayIndex}`).join(", ")}`;
    }
    return "Guardado en el viaje";
  }

  if (place.kind === "tripDestination") {
    return "Destino base del viaje";
  }

  return "Resultado de búsqueda";
}

function resolveVisibleCategory(category) {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("_")) return null;
  if (normalized === "establishment" || normalized === "point_of_interest" || normalized === "point of interest") {
    return null;
  }
  return category;
}

export default function PlaceDetailSheet({
  onClose,
  onSave,
  onSaveAndSchedule,
  onSchedule,
  place,
  loadingDetails = false,
  saving = false,
  scheduling = false,
  savingAndScheduling = false,
}) {
  const [reviewsExpanded, setReviewsExpanded] = useState(false);

  if (!place) return null;

  const isSearchResult = place.kind === "searchResult";
  const isSavedPlace = place.kind === "savedPlace";
  const canSave = isSearchResult && !place.alreadySaved;
  const canSchedule = isSavedPlace || (isSearchResult && place.alreadySaved);
  const reviewCount = place.reviews?.length ?? 0;
  const visibleCategory = resolveVisibleCategory(place.category);

  useEffect(() => {
    setReviewsExpanded(false);
  }, [place.placeId]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{place.name}</Text>
          <Text style={styles.address}>{place.address}</Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <FontAwesome6 color={colors.textSecondary} name="xmark" size={16} />
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{buildStatus(place)}</Text>
        </View>
        {visibleCategory ? <Text style={styles.category}>{visibleCategory}</Text> : null}
        {typeof place.rating === "number" ? (
          <Text style={styles.category}>{`★ ${place.rating.toFixed(1)}`}</Text>
        ) : null}
        {typeof place.userRatingsTotal === "number" ? (
          <Text style={styles.category}>{`${place.userRatingsTotal} reseñas`}</Text>
        ) : null}
      </View>

      {place.scheduledDays?.length ? (
        <View style={styles.daysWrap}>
          {place.scheduledDays.map((day) => (
            <View key={`${place.id ?? place.placeId}-day-${day.dayId ?? day.dayIndex}`} style={styles.dayChip}>
              <Text style={styles.dayChipText}>{`Día ${day.dayIndex}`}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.reviewsSection}>
        <Pressable onPress={() => setReviewsExpanded((current) => !current)} style={styles.reviewsToggle}>
          <View style={styles.reviewsToggleCopy}>
            <Text style={styles.reviewsTitle}>Reseñas</Text>
            <Text style={styles.reviewsHint}>
              {loadingDetails
                ? "Cargando opiniones del lugar..."
                : reviewCount
                  ? `${reviewCount} reseñas disponibles`
                  : "Este lugar no tiene reseñas visibles por ahora."}
            </Text>
          </View>
          <FontAwesome6
            color={colors.primary}
            name={reviewsExpanded ? "chevron-up" : "chevron-down"}
            size={14}
          />
        </Pressable>

        {!loadingDetails && reviewsExpanded && reviewCount > 0 ? (
          <View style={styles.reviewsList}>
            {place.reviews.map((review, index) => (
              <View key={`${place.placeId}-review-${index}`} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{review.authorName}</Text>
                  {typeof review.rating === "number" ? (
                    <Text style={styles.reviewRating}>{`★ ${review.rating.toFixed(1)}`}</Text>
                  ) : null}
                </View>
                {review.relativePublishTimeDescription ? (
                  <Text style={styles.reviewMeta}>{review.relativePublishTimeDescription}</Text>
                ) : null}
                {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}
                <Text style={styles.reviewAttribution}>Reseña de Google.</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {canSave ? (
          <>
            <PrimaryButton
              icon="bookmark"
              iconPosition="left"
              label={saving ? "Guardando..." : "Guardar en el viaje"}
              loading={saving}
              onPress={onSave}
              style={styles.cta}
              variant="secondary"
            />
            <PrimaryButton
              icon="route"
              iconPosition="left"
              label={savingAndScheduling ? "Preparando..." : "Guardar y agregar al itinerario"}
              loading={savingAndScheduling}
              onPress={onSaveAndSchedule}
              style={styles.cta}
            />
          </>
        ) : null}

        {canSchedule ? (
          <PrimaryButton
            icon="route"
            iconPosition="left"
            label={scheduling ? "Agendando..." : "Agregar al itinerario"}
            loading={scheduling}
            onPress={onSchedule}
            style={styles.cta}
            variant={canSave ? "secondary" : "primary"}
          />
        ) : null}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  address: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
  },
  statusText: {
    ...textStyles.meta,
    color: colors.primary,
  },
  category: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  reviewsSection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  reviewsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reviewsToggleCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  reviewsTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  reviewsHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  reviewsList: {
    gap: spacing.sm,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  reviewAuthor: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    flex: 1,
  },
  reviewRating: {
    ...textStyles.meta,
    color: colors.primary,
  },
  reviewMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  reviewText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  reviewAttribution: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  daysWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  dayChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  dayChipText: {
    ...textStyles.meta,
    color: colors.textInverse,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  cta: {},
});
