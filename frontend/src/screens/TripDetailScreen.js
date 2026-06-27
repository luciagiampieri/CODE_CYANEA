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

import { getTripParticipants, getExpenseCategories } from "../services/api";
import {
  guardarParticipantesEnCache,
  guardarCategoriasEnCache,
} from "../database/gastosLocal";


const mockVotaciones = [
  {
    IdVotacion: 101,
    Titulo: "¿Qué almorzamos el segundo día en Buenos Aires?",
    Tipo: "opcion_unica",
    FechaCierre: "2026-12-31T23:59:59Z", // Votación activa
    YaVoto: false,
    Propuestas: [
      { IdPropuesta: 1, Texto: "Pizzería Güerrín" },
      { IdPropuesta: 2, Texto: "Mercado de San Telmo" },
      { IdPropuesta: 3, Texto: "Bodegón El Preferido" }
    ]
  },
  {
    IdVotacion: 102,
    Titulo: "¿Qué actividades grupales quieren hacer?",
    Tipo: "opcion_multiple",
    FechaCierre: "2026-12-31T23:59:59Z", // Votación activa
    YaVoto: false,
    Propuestas: [
      { IdPropuesta: 4, Texto: "Paseo en el Bus Turístico" },
      { IdPropuesta: 5, Texto: "Visita guiada al Teatro Colón" },
      { IdPropuesta: 6, Texto: "Noche de San Telmo y Jazz" }
    ]
  },
  {
    IdVotacion: 103,
    Titulo: "Elegir transporte al hotel",
    Tipo: "opcion_unica",
    FechaCierre: "2026-05-01T12:00:00Z", // Votación cerrada (Fecha pasada)
    YaVoto: false,
    Propuestas: [
      { IdPropuesta: 7, Texto: "Uber corporativo entre todos" },
      { IdPropuesta: 8, Texto: "Colectivo / Subte" }
    ]
  }
];

const tabs = [
  { id: "itinerario", label: "Itinerario", icon: "map" },
  { id: "gastos", label: "Gastos", icon: "sack-dollar" },
  { id: "docs", label: "Docs", icon: "folder" },
  { id: "votar", label: "Votar", icon: "check-to-slot" },
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
    cronograma: raw.cronograma ?? raw.Cronograma ?? raw.dias ?? [],
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

function formatDayDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const formattedDate = new Intl.DateTimeFormat("es-AR", {
    weekday: "long", 
    day: "2-digit",   
    month: "long",
    timeZone: "UTC"
  }).format(date);

  return formattedDate.replace(/(\p{L})\p{L}*/gu, (word) => word.charAt(0).toLocaleUpperCase("es-AR") + word.slice(1).toLocaleLowerCase("es-AR"));
}

