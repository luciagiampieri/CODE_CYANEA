import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import Avatar from "../components/ui/Avatar";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, getPaisesVisitados, getTrips } from "../services/api";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

const initialProfile = {
  id: null,
  nombre: "",
  apellido: "",
  nombreUsuario: "",
  email: "",
  fotoUrl: "",
};


const COUNTRY_CODES = {
  argentina: "ar",
  brasil: "br",
  chile: "cl",
  uruguay: "uy",
  paraguay: "py",
  bolivia: "bo",
  peru: "pe",
  "perú": "pe",
  colombia: "co",
  ecuador: "ec",
  mexico: "mx",
  "méxico": "mx",
  espana: "es",
  "españa": "es",
  francia: "fr",
  italia: "it",
  portugal: "pt",
  alemania: "de",
  "estados unidos": "us",
  japon: "jp",
  "japón": "jp",
};

function flagImageUrlFor(country) {
  const code = COUNTRY_CODES[country.trim().toLowerCase()];
  return code ? `https://flagcdn.com/h80/${code}.png` : null;
}

function formatFechaCorta(fechaIso) {
  if (!fechaIso) return "";
  const fecha = new Date(`${fechaIso}T00:00:00`);
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function calcularProximoViaje(viajes) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let proximo = null;

  for (const viaje of viajes) {
    if (viaje.status === "activo" && viaje.startDate) {
      const inicio = new Date(`${viaje.startDate}T00:00:00`);
      if (inicio >= hoy && (!proximo || inicio < new Date(`${proximo.startDate}T00:00:00`))) {
        proximo = viaje;
      }
    }
  }

  return proximo;
}


