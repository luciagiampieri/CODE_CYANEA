import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, Image, ScrollView } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import TripCard from "../components/home/TripCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { getTrips } from "../services/api.js";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";
import CyaneaLogo from "../../assets/cyanea_Logo.png";

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

  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC" 
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

  const nextTrip = useMemo(() => {
    if (decoratedTrips.length === 0) return null;

    return [...decoratedTrips]
      .filter((trip) => {
        const date = new Date(trip.startDate || trip.FechaInicio);
        return !Number.isNaN(date.getTime());
      })
      .sort(
        (a, b) =>
          new Date(a.startDate || a.FechaInicio) -
          new Date(b.startDate || b.FechaInicio)
      )[0];
  }, [decoratedTrips]);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        
        {/* Cabecera Hero */}
        <LinearGradient colors={[colors.primaryStrong, colors.primary]} style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandBlock}>
              <View style={styles.brandIcon}>
                <Image 
                  source={CyaneaLogo} 
                  style={styles.logoImage} 
                  resizeMode="contain"
                />
              </View>
              <View>
                <Text style={styles.brandName}>CYANEA</Text>
                <Text style={styles.brandSubtitle}>Muchas manos, un único destino</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Mis Viajes</Text>
            <Text style={styles.heroSubtitle}>Explorá tus próximas aventuras y organizá tu viaje en grupo.</Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{decoratedTrips.length}</Text>
              <Text style={styles.statLabel}>
                {decoratedTrips.length === 1 ? "Viaje" : "Viajes"}
              </Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statValue} numberOfLines={1}>
                {nextTrip ? (nextTrip.title || nextTrip.Titulo) : "--"}
              </Text>
              <Text style={styles.statLabel}>Próximo viaje</Text>
            </View>
          </View>

          <View style={styles.buttonWrap}>
            <PrimaryButton label="Nuevo Viaje" onPress={() => navigation.navigate("NuevoViaje")} />
          </View>
        </LinearGradient>

        <View style={styles.contentFeed}>

          <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
            
            <View style={[styles.primaryColumn, isDesktop && styles.primaryColumnDesktop]}>
              {decoratedTrips.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Todavía no hay viajes cargados.</Text>
                  <Text style={styles.emptyCopy}>Creá el primero para empezar a armar el grupo.</Text>
                </View>
              ) : (
                <View style={styles.tripList}>
                  {decoratedTrips.map((trip) => (
                    <TripCard
                      key={trip.id || trip.IdViaje}
                      trip={trip}
                      onPress={() => navigation.navigate("TripDetail", { trip })}
                    />
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
                  <Text style={styles.dayPillTitle}>Día 1</Text>
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
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingBottom: 32,
  },
  header: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginHorizontal: 16, 
    marginTop: 12,
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
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    overflow: 'hidden'
  },
  logoImage: {
    width: 28, 
    height: 28,
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
  heroText: {
    marginTop: spacing.lg,
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
  heroStats: {
    flexDirection: "row",
    flexWrap: "nowrap", 
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1, 
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  statValue: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    color: "#dfe7f7",
    fontSize: typography.micro,
    marginTop: 4,
  },
  buttonWrap: {
    marginTop: spacing.lg,
    maxWidth: 200
  },
  contentFeed: {
    paddingHorizontal: 16, 
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1a202c",
    marginBottom: 16,
  },
  mainLayout: {
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
    gap: spacing.md 
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