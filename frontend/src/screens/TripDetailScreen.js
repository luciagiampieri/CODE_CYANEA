import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import ParticipantList from "../components/trip/ParticipantList";
import AvatarStack from "../components/ui/AvatarStack";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  addTripParticipant,
  emitirVoto,
  getCurrentUser,
  getTripDetail,
  getItinerarySocketUrl,
  getVotaciones,
  getUsers,
  removeTripExternalInvitation,
  removeTripParticipant,
  deleteTrip,
} from "../services/api";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

import { getTripParticipants, getExpenseCategories } from "../services/api";
import {
  guardarParticipantesEnCache,
  guardarCategoriasEnCache,
} from "../database/gastosLocal";

import AddActivityScreen from "./AddActivityScreen";
import { createActivity } from "../services/api";


const tabs = [
  { id: "itinerario", label: "Itinerario", icon: "map" },
  { id: "gastos", label: "Gastos", icon: "sack-dollar" },
  { id: "docs", label: "Docs", icon: "folder" },
  { id: "votar", label: "Votar", icon: "check-to-slot" },
  { id: "grupo", label: "Grupo", icon: "users" },
];

function normalizeTrip(raw) {
  if (!raw) return null;
  const destinationNames =
    Array.isArray(raw.destinations) && raw.destinations.length > 0
      ? raw.destinations.map((d) => d.name ?? d.Nombre).filter(Boolean).join(", ")
      : raw.destination ?? raw.Destino ?? "Destino";

  return {
    id: raw.id ?? raw.IdViaje ?? null,
    title: raw.title ?? raw.Titulo ?? "Viaje sin nombre",
    destination: destinationNames,
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

function avisar(titulo, mensaje) {
  if (Platform.OS === "web") {
    window.alert(mensaje);
  } else {
    Alert.alert(titulo, mensaje);
  }
}

export default function TripDetailScreen({ navigation, route }) {
  const initialTrip = normalizeTrip(route.params?.trip);
  const [trip, setTrip] = useState(initialTrip);
  const [activeTab, setActiveTab] = useState("itinerario");
  const [expandedDayId, setExpandedDayId] = useState(initialTrip?.cronograma[0]?.IdDiaCronograma ?? initialTrip?.cronograma[0]?.id ?? null);
  const [votacionesActivas, setVotacionesActivas] = useState([]);
  const [loadingVotaciones, setLoadingVotaciones] = useState(false);
  const [votacionesError, setVotacionesError] = useState("");
  const [votandoId, setVotandoId] = useState(null);
  const [votosSeleccionados, setVotosSeleccionados] = useState({});
  const [participantSearch, setParticipantSearch] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutatingParticipants, setMutatingParticipants] = useState(false);
  const [participantMessage, setParticipantMessage] = useState("");
  const [activityModalDay, setActivityModalDay] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false); 
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
      } catch {
        setCurrentUser(null);
      }
    }
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const nueva = route.params?.nuevaVotacion;
    if (!nueva) return;
    setVotacionesActivas((prev) => [
      nueva,
      ...prev.filter((v) => v.IdVotacion !== nueva.IdVotacion),
    ]);
    navigation.setParams({ nuevaVotacion: undefined });
  }, [route.params?.nuevaVotacion]);

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
  if (!trip?.id) return;

  let socket = null;
  let reconnectTimeout = null;
  let cancelado = false;

  async function conectar() {
    if (cancelado) return;
    try {
      const url = await getItinerarySocketUrl(trip.id);
      socket = new WebSocket(url);

      socket.onmessage = () => {
        // No procesamos el contenido del mensaje: ante cualquier evento,
        // simplemente volvemos a pedir el detalle actualizado del viaje.
        // Es más simple y menos propenso a errores que mergear el estado
        // a mano, y el costo extra de red es insignificante para este caso.
        loadTripDetail();
      };

      socket.onclose = () => {
        if (!cancelado) {
          reconnectTimeout = setTimeout(conectar, 3000);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    } catch {
      if (!cancelado) {
        reconnectTimeout = setTimeout(conectar, 3000);
      }
    }
  }

  conectar();

  return () => {
    cancelado = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    socket?.close();
  };
}, [trip?.id]);

  async function loadVotaciones() {
    if (!trip?.id) return;
    try {
      setLoadingVotaciones(true);
      setVotacionesError("");
      const data = await getVotaciones(trip.id);
      setVotacionesActivas(data);
    } catch (error) {
      setVotacionesError(error.message || "No se pudieron cargar las votaciones.");
    } finally {
      setLoadingVotaciones(false);
    }
  }

  useEffect(() => {
    loadVotaciones();
  }, [trip?.id]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadTripDetail();
    });
    return unsubscribe;
  }, [navigation, initialTrip?.id]);

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


  const isAdmin = useMemo(() => {
    if (!currentUser || !trip?.admin) return false;
    return String(currentUser.id) === String(trip.admin.id);
  }, [currentUser, trip?.admin]);

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
  }, [trip?.externalInvitations, trip?.participants]);

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

  async function handleCreateActivity(payload) {
    if (!trip?.id || !activityModalDay) return;
    await createActivity(trip.id, activityModalDay.id, payload);
    await loadTripDetail();
  }

  async function handleConfirmDelete() {
    if (!trip?.id) return;
    try {
      setShowDeleteModal(false);
      setLoading(true);
      
      await deleteTrip(trip.id);

      setLoading(false);
      navigation.reset({
        index: 0,
        routes: [{ name: "Tabs" }], 
      });

      setTimeout(() => {
        Alert.alert(
          "Viaje dado de baja", 
          "El viaje ha sido eliminado correctamente."
        );
      }, 300);

    } catch (error) {
      setLoading(false);
      setTimeout(() => {
        Alert.alert("Error", error.message || "Ocurrió un problema al intentar eliminar el viaje.");
      }, 300);
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
        <ImageBackground 
          imageStyle={styles.heroImage} 
          source={{ uri: trip.image }} 
          style={styles.hero}
        >
          <LinearGradient 
            colors={["rgba(4,16,36,0.15)", "rgba(9,19,45,0.82)"]} 
            style={styles.heroGradient}
            pointerEvents="box-none" 
          >
            <View style={styles.heroActions} pointerEvents="box-none">
              <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <View style={styles.heroActionsRight} pointerEvents="box-none">
                {isAdmin ? (
                  <IconCircleButton
                    icon="pen-to-square"
                    onPress={() => navigation.navigate("EditarViaje", { tripId: trip.id })}
                  />
                ) : null}
                
                <IconCircleButton 
                  icon="ellipsis-vertical" 
                  onPress={() => {
                    if (isAdmin) {
                      setShowOptionsMenu(true); 
                    } else {
                      Alert.alert("Acceso denegado", "Solo el administrador de este viaje puede gestionarlo."); 
                    }
                  }} 
                />
              </View>
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.heroMeta}>{`${formatHeroDate(trip)} · ${participantItems.length} ${participantItems.length === 1 ? "persona" : "personas"}`}</Text>
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
                  const diferenciaTiempo = fin.getTime() - inicio.getTime();
                  const totalDias = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24)) + 1;

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
                  const actividadesBackend = (day.actividades ?? day.Actividades ?? []).map((act) => ({
                    id: act.idActividad ?? act.IdActividad,
                    time: `${(act.horaInicio ?? act.HoraInicio)?.slice(0, 5)} - ${(act.horaFin ?? act.HoraFin)?.slice(0, 5)}`,
                    title: act.nombre ?? act.Nombre,
                    note: act.descripcion ?? act.Descripcion,
                    icon: act.icono ?? act.Icono ?? "location-dot",
                  }));
                  const actividades = day.items ?? actividadesBackend;
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
                                  <View style={styles.agendaHeaderRow}>
                                    <Text style={styles.agendaTime}>{item.time ?? item.Hora ?? "---"}</Text>
                                    <Text style={styles.agendaTitle}>{item.title ?? item.Titulo}</Text>
                                  </View>
                                  {!!item.note || item.Notas ? (
                                    <Text style={styles.agendaNote}>{item.note ?? item.Notas}</Text>
                                  ) : null}
                                </View>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.sectionCopy}>No hay actividades agendadas para este día todavía.</Text>
                          )}

                          <Pressable
                            onPress={() =>
                              setActivityModalDay({
                                id: dayId,
                                label: `${dayDateText} · Día ${dayIndex}`,
                              })
                            }
                            style={styles.addActivityButton}
                          >
                            <FontAwesome6 color={colors.primary} name="plus" size={12} />
                            <Text style={styles.addActivityText}>Agregar actividad</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                });
              }

              return (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionHeading}>Fechas sin definir</Text>
                  <Text style={styles.sectionCopy}>Establecé las fechas de ida y vuelta para estructurar el cronograma.</Text>
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
              <Pressable
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: colors.primary,
                  height: 48,
                  borderRadius: 12,
                  marginBottom: 16,
                  opacity: pressed ? 0.85 : 1,
                })}
                onPress={() => navigation.navigate("CrearVotacion", {
                    IdViaje: trip.id,
                    onVotacionCreada: (nuevaVotacion) =>
                        setVotacionesActivas((prev) => [nuevaVotacion, ...prev]),
                })}
              >
                <FontAwesome6 name="plus" size={14} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800" }}>Crear votación</Text>
              </Pressable>

              {loadingVotaciones ? (
                <ActivityIndicator color={colors.primary} />
              ) : votacionesError ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionCopy}>{votacionesError}</Text>
                </View>
              ) : votacionesActivas.length === 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionCopy}>
                    Todavía no hay votaciones para este viaje. ¡Creá la primera!
                  </Text>
                </View>
              ) : null}

              {votacionesActivas.map((votacion) => {
                const esCerrada = votacion.Estado
                  ? votacion.Estado === "cerrada"
                  : new Date(votacion.FechaCierre) < new Date();
                const opcionesElegidas = votosSeleccionados[votacion.IdVotacion] || [];
                const enviandoEsteVoto = votandoId === votacion.IdVotacion;

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

                const registrarVoto = async () => {
                  if (opcionesElegidas.length === 0) {
                    avisar("Atención", "Por favor, seleccioná al menos una opción.");
                    return;
                  }

                  try {
                    setVotandoId(votacion.IdVotacion);
                    const resultado = await emitirVoto(votacion.IdVotacion, opcionesElegidas);
                    avisar(
                      "¡Listo!",
                      resultado?.detail || "Voto registrado correctamente. ¡Gracias por participar!"
                    );
                    setVotacionesActivas(prev =>
                      prev.map(v => v.IdVotacion === votacion.IdVotacion ? { ...v, YaVoto: true } : v)
                    );
                  } catch (error) {
                    avisar("No se pudo votar", error.message || "Ocurrió un error al registrar tu voto.");
                  } finally {
                    setVotandoId(null);
                  }
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
                        <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 13 }}>⚠️ Esta votación ha finalizado por fecha límite.</Text>
                      ) : votacion.YaVoto ? (
                        <Text style={{ color: colors.success, fontWeight: '600', fontSize: 13 }}>✓ Ya registraste tu voto en esta decisión grupal.</Text>
                      ) : (
                        <PrimaryButton
                          label={enviandoEsteVoto ? "Enviando..." : "Confirmar voto"}
                          onPress={registrarVoto}
                          disabled={enviandoEsteVoto}
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
      <AddActivityScreen
        dayLabel={activityModalDay?.label}
        onClose={() => setActivityModalDay(null)}
        onSubmit={handleCreateActivity}
        visible={!!activityModalDay}
      />

      <Modal
        animationType="fade"
        transparent={true}
        visible={showOptionsMenu}
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.menuContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
              onPress={() => {
                setShowOptionsMenu(false);
                setShowDeleteModal(true);
              }}
            >
              <FontAwesome6 name="trash-can" size={14} color={colors.danger || "#ef4444"} />
              <Text style={styles.menuItemText}>Eliminar viaje</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showDeleteModal}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconContainer}>
              <FontAwesome6 name="trash-can" size={22} color={colors.danger || "#ef4444"} />
            </View>
            <Text style={styles.modalTitle}>¿Dar de baja viaje?</Text>
            <Text style={styles.modalMessage}>
              Esta acción marcará el viaje "{trip?.title}" como cancelado. Ninguno de los participantes podrá volver a acceder a la información.
            </Text>
            <View style={{ height: 10 }} /> 
            <View style={styles.modalActions}>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonCancel]} 
                onPress={() => setShowDeleteModal(false)} 
              >
                <Text style={styles.modalButtonTextCancel}>Conservar</Text>
              </Pressable>
              <Pressable 
                style={[styles.modalButton, styles.modalButtonConfirm]} 
                onPress={handleConfirmDelete} 
              >
                <Text style={styles.modalButtonTextConfirm}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  heroActionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  agendaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  agendaTime: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  agendaTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 17,
  },
  agendaNote: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  addActivityButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    marginTop: spacing.xs,
  },
  addActivityText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
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
  menuOverlay: {
    flex: 1,
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 68 : 52,
    paddingRight: spacing.lg,
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    minWidth: 180,
    paddingVertical: spacing.xs,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  menuItemText: {
    ...textStyles.bodyStrong,
    color: colors.danger || "#ef4444",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(9, 19, 45, 0.7)", 
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ffeecf", 
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  modalMessage: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.danger || "#ef4444",
  },
  modalButtonTextCancel: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalButtonTextConfirm: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
    fontSize: 14,
  },
});