function calcularEstadisticas(viajes, idUsuarioActual, year) {
  const filtrados = year == null
    ? viajes
    : viajes.filter((viaje) => viaje.startDate && new Date(`${viaje.startDate}T00:00:00`).getFullYear() === year);

  const amigosIds = new Set();
  const paisesSet = new Set();

  for (const viaje of filtrados) {
    for (const participante of viaje.participants ?? []) {
      if (participante.id !== idUsuarioActual) {
        amigosIds.add(participante.id);
      }
    }
    for (const destino of viaje.destinations ?? []) {
      if (destino.country) {
        paisesSet.add(destino.country);
      }
    }
  }

  return {
    totalViajes: filtrados.length,
    totalAmigos: amigosIds.size,
    totalPaises: paisesSet.size,
  };
}

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(initialProfile);
  const [paises, setPaises] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedYear, setSelectedYear] = useState(null);
  const { isDesktop } = useResponsive();

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadData() {
        setLoading(true);
        setStatusMessage("");
        try {
          const [data, visitados, viajes] = await Promise.all([
            getCurrentUser(),
            getPaisesVisitados().catch(() => ({ paises: [] })),
            getTrips().catch(() => []),
          ]);
          if (!active) return;

          setProfile({
            id: data.id ?? null,
            nombre: data.nombre ?? "",
            apellido: data.apellido ?? "",
            nombreUsuario: data.nombreUsuario ?? "",
            email: data.email ?? "",
            fotoUrl: data.fotoUrl ?? "",
          });
          setPaises(visitados.paises ?? []);
          setTrips(Array.isArray(viajes) ? viajes : []);
        } catch (error) {
          if (active) {
            setStatusMessage(error.message || "No se pudo cargar el perfil.");
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      loadData();
      return () => {
        active = false;
      };
    }, [])
  );

  const nombreCompleto = `${profile.nombre} ${profile.apellido}`.trim();
  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];

  const proximoViaje = useMemo(() => calcularProximoViaje(trips), [trips]);

  const aniosDisponibles = useMemo(() => {
    const anios = new Set();
    for (const viaje of trips) {
      if (viaje.startDate) {
        anios.add(new Date(`${viaje.startDate}T00:00:00`).getFullYear());
      }
    }
    return Array.from(anios).sort((a, b) => b - a);
  }, [trips]);

  const estadisticasAnio = useMemo(
    () => calcularEstadisticas(trips, profile.id, selectedYear),
    [trips, profile.id, selectedYear]
  );

  const destinoLabel = proximoViaje?.destinations?.length
    ? proximoViaje.destinations.map((destino) => destino.name).join(" · ")
    : proximoViaje?.title;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={cardStyle}>
          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <>
              <View style={styles.topRow}>
                <View style={styles.headerRow}>
                  <Avatar imageUrl={profile.fotoUrl} name={nombreCompleto || "?"} size={72} />
                  <View style={styles.headerText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {nombreCompleto || "Sin nombre"}
                    </Text>
                    {profile.nombreUsuario ? (
                      <Text style={styles.username}>@{profile.nombreUsuario}</Text>
                    ) : null}
                  </View>
                </View>
                <PrimaryButton
                  icon="gear"
                  label=""
                  onPress={() => navigation.navigate("EditarPerfil")}
                  style={styles.settingsButton}
                  variant="secondary"
                />
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Próximo viaje</Text>
                {proximoViaje ? (
                  <Pressable
                    onPress={() =>
                      navigation.navigate("TripDetail", {
                        tripId: proximoViaje.id,
                        trip: proximoViaje,
                      })
                    }
                    style={({ pressed }) => [
                      styles.nextTripCard,
                      pressed && styles.nextTripCardPressed,
                    ]}
                  >
                    {proximoViaje.image ? (
                      <Image source={{ uri: proximoViaje.image }} style={styles.nextTripImage} />
                    ) : (
                      <View style={[styles.nextTripImage, styles.nextTripImageFallback]}>
                        <Text style={styles.nextTripImageFallbackText}>✈️</Text>
                      </View>
                    )}
                    <View style={styles.nextTripInfo}>
                      <Text style={styles.nextTripTitle} numberOfLines={1}>
                        {proximoViaje.title}
                      </Text>
                      {destinoLabel ? (
                        <Text style={styles.nextTripDestino} numberOfLines={1}>
                          {destinoLabel}
                        </Text>
                      ) : null}
                      <Text style={styles.nextTripFechas}>
                        {formatFechaCorta(proximoViaje.startDate)} - {formatFechaCorta(proximoViaje.endDate)}
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <Text style={styles.emptyText}>
                    Todavía no tenés un próximo viaje planeado.
                  </Text>
                )}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Pasaporte</Text>
                {paises.length > 0 ? (
                  <View style={styles.passportContainer}>
                    <View style={styles.passportGrid}>
                      {paises.map((pais) => {
                        const flagUrl = flagImageUrlFor(pais);
                        return (
                          <View key={pais} style={styles.stamp}>
                            {flagUrl ? (
                              <Image source={{ uri: flagUrl }} style={styles.stampFlagImage} />
                            ) : (
                              <Text style={styles.stampFlagFallback}>🌍</Text>
                            )}
                            <Text style={styles.stampLabel} numberOfLines={1}>
                              {pais}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={styles.passportContainer}>
                    <Text style={styles.emptyText}>
                      Todavía no completaste ningún viaje. ¡Tu primer país visitado va a aparecer acá!
                    </Text>
                  </View>
                )}
              </View>

              {trips.length > 0 ? (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>Estadísticas por año</Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.yearPillsRow}
                  >
                    <Pressable
                      onPress={() => setSelectedYear(null)}
                      style={[styles.yearPill, selectedYear === null && styles.yearPillActive]}
                    >
                      <Text
                        style={[
                          styles.yearPillText,
                          selectedYear === null && styles.yearPillTextActive,
                        ]}
                      >
                        Todos
                      </Text>
                    </Pressable>
                    {aniosDisponibles.map((anio) => (
                      <Pressable
                        key={anio}
                        onPress={() => setSelectedYear(anio)}
                        style={[styles.yearPill, selectedYear === anio && styles.yearPillActive]}
                      >
                        <Text
                          style={[
                            styles.yearPillText,
                            selectedYear === anio && styles.yearPillTextActive,
                          ]}
                        >
                          {anio}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={styles.yearStatsRow}>
                    <View style={styles.yearStatCard}>
                      <Text style={styles.yearStatIcon}>🧳</Text>
                      <Text style={styles.yearStatValue}>{estadisticasAnio.totalViajes}</Text>
                      <Text style={styles.yearStatLabel}>Viajes</Text>
                    </View>
                    <View style={styles.yearStatCard}>
                      <Text style={styles.yearStatIcon}>🌍</Text>
                      <Text style={styles.yearStatValue}>{estadisticasAnio.totalPaises}</Text>
                      <Text style={styles.yearStatLabel}>Países</Text>
                    </View>
                    <View style={styles.yearStatCard}>
                      <Text style={styles.yearStatIcon}>👥</Text>
                      <Text style={styles.yearStatValue}>{estadisticasAnio.totalAmigos}</Text>
                      <Text style={styles.yearStatLabel}>Amigos</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  card: {
    ...surfaces.card,
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardDesktop: {
    maxWidth: 480,
    alignSelf: "center",
    width: "100%",
  },
  loadingBlock: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  username: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  settingsButton: {
    alignSelf: "flex-start",
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  nextTripCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.md ?? 16,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
    padding: spacing.sm,
  },
  nextTripCardPressed: {
    opacity: 0.75,
  },
  nextTripImage: {
    width: 64,
    height: 64,
    borderRadius: radii.sm ?? 12,
  },
  nextTripImageFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  nextTripImageFallbackText: {
    fontSize: 24,
  },
  nextTripInfo: {
    flex: 1,
    gap: 2,
  },
  nextTripTitle: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "700",
  },
  nextTripDestino: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  nextTripFechas: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  passportContainer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md ?? 16,
    padding: spacing.sm,
  },
  passportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  stamp: {
    width: 84,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm ?? 12,
    backgroundColor: colors.surface ?? "#fff",
  },
  stampFlagImage: {
    width: 40,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
  },
  stampFlagFallback: {
    fontSize: 24,
  },
  stampLabel: {
    ...textStyles.meta,
    color: colors.textPrimary,
    textAlign: "center",
  },
  yearPillsRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingBottom: 2,
  },
  yearPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.pill ?? 999,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
  },
  yearPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearPillText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  yearPillTextActive: {
    color: colors.surface ?? "#fff",
  },
  yearStatsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  yearStatCard: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radii.md ?? 16,
    backgroundColor: colors.surfaceAlt,
  },
  yearStatIcon: {
    fontSize: 20,
  },
  yearStatValue: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  yearStatLabel: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  statusText: {
    ...textStyles.body,
    color: colors.danger,
  },
});