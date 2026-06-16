import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useMemo } from "react";
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
import ParticipantSearch from "../components/trip/ParticipantSearch";
import ParticipantList from "../components/trip/ParticipantList";

import { getTripById, getUsers } from "../services/api";
import { colors, radii, spacing, typography, shadows } from "../theme/tokens";

const STATUS_LABEL = {
  activo: "Activo",
  finalizado: "Finalizado",
};

function normalizeTrip(raw) {
  if (!raw) return raw;
  return {
    id: raw.id ?? null,
    title: raw.title ?? "",
    destination: raw.destination ?? "",
    description: raw.description ?? "",
    status: raw.status ?? "",
    currency: raw.currency ?? "",
    startDate: raw.startDate ?? "",
    endDate: raw.endDate ?? "",
    budget: raw.budget ?? null,
    participants_count: raw.participants_count ?? null,
    owner_name: raw.owner_name ?? "",
    participantUserIds: raw.participantUserIds ?? [],
    invitedEmails: raw.invitedEmails ?? [],
    participants: raw.participants ?? [] 
  };
}

function formatDateRange(trip) {
  if (!trip.startDate || !trip.endDate) return "Fechas por definir";
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Fechas por definir";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(start) + " — " + new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
}

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1200&q=80";

export default function TripDetailScreen({ route, navigation }) {
  const { trip: rawInitialTrip } = route.params;
  const initialTrip = normalizeTrip(rawInitialTrip);

  const [trip, setTrip] = useState(initialTrip);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estado para controlar la sub-pantalla o pestaña activa (Como en image_cff242.png)
  const [activeTab, setActiveTab] = useState("itinerario");

  // Estados locales para el buscador de participantes
  const [participantSearch, setParticipantSearch] = useState("");
  const [userOptions, setUserOptions] = useState([]);

  useEffect(() => {
    async function loadDetail() {
      try {
        const raw = await getTripById(initialTrip.id);
        setTrip(normalizeTrip(raw));
      } catch (err) {
        setError("No se pudo actualizar la información del viaje.");
        console.warn("[TripDetail] getTripById error:", err?.message ?? err);
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [initialTrip.id]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!participantSearch.trim()) {
        setUserOptions([]);
        return;
      }
      try {
        const users = await getUsers(participantSearch, 8);
        setUserOptions(users);
      } catch {
        setUserOptions([]);
      }
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [participantSearch]);

  function handleBack() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (Platform.OS === "web" && typeof window !== "undefined") {
      window.history.back();
    } else {
      navigation.navigate("Tabs");
    }
  }

  const normalizedSearch = participantSearch.trim().toLowerCase();
  
  const selectableUsers = useMemo(() => {
    return userOptions.filter((user) => !trip.participantUserIds.includes(user.id));
  }, [trip.participantUserIds, userOptions]);

  const canInviteExternal = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedSearch)) return false;
    if (trip.invitedEmails.includes(normalizedSearch)) return false;
    return !selectableUsers.some((u) => u.email.toLowerCase() === normalizedSearch);
  }, [normalizedSearch, trip.invitedEmails, selectableUsers]);

  const participantItems = useMemo(() => {
    const registered = (trip.participants || []).map((user) => ({
      key: `user-${user.id}`,
      kind: "registered",
      id: user.id,
      nombreCompleto: user.nombreCompleto || user.name,
      email: user.email,
      fotoUrl: user.fotoUrl ?? ""
    }));

    const invited = (trip.invitedEmails || []).map((email) => ({
      key: `external-${email}`,
      kind: "external",
      email,
      nombreCompleto: email.split("@")[0],
      fotoUrl: ""
    }));

    return [...registered, ...invited];
  }, [trip.participants, trip.invitedEmails]);

  function handleAddParticipant(user) {
    setTrip(prev => ({
      ...prev,
      participantUserIds: [...prev.participantUserIds, user.id],
      participants: [...(prev.participants || []), user]
    }));
    setParticipantSearch("");
  }

  function handleAddExternalInvite() {
    if (!canInviteExternal) return;
    setTrip(prev => ({
      ...prev,
      invitedEmails: [...prev.invitedEmails, normalizedSearch]
    }));
    setParticipantSearch("");
  }

  function handleRemoveParticipant(participant) {
    if (participant.kind === "external") {
      setTrip(prev => ({
        ...prev,
        invitedEmails: prev.invitedEmails.filter(e => e !== participant.email)
      }));
    } else {
      setTrip(prev => ({
        ...prev,
        participantUserIds: prev.participantUserIds.filter(id => id !== participant.id),
        participants: prev.participants.filter(p => p.id !== participant.id)
      }));
    }
  }

  const statusKey = trip.status?.toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? trip.status ?? "";
  const dateLabel = formatDateRange(trip);
  const heroImage = rawInitialTrip.image ?? FALLBACK_IMAGE;

  // Listado de pestañas idéntico al menú de Figma
  const tabs = [
    { id: "itinerario", label: "Itinerario", icon: "calendar-day" },
    { id: "gastos", label: "Gastos", icon: "wallet" },
    { id: "docs", label: "Docs", icon: "folder-open" },
    { id: "votar", label: "Votar", icon: "square-poll-horizontal" },
    { id: "checklists", label: "Checklists", icon: "list-check" },
    { id: "participantes", label: "Grupo", icon: "users" },
  ];

  return (
    <ScreenContainer>
      {/* Hero Header con Banner de Imagen */}
      <ImageBackground imageStyle={styles.heroImage} source={{ uri: heroImage }} style={styles.hero}>
        <LinearGradient colors={["transparent", "rgba(10,20,50,0.9)"]} style={styles.heroGradient}>
          <Pressable onPress={handleBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <FontAwesome6 color={colors.surface} name="arrow-left" size={16} />
          </Pressable>

          <View style={styles.heroContent}>
            {statusLabel ? (
              <View style={styles.pillWrap}>
                <StatusPill tone={statusKey}>{statusLabel}</StatusPill>
              </View>
            ) : null}
            <Text style={styles.heroTitle}>{trip.title || "Sin nombre"}</Text>
            <Text style={styles.heroSubtitle}>{trip.destination} · {dateLabel}</Text>
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* BARRA HORIZONTAL DE SUB-PESTAÑAS (Mockup Cyanea) */}
      <View style={styles.tabBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <FontAwesome6
                  name={t.icon}
                  size={14}
                  color={isActive ? colors.surface : colors.textSecondary}
                  style={styles.tabIcon}
                />
                <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* SECCIÓN DE CONTENIDOS DINÁMICOS */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {error && (
            <View style={styles.errorBanner}>
              <FontAwesome6 color={colors.warning ?? "#b45309"} name="triangle-exclamation" size={14} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* ================= PESTAÑA: ITINERARIO ================= */}
          {activeTab === "itinerario" && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📍 Itinerario de actividades</Text>
              <Text style={styles.descriptionText}>
                {trip.description || "No hay una descripción cargada para el recorrido general."}
              </Text>
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>Día 1: Arribo a {trip.destination || "Destino"}</Text>
              </View>
            </View>
          )}

          {/* ================= PESTAÑA: GASTOS (CON TU BOTÓN CONECTADO) ================= */}
          {activeTab === "gastos" && (
            <View style={styles.containerGastosTab}>
              
              {/* Tarjeta de Control y Acción de Gastos */}
              <View style={styles.card}>
                <View style={styles.gastosHeaderRow}>
                  <View style={{ flex: 1, paddingRight: spacing.sm }}>
                    <Text style={styles.sectionTitle}>💰 Finanzas y Cuentas</Text>
                    <Text style={styles.descriptionText}>Moneda base del viaje: {trip.currency}</Text>
                  </View>
                  
                  {/* BOTÓN DE CONTROL DE NAVEGACIÓN HACIA ADDGASTOSCREEN */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.addGastoButton,
                      pressed && styles.addGastoButtonPressed
                    ]}
                    onPress={() => navigation.navigate("AddGasto", { IdViaje: trip.id })}
                  >
                    <FontAwesome6 name="plus" size={12} color={colors.surface} />
                    <Text style={styles.addGastoButtonText}>Agregar</Text>
                  </Pressable>
                </View>
              </View>

              {/* Contenedor histórico de Recibos/Balances */}
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Balances Generales</Text>
                <View style={styles.placeholderBox}>
                  <FontAwesome6 name="scale-balanced" size={22} color={colors.textMuted} style={{ marginBottom: 8 }} />
                  <Text style={styles.placeholderText}>Todo en orden. No hay cuentas pendientes que saldar.</Text>
                </View>
              </View>
            </View>
          )}

          {/* ================= PESTAÑA: DOCUMENTOS ================= */}
          {activeTab === "docs" && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📂 Archivos y Reservas</Text>
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>Espacio de almacenamiento en desarrollo.</Text>
              </View>
            </View>
          )}

          {/* ================= PESTAÑA: VOTACIONES ================= */}
          {activeTab === "votar" && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>🗳️ Tomar Decisiones</Text>
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>Las encuestas grupales aparecerán aquí.</Text>
              </View>
            </View>
          )}

          {/* ================= PESTAÑA: CHECKLISTS ================= */}
          {activeTab === "checklists" && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>✅ Listas de Control</Text>
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>Armado de valijas, compras conjuntas, etc.</Text>
              </View>
            </View>
          )}

          {/* ================= PESTAÑA: PARTICIPANTES / GRUPO ================= */}
          {activeTab === "participantes" && (
            <View style={styles.containerGastosTab}>
              <Text style={styles.sectionTitle}>👥 Comunidad de Viajeros</Text>
              
              <View style={styles.card}>
                <ParticipantSearch
                  canInviteExternal={canInviteExternal}
                  message=""
                  onInviteExternal={handleAddExternalInvite}
                  onSearchChange={setParticipantSearch}
                  onSelectUser={handleAddParticipant}
                  search={participantSearch}
                  suggestions={selectableUsers}
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>Lista de miembos aceptados ({participantItems.length})</Text>
                <ParticipantList onRemove={handleRemoveParticipant} participants={participantItems} />
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 220,
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
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  backButtonPressed: {
    backgroundColor: "rgba(0,0,0,0.55)",
    transform: [{ scale: 0.96 }],
  },
  heroContent: {
    gap: spacing.xs,
  },
  pillWrap: {
    alignSelf: "flex-start",
  },
  heroTitle: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: "#dfe6f5",
    fontSize: typography.small,
  },
  tabBarContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    marginTop: spacing.md,
    padding: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBar: {
    flexDirection: "row",
    gap: 4,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    ...shadows.card,
  },
  tabIcon: {
    marginRight: 6,
  },
  tabButtonText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: typography.small,
  },
  tabButtonTextActive: {
    color: colors.surface,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xl,
  },
  body: {
    paddingTop: spacing.sm,
    gap: spacing.md,
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
  cardLabel: {
    color: colors.textSecondary,
    fontSize: typography.micro,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: "900",
    fontSize: 17,
  },
  descriptionText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  containerGastosTab: {
    gap: spacing.md,
  },
  gastosHeaderRow: {
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center"
  },
  addGastoButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    ...shadows.card
  },
  addGastoButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }]
  },
  addGastoButtonText: {
    color: colors.surface,
    fontWeight: "900",
    fontSize: 13
  },
  placeholderBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    marginTop: 4,
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: "600",
    textAlign: "center"
  },
});