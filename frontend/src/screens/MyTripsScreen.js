import { useEffect, useMemo, useState } from "react";
import {
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather, FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import StatusPill from "../components/ui/StatusPill";
import useResponsive from "../hooks/useResponsive";
import { getTrips } from "../services/api";
import {
  colors,
  radii,
  spacing,
  surfaces,
  textStyles,
} from "../theme/tokens";

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "proximos", label: "Próximos" },
  { key: "pasados", label: "Pasados" },
];

const STATUS_LABEL = {
  activo: "En curso",
  finalizado: "Finalizado",
  planificando: "Planificando",
};

const QUICK_ACTIONS = [
  { key: "itinerario", label: "Itinerario", icon: "map", color: colors.primary },
  { key: "gastos", label: "Gastos", icon: "dollar-sign", color: colors.warning },
  { key: "checklist", label: "Checklist", icon: "check-circle", color: colors.success },
  { key: "docs", label: "Docs", icon: "file-text", color: "#7c6fa8" },
];

function formatDateRange(trip) {
  const startDateStr = trip.startDate || trip.FechaInicio;
  const endDateStr = trip.endDate || trip.FechaFin;

  if (!startDateStr || !endDateStr) {
    return "Fechas por definir";
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Fechas por definir";
  }

  const dayFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    timeZone: "UTC",
  });
  const monthFormatter = new Intl.DateTimeFormat("es-AR", {
    month: "short",
    timeZone: "UTC",
  });

  return `${dayFormatter.format(start)}-${dayFormatter.format(end)} ${monthFormatter.format(end)} ${end.getUTCFullYear()}`;
}

function normalizeTrip(trip) {
  const destinations = trip.destinations || trip.Destinations || [];
  const participants = trip.participants || trip.Participants || [];
  const destinationLabel = destinations.length
    ? destinations.map((item) => `${item.name}, ${item.country}`).join(" · ")
    : trip.destination || trip.Destino || "Destino a confirmar";
  const startDateStr = trip.startDate || trip.FechaInicio || null;
  const endDateStr = trip.endDate || trip.FechaFin || null;

  return {
    ...trip,
    id: trip.id ?? trip.IdViaje,
    title: trip.title || trip.Titulo || "Viaje sin nombre",
    destination: destinationLabel,
    status: (trip.status || trip.Estado || "planificando").toLowerCase(),
    image: trip.image || null,
    dateLabel: formatDateRange(trip),
    startDate: startDateStr ? new Date(startDateStr) : null,
    endDate: endDateStr ? new Date(endDateStr) : null,
    travelersCount: participants.length,
    budgetProgress: trip.budgetProgress ?? null,
    hasLeft: trip.hasLeft ?? trip.HasLeft ?? false,
  };
}

