import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import TripCard from "../components/home/TripCard";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, getTrips, getNotifications, getPendingInvitations, getNotificationsSocketUrl } from "../services/api";

import {
  colors,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

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

function normalizeTrip(trip) {
  const destinations = trip.destinations || trip.Destinations || [];
  const participants = trip.participants || trip.Participants || [];
  const destinationLabel = destinations.length
    ? destinations.map((item) => `${item.name}, ${item.country}`).join(" · ")
    : trip.destination || trip.Destino || "Destino a confirmar";

  const participantPreview = participants.slice(0, 4).map((participant) => ({
    id: participant.id,
    key: `${trip.id ?? trip.IdViaje}-${participant.id}`,
    nombreCompleto: participant.nombreCompleto,
    fotoUrl: participant.fotoUrl,
  }));

  return {
    ...trip,
    title: trip.title || trip.Titulo || "Viaje sin nombre",
    destination: destinationLabel,
    status: (trip.status || trip.Estado || "activo").toLowerCase(),
    image: trip.image || null,
    dateLabel: formatDateRange(trip),
    participantsPreview: participantPreview,
    avatarOverflowLabel: participants.length > 4 ? `+${participants.length - 4}` : undefined,
    hasBudgetData: Boolean(trip.budgetLabel || trip.budget != null || trip.budgetProgress != null),
    budgetLabel:
      trip.budgetLabel ||
      (trip.budget != null && trip.currency ? `${trip.currency} ${Number(trip.budget).toLocaleString("es-AR")}` : null),
    budgetProgress: trip.budgetProgress ?? null,
  };
}

export default function HomeScreen({ navigation }) {

  const [trips, setTrips] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
  const { isTablet, isDesktop } = useResponsive();

  const loadData = useCallback(async () => {
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
  }, []);

  const loadNotificationBadge = useCallback(async () => {
      try {
        const [notificaciones, invitaciones] = await Promise.all([
          getNotifications().catch(() => []),
          getPendingInvitations().catch(() => []),
        ]);
        const unreadNotifs = notificaciones.filter((n) => n.leida === false).length;
        setNotificationBadgeCount(unreadNotifs + invitaciones.length);
      } catch {
        setNotificationBadgeCount(0);
      }
    }, []);
  
  // Se recarga cada vez que la pantalla vuelve a tener foco (por ejemplo, al
  // volver de aceptar/rechazar una invitación, o de expulsar/salir de un
  // viaje) para que ni la lista de viajes ni el badge queden desactualizados.
  useFocusEffect(
    useCallback(() => {
      loadData();
      loadNotificationBadge();
    }, [loadData, loadNotificationBadge])
  );

  useEffect(() => {
    let ws = null;
    let cancelado = false;

    async function conectarSocketUsuario() {
      try {
        const socketUrl = await getNotificationsSocketUrl();
        if (cancelado) return;
        
        ws = new WebSocket(socketUrl);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.tipo === "nueva_notificacion") {
              loadNotificationBadge();
            }
          } catch (e) {
            console.error("Error al parsear mensaje de notificación", e);
          }
        };
        ws.onerror = (error) => {
          console.log("Error en el WebSocket de notificaciones:", error);
        };
      } catch (err) {
        console.log("Error conectando WS de notificaciones:", err);
      }
    }

    conectarSocketUsuario();

    return () => {
      cancelado = true;
      if (ws) {
        ws.close();
      }
    };
  }, [loadNotificationBadge]);

  const decoratedTrips = useMemo(
    () => {
      const now = new Date();
      return trips
        .filter((trip) => {
          const endDateStr = trip.endDate || trip.FechaFin;
          if (!endDateStr) return true;
          const endDate = new Date(endDateStr);
          return endDate >= now;
        })
        .map((trip) => normalizeTrip(trip));
    },
    [trips]
  );

  const metrics = useMemo(() => {
    const countries = new Set();
    const companionIds = new Set();

    decoratedTrips.forEach((trip) => {
      (trip.destinations || []).forEach((destination) => {
        if (destination.country) {
          countries.add(destination.country);
        }
      });

      (trip.participants || []).forEach((participant) => {
        if (participant.id && participant.id !== currentUser?.id) {
          companionIds.add(participant.id);
        }
      });
    });
    
    return {
      viajes: decoratedTrips.length,
      companeros: companionIds.size,
      paises: countries.size,
    };
  }, [currentUser?.id, decoratedTrips]);

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.topRow}>
            <View>
              <Text style={styles.greeting}>Bienvenida de vuelta,</Text>
              <Text style={styles.heading}>
                {currentUser?.nombre || currentUser?.nombreCompleto?.split(" ")[0] || "Viajera"} ✈︎
              </Text>
            </View>
            <View style={styles.headerActions}>
              <IconCircleButton
                icon="bell"
                tone="primary"
                badgeCount={notificationBadgeCount}
                accessibilityLabel="Notificaciones"
                onPress={() => navigation.navigate("Invitaciones")}
              />
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
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  greeting: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 16,
  },
  heading: {
    ...textStyles.screenTitle,
    color: colors.primary,
    marginTop: spacing.xxs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
    color: colors.textMuted,
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