import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import StatusPill from "../components/ui/StatusPill";
import useResponsive from "../hooks/useResponsive";
import { getMyPlanningPreferences } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import PlanningPreferencesScreen from "./PlanningPreferencesScreen";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Se parsea a mano para no correr la fecha por zona horaria ("2026-12-01" en UTC-3).
function parsearFecha(iso) {
  const [anio, mes, dia] = String(iso || "").split("-").map(Number);
  return anio && mes && dia ? { anio, mes, dia } : null;
}

export function formatearRangoFechas(inicioIso, finIso) {
  const inicio = parsearFecha(inicioIso);
  const fin = parsearFecha(finIso);
  if (!inicio || !fin) return "";
  const textoInicio = `${inicio.dia} ${MESES[inicio.mes - 1]}`;
  const textoFin = `${fin.dia} ${MESES[fin.mes - 1]} ${fin.anio}`;
  return inicio.anio === fin.anio
    ? `${textoInicio} – ${textoFin}`
    : `${textoInicio} ${inicio.anio} – ${textoFin}`;
}

export function resumirPreferencias(viaje) {
  if (!viaje.Configurada) return "Todavía no configuraste tus preferencias.";
  const partes = [];
  if (viaje.Intereses?.length) partes.push(viaje.Intereses.join(", "));
  if (viaje.Ritmo) partes.push(`ritmo ${viaje.Ritmo.toLowerCase()}`);
  return partes.join(" · ");
}

export default function PlanningPreferencesListScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [viajeSeleccionado, setViajeSeleccionado] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setErrorCarga(null);
    try {
      const data = await getMyPlanningPreferences();
      setViajes(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorCarga(error?.message || "No se pudieron cargar tus viajes.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];

  function renderListado() {
    if (cargando) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      );
    }

    if (errorCarga) {
      return (
        <View style={cardStyle}>
          <Text style={styles.errorText}>{errorCarga}</Text>
        </View>
      );
    }

    if (viajes.length === 0) {
      return (
        <View style={cardStyle}>
          <View style={[styles.groupContainer, styles.emptyBox]} testID="planning-prefs-empty">
            <FontAwesome6 name="suitcase-rolling" size={22} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No tenés viajes en planificación</Text>
            <Text style={styles.emptyText}>
              Cuando participes de un viaje que todavía no terminó, vas a poder configurar tus
              preferencias desde acá.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={cardStyle}>
        <Text style={styles.helperText}>
          Tus preferencias se guardan por viaje. El asistente combina las de todo el grupo para
          sugerir actividades.
        </Text>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tus viajes</Text>
          <View style={styles.groupContainer}>
            {viajes.map((viaje, indice) => (
              <Pressable
                key={viaje.IdViaje}
                testID={`planning-prefs-trip-${viaje.IdViaje}`}
                onPress={() => setViajeSeleccionado(viaje)}
                style={({ pressed }) => [
                  styles.itemRow,
                  indice < viajes.length - 1 && styles.itemRowDivider,
                  pressed && styles.itemRowPressed,
                ]}
              >
                <View style={styles.itemLeft}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: viaje.Configurada ? colors.successSurface : colors.surfaceAlt },
                    ]}
                  >
                    <FontAwesome6
                      name={viaje.Configurada ? "check" : "sliders"}
                      size={15}
                      color={viaje.Configurada ? colors.success : colors.primary}
                    />
                  </View>
                  <View style={styles.itemTexts}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {viaje.Titulo}
                    </Text>
                    <Text style={styles.itemMeta} numberOfLines={1}>
                      {[formatearRangoFechas(viaje.FechaInicio, viaje.FechaFin), viaje.Destinos?.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <Text style={styles.itemSubtitle} numberOfLines={2}>
                      {resumirPreferencias(viaje)}
                    </Text>
                  </View>
                </View>
                <View style={styles.itemRight}>
                  <StatusPill tone={viaje.Configurada ? "activo" : "pendiente"} textStyle={styles.pillText}>
                    {viaje.Configurada ? "Configuradas" : "Pendiente"}
                  </StatusPill>
                  <FontAwesome6 name="chevron-right" size={13} color={colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              tone="light"
              testID="planning-prefs-back-button"
            />
          </View>
          <Text style={styles.title}>Planificación de viajes</Text>
        </View>
        {renderListado()}
      </ScrollView>

      <PlanningPreferencesScreen
        visible={viajeSeleccionado != null}
        tripId={viajeSeleccionado?.IdViaje}
        tripTitle={viajeSeleccionado?.Titulo}
        onClose={() => setViajeSeleccionado(null)}
        onGuardado={() => cargar({ silencioso: true })}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 26,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  center: {
    padding: spacing.xxl,
    alignItems: "center",
  },
  card: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  cardDesktop: {
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  groupContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  itemTexts: {
    flex: 1,
    gap: 2,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  itemMeta: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
  },
  itemSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
  },
  pillText: {
    fontSize: 11,
  },
  helperText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginHorizontal: 4,
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    textAlign: "center",
  },
});