export default function TripDetailScreen({ navigation, route }) {
  const initialTrip = normalizeTrip(route.params?.trip);
  const [trip, setTrip] = useState(initialTrip);
  const [activeTab, setActiveTab] = useState("itinerario");
  const [expandedDayId, setExpandedDayId] = useState(initialTrip?.cronograma[0]?.IdDiaCronograma ?? initialTrip?.cronograma[0]?.id ?? null);
  const [votacionesActivas, setVotacionesActivas] = useState(mockVotaciones);
  const [votosSeleccionados, setVotosSeleccionados] = useState({});
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

useEffect(() => {
    async function precargarDatosOffline() {
      if (!trip?.id) return;
      
      try {
        const [participantes, categorias] = await Promise.all([
          getTripParticipants(trip.id),
          getExpenseCategories(),
        ]);
        
        guardarParticipantesEnCache(trip.id, participantes);
        guardarCategoriasEnCache(categorias);
        console.log("Datos offline del viaje precargados correctamente.");
        
        if (participantes) {
          setTrip((prev) => ({
            ...prev,
            participants: prev?.participants?.length ? prev.participants : participantes,
            participantUserIds: prev?.participantUserIds?.length
              ? prev.participantUserIds
              : participantes.map((p) => p.id ?? p.IdUsuario ?? p.Id),
          }));
        }
      
      } catch (error) {
        console.log("No se pudieron precargar datos offline del viaje:", error);
      }
    }
    precargarDatosOffline();
  }, [trip?.id]);

  const normalizedSearch = participantSearch.trim().toLowerCase();

  const selectableUsers = useMemo(() => {
    if (!trip) return [];
    return userOptions.filter((user) => !trip.participantUserIds.includes(user.id));
  }, [trip, userOptions]);

  const canInviteExternal = useMemo(() => {
    if (!trip) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedSearch)) return false;
    if (trip.invitedEmails.includes(normalizedSearch)) return false;
    return !selectableUsers.some((user) => user.email.toLowerCase() === normalizedSearch);
  }, [normalizedSearch, selectableUsers, trip]);

  const participantItems = useMemo(() => {
    if (!trip) return [];
    const registered = (trip.participants || []).map((user) => {
      const nombreCompleto = user.nombreCompleto || user.name || 
        (user.Nombre && user.Apellido ? `${user.Nombre} ${user.Apellido}` : null) || 
        user.Nombre || "Usuario";

      return {
        key: `user-${user.id ?? user.IdUsuario}`,
        kind: "registered",
        id: user.id ?? user.IdUsuario,
        nombreCompleto: nombreCompleto,
        email: user.email ?? user.Email,
        fotoUrl: user.fotoUrl ?? user.FotoUrl ?? "",
      };
    });

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
    if (!trip?.id) return;
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
    if (!trip?.id) return;
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

  if (!trip && !loading) {
    return (
      <ScreenContainer fullWidth padded={false}>
        <View style={styles.body}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>No se pudo cargar el viaje</Text>
            <Text style={styles.sectionCopy}>
              {loadError || "No se encontró información para mostrar."}
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
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
              <Text style={styles.heroMeta}>{formatHeroDate(trip)} · {participantItems.length} {participantItems.length === 1 ? "persona" : "personas"}</Text>
              <Text style={styles.heroTitle}>{trip.title}</Text>
              <Text style={styles.heroSubtitle}>{trip.destination}</Text>
              <View style={styles.heroFooter}>
                <AvatarStack
                  max={4}
                  overflowLabel={participantItems.length > 4 ? `+${participantItems.length - 4}` : ""}
                  participants={participantItems}
                  size={34}
                />
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>

        <View style={styles.tabBar}>
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
        </View>

        <View style={styles.body}>
          {loadError ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>No se pudo cargar el viaje</Text>
              <Text style={styles.sectionCopy}>{loadError}</Text>
            </View>
          ) : null}
          {activeTab === "itinerario" ? (
            (() => {
              let diasAMostrar = [];

              if (trip.cronograma && trip.cronograma.length > 0) {
                diasAMostrar = trip.cronograma;
              } else if (trip.startDate && trip.endDate) {
                const inicio = new Date(`${trip.startDate}T12:00:00`);
                const fin = new Date(`${trip.endDate}T12:00:00`);
                
                if (!isNaN(inicio.getTime()) && !isNaN(fin.getTime())) {
                  const deiferenciaTiempo = fin.getTime() - inicio.getTime();
                  const totalDias = Math.ceil(deiferenciaTiempo / (1000 * 60 * 60 * 24)) + 1;

                  for (let i = 0; i < totalDias; i++) {
                    const fechaActual = new Date(inicio);
                    fechaActual.setDate(inicio.getDate() + i);
                    
                    const año = fechaActual.getFullYear();
                    const mes = String(fechaActual.getMonth() + 1).padStart(2, "0");
                    const dia = String(fechaActual.getDate()).padStart(2, "0");

                    diasAMostrar.push({
                      id: `fallback-day-${i + 1}`,
                      indiceDia: i + 1,
                      fecha: `${año}-${mes}-${dia}`,
                      actividades: []
                    });
                  }
                }
              }

              if (diasAMostrar.length > 0) {
                return diasAMostrar.map((day, index) => {
                  const dayId = day.id ?? day.IdDiaCronograma;
                  const dayIndex = day.indiceDia ?? day.IndiceDia ?? (index + 1);
                  const dayDateText = formatDayDate(day.fecha ?? day.Fecha);
                  const actividades = day.items ?? day.actividades ?? [];
                  const isExpanded = expandedDayId === dayId;

                  return (
                    <View key={dayId} style={[styles.dayCard, !isExpanded && styles.dayCardCompact]}>
                      <Pressable  
                        onPress={() => setExpandedDayId(isExpanded ? null : dayId)}
                        style={styles.dayHeader}
                      >
                        <View style={[styles.dayIndex, isExpanded && styles.dayIndexActive]}>
                          <Text style={[styles.dayIndexText, isExpanded && styles.dayIndexTextActive]}>
                            {dayIndex}
                          </Text>
                        </View>
                        <View style={styles.dayTitleWrap} >
                          <Text style={styles.dayTitle}>{dayDateText}</Text> 
                          <Text style={styles.daySubtitle}>Día {dayIndex} del viaje</Text>
                        </View>
                        <FontAwesome6 
                          color={colors.textSecondary} 
                          name={isExpanded ? "chevron-up" : "chevron-down"} 
                          size={14} 
                        />
                      </Pressable>

                      {isExpanded ? (
                        <View style={styles.dayAgenda}>
                          {actividades.length > 0 ? (
                            actividades.map((item, actIndex) => (
                              <View key={item.id ?? actIndex} style={styles.agendaItem}>
                                <View style={styles.agendaIcon}>
                                  <FontAwesome6 color={colors.primary} name={item.icon ?? "location-dot"} size={14} />
                                </View>
                                <View style={styles.agendaContent}>
                                  <Text style={styles.agendaTime}>{item.time ?? item.Hora ?? "---"}</Text>
                                  <Text style={styles.agendaTitle}>{item.title ?? item.Titulo}</Text>
                                  {item.note || item.Notas ? (
                                    <Text style={styles.agendaNote}>{item.note ?? item.Notas}</Text>
                                  ) : null}
                                </View>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.sectionCopy}>No hay actividades agendadas para este día todavía.</Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                });
              }

              return (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Fechas sin definir</Text>
                  <Text style={styles.sectionCopy}>Establece las fechas de ida y vuelta para estructurar el cronograma.</Text>
                </View>
              );
            })()
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
            <View style={styles.sectionStack}>
              {votacionesActivas.map((votacion) => {
                const esCerrada = new Date(votacion.FechaCierre) < new Date();
                const opcionesElegidas = votosSeleccionados[votacion.IdVotacion] || [];

                const togglePropuesta = (idPropuesta, tipo) => {
                  setVotosSeleccionados(prev => {
                    const actuales = prev[votacion.IdVotacion] || [];
                    if (tipo === "opcion_unica") {
                      return { ...prev, [votacion.IdVotacion]: [idPropuesta] };
                    } else {
                      return actuales.includes(idPropuesta)
                        ? { ...prev, [votacion.IdVotacion]: actuales.filter(id => id !== idPropuesta) }
                        : { ...prev, [votacion.IdVotacion]: [...actuales, idPropuesta] };
                    }
                  });
                };

                // Función interna para simular el envío del voto
                const registrarVoto = () => {
                  if (opcionesElegidas.length === 0) {
                    alert("Por favor, selecciona al menos una opción.");
                    return;
                  }
                  
                  alert("Voto registrado correctamente. ¡Gracias por participar!");
                  
                  setVotacionesActivas(prev => 
                    prev.map(v => v.IdVotacion === votacion.IdVotacion ? { ...v, YaVoto: true } : v)
                  );
                };

                return (
                  <View key={votacion.IdVotacion} style={styles.sectionCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[styles.sectionHeading, { fontSize: 18, flex: 1 }]}>{votacion.Titulo}</Text>
                      <View style={{ backgroundColor: votacion.Tipo === 'opcion_unica' ? '#e0f2fe' : '#f3e8ff', padding: 6, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: votacion.Tipo === 'opcion_unica' ? '#0369a1' : '#6b21a8' }}>
                          {votacion.Tipo === 'opcion_unica' ? 'ÚNICA' : 'MÚLTIPLE'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 15, gap: 10 }}>
                      {votacion.Propuestas.map((propuesta) => {
                        const marcada = opcionesElegidas.includes(propuesta.IdPropuesta);
                        return (
                          <Pressable
                            key={propuesta.IdPropuesta}
                            disabled={votacion.YaVoto || esCerrada}
                            onPress={() => togglePropuesta(propuesta.IdPropuesta, votacion.Tipo)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: 12,
                              borderWidth: 1,
                              borderColor: marcada ? colors.primary : colors.border,
                              borderRadius: radii.md,
                              backgroundColor: marcada ? '#f0f4f8' : colors.surface
                            }}
                          >
                            <View style={{
                              width: 18, height: 18, borderRadius: votacion.Tipo === 'opcion_unica' ? 9 : 4,
                              borderWidth: 2, borderColor: marcada ? colors.primary : colors.textMuted,
                              marginRight: 10, justifyContent: 'center', alignItems: 'center'
                            }}>
                              {marcada && <View style={{ width: 10, height: 10, borderRadius: votacion.Tipo === 'opcion_unica' ? 5 : 2, backgroundColor: colors.primary }} />}
                            </View>
                            <Text style={{ color: colors.textPrimary }}>{propuesta.Texto}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={{ marginTop: 15 }}>
                      {esCerrada ? (
                        <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>⚠️ Esta votación cerró por alcanzar su fecha límite.</Text>
                      ) : votacion.YaVoto ? (
                        <Text style={{ color: colors.success, fontWeight: '600', fontSize: 13 }}>✓ Ya registraste tu voto en esta decisión grupal.</Text>
                      ) : (
                        <PrimaryButton
                          label="Confirmar Voto"
                          onPress={registrarVoto}
                          style={{ marginTop: 5 }}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
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
    flexWrap: "nowrap",
    justifyContent: "space-between",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...textStyles.nav,
    fontSize: 10,
    color: colors.textSecondary,
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
