import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import StatusPill from "../components/ui/StatusPill";
import { getTripById } from "../services/api";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";

const STATUS_LABEL = {
  activo: "Activo",
  finalizado: "Finalizado",
};

// El backend devuelve exactamente: id, title, destination, status,
// currency, startDate, endDate  (ver TripRead schema y GET /trips/{id}).
// Para el trip que viene del listado (initialTrip) los campos son los mismos
// porque list_trips usa el mismo TripRead.
function normalizeTrip(raw) {
  if (!raw) return raw;
  return {
    id:          raw.id          ?? null,
    title:       raw.title       ?? "",
    destination: raw.destination ?? "",
    description: raw.description ?? "",   // null si no hay descripción
    status:      raw.status      ?? "",
    currency:    raw.currency    ?? "",
    startDate:   raw.startDate   ?? "",
    endDate:     raw.endDate     ?? "",
    // campos opcionales que el backend podría agregar en el futuro
    budget:             raw.budget             ?? null,
    participants_count: raw.participants_count ?? null,
    owner_name:         raw.owner_name         ?? "",
  };
}

function formatDateRange(trip) {
  const startDateStr = trip.startDate;
  const endDateStr   = trip.endDate;

  if (!startDateStr || !endDateStr) return "Fechas por definir";

  const start = new Date(startDateStr);
  const end   = new Date(endDateStr);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return "Fechas por definir";

  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(start)} — ${formatter.format(end)}`;
}

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80";

export default function TripDetailScreen({ route, navigation }) {
  const { trip: rawInitialTrip } = route.params;
  const initialTrip = normalizeTrip(rawInitialTrip);

  const [trip, setTrip]       = useState(initialTrip);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function loadDetail() {
      try {
        const raw  = await getTripById(initialTrip.id);
        const data = normalizeTrip(raw);
        setTrip(data);
      } catch (err) {
        // Queda con los datos del listado; mostramos aviso no bloqueante
        setError("No se pudo actualizar la información del viaje.");
        console.warn("[TripDetail] getTripById error:", err?.message ?? err);
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [initialTrip.id]);

  // En Expo Web no siempre hay historial de navegación React Navigation,
  // así que usamos window.history como fallback.
  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.back();
    } else {
      navigation.navigate("Tabs");
    }
  }

  const statusKey  = trip.status?.toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? trip.status ?? "";
  const dateLabel  = formatDateRange(trip);
  const heroImage  = rawInitialTrip.image ?? FALLBACK_IMAGE;

  return (
    <ScreenContainer>
      {/* Hero con imagen */}
      <ImageBackground
        imageStyle={styles.heroImage}
        source={{ uri: heroImage }}
        style={styles.hero}
      >
        <LinearGradient
          colors={["transparent", "rgba(10,20,50,0.85)"]}
          style={styles.heroGradient}
        >
          {/* Botón volver — siempre visible, fuera del scroll */}
          <Pressable
            accessibilityLabel="Volver al listado"
            accessibilityRole="button"
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <FontAwesome6 color={colors.surface} name="arrow-left" size={16} />
          </Pressable>

          <View style={styles.heroContent}>
            {statusLabel ? (
              <View style={styles.pillWrap}>
                <StatusPill tone={statusKey}>{statusLabel}</StatusPill>
              </View>
            ) : null}
            <Text style={styles.heroTitle}>
              {trip.title || "Sin nombre"}
            </Text>
            {trip.destination ? (
              <Text style={styles.heroSubtitle}>{trip.destination}</Text>
            ) : null}
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* Cuerpo */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBanner}>
              <FontAwesome6
                color={colors.warning ?? "#b45309"}
                name="triangle-exclamation"
                size={14}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Fechas */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <FontAwesome6
                color={colors.primary}
                name="calendar-days"
                size={16}
              />
              <View style={styles.cardRowContent}>
                <Text style={styles.cardLabel}>Fechas</Text>
                <Text style={styles.cardValue}>{dateLabel}</Text>
              </View>
            </View>
          </View>

          {/* Descripción */}
          {trip.description ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text style={styles.descriptionText}>{trip.description}</Text>
            </View>
          ) : null}

          {/* Datos adicionales */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Información del viaje</Text>

            <InfoRow icon="hashtag" label="ID" value={String(trip.id)} />

            {trip.budget != null ? (
              <InfoRow
                icon="coins"
                label="Presupuesto"
                value={`$${trip.budget}`}
              />
            ) : null}

            {trip.participants_count != null ? (
              <InfoRow
                icon="users"
                label="Participantes"
                value={String(trip.participants_count)}
              />
            ) : null}

            {trip.owner_name ? (
              <InfoRow
                icon="user-tie"
                label="Organizador"
                value={trip.owner_name}
              />
            ) : null}
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <FontAwesome6
        color={colors.textSecondary}
        name={icon}
        size={13}
        style={styles.infoIcon}
      />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 280,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  heroImage: {
    borderRadius: radii.lg,
  },
  heroGradient: {
    flex: 1,
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.40)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    // Sombra para que destaque sobre imágenes claras
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backButtonPressed: {
    backgroundColor: "rgba(0,0,0,0.60)",
    transform: [{ scale: 0.93 }],
  },
  heroContent: {
    gap: spacing.xs,
  },
  pillWrap: {
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: colors.surface,
    fontSize: typography.hero ?? 28,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: "#dfe6f5",
    fontSize: typography.body,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xl,
  },
  body: {
    paddingTop: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fef3c7",
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: {
    color: "#92400e",
    fontSize: typography.small,
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  cardRowContent: {
    flex: 1,
    gap: spacing.xs,
  },
  cardLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  cardValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  sectionTitle: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: typography.small,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  descriptionText: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 20,
    textAlign: "center",
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    flex: 1,
  },
  infoValue: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: typography.small,
  },
});