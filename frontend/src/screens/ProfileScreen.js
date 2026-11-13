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
import { useEspacioBarraTabs } from "../components/navigation/FloatingTabBar";
import MapaPaises, { banderaDe } from "../components/profile/MapaPaises";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import { UsageMeter } from "../components/plans/AccountUsage";
import useResponsive from "../hooks/useResponsive";
import {
  getAccountUsage,
  getAchievements,
  getCurrentUser,
  getPaisesVisitados,
  getTrips,
} from "../services/api";
import { getTodayIso } from "../utils/dates";
import { colorDeDestino, colors, radii, spacing, textStyles } from "../theme/tokens";

const initialProfile = {
  id: null,
  nombre: "",
  apellido: "",
  nombreUsuario: "",
  email: "",
  fotoUrl: "",
  planActual: null,
};

const TOTAL_PAISES_MUNDO = 195;
const MAX_VIAJES_ANTERIORES = 6;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function fechaISO(valor) {
  return valor ? String(valor).slice(0, 10) : "";
}

function diasEntre(desdeIso, hastaIso) {
  const desde = new Date(`${desdeIso}T00:00:00`);
  const hasta = new Date(`${hastaIso}T00:00:00`);
  return Math.round((hasta - desde) / MS_POR_DIA);
}

function plural(cantidad, singular, pluralTexto) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