export default function MyTripsScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [activeFilter, setActiveFilter] = useState("todos");
  const { isTablet, isDesktop } = useResponsive();

  useEffect(() => {
    async function loadData() {
      try {
        const tripData = await getTrips();
        setTrips(tripData);
      } catch {
        setTrips([]);
      }
    }

    loadData();
  }, []);

  const decoratedTrips = useMemo(() => trips.map(normalizeTrip), [trips]);

  const nextTripId = useMemo(() => {
    const now = new Date();
    const upcoming = decoratedTrips
      .filter((trip) => trip.status !== "finalizado" && !trip.hasLeft && trip.startDate)
      .sort((a, b) => a.startDate - b.startDate);
    const closest = upcoming.find((trip) => trip.startDate >= now) || upcoming[0];
    return closest?.id;
  }, [decoratedTrips]);

  const filteredTrips = useMemo(() => {
    if (activeFilter === "todos") return decoratedTrips;
    if (activeFilter === "pasados") {
      return decoratedTrips.filter((trip) => trip.status === "finalizado" || trip.hasLeft);
    }
    return decoratedTrips.filter((trip) => trip.status !== "finalizado" && !trip.hasLeft);
  }, [activeFilter, decoratedTrips]);

  const summary = useMemo(() => {
    const activos = decoratedTrips.filter((trip) => trip.status !== "finalizado" && !trip.hasLeft).length;
    const completados = decoratedTrips.filter((trip) => trip.status === "finalizado" && !trip.hasLeft).length;
    return { activos, completados };
  }, [decoratedTrips]);

  function badgeInfo(trip) {
    if (trip.hasLeft) {
      return { tone: "saliste", label: "Saliste" };
    }
    if (trip.status !== "finalizado" && trip.id === nextTripId) {
      return { tone: "proximo", label: "Próximo" };
    }
    return { tone: trip.status, label: STATUS_LABEL[trip.status] ?? "Planificando" };
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.heading}>Mis Viajes</Text>
          <Text style={styles.subheading}>
            {summary.activos} viajes activos · {summary.completados} completado
            {summary.completados === 1 ? "" : "s"}
          </Text>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.chipGroup}>
            {FILTERS.map((filter) => {
              const active = filter.key === activeFilter;
              return (
                <Pressable
                  key={filter.key}
                  onPress={() => setActiveFilter(filter.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityLabel="Crear viaje"
            onPress={() => navigation.navigate("NuevoViaje")}
            style={styles.addButton}
          >
            <FontAwesome6 name="plus" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View
          style={[
            styles.tripList,
            isTablet && styles.tripListTablet,
            isDesktop && styles.tripListDesktop,
          ]}
        >
          {filteredTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No hay viajes en esta categoría.</Text>
            </View>
          ) : (
            filteredTrips.map((trip) => {
              const progress =
                trip.budgetProgress != null
                  ? Math.max(0, Math.min(100, Number(trip.budgetProgress)))
                  : null;
              const HeroContainer = trip.image ? ImageBackground : View;
              const heroProps = trip.image
                ? { source: { uri: trip.image }, imageStyle: styles.heroImage }
                : {};

              return (
                <Pressable
                  key={trip.id}
                  onPress={() => navigation.navigate("TripDetail", { trip })}
                  style={[styles.tripCard, (isTablet || isDesktop) && styles.tripCardGrid]}
                >
                  <HeroContainer
                    {...heroProps}
                    style={[styles.hero, !trip.image && styles.heroFallback]}
                  >
                    <StatusPill tone={badgeInfo(trip).tone} style={styles.badge}>
                      {badgeInfo(trip).label}
                    </StatusPill>
                    <Text numberOfLines={1} style={styles.tripTitle}>
                      {trip.title}
                    </Text>
                  </HeroContainer>

                  <View style={styles.tripFooter}>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <FontAwesome6 name="calendar" size={13} color={colors.textSecondary} />
                        <Text style={styles.metaText}>{trip.dateLabel}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <FontAwesome6 name="user-group" size={13} color={colors.textSecondary} />
                        <Text style={styles.metaText}>{trip.travelersCount} viajeros</Text>
                      </View>
                    </View>

                    {progress != null && (
                      <View style={styles.progressRow}>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${progress}%` }]} />
                        </View>
                        <Text style={styles.progressText}>{progress}%</Text>
                      </View>
                    )}

                    <View style={styles.actionsRow}>
                      {QUICK_ACTIONS.map((action) => (
                        <Pressable
                          key={action.key}
                          onPress={() =>
                            navigation.navigate("TripDetail", {
                              trip,
                              initialTab: action.key,
                            })
                          }
                          style={styles.actionItem}
                        >
                          <View style={styles.actionCircle}>
                            <Feather name={action.icon} size={16} color={action.color} />
                          </View>
                          <Text style={styles.actionLabel}>{action.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  heading: {
    ...textStyles.screenTitle,
    color: colors.primary,
  },
  subheading: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  chipGroup: {
    flexDirection: "row",
    gap: spacing.xs,
    flexShrink: 1,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.textInverse,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  tripList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  tripListTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tripListDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tripCard: {
    ...surfaces.card,
    overflow: "hidden",
    borderRadius: radii.lg,
  },
  tripCardGrid: {
    width: "48.6%",
  },
  hero: {
    minHeight: 190,
    justifyContent: "flex-end",
    padding: spacing.md,
  },
  heroFallback: {
    backgroundColor: colors.primarySoft,
  },
  heroImage: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  badge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
  },
  tripTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 22,
  },
  tripFooter: {
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  metaText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
  },
  progressText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  actionItem: {
    alignItems: "center",
    gap: spacing.xxs,
    width: 64,
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  actionLabel: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyCard: {
    ...surfaces.card,
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
});