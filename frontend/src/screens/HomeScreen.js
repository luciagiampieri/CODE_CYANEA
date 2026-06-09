import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import TripCard from "../components/home/TripCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import StatusPill from "../components/ui/StatusPill";
import useResponsive from "../hooks/useResponsive";
import { getTrips } from "../services/api.js";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";

const fallbackImages = [
  "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1508261305436-e282fd32d20a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80"
];

const itineraryItems = [
  { time: "09:00", title: "Llegada y check-in", note: "Aterrizaje, hotel y primer reagrupamiento" },
  { time: "11:00", title: "Paseo inicial", note: "Recorrido liviano para ubicar al grupo" },
  { time: "13:30", title: "Almuerzo", note: "Punto de encuentro para definir el resto del dia" }
];

function formatDateRange(trip) {
  if (!trip.startDate || !trip.endDate) {
    return "Fechas por definir";
  }

  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Fechas por definir";
  }

  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [apiStatus, setApiStatus] = useState("cargando");
  const { isDesktop } = useResponsive();

  useEffect(() => {
    async function loadTrips() {
      try {
        const data = await getTrips();
        setTrips(data);
        setApiStatus("conectada");
      } catch {
        setApiStatus("sin-conexion");
      }
    }

    loadTrips();
  }, []);

  const decoratedTrips = useMemo(
    () =>
      trips.map((trip, index) => ({
        ...trip,
        image: fallbackImages[index % fallbackImages.length],
        dateLabel: formatDateRange(trip)
      })),
    [trips]
  );

  return (
    <ScreenContainer>
      <LinearGradient colors={[colors.primaryStrong, colors.primary]} style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBlock}>
            <View style={styles.brandIcon}>
              <FontAwesome6 color={colors.accent} name="location-dot" size={22} />
            </View>
            <View>
              <Text style={styles.brandName}>CYANEA</Text>
              <Text style={styles.brandSubtitle}>Planificacion colaborativa</Text>
            </View>
          </View>

          <Pressable onPress={() => navigation.navigate("NuevoViaje")} style={styles.actionIcon}>
            <FontAwesome6 color={colors.surface} name="plus" size={18} />
          </Pressable>
        </View>

        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Mis Viajes</Text>
          <Text style={styles.heroSubtitle}>Explora tus proximas aventuras y organiza el grupo.</Text>
        </View>

        <View style={styles.heroActions}>
          <StatusPill tone={apiStatus}>API {apiStatus.replace("-", " ")}</StatusPill>
          <StatusPill tone="note">{decoratedTrips.length} viajes</StatusPill>
        </View>

        <View style={styles.buttonWrap}>
          <PrimaryButton label="Nuevo Viaje" onPress={() => navigation.navigate("NuevoViaje")} />
        </View>
      </LinearGradient>

      <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
        <View style={[styles.primaryColumn, isDesktop && styles.primaryColumnDesktop]}>
          {decoratedTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Todavia no hay viajes cargados.</Text>
              <Text style={styles.emptyCopy}>Crea el primero para empezar a armar el grupo.</Text>
            </View>
          ) : (
            <View style={styles.tripList}>
              {decoratedTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </View>
          )}
        </View>

        <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
          <View style={styles.panelCard}>
            <Text style={styles.panelEyebrow}>Resumen</Text>
            <Text style={styles.panelTitle}>Itinerario sugerido</Text>
            <Text style={styles.panelCopy}>
              Base visual para la agenda del viaje y las acciones del grupo.
            </Text>

            <View style={styles.dayPill}>
              <Text style={styles.dayPillTitle}>Dia 1</Text>
              <Text style={styles.dayPillSubtitle}>12 Jun</Text>
            </View>

            <View style={styles.agendaList}>
              {itineraryItems.map((item, index) => (
                <View key={`${item.time}-${item.title}`} style={styles.agendaItem}>
                  <Text style={styles.agendaTime}>{item.time}</Text>
                  <View style={styles.agendaTrack}>
                    <View style={[styles.agendaDot, index === 0 && styles.agendaDotActive]} />
                    {index < itineraryItems.length - 1 ? <View style={styles.agendaLine} /> : null}
                  </View>
                  <View style={[styles.agendaCard, index === 0 && styles.agendaCardActive]}>
                    <Text style={styles.agendaTitle}>{item.title}</Text>
                    <Text style={styles.agendaNote}>{item.note}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.card
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  brandName: {
    color: colors.surface,
    fontSize: typography.subheading,
    fontWeight: "900",
    letterSpacing: 1
  },
  brandSubtitle: {
    color: "#dbe6fb",
    fontSize: typography.micro
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center"
  },
  heroText: {
    marginTop: spacing.xl,
    gap: spacing.sm
  },
  heroTitle: {
    color: colors.surface,
    fontWeight: "900",
    fontSize: typography.hero
  },
  heroSubtitle: {
    color: "#dfe7f7",
    fontSize: typography.body,
    maxWidth: 560
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  buttonWrap: {
    marginTop: spacing.lg,
    maxWidth: 220
  },
  mainLayout: {
    marginTop: spacing.xl,
    gap: spacing.lg
  },
  mainLayoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start"
  },
  primaryColumn: {
    gap: spacing.lg
  },
  primaryColumnDesktop: {
    flex: 1.2
  },
  sideColumn: {
    gap: spacing.lg
  },
  sideColumnDesktop: {
    flex: 0.8
  },
  tripList: {
    gap: spacing.lg
  },
  emptyCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.card
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: typography.subheading
  },
  emptyCopy: {
    color: colors.textSecondary,
    marginTop: spacing.sm
  },
  panelCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card
  },
  panelEyebrow: {
    color: colors.primary,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontSize: typography.micro
  },
  panelTitle: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: typography.heading,
    marginTop: spacing.sm
  },
  panelCopy: {
    color: colors.textSecondary,
    marginTop: spacing.sm
  },
  dayPill: {
    alignSelf: "flex-start",
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  dayPillTitle: {
    color: colors.primary,
    fontWeight: "900"
  },
  dayPillSubtitle: {
    color: colors.primaryStrong,
    marginTop: 2
  },
  agendaList: {
    marginTop: spacing.lg,
    gap: spacing.md
  },
  agendaItem: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  agendaTime: {
    width: 56,
    color: colors.primary,
    fontWeight: "800",
    paddingTop: 8
  },
  agendaTrack: {
    width: 28,
    alignItems: "center"
  },
  agendaDot: {
    width: 14,
    height: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border
  },
  agendaDotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accentStrong
  },
  agendaLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: 4
  },
  agendaCard: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  agendaCardActive: {
    backgroundColor: "#fff7d1"
  },
  agendaTitle: {
    color: colors.textPrimary,
    fontWeight: "800"
  },
  agendaNote: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: typography.small
  }
});
