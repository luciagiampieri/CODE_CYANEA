import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import TripCard from "../components/home/TripCard";
import Avatar from "../components/ui/Avatar";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, getTrips } from "../services/api";
import {
  colors,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

const fallbackImages = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1539650116574-75c0c6d73f4e?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1483683804023-6ccdb62f86ef?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1400&q=80",
];

const previewParticipants = [
  { id: 1, nombreCompleto: "Lucía Giampieri" },
  { id: 2, nombreCompleto: "Candela Páez" },
  { id: 3, nombreCompleto: "Ticiana Gatica" },
  { id: 4, nombreCompleto: "Luciano Correa" },
  { id: 5, nombreCompleto: "María Paz" },
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

  const monthFormatter = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return `${monthFormatter.format(start)} - ${monthFormatter.format(end)} ${end.getUTCFullYear()}`;
}

export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const { isTablet, isDesktop } = useResponsive();

  useEffect(() => {
    async function loadData() {
      try {
        const [tripData, me] = await Promise.all([
          getTrips(),
          getCurrentUser().catch(() => null),
        ]);
        
        setTrips(tripData);
        setCurrentUser(me);
      } catch {
        setTrips([]);
      }
    }

    loadData();
  }, []);

  const decoratedTrips = useMemo(
    () =>
      trips.map((trip, index) => ({
        ...trip,
        title: trip.title || trip.Titulo || "Viaje sin nombre",
        destination: 
        (trip.destinations || trip.Destinations)?.length > 0
          ? (trip.destinations || trip.Destinations)
              .map((d) => `${d.name}, ${d.country}`)
              .join(" · ")
            : trip.destination || trip.Destino || "Destino a confirmar",

        status: (trip.status || trip.Estado || "activo").toLowerCase(),
        image: trip.image || fallbackImages[index % fallbackImages.length],
        dateLabel: formatDateRange(trip),
        budgetLabel: trip.budgetLabel || `€${(trip.budget || 4800).toLocaleString("es-AR")}`,
        budgetProgress: trip.budgetProgress || [62, 18, 44, 73][index % 4],
        participantsPreview:
          trip.participantsPreview ||
          previewParticipants.slice(0, 4 + (index % 2)).map((participant) => ({
            ...participant,
            key: `${trip.IdViaje ?? trip.id}-${participant.id}`,
          })),
        avatarOverflowLabel: index % 2 === 0 ? "+4" : undefined,
      })),
    [trips]
  );

  const metrics = useMemo(() => {
    const countries = new Set(
      decoratedTrips
        .map((trip) => trip.destination.split(",").slice(-1)[0]?.trim())
        .filter(Boolean)
    );

    return {
      viajes: decoratedTrips.length,
      companeros: 14,
      paises: countries.size || 1,
    };
  }, [decoratedTrips]);

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.greeting}>Hola, {currentUser?.nombreCompleto} 👋</Text>
              <Text style={styles.heading}>Mis Viajes</Text>
            </View>

            <View style={styles.headerActions}>
              <IconCircleButton icon="bell" onPress={() => navigation.navigate("Invitaciones")} />
              <View style={styles.avatarRing}>
                {currentUser?.fotoUrl ? (
                  <Avatar imageUrl={currentUser.fotoUrl} name={currentUser.nombreCompleto} size={42} />
                ) : (
                  <Image
                    source={{ uri: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80" }}
                    style={styles.profileImage}
                  />
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metricsRow}>
            <MetricCard label="Viajes" value={metrics.viajes} />
            <MetricCard label="Compañeros" value={metrics.companeros} />
            <MetricCard label="Países" value={metrics.paises} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Próximos viajes</Text>
            <Pressable>
              <Text style={styles.sectionAction}>Ver todos</Text>
            </Pressable>
          </View>

          {decoratedTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Todavía no hay viajes cargados.</Text>
              <Text style={styles.emptyCopy}>Creá el primero y empezá a sumar compañeros.</Text>
            </View>
          ) : (
            <View style={[styles.tripGrid, isTablet && styles.tripGridTablet, isDesktop && styles.tripGridDesktop]}>
              {decoratedTrips.map((trip) => (
                <View
                  key={trip.id || trip.IdViaje}
                  style={[
                    styles.tripCell,
                    isTablet && styles.tripCellTablet,
                    isDesktop && styles.tripCellDesktop,
                  ]}
                >
                  <TripCard
                    trip={trip}
                    onPress={() => navigation.navigate("TripDetail", { trip })}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Pressable onPress={() => navigation.navigate("NuevoViaje")} style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <FontAwesome6 name="plus" size={28} color={colors.primary} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 148,
  },
  header: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  greeting: {
    ...textStyles.meta,
    color: "#c4d0ee",
    fontSize: 16,
  },
  heading: {
    ...textStyles.screenTitle,
    color: colors.textInverse,
    marginTop: spacing.xxs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.accent,
    padding: 2,
    backgroundColor: colors.surface,
  },
  profileImage: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...textStyles.sectionLabel,
    color: "#8b6c37",
    fontSize: 13,
  },
  sectionAction: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  tripGrid: {
    gap: spacing.lg,
  },
  tripGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  tripGridDesktop: {
    gap: spacing.lg,
  },
  tripCell: {
    width: "100%",
  },
  tripCellTablet: {
    width: "48.6%",
  },
  tripCellDesktop: {
    width: "48.8%",
  },
  emptyCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: 104,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.97 }],
  },
});
