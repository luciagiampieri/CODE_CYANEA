import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import ParticipantList from "../components/trip/ParticipantList";
import AvatarStack from "../components/ui/AvatarStack";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  addTripParticipant,
  getTripDetail,
  getUsers,
  removeTripExternalInvitation,
  removeTripParticipant,
} from "../services/api";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

const itineraryDays = [
  {
    id: 1,
    title: "Llegada a Santorini",
    date: "12 jul",
    items: [
      { time: "11:30", icon: "plane", title: "Vuelo MAD → ATH → JTR", note: "Vueling VY1234" },
      { time: "15:00", icon: "hospital", title: "Check-in Casa Caldera", note: "Calle Oia 14, Fira" },
      { time: "20:00", icon: "utensils", title: "Cena en Argo Restaurant", note: "Reserva a nombre de Lucía" },
    ],
  },
  { id: 2, title: "Oia y el volcán", date: "13 jul", items: [] },
  { id: 3, title: "Día libre · Playas", date: "14 jul", items: [] },
  { id: 4, title: "Ferry a Mykonos", date: "15 jul", items: [] },
];

const tabs = [
  { id: "itinerario", label: "Itinerario", icon: "map" },
  { id: "gastos", label: "Gastos", icon: "sack-dollar" },
  { id: "docs", label: "Docs", icon: "folder" },
  { id: "votar", label: "Votar", icon: "square-poll-horizontal" },
  { id: "grupo", label: "Grupo", icon: "users" },
];

function normalizeTrip(raw) {
  if (!raw) return null;
  return {
    id: raw.id ?? raw.IdViaje ?? null,
    title: raw.title ?? raw.Titulo ?? "Viaje sin nombre",
    destination: raw.destination ?? raw.Destino ?? "Destino",
    description: raw.description ?? raw.Descripcion ?? "",
    status: (raw.status ?? raw.Estado ?? "activo").toLowerCase(),
    currency: raw.currency ?? raw.Moneda ?? "EUR",
    startDate: raw.startDate ?? raw.FechaInicio ?? "",
    endDate: raw.endDate ?? raw.FechaFin ?? "",
    participantUserIds: raw.participantUserIds ?? [],
    invitedEmails: raw.invitedEmails ?? [],
    participants: raw.participants ?? [],
    externalInvitations: raw.externalInvitations ?? [],
    admin: raw.admin ?? null,
    image:
      raw.image ??
      "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1400&q=80",
  };
}