function formatFechaCorta(fechaIso) {
  if (!fechaIso) return "";
  const fecha = new Date(`${fechaISO(fechaIso)}T00:00:00`);
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function formatMesAnio(fechaIso) {
  if (!fechaIso) return "";
  const fecha = new Date(`${fechaISO(fechaIso)}T00:00:00`);
  return fecha.toLocaleDateString("es-AR", { month: "short", year: "numeric" });
}

function textoCuentaRegresiva(startDate) {
  const dias = diasEntre(getTodayIso(), fechaISO(startDate));
  if (dias <= 0) return "Arranca hoy";
  if (dias === 1) return "Arranca mañana";
  return `Faltan ${dias} días`;
}

function textoNoches(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const noches = Math.max(0, diasEntre(fechaISO(startDate), fechaISO(endDate)));
  return plural(noches, "noche", "noches");
}

function calcularProximoViaje(viajes) {
  const hoy = getTodayIso();
  let proximo = null;

  for (const viaje of viajes) {
    const inicio = fechaISO(viaje.startDate);
    if (viaje.status === "activo" && inicio && inicio >= hoy) {
      if (!proximo || inicio < fechaISO(proximo.startDate)) proximo = viaje;
    }
  }

  return proximo;
}

function calcularViajesAnteriores(viajes) {
  const hoy = getTodayIso();
  return viajes
    .filter((viaje) => {
      const estado = String(viaje.status ?? "").toLowerCase();
      return (
        viaje.endDate &&
        fechaISO(viaje.endDate) < hoy &&
        estado !== "cancelado" &&
        estado !== "eliminado"
      );
    })
    .sort((a, b) => fechaISO(b.endDate).localeCompare(fechaISO(a.endDate)));
}

export function calcularEstadisticas(viajes, idUsuarioActual, year, hoy = new Date()) {
  const fechaHoy = new Date(hoy);
  fechaHoy.setHours(0, 0, 0, 0);
  const filtrados = viajes.filter((viaje) => {
    if (!viaje.startDate) return year == null;

    const inicio = new Date(`${fechaISO(viaje.startDate)}T00:00:00`);
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

function Seccion({ titulo, detalle, grande, children, testID }) {
  return (
    <View style={[styles.card, grande && styles.cardGrande]} testID={testID}>
      <View style={styles.seccionHeader}>
        <Text style={[styles.seccionTitulo, grande && styles.seccionTituloGrande]}>{titulo}</Text>
        {detalle ? (
          <Text style={[styles.seccionDetalle, grande && styles.textoGrande]}>{detalle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ProfileHeader({
  profile,
  nombreCompleto,
  loading,
  planActual,
  esPro,
  portada,
  isTablet,
  grande,
  navigation,
}) {
  const avatarSize = grande ? 136 : isTablet ? 108 : 84;

  return (
    <View style={[styles.headerCard, isTablet && styles.headerCardTablet]}>
      <View style={[styles.cover, isTablet && styles.coverTablet, grande && styles.coverGrande]}>
        {portada ? (
          <>
            <Image source={{ uri: portada }} style={StyleSheet.absoluteFill} />
            <View style={styles.coverOverlay} />
          </>
        ) : null}
        <View style={styles.coverActions}>
          <IconCircleButton
            icon="gear"
            onPress={() => navigation.navigate("Configuracion")}
            tone="surface"
            testID="profile-settings-button"
            accessibilityLabel="Configuración"
          />
        </View>
      </View>

      <View style={[styles.headerBody, grande && styles.headerBodyGrande]}>
        <View style={[styles.avatarRow, { marginTop: -(avatarSize / 2 + 4) }]}>
          <View style={styles.avatarRing}>
            <Avatar imageUrl={profile.fotoUrl} name={nombreCompleto || "?"} size={avatarSize} />
          </View>
          <Pressable
            onPress={() => navigation.navigate("EditarPerfil")}
            style={({ pressed }) => [styles.editButton, grande && styles.editButtonGrande, pressed && styles.pressed]}
            testID="profile-edit-button"
            accessibilityRole="button"
          >
            <FontAwesome6 name="pen" size={grande ? 14 : 12} color={colors.primary} />
            <Text style={[styles.editText, grande && styles.textoGrande]}>Editar perfil</Text>
          </Pressable>
        </View>

        <View style={styles.nameRow}>
          <Text
            style={[styles.name, isTablet && styles.nameTablet, grande && styles.nameGrande]}
            numberOfLines={1}
          >
            {loading ? " " : nombreCompleto || "Sin nombre"}
          </Text>
          {planActual ? (
            <Text style={[styles.badge, esPro && styles.badgePro]} testID="profile-plan-badge">
              {esPro ? "Pro" : "Gratuito"}
            </Text>
          ) : null}
        </View>
        {profile.nombreUsuario ? (
          <Text style={[styles.username, grande && styles.textoGrande]}>@{profile.nombreUsuario}</Text>
        ) : null}
      </View>
    </View>
  );
}

function NextTripCard({ viaje, horizontal, grande, navigation }) {
  const destino = viaje.destinations?.length
    ? viaje.destinations.map((item) => item.name).join(" · ")
    : null;
  const noches = textoNoches(viaje.startDate, viaje.endDate);

  return (
    <Pressable
      onPress={() => navigation.navigate("TripDetail", { tripId: viaje.id, trip: viaje })}
      style={({ pressed }) => [
        styles.card,
        styles.nextTrip,
        horizontal && styles.nextTripRow,
        grande && styles.nextTripRowGrande,
        pressed && styles.pressed,
      ]}
      testID="profile-next-trip"
    >
      {viaje.image ? (
        <Image
          source={{ uri: viaje.image }}
          style={[
            styles.nextTripImage,
            horizontal && styles.nextTripImageRow,
            grande && styles.nextTripImageGrande,
          ]}
        />
      ) : (
        <View
          style={[
            styles.nextTripImage,
            horizontal && styles.nextTripImageRow,
            grande && styles.nextTripImageGrande,
            styles.imageFallback,
          ]}
        >
          <FontAwesome6 name="plane" size={28} color={colors.primary} />
        </View>
      )}
      <View style={[styles.nextTripInfo, grande && styles.nextTripInfoGrande]}>
        <Text style={[styles.nextTripLabel, grande && styles.nextTripLabelGrande]}>
          Próximo viaje · {textoCuentaRegresiva(viaje.startDate)}
        </Text>
        <Text style={[styles.nextTripTitle, grande && styles.nextTripTitleGrande]} numberOfLines={1}>
          {viaje.title}
        </Text>
        {destino ? (
          <Text style={[styles.nextTripDestino, grande && styles.textoGrande]} numberOfLines={1}>
            {destino}
          </Text>
        ) : null}
        <Text style={[styles.nextTripFechas, grande && styles.textoGrande]}>
          {formatFechaCorta(viaje.startDate)} al {formatFechaCorta(viaje.endDate)}
          {noches ? ` · ${noches}` : ""}
        </Text>
        <View style={styles.nextTripCta}>
          <Text style={[styles.link, grande && styles.textoGrande]}>Ver viaje</Text>
          <FontAwesome6 name="arrow-right" size={12} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  );
}

function PlanCard({ consumo, planActual, grande, navigation }) {
  const conocido = Boolean(planActual);
  const esPro = planActual === "pro";
  let boton = { label: "Ver plan y suscripción", destino: "MiSuscripcion" };
  if (conocido) {
    boton = esPro
      ? { label: "Gestionar plan", destino: "MiSuscripcion" }
      : { label: "Conocé Pro", destino: "Planes" };
  }

  return (
    <Seccion
      titulo="Tu plan"
      detalle={conocido ? (esPro ? "Pro" : "Gratuito") : null}
      grande={grande}
      testID="profile-plan-card"
    >
      {consumo ? (
        <View style={styles.planMeters}>
          <View style={styles.meterRow}>
            <UsageMeter titulo="Viajes activos que administrás" uso={consumo.viajesActivos} testID="profile-uso-viajes" />
          </View>
          <View style={styles.meterRow}>
            <UsageMeter titulo="Escaneos de comprobantes del mes" uso={consumo.escaneosMensuales} testID="profile-uso-escaneos" />
          </View>
        </View>
      ) : (
        <Text style={styles.mutedText}>No pudimos cargar el consumo de tu plan.</Text>
      )}
      <PrimaryButton
        label={boton.label}
        variant="secondary"
        onPress={() => navigation.navigate(boton.destino)}
        testID="profile-plan-button"
      />
    </Seccion>
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

function LogrosSection({ logros, grande }) {
  if (!logros?.length) return null;
  const obtenidos = logros.filter((logro) => logro.obtenido).length;
  return (
    <Seccion
      titulo="Logros"
      detalle={`${obtenidos} de ${logros.length}`}
      grande={grande}
      testID="profile-logros"
    >
      {obtenidos === 0 ? (
        <Text style={styles.mutedText}>Completá metas usando Cyanea con tu grupo.</Text>
      ) : null}
      <View style={styles.logrosGrid}>
        {logros.map((logro) => (
          <LogroCard key={logro.id} logro={logro} />
        ))}
      </View>
    </Seccion>
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
  const { isTablet, isDesktop } = useResponsive();
  const espacioBarraTabs = useEspacioBarraTabs();
  const grande = false;

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
            planActual: data.planActual ?? null,
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
  const planActual = consumo?.planActual ?? profile.planActual;
  const esPro = planActual === "pro";
  const sinViajes = trips.length === 0;

  const proximoViaje = useMemo(() => calcularProximoViaje(trips), [trips]);
  const viajesAnteriores = useMemo(() => calcularViajesAnteriores(trips), [trips]);
  const portada = proximoViaje?.image ?? viajesAnteriores.find((viaje) => viaje.image)?.image ?? null;

  const aniosDisponibles = useMemo(() => {
    const anios = new Set();
    const hoy = getTodayIso();
    for (const viaje of trips) {
      const inicio = fechaISO(viaje.startDate);
      if (inicio && inicio <= hoy) anios.add(Number(inicio.slice(0, 4)));
    }
    return Array.from(anios).sort((a, b) => b - a);
  }, [trips]);

  const estadisticasAnio = useMemo(
    () => calcularEstadisticas(trips, profile.id, selectedYear),
    [trips, profile.id, selectedYear]
  );

  const porcentajeMundo = (paises.length / TOTAL_PAISES_MUNDO) * 100;
  const porcentajeTexto =
    porcentajeMundo > 0 && porcentajeMundo < 1 ? "menos del 1%" : `${Math.round(porcentajeMundo)}%`;
  const columnasViajes = isTablet ? 3 : 2;
  const maxVisibles = Math.min(viajesAnteriores.length, MAX_VIAJES_ANTERIORES);
  const cantidadVisibles =
    maxVisibles >= columnasViajes
      ? Math.floor(maxVisibles / columnasViajes) * columnasViajes
      : maxVisibles;

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
    proximoViaje ? (
      <NextTripCard
        viaje={proximoViaje}
        horizontal={isTablet}
        grande={grande}
        navigation={navigation}
      />
    ) : (
      <View style={[styles.card, styles.inlineEmpty]}>
        <Text style={styles.mutedText}>Todavía no tenés un próximo viaje planeado.</Text>
        <Pressable onPress={() => navigation.navigate("NuevoViaje")} hitSlop={8}>
          <Text style={styles.link}>Crear viaje</Text>
        </Pressable>
      </View>
    )
  ) : null;

  const resumen = !sinViajes ? (
    <Seccion titulo="Tus números" grande={grande}>
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
        <View style={[styles.yearStatCard, grande && styles.yearStatCardGrande]}>
          <Text style={[styles.yearStatValue, grande && styles.yearStatValueGrande]} testID="profile-stat-viajes">
            {estadisticasAnio.totalViajes}
          </Text>
          <Text style={styles.yearStatLabel}>Viajes</Text>
        </View>
        <View style={[styles.yearStatCard, grande && styles.yearStatCardGrande]}>
          <Text style={[styles.yearStatValue, grande && styles.yearStatValueGrande]} testID="profile-stat-paises">
            {estadisticasAnio.totalPaises}
          </Text>
          <Text style={styles.yearStatLabel}>Países</Text>
        </View>
        <View style={[styles.yearStatCard, grande && styles.yearStatCardGrande]}>
          <Text style={[styles.yearStatValue, grande && styles.yearStatValueGrande]} testID="profile-stat-amigos">
            {estadisticasAnio.totalAmigos}
          </Text>
          <Text style={styles.yearStatLabel}>Amigos</Text>
        </View>
      </View>
    </Seccion>
  ) : null;

  const pasaporte = !sinViajes ? (
    <Seccion
      titulo="Tu pasaporte"
      detalle={`${paises.length} de ${TOTAL_PAISES_MUNDO} países`}
      grande={grande}
    >
      <MapaPaises paises={paises} />
      {paises.length > 0 ? (
        <>
          <View style={styles.mundoPista}>
            <View style={[styles.mundoBarra, { width: `${Math.max(2, porcentajeMundo)}%` }]} />
          </View>
          <Text style={[styles.mutedText, grande && styles.textoGrande]}>
            Conociste el {porcentajeTexto} del mundo
          </Text>
          <View style={styles.passportGrid}>
            {paises.map((pais) => {
              const flagUrl = banderaDe(pais);
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
        </>
      ) : (
        <Text style={styles.mutedText}>
          Cuando termine tu primer viaje, sus países van a aparecer acá.
        </Text>
      )}
    </Seccion>
  ) : null;

  const anteriores = !sinViajes ? (
    <Seccion
      titulo="Viajes anteriores"
      detalle={
        viajesAnteriores.length > cantidadVisibles
          ? `${cantidadVisibles} de ${viajesAnteriores.length}`
          : null
      }
      grande={grande}
    >
      {viajesAnteriores.length > 0 ? (
        <View style={styles.tripGrid}>
          {viajesAnteriores.slice(0, cantidadVisibles).map((viaje, indice) => (
            <View
              key={viaje.id ?? indice}
              style={[styles.tripGridItem, { width: `${100 / columnasViajes}%` }]}
            >
              <Pressable
                onPress={() => navigation.navigate("TripDetail", { tripId: viaje.id, trip: viaje })}
                style={({ pressed }) => [pressed && styles.pressed]}
                testID={`profile-past-trip-${viaje.id}`}
              >
                {viaje.image ? (
                  <Image
                    source={{ uri: viaje.image }}
                    style={[styles.tripThumb, grande && styles.tripThumbGrande]}
                  />
                ) : (
                  <View
                    style={[
                      styles.tripThumb,
                      grande && styles.tripThumbGrande,
                      { backgroundColor: `${colorDeDestino(indice)}22` },
                    ]}
                  >
                    <FontAwesome6 name="map-location-dot" size={22} color={colorDeDestino(indice)} />
                  </View>
                )}
                <Text style={[styles.tripThumbTitle, grande && styles.textoGrande]} numberOfLines={1}>
                  {viaje.title}
                </Text>
                <Text style={styles.tripThumbFecha}>{formatMesAnio(viaje.endDate)}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>Cuando termine tu primer viaje lo vas a ver acá.</Text>
      )}
    </Seccion>
  ) : null;

  const plan = (
    <PlanCard consumo={consumo} planActual={planActual} grande={grande} navigation={navigation} />
  );
  const seccionLogros = <LogrosSection logros={logros} grande={grande} />;

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: espacioBarraTabs + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.contenedor,
            isTablet && styles.contenedorTablet,
            isDesktop && styles.contenedorDesktop,
          ]}
        >
          <ProfileHeader
            profile={profile}
            nombreCompleto={nombreCompleto}
            loading={loading}
            planActual={planActual}
            esPro={esPro}
            portada={portada}
            isTablet={isTablet}
            grande={grande}
            navigation={navigation}
          />

          <View style={[styles.body, isTablet && styles.bodyTablet]}>
            {loading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : isDesktop ? (
              <View style={styles.columns}>
                <View style={styles.columnMain}>
                  {primerViaje}
                  {proximo}
                  {pasaporte}
                  {anteriores}
                  {seccionLogros}
                </View>
                <View style={styles.columnSide}>
                  {resumen}
                  {plan}
                </View>
              </View>
            ) : (
              <View style={styles.stack}>
                {primerViaje}
                {proximo}
                {resumen}
                {pasaporte}
                {anteriores}
                {seccionLogros}
                {plan}
              </View>
            )}
            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    width: "100%",
    alignSelf: "center",
  },
  contenedorDesktop: {
    paddingHorizontal: spacing.xxl,
  },
  contenedorTablet: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  pressed: {
    opacity: 0.75,
  },
  textoGrande: {
    fontSize: 16,
  },

  headerCard: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  headerCardTablet: {
    borderWidth: 1,
    borderRadius: radii.md,
  },
  cover: {
    height: 120,
    backgroundColor: colors.primary,
  },
  coverTablet: {
    height: 180,
  },
  coverGrande: {
    height: 260,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  coverActions: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
  headerBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: 4,
  },
  headerBodyGrande: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: 6,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  avatarRing: {
    borderWidth: 4,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  editButtonGrande: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  editText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  name: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
    flexShrink: 1,
  },
  nameTablet: {
    fontSize: 30,
    lineHeight: 36,
  },
  nameGrande: {
    fontSize: 40,
    lineHeight: 48,
  },
  username: {
    ...textStyles.meta,
    color: colors.textSecondary,
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

  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  bodyTablet: {
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
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
  columnMain: {
    flex: 2,
    minWidth: 0,
    gap: spacing.lg,
  },
  columnSide: {
    flex: 1,
    minWidth: 0,
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardGrande: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  seccionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  seccionTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 17,
  },
  seccionTituloGrande: {
    fontSize: 21,
  },
  seccionDetalle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
  },

  nextTrip: {
    padding: 0,
    gap: 0,
    overflow: "hidden",
  },
  nextTripRow: {
    flexDirection: "row",
    minHeight: 160,
  },
  nextTripRowGrande: {
    minHeight: 220,
  },
  nextTripImage: {
    width: "100%",
    height: 160,
  },
  nextTripImageRow: {
    width: 220,
    height: "auto",
    alignSelf: "stretch",
  },
  nextTripImageGrande: {
    width: 320,
  },
  imageFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  nextTripInfo: {
    flex: 1,
    padding: spacing.md,
    gap: 3,
    justifyContent: "center",
  },
  nextTripInfoGrande: {
    padding: spacing.xl,
    gap: 6,
  },
  nextTripLabel: {
    ...textStyles.label,
    fontSize: 11,
    color: colors.primarySoft,
  },
  nextTripLabelGrande: {
    fontSize: 13,
  },
  nextTripTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
    lineHeight: 28,
  },
  nextTripTitleGrande: {
    fontSize: 32,
    lineHeight: 38,
  },
  nextTripDestino: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  nextTripFechas: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  nextTripCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
  },
  inlineEmpty: {
    gap: spacing.xs,
  },
  link: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },

  mundoPista: {
    height: 8,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  mundoBarra: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  passportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  stamp: {
    width: 88,
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
    fontSize: 13,
  },

  tripGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
  },
  tripGridItem: {
    padding: 6,
  },
  tripThumb: {
    width: "100%",
    height: 100,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tripThumbGrande: {
    height: 160,
  },
  tripThumbTitle: {
    ...textStyles.meta,
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: 6,
  },
  tripThumbFecha: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
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
    gap: spacing.xs,
  },
  yearStatCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
  },
  yearStatCardGrande: {
    paddingVertical: spacing.md,
  },
  yearStatValue: {
    ...textStyles.kpiValue,
    color: colors.primary,
  },
  yearStatValueGrande: {
    fontSize: 30,
  },
  yearStatLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
  },

  planMeters: {
    gap: spacing.md,
  },
  meterRow: {
    flexDirection: "row",
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

  mutedText: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  statusText: {
    ...textStyles.body,
    color: colors.danger,
    marginTop: spacing.md,
  },
});