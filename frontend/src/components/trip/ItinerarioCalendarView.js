import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import DayTimeGrid from "./DayTimeGrid";
import DayRouteSection from "./DayRouteSection";
import DaySuggestionsSection from "./DaySuggestionsSection";
import useResponsive from "../../hooks/useResponsive";
import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { calcularActividadesSolapadas } from "../../utils/itinerarioOverlaps";
import { isTodayISO } from "../../utils/agenda";

const ANCHO_MINIMO_COLUMNA = 240;
const MAXIMO_COLUMNAS = 4;
const ANCHO_MOBILE = 768;
const DIAS_SEMANA = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ANCHO_DIA = 48;
const SEPARACION_DIA = 6;

function fechaLarga(fechaRaw) {
  const fecha = new Date(`${String(fechaRaw ?? "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

function partesDeFecha(fechaRaw) {
  const fecha = new Date(`${String(fechaRaw ?? "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return { semana: "", numero: "" };
  return { semana: DIAS_SEMANA[fecha.getDay()], numero: String(fecha.getDate()) };
}

function modoPorDefecto(dayId, ruta) {
  return ruta?.modo ?? "walking";
}

export default function ItinerarioCalendarView({
  dias,
  tripId,
  canPropose = false,
  onEditActivity,
  onDeleteActivity,
  onAddActivity,
  onGenerarRuta,
  generandoRutaDayId = null,
  resolverModo = modoPorDefecto,
  onCambiarModo,
  onVerMapa,
  onSuggestGap,
  sugerenciasPorDia = {},
}) {
  const { width } = useResponsive();
  const [diaSeleccionadoId, setDiaSeleccionadoId] = useState(null);
  const esMobile = width < ANCHO_MOBILE;
  const tiraRef = useRef(null);
  const [anchoTira, setAnchoTira] = useState(0);

  const columnas = useMemo(() => {
    const anchoDisponible = Math.max(width - spacing.lg * 2, ANCHO_MINIMO_COLUMNA);
    const calculadas = Math.floor(anchoDisponible / (ANCHO_MINIMO_COLUMNA + spacing.md));
    return Math.min(Math.max(calculadas, 1), MAXIMO_COLUMNAS);
  }, [width]);

  const anchoCelda = esMobile ? "100%" : `${100 / columnas}%`;

  const diaActual = useMemo(() => {
    if (!dias || dias.length === 0) return null;
    return (
      dias.find((d) => d.dayId === diaSeleccionadoId) ??
      dias.find((d) => isTodayISO(d.fechaRaw)) ??
      dias[0]
    );
  }, [dias, diaSeleccionadoId]);

  const indiceActual = diaActual && dias ? dias.findIndex((d) => d.dayId === diaActual.dayId) : -1;

  useEffect(() => {
    if (!esMobile || indiceActual < 0 || !anchoTira) return;
    const x = indiceActual * (ANCHO_DIA + SEPARACION_DIA) - (anchoTira - ANCHO_DIA) / 2;
    tiraRef.current?.scrollTo?.({ x: Math.max(0, x), animated: true });
  }, [esMobile, indiceActual, anchoTira]);

  if (!dias || dias.length === 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Fechas sin definir</Text>
        <Text style={styles.sectionCopy}>
          Establece las fechas de ida y vuelta para estructurar el cronograma.
        </Text>
      </View>
    );
  }

  function irAlDia(delta) {
    const destino = dias[indiceActual + delta];
    if (destino) setDiaSeleccionadoId(destino.dayId);
  }

  const diasVisibles = esMobile && diaActual ? [diaActual] : dias;

  return (
    <View>
      {esMobile && diaActual ? (
        <View style={styles.selectorHeader}>
          <Pressable
            accessibilityLabel="Día anterior"
            disabled={indiceActual <= 0}
            hitSlop={8}
            onPress={() => irAlDia(-1)}
            style={[styles.flecha, indiceActual <= 0 && styles.flechaOff]}
            testID="calendar-prev"
          >
            <FontAwesome6 color={colors.primary} name="chevron-left" size={13} />
          </Pressable>
          <View style={styles.selectorCentro}>
            <Text numberOfLines={1} style={styles.selectorFecha}>
              {fechaLarga(diaActual.fechaRaw) || diaActual.dayDateText}
            </Text>
            <Text style={styles.selectorSub}>
              Día {diaActual.dayIndex} de {dias.length}
              {isTodayISO(diaActual.fechaRaw) ? " · Hoy" : ""}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Día siguiente"
            disabled={indiceActual >= dias.length - 1}
            hitSlop={8}
            onPress={() => irAlDia(1)}
            style={[styles.flecha, indiceActual >= dias.length - 1 && styles.flechaOff]}
            testID="calendar-next"
          >
            <FontAwesome6 color={colors.primary} name="chevron-right" size={13} />
          </Pressable>
        </View>
      ) : null}
      {esMobile ? (
        <ScrollView
          ref={tiraRef}
          contentContainerStyle={styles.tira}
          horizontal
          onLayout={(e) => setAnchoTira(e.nativeEvent.layout.width)}
          showsHorizontalScrollIndicator={false}
          style={styles.tiraScroll}
        >
          {dias.map((d) => {
            const activo = d.dayId === diaActual?.dayId;
            const { semana, numero } = partesDeFecha(d.fechaRaw);
            const hoy = isTodayISO(d.fechaRaw);
            const cantidad = (d.actividades ?? []).length;
            return (
              <Pressable
                key={d.dayId}
                accessibilityLabel={`Día ${d.dayIndex}, ${cantidad} ${cantidad === 1 ? "actividad" : "actividades"}`}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                onPress={() => setDiaSeleccionadoId(d.dayId)}
                style={[styles.tiraDia, activo && styles.tiraDiaActivo]}
              >
                <Text style={[styles.tiraSemana, activo && styles.tiraTextoActivo]}>{semana}</Text>
                <Text style={[styles.tiraNumero, activo && styles.tiraTextoActivo]}>{numero}</Text>
                <View
                  style={[
                    styles.tiraPunto,
                    cantidad > 0 && styles.tiraPuntoLleno,
                    activo && cantidad > 0 && styles.tiraPuntoActivo,
                    hoy && !activo && styles.tiraPuntoHoy,
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={esMobile ? undefined : styles.grid}>
        {diasVisibles.map((dia) => {
          const solapadas = calcularActividadesSolapadas(dia.actividades);
          const actividadesOrdenadas = [...dia.actividades].sort((a, b) =>
            (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "")
          );
          const sugerirHueco =
            onSuggestGap && Number.isInteger(dia.dayId)
              ? (desde, hasta) => onSuggestGap(dia, desde, hasta)
              : undefined;

          return (
            <View key={dia.dayId} style={[styles.celdaWrap, { width: anchoCelda }]}>
              <View style={styles.celda}>
                <View style={styles.celdaHeader}>
                  <View style={styles.celdaIndice}>
                    <Text style={styles.celdaIndiceTexto}>{dia.dayIndex}</Text>
                  </View>
                  <View style={styles.celdaTituloWrap}>
                    <Text numberOfLines={1} style={styles.celdaTitulo}>
                      {dia.dayDateTextCorta || dia.dayDateText}
                    </Text>
                    <Text style={styles.celdaSubtitulo}>
                      Día {dia.dayIndex}
                      {isTodayISO(dia.fechaRaw) ? " · Hoy" : ""}
                    </Text>
                  </View>
                </View>

                <View style={styles.celdaAgenda}>
                  {esMobile ? (
                    <DayTimeGrid
                      actividades={dia.actividades}
                      canEdit={Boolean(onEditActivity)}
                      fecha={dia.fechaRaw}
                      onAdd={onAddActivity ? () => onAddActivity(dia) : undefined}
                      onDelete={onDeleteActivity ? (item) => onDeleteActivity(dia, item) : undefined}
                      onEdit={onEditActivity ? (item) => onEditActivity(dia, item) : undefined}
                      onSuggestGap={sugerirHueco}
                    />
                  ) : actividadesOrdenadas.length > 0 ? (
                    actividadesOrdenadas.map((actividad) => {
                      const seSolapa = solapadas.has(actividad.id);
                      return (
                        <Pressable
                          key={actividad.id}
                          disabled={!onEditActivity}
                          onPress={() => onEditActivity?.(dia, actividad)}
                          style={[styles.actividad, seSolapa && styles.actividadSolapada]}
                        >
                          <View style={styles.actividadHeaderRow}>
                            <FontAwesome6
                              color={seSolapa ? colors.warning : colors.primary}
                              name={actividad.icon ?? "location-dot"}
                              size={12}
                            />
                            <Text style={styles.actividadHora}>{actividad.time}</Text>
                            {seSolapa ? (
                              <FontAwesome6
                                color={colors.warning}
                                name="triangle-exclamation"
                                size={11}
                              />
                            ) : null}
                          </View>
                          <Text numberOfLines={2} style={styles.actividadTitulo}>
                            {actividad.title}
                          </Text>
                          {seSolapa ? (
                            <Text style={styles.actividadSolapadaTexto}>
                              Se superpone con otra actividad
                            </Text>
                          ) : null}
                          {actividad.advertenciaHorario ? (
                            <Text
                              numberOfLines={2}
                              style={styles.actividadSolapadaTexto}
                              testID={`calendar-schedule-warning-${actividad.id}`}
                            >
                              {actividad.advertenciaHorario}
                            </Text>
                          ) : null}

                          {onEditActivity || onDeleteActivity ? (
                            <View style={styles.actividadAcciones}>
                              {onEditActivity ? (
                                <Pressable
                                  accessibilityLabel={`Editar ${actividad.title}`}
                                  hitSlop={8}
                                  onPress={() => onEditActivity(dia, actividad)}
                                  style={styles.actividadAccionBoton}
                                >
                                  <FontAwesome6 color={colors.primary} name="pen" size={11} />
                                </Pressable>
                              ) : null}
                              {onDeleteActivity ? (
                                <Pressable
                                  accessibilityLabel={`Eliminar ${actividad.title}`}
                                  hitSlop={8}
                                  onPress={() => onDeleteActivity(dia, actividad)}
                                  style={styles.actividadAccionBoton}
                                >
                                  <FontAwesome6 color={colors.textMuted} name="trash" size={11} />
                                </Pressable>
                              ) : null}
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.sinActividades}>Sin actividades agendadas.</Text>
                  )}

                  {onAddActivity && !esMobile ? (
                    <Pressable onPress={() => onAddActivity(dia)} style={styles.agregarBoton}>
                      <FontAwesome6 color={colors.primary} name="plus" size={11} />
                      <Text style={styles.agregarTexto}>Agregar</Text>
                    </Pressable>
                  ) : null}

                  <DaySuggestionsSection
                    tripId={tripId}
                    dia={dia}
                    sugerencias={sugerenciasPorDia?.[dia.dayId] ?? []}
                    canPropose={canPropose}
                  />

                  <DayRouteSection
                    dayId={dia.dayId}
                    actividades={dia.actividades ?? []}
                    ruta={dia.ruta}
                    canEdit={typeof onGenerarRuta === "function"}
                    modoSeleccionado={resolverModo(dia.dayId, dia.ruta)}
                    generando={generandoRutaDayId === dia.dayId}
                    onCambiarModo={(modo) => onCambiarModo?.(dia.dayId, modo)}
                    onGenerar={
                      onGenerarRuta ? (modo) => onGenerarRuta(dia.dayId, modo) : undefined
                    }
                    onVerMapa={onVerMapa}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tiraScroll: {
    flexGrow: 0,
    marginBottom: spacing.xs,
  },
  tira: {
    gap: SEPARACION_DIA,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  selectorCentro: { flex: 1, alignItems: "center" },
  selectorFecha: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 15 },
  selectorSub: { ...textStyles.meta, color: colors.textSecondary, fontSize: 11 },
  flecha: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  flechaOff: { opacity: 0.35 },
  tiraDia: {
    width: ANCHO_DIA,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radii.md ?? 12,
    backgroundColor: colors.surfaceAlt,
    gap: 1,
  },
  tiraDiaActivo: {
    backgroundColor: colors.primary,
  },
  tiraSemana: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  tiraNumero: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 17,
  },
  tiraTextoActivo: {
    color: colors.textInverse,
  },
  tiraPunto: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "transparent",
    marginTop: 2,
  },
  tiraPuntoLleno: {
    backgroundColor: colors.primary,
  },
  tiraPuntoActivo: {
    backgroundColor: colors.textInverse,
  },
  tiraPuntoHoy: {
    backgroundColor: colors.warning,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  celdaWrap: {
    padding: spacing.xs,
  },
  celda: {
    ...surfaces.card,
    padding: spacing.md,
    flex: 1,
  },
  celdaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  celdaIndice: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  celdaIndiceTexto: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  celdaTituloWrap: {
    flex: 1,
  },
  celdaTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  celdaSubtitulo: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 11,
  },
  celdaAgenda: {
    gap: spacing.sm,
  },
  actividad: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    padding: spacing.xs,
  },
  actividadSolapada: {
    borderLeftColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  actividadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actividadHora: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 11,
  },
  actividadTitulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
    marginTop: 2,
  },
  actividadSolapadaTexto: {
    ...textStyles.meta,
    color: colors.warning,
    fontSize: 10,
    marginTop: 2,
  },
  actividadAcciones: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  actividadAccionBoton: {
    padding: 2,
  },
  sinActividades: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
  },
  agregarBoton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: spacing.xxs,
  },
  agregarTexto: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 12,
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
});