function formatHeroDate(trip) {
  if (!trip.startDate || !trip.endDate) return "Fechas por definir";
  const start = new Date(trip.startDate);
  const end = new Date(trip.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Fechas por definir";
  const formatter = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} · ${formatter.format(end)}`;
}

export default function TripDetailScreen({ navigation, route }) {
  const initialTrip = normalizeTrip(route.params?.trip);
  const [trip, setTrip] = useState(initialTrip);
  const [activeTab, setActiveTab] = useState("itinerario");
  const [participantSearch, setParticipantSearch] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutatingParticipants, setMutatingParticipants] = useState(false);
  const [participantMessage, setParticipantMessage] = useState("");

  async function loadTripDetail() {
    if (!initialTrip?.id) {
      setLoading(false);
      setLoadError("No se pudo resolver el viaje.");
      return;
    }

    try {
      setLoading(true);
      setLoadError("");
      const detail = await getTripDetail(initialTrip.id);
      setTrip((current) => ({
        ...normalizeTrip(detail),
        image: current?.image ?? initialTrip.image,
      }));
    } catch (error) {
      setLoadError(error.message || "No se pudo cargar el detalle del viaje.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTripDetail();
  }, [initialTrip?.id]);

  useEffect(() => {
    if (!trip) return;
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
  }, [participantSearch, trip]);

  const normalizedSearch = participantSearch.trim().toLowerCase();

  const selectableUsers = useMemo(
    () => userOptions.filter((user) => !trip.participantUserIds.includes(user.id)),
    [trip.participantUserIds, userOptions]
  );

  const canInviteExternal = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedSearch)) return false;
    if (trip.invitedEmails.includes(normalizedSearch)) return false;
    return !selectableUsers.some((user) => user.email.toLowerCase() === normalizedSearch);
  }, [normalizedSearch, selectableUsers, trip.invitedEmails]);

  const participantItems = useMemo(() => {
    const registered = (trip.participants || []).map((user) => ({
      key: `user-${user.id}`,
      kind: "registered",
      id: user.id,
      nombreCompleto: user.nombreCompleto || user.name,
      email: user.email,
      fotoUrl: user.fotoUrl ?? "",
    }));

    const invited = (trip.externalInvitations || []).map((invitation) => ({
      key: `invite-${invitation.email}`,
      kind: "external",
      nombreCompleto: invitation.email.split("@")[0],
      email: invitation.email,
      fotoUrl: "",
      status: invitation.status,
    }));

    return [...registered, ...invited];
  }, [trip.externalInvitations, trip.participants]);

  function handleAddParticipant(user) {
    persistAddParticipant({ userId: user.id });
  }

  function handleAddExternalInvite() {
    if (!canInviteExternal) return;
    persistAddParticipant({ email: normalizedSearch });
  }

  async function persistAddParticipant(payload) {
    try {
      setMutatingParticipants(true);
      setParticipantMessage("");
      await addTripParticipant(trip.id, payload);
      setParticipantSearch("");
      setUserOptions([]);
      await loadTripDetail();
    } catch (error) {
      setParticipantMessage(error.message || "No se pudo agregar el participante.");
    } finally {
      setMutatingParticipants(false);
    }
  }

  async function handleRemoveParticipant(participant) {
    try {
      setMutatingParticipants(true);
      setParticipantMessage("");
      if (participant.kind === "external") {
        await removeTripExternalInvitation(trip.id, participant.email);
      } else {
        await removeTripParticipant(trip.id, participant.id);
      }
      await loadTripDetail();
    } catch (error) {
      setParticipantMessage(error.message || "No se pudo quitar el participante.");
    } finally {
      setMutatingParticipants(false);
    }
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ImageBackground imageStyle={styles.heroImage} source={{ uri: trip.image }} style={styles.hero}>
          <LinearGradient colors={["rgba(4,16,36,0.15)", "rgba(9,19,45,0.82)"]} style={styles.heroGradient}>
            <View style={styles.heroActions}>
              <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <IconCircleButton icon="ellipsis-vertical" onPress={() => {}} />
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.heroMeta}>{formatHeroDate(trip)} · {Math.max(8, participantItems.length || 8)} personas</Text>
              <Text style={styles.heroTitle}>{trip.title}</Text>
              <Text style={styles.heroSubtitle}>{trip.destination}</Text>
              <View style={styles.heroFooter}>
                <AvatarStack
                  max={4}
                  overflowLabel="+5"
                  participants={
                    participantItems.length > 0
                      ? participantItems
                      : [
                          { id: 1, nombreCompleto: "Lucía Giampieri" },
                          { id: 2, nombreCompleto: "Candela Páez" },
                          { id: 3, nombreCompleto: "Ticiana Gatica" },
                          { id: 4, nombreCompleto: "Luciano Correa" },
                        ]
                  }
                  size={34}
                />
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabButton, active && styles.tabButtonActive]}
              >
                <FontAwesome6 color={active ? colors.accent : colors.primary} name={tab.icon} size={12} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.body}>
          {loadError ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>No se pudo cargar el viaje</Text>
              <Text style={styles.sectionCopy}>{loadError}</Text>
            </View>
          ) : null}
          {activeTab === "itinerario" ? (
            itineraryDays.map((day, index) => (
              <View key={day.id} style={[styles.dayCard, index !== 0 && styles.dayCardCompact]}>
                <View style={styles.dayHeader}>
                  <View style={[styles.dayIndex, index === 0 && styles.dayIndexActive]}>
                    <Text style={[styles.dayIndexText, index === 0 && styles.dayIndexTextActive]}>{day.id}</Text>
                  </View>
                  <View style={styles.dayTitleWrap}>
                    <Text style={styles.dayTitle}>{day.title}</Text>
                    <Text style={styles.daySubtitle}>{day.date}</Text>
                  </View>
                  <FontAwesome6 color={colors.textSecondary} name={index === 0 ? "chevron-up" : "chevron-down"} size={14} />
                </View>

                {index === 0 ? (
                  <View style={styles.dayAgenda}>
                    {day.items.map((item) => (
                      <View key={`${day.id}-${item.time}-${item.title}`} style={styles.agendaItem}>
                        <View style={styles.agendaIcon}>
                          <FontAwesome6 color={colors.primary} name={item.icon} size={14} />
                        </View>
                        <View style={styles.agendaContent}>
                          <Text style={styles.agendaTime}>{item.time}</Text>
                          <Text style={styles.agendaTitle}>{item.title}</Text>
                          <Text style={styles.agendaNote}>{item.note}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          ) : null}

          {activeTab === "gastos" ? (
            <View style={styles.sectionStack}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Gastos del viaje</Text>
                <Text style={styles.sectionCopy}>Moneda base: {trip.currency}. Puedes cargar nuevos gastos o revisar el balance del grupo.</Text>
                <PrimaryButton
                  icon="plus"
                  iconPosition="left"
                  label="Agregar gasto"
                  onPress={() => navigation.navigate("AddGasto", { IdViaje: trip.id, Moneda: trip.currency })}
                  style={styles.fullButton}
                />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionHeading}>Balance general</Text>
                <Text style={styles.sectionCopy}>Todavía no hay desbalances importantes para resolver.</Text>
              </View>
            </View>
          ) : null}

          {activeTab === "docs" ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Documentos</Text>
              <Text style={styles.sectionCopy}>Reservas, vouchers y archivos del viaje aparecerán aquí.</Text>
            </View>
          ) : null}

          {activeTab === "votar" ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Votaciones</Text>
              <Text style={styles.sectionCopy}>Las decisiones del grupo y las encuestas se integrarán en esta sección.</Text>
            </View>
          ) : null}

          {activeTab === "grupo" ? (
            <View style={styles.sectionStack}>
              <View style={styles.sectionCard}>
                <ParticipantSearch
                  canInviteExternal={canInviteExternal}
                  message={participantMessage}
                  onInviteExternal={handleAddExternalInvite}
                  onSearchChange={setParticipantSearch}
                  onSelectUser={handleAddParticipant}
                  search={participantSearch}
                  suggestions={selectableUsers}
                />
              </View>
              <View style={styles.sectionCard}>
                <ParticipantList onRemove={handleRemoveParticipant} participants={participantItems} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {mutatingParticipants ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 132,
  },
  hero: {
    minHeight: 300,
  },
  heroImage: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  heroGradient: {
    minHeight: 300,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    justifyContent: "space-between",
  },
  heroActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroContent: {
    marginTop: spacing.xxxl,
  },
  heroMeta: {
    ...textStyles.meta,
    color: "#dde7fb",
    fontSize: 15,
  },
  heroTitle: {
    ...textStyles.screenTitle,
    color: colors.textInverse,
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    ...textStyles.body,
    color: "#f1f6ff",
    marginTop: spacing.xxs,
  },
  heroFooter: {
    marginTop: spacing.lg,
  },
  tabBar: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: radii.sm,
    minWidth: 68,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...textStyles.nav,
    color: colors.textSecondary,
    fontSize: 11,
  },
  tabTextActive: {
    color: colors.accent,
  },
  body: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247,242,232,0.35)",
    zIndex: 10,
  },
  dayCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  dayCardCompact: {
    paddingVertical: spacing.md,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayIndex: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  dayIndexActive: {
    backgroundColor: colors.primary,
  },
  dayIndexText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  dayIndexTextActive: {
    color: colors.textInverse,
  },
  dayTitleWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  dayTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 18,
  },
  daySubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  dayAgenda: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  agendaItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  agendaIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  agendaContent: {
    flex: 1,
  },
  agendaTime: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  agendaTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 17,
    marginTop: spacing.xxs,
  },
  agendaNote: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  sectionStack: {
    gap: spacing.md,
  },
  sectionCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  sectionHeading: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  sectionCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  fullButton: {
    marginTop: spacing.lg,
  },
});
