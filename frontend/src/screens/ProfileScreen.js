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
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import SectionCard from "../components/ui/SectionCard";
import { UsageMeter } from "../components/plans/AccountUsage";
import useResponsive from "../hooks/useResponsive";
import {
  getAccountUsage,
  getAchievements,
  getCurrentUser,
  getPaisesVisitados,
  getTrips,
} from "../services/api";
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

export function calcularEstadisticas(viajes, idUsuarioActual, year, hoy = new Date()) {
  const fechaHoy = new Date(hoy);
  fechaHoy.setHours(0, 0, 0, 0);
  const filtrados = viajes.filter((viaje) => {
    if (!viaje.startDate) return year == null;

    const inicio = new Date(`${viaje.startDate}T00:00:00`);
    return inicio <= fechaHoy && (year == null || inicio.getFullYear() === year);
  });

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

function PlanCard({ consumo, navigation }) {
  const conocido = Boolean(consumo);
  const esPro = consumo?.planActual === "pro";
  let boton = { label: "Ver plan y suscripción", destino: "MiSuscripcion" };
  if (conocido) {
    boton = esPro
      ? { label: "Gestionar plan", destino: "MiSuscripcion" }
      : { label: "Conocé Pro", destino: "Planes" };
  }

  return (
    <SectionCard label="Tu plan" padded testID="profile-plan-card">
      {conocido ? (
        <View style={styles.planHeader}>
          <View style={[styles.planIcon, esPro && styles.planIconPro]}>
            <FontAwesome6 name={esPro ? "crown" : "suitcase-rolling"} size={16} color={colors.primary} />
          </View>
          <Text style={styles.planName}>{esPro ? "Pro" : "Gratuito"}</Text>
        </View>
      ) : null}
      {conocido ? (
        <>
          <UsageMeter titulo="Viajes activos que administrás" uso={consumo.viajesActivos} testID="profile-uso-viajes" />
          <UsageMeter titulo="Escaneos de comprobantes del mes" uso={consumo.escaneosMensuales} testID="profile-uso-escaneos" />
        </>
      ) : (
        <Text style={styles.mutedText}>No pudimos cargar el consumo de tu plan.</Text>
      )}
      <PrimaryButton
        label={boton.label}
        variant={esPro || !conocido ? "secondary" : undefined}
        onPress={() => navigation.navigate(boton.destino)}
        testID="profile-plan-button"
      />
    </SectionCard>
  );
}

function LogroCard({ logro }) {
  return (
    <View
      style={[styles.logro, logro.obtenido && styles.logroObtenido]}
      testID={`logro-${logro.id}`}
      accessible
      accessibilityLabel={`${logro.titulo}. ${logro.descripcion} ${logro.progresoTexto}.`}
    >
      <View style={[styles.logroIcono, logro.obtenido && styles.logroIconoObtenido]}>
        <FontAwesome6
          name={logro.icono}
          size={16}
          color={logro.obtenido ? colors.primary : colors.textMuted}
        />
      </View>
      <View style={styles.logroCuerpo}>
        <View style={styles.logroTituloFila}>
          <Text style={[styles.logroTitulo, !logro.obtenido && styles.logroTituloPendiente]}>
            {logro.titulo}
          </Text>
          {logro.niveles > 1 && logro.nivel > 0 ? (
            <Text style={styles.logroNivel}>Nivel {logro.nivel}</Text>
          ) : null}
        </View>
        <Text style={styles.logroTexto}>{logro.progresoTexto}</Text>
        {!logro.completo ? (
          <View style={styles.pista}>
            <View style={[styles.barra, { width: `${logro.progreso}%` }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LogrosSection({ logros }) {
  if (!logros?.length) return null;
  const obtenidos = logros.filter((logro) => logro.obtenido).length;
  return (
    <SectionCard label="Logros" padded testID="profile-logros">
      <Text style={styles.mutedText}>
        {obtenidos === 0
          ? "Completá metas usando Cyanea con tu grupo."
          : `${obtenidos} de ${logros.length} logros obtenidos`}
      </Text>
      <View style={styles.logrosGrid}>
        {logros.map((logro) => (
          <LogroCard key={logro.id} logro={logro} />
        ))}
      </View>
    </SectionCard>
  );
}

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(initialProfile);
  const [paises, setPaises] = useState([]);
  const [trips, setTrips] = useState([]);
  const [consumo, setConsumo] = useState(null);
  const [logros, setLogros] = useState([]);
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
          const [data, visitados, viajes, uso, datosLogros] = await Promise.all([
            getCurrentUser(),
            getPaisesVisitados().catch(() => ({ paises: [] })),
            getTrips().catch(() => []),
            getAccountUsage().catch(() => null),
            getAchievements().catch(() => ({ logros: [] })),
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
          setConsumo(uso);
          setLogros(datosLogros?.logros ?? []);
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
  const esPro = consumo?.planActual === "pro";
  const sinViajes = trips.length === 0;

  const proximoViaje = useMemo(() => calcularProximoViaje(trips), [trips]);

  const aniosDisponibles = useMemo(() => {
    const anios = new Set();
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    for (const viaje of trips) {
      if (viaje.startDate) {
        const inicio = new Date(`${viaje.startDate}T00:00:00`);
        if (inicio <= hoy) anios.add(inicio.getFullYear());
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

  const primerViaje = sinViajes ? (
    <EmptyState
      icon="plane-departure"
      title="Planeá tu primer viaje"
      body="Invitá a tu grupo y organicen todo juntos: itinerario, gastos y votaciones en un solo lugar."
      actionLabel="Crear viaje"
      onAction={() => navigation.navigate("NuevoViaje")}
      testID="profile-empty"
    />
  ) : null;

  const proximo = !sinViajes ? (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionLabel}>Próximo viaje</Text>
      {proximoViaje ? (
        <Pressable
          onPress={() =>
            navigation.navigate("TripDetail", { tripId: proximoViaje.id, trip: proximoViaje })
          }
          style={({ pressed }) => [styles.nextTripCard, pressed && styles.pressed]}
          testID="profile-next-trip"
        >
          {proximoViaje.image ? (
            <Image source={{ uri: proximoViaje.image }} style={styles.nextTripImage} />
          ) : (
            <View style={[styles.nextTripImage, styles.nextTripImageFallback]}>
              <FontAwesome6 name="plane" size={22} color={colors.primary} />
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
              {formatFechaCorta(proximoViaje.startDate)} al {formatFechaCorta(proximoViaje.endDate)}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.inlineEmpty}>
          <Text style={styles.mutedText}>Todavía no tenés un próximo viaje planeado.</Text>
          <Pressable onPress={() => navigation.navigate("NuevoViaje")} hitSlop={8}>
            <Text style={styles.link}>Crear viaje</Text>
          </Pressable>
        </View>
      )}
    </View>
  ) : null;

  const resumen = !sinViajes ? (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionLabel}>Resumen anual</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearPillsRow}>
        {[null, ...aniosDisponibles].map((anio) => {
          const activo = selectedYear === anio;
          return (
            <Pressable
              key={anio ?? "todos"}
              onPress={() => setSelectedYear(anio)}
              style={[styles.yearPill, activo && styles.yearPillActive]}
            >
              <Text style={[styles.yearPillText, activo && styles.yearPillTextActive]}>
                {anio ?? "Todos"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.yearStatsRow}>
        <View style={styles.yearStatCard}>
          <FontAwesome6 name="suitcase-rolling" size={18} color={colors.primary} />
          <Text style={styles.yearStatValue} testID="profile-stat-viajes">{estadisticasAnio.totalViajes}</Text>
          <Text style={styles.yearStatLabel}>Viajes</Text>
        </View>
        <View style={styles.yearStatCard}>
          <FontAwesome6 name="earth-americas" size={18} color={colors.primary} />
          <Text style={styles.yearStatValue} testID="profile-stat-paises">{estadisticasAnio.totalPaises}</Text>
          <Text style={styles.yearStatLabel}>Países</Text>
        </View>
        <View style={styles.yearStatCard}>
          <FontAwesome6 name="user-group" size={18} color={colors.primary} />
          <Text style={styles.yearStatValue} testID="profile-stat-amigos">{estadisticasAnio.totalAmigos}</Text>
          <Text style={styles.yearStatLabel}>Amigos</Text>
        </View>
      </View>
    </View>
  ) : null;

  const pasaporte = !sinViajes ? (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionLabel}>Países visitados</Text>
      <View style={styles.passportContainer}>
        {paises.length > 0 ? (
          <View style={styles.passportGrid}>
            {paises.map((pais) => {
              const flagUrl = flagImageUrlFor(pais);
              return (
                <View key={pais} style={styles.stamp}>
                  {flagUrl ? (
                    <Image source={{ uri: flagUrl }} style={styles.stampFlagImage} />
                  ) : (
                    <FontAwesome6 name="earth-americas" size={22} color={colors.primary} />
                  )}
                  <Text style={styles.stampLabel} numberOfLines={1}>
                    {pais}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.mutedText}>
            Cuando termine tu primer viaje, sus países van a aparecer acá.
          </Text>
        )}
      </View>
    </View>
  ) : null;

  const plan = <PlanCard consumo={consumo} navigation={navigation} />;
  const seccionLogros = <LogrosSection logros={logros} />;

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, isDesktop && styles.headerDesktop]}>
          <View style={styles.headerRow}>
            <Avatar imageUrl={profile.fotoUrl} name={nombreCompleto || "?"} size={72} />
            <View style={styles.headerText}>
              <Text style={styles.name} numberOfLines={1}>
                {loading ? " " : nombreCompleto || "Sin nombre"}
              </Text>
              {profile.nombreUsuario ? (
                <Text style={styles.username}>@{profile.nombreUsuario}</Text>
              ) : null}
              <View style={styles.headerMeta}>
                {consumo ? (
                  <Text style={[styles.badge, esPro && styles.badgePro]} testID="profile-plan-badge">
                    {esPro ? "Pro" : "Gratuito"}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => navigation.navigate("EditarPerfil")}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                  testID="profile-edit-button"
                  accessibilityRole="button"
                >
                  <FontAwesome6 name="pen" size={11} color={colors.primary} />
                  <Text style={styles.editText}>Editar perfil</Text>
                </Pressable>
              </View>
            </View>
            <IconCircleButton
              icon="gear"
              onPress={() => navigation.navigate("Configuracion")}
              tone="surface"
              style={styles.settingsButton}
              testID="profile-settings-button"
              accessibilityLabel="Configuración"
            />
          </View>
        </View>

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          {loading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : isDesktop ? (
            <View style={styles.columns}>
              <View style={styles.columnLeft}>
                {seccionLogros}
                {plan}
              </View>
              <View style={styles.columnRight}>
                {primerViaje}
                {proximo}
                {resumen}
                {pasaporte}
              </View>
            </View>
          ) : (
            <View style={styles.stack}>
              {primerViaje}
              {proximo}
              {seccionLogros}
              {resumen}
              {pasaporte}
              {plan}
            </View>
          )}
          {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerDesktop: {
    maxWidth: 1000,
    width: "100%",
    alignSelf: "center",
  },
  headerRow: {
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
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  badge: {
    ...textStyles.label,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.primary,
  },
  badgePro: {
    backgroundColor: colors.accent,
    color: colors.primaryStrong,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  settingsButton: {
    alignSelf: "flex-start",
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  bodyDesktop: {
    maxWidth: 1000,
    width: "100%",
    alignSelf: "center",
  },
  loadingBlock: {
    paddingVertical: spacing.xxxl,
    alignItems: "center",
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  columnLeft: {
    flex: 1,
    gap: spacing.lg,
  },
  columnRight: {
    flex: 1.5,
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.lg,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  planIconPro: {
    backgroundColor: colors.accent,
  },
  planName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 20,
  },
  logrosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  logro: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  logroObtenido: {
    backgroundColor: colors.surface,
    borderColor: colors.accentStrong,
  },
  logroIcono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  logroIconoObtenido: {
    backgroundColor: colors.accent,
  },
  logroCuerpo: {
    flex: 1,
    gap: 3,
  },
  logroTituloFila: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  logroTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  logroTituloPendiente: {
    color: colors.textSecondary,
  },
  logroNivel: {
    ...textStyles.label,
    fontSize: 10,
    color: colors.primaryStrong,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  logroTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },
  pista: {
    height: 5,
    marginTop: 2,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  barra: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.primarySoft,
  },
  nextTripCard: {
    ...surfaces.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  nextTripImage: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
  },
  nextTripImageFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
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
  inlineEmpty: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  link: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  passportContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: radii.sm,
    backgroundColor: colors.background,
  },
  stampFlagImage: {
    width: 40,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.surfaceAlt,
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
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    color: colors.textInverse,
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
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearStatValue: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  yearStatLabel: {
    ...textStyles.meta,
    color: colors.primary,
  },
  mutedText: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  statusText: {
    ...textStyles.body,
    color: colors.danger,
  },
});