import { FontAwesome6 } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import DayTimeGrid from "./DayTimeGrid";
import ChipDia from "./ChipDia";
import DayRouteSection from "./DayRouteSection";
import RecorridoCalendario from "./RecorridoCalendario";
import { TIPOS_DIA, chipDelDiaCalendario } from "../../utils/destinosDias";
import DaySuggestionsSection from "./DaySuggestionsSection";
import useArrastreDia from "../../hooks/useArrastreDia";
import useResponsive from "../../hooks/useResponsive";
import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { calcularActividadesSolapadas } from "../../utils/itinerarioOverlaps";
import { resumenDelDia, isTodayISO } from "../../utils/agenda";
import { diaDestinoDeArrastre, etiquetaArrastre } from "../../utils/moverActividad";

const ANCHO_MINIMO_COLUMNA = 240;
const MAXIMO_COLUMNAS = 4;
const ANCHO_MOBILE = 768;
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DEMORA_ARRASTRE_MS = 300;

function fechaLarga(fechaRaw) {
  const fecha = new Date(`${String(fechaRaw ?? "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${DIAS_LARGOS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

function modoPorDefecto(dayId, ruta) {
  return ruta?.modo ?? "walking";
}

function ActividadColumna({ dia, actividad, seSolapa, onEditActivity, onDeleteActivity, arrastre, anchoPaso }) {
  const puedeArrastrar = Boolean(arrastre) && !actividad.traslado;
  const { desplazamiento, arrastrando, pasos, panHandlers, alMantener, alSoltar } = useArrastreDia({
    anchoPaso,
    onInicio: () => arrastre?.onInicio?.(),
    onCambio: (nuevos) => arrastre?.onCambio?.(actividad, nuevos),
    onSoltar: (resultado, movio) => arrastre?.onSoltar?.(actividad, movio ? resultado : 0),
  });
  const destino = arrastrando && arrastre ? arrastre.etiqueta(pasos) : null;

  return (
    <Animated.View
      {...(puedeArrastrar ? panHandlers : {})}
      style={[
        { transform: [{ translateX: desplazamiento }] },
        arrastrando && styles.actividadArrastrada,
      ]}
    >
      <Pressable
        disabled={!onEditActivity}
        delayLongPress={puedeArrastrar ? DEMORA_ARRASTRE_MS : undefined}
        onLongPress={puedeArrastrar ? alMantener : undefined}
        onPressOut={puedeArrastrar ? alSoltar : undefined}
        onPress={() => onEditActivity?.(dia, actividad)}
        style={[styles.actividad, seSolapa && styles.actividadSolapada]}
        testID={`calendar-activity-${actividad.id}`}
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
      {destino ? (
        <View
          pointerEvents="none"
          style={[styles.destino, destino.valido ? styles.destinoValido : styles.destinoInvalido]}
          testID={`calendar-destino-${actividad.id}`}
        >
          <FontAwesome6
            color={colors.textInverse}
            name={destino.valido ? "calendar-day" : "ban"}
            size={10}
          />
          <Text numberOfLines={1} style={styles.destinoTexto}>
            {destino.texto}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
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
  renderEncabezadoDia,
  // Accesos por destino; null si el itinerario no muestra destinos (US 138).
  accesos = null,
  // Ruta de cada destino en un día de traslado: su modo, su generación y su mapa.
  generandoDestino = null,
  resolverModoDestino,
  onCambiarModoDestino,
  onVerMapaDestino,
  onMoveActivity,
  onArrastreChange,
}) {
  const { width } = useResponsive();
  const [diaSeleccionadoId, setDiaSeleccionadoId] = useState(null);
  const [diaObjetivoId, setDiaObjetivoId] = useState(null);
  const [anchoColumna, setAnchoColumna] = useState(0);
  const esMobile = width < ANCHO_MOBILE;

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

  function arrastrePara(dia) {
    if (typeof onMoveActivity !== "function") return undefined;
    return {
      onInicio: () => onArrastreChange?.(true),
      onCambio: (actividad, pasos) =>
        setDiaObjetivoId(diaDestinoDeArrastre(dias, dia.dayId, pasos)?.dayId ?? null),
      onSoltar: (actividad, pasos) => {
        setDiaObjetivoId(null);
        onArrastreChange?.(false);
        const destino = diaDestinoDeArrastre(dias, dia.dayId, pasos);
        if (destino) onMoveActivity(dia, actividad, destino);
      },
      etiqueta: (pasos) => etiquetaArrastre(dias, dia.dayId, pasos),
    };
  }

  const diasVisibles = esMobile && diaActual ? [diaActual] : dias;

  function irAlDestino(acceso) {
    const dia = dias.find((d) => String(d.fechaRaw ?? "").slice(0, 10) === acceso.primeraFecha);
    if (dia) setDiaSeleccionadoId(dia.dayId);
  }

  return (
    <View>
      {esMobile || accesos ? (
        <RecorridoCalendario
          accesos={accesos}
          conTira={esMobile}
          diaActual={diaActual}
          diaObjetivoId={diaObjetivoId}
          dias={dias}
          onElegirDestino={irAlDestino}
          onElegirDia={(dia) => setDiaSeleccionadoId(dia.dayId)}
        />
      ) : null}
      <View style={esMobile ? undefined : styles.grid}>
        {diasVisibles.map((dia, indice) => {
          const solapadas = calcularActividadesSolapadas(dia.actividades);
          const actividadesOrdenadas = [...dia.actividades].sort((a, b) =>
            (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "")
          );
          const sugerirHueco =
            onSuggestGap && Number.isInteger(dia.dayId)
              ? (desde, hasta) => onSuggestGap(dia, desde, hasta)
              : undefined;
          const arrastre = onEditActivity ? arrastrePara(dia) : undefined;

          return (
            <View
              key={dia.dayId}
              onLayout={
                !esMobile && indice === 0
                  ? (e) => setAnchoColumna(e.nativeEvent.layout.width)
                  : undefined
              }
              style={[styles.celdaWrap, { width: anchoCelda }]}
            >
              <View
                style={[
                  styles.celda,
                  dia.infoDestino?.tipo === TIPOS_DIA.EN_VIAJE && styles.celdaEnViaje,
                  !esMobile && dia.dayId === diaObjetivoId && styles.celdaObjetivo,
                ]}
              >
                {esMobile ? (
                  <View style={styles.diaHeader}>
                    <View style={styles.celdaTituloWrap}>
                      <Text style={styles.diaFecha}>
                        {fechaLarga(dia.fechaRaw) || dia.dayDateText}
                      </Text>
                      <Text style={styles.diaResumen}>
                        Día {dia.dayIndex} · {resumenDelDia(dia.actividades)}
                        {isTodayISO(dia.fechaRaw) ? " · Hoy" : ""}
                      </Text>
                    </View>
                    <ChipDia alto={28} chip={chipDelDiaCalendario(dia.infoDestino)} />
                  </View>
                ) : (
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
                      <ChipDia chip={chipDelDiaCalendario(dia.infoDestino)} />
                    </View>
                  </View>
                )}

                <View style={styles.celdaAgenda}>
                  {renderEncabezadoDia?.(dia)}
                  {esMobile ? (
                    <DayTimeGrid
                      actividades={dia.actividades}
                      canEdit={Boolean(onEditActivity)}
                      fecha={dia.fechaRaw}
                      franjas={dia.franjas}
                      viaje={dia.viaje}
                      onAdd={onAddActivity ? () => onAddActivity(dia) : undefined}
                      onDelete={onDeleteActivity ? (item) => onDeleteActivity(dia, item) : undefined}
                      onEdit={onEditActivity ? (item) => onEditActivity(dia, item) : undefined}
                      onSuggestGap={sugerirHueco}
                      arrastre={arrastre}
                    />
                  ) : actividadesOrdenadas.length > 0 ? (
                    actividadesOrdenadas.map((actividad) => (
                      <ActividadColumna
                        key={actividad.id}
                        dia={dia}
                        actividad={actividad}
                        seSolapa={solapadas.has(actividad.id)}
                        onEditActivity={onEditActivity}
                        onDeleteActivity={onDeleteActivity}
                        arrastre={arrastre}
                        anchoPaso={anchoColumna}
                      />
                    ))
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
                    rutas={dia.rutas}
                    infoDestino={dia.infoDestino}
                    separacion={dia.separacion}
                    generandoDestino={generandoDestino}
                    modoDeDestino={(idDestino, ruta) =>
                      resolverModoDestino?.(dia.dayId, ruta, idDestino)
                    }
                    onCambiarModoDestino={(idDestino, modo) =>
                      onCambiarModoDestino?.(dia.dayId, idDestino, modo)
                    }
                    onGenerarDestino={
                      onGenerarRuta
                        ? (idDestino, modo) => onGenerarRuta(dia.dayId, modo, idDestino)
                        : undefined
                    }
                    onVerMapaDestino={onVerMapaDestino}
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
  diaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  diaFecha: {
    ...textStyles.bodyStrong,
    fontSize: 17,
    color: colors.primary,
  },
  diaResumen: {
    ...textStyles.meta,
    color: colors.textSecondary,
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
    borderWidth: 2,
    borderColor: "transparent",
  },
  celdaObjetivo: {
    borderColor: colors.accentStrong,
  },
  celdaEnViaje: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
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
  actividadArrastrada: {
    zIndex: 20,
    elevation: 20,
    opacity: 0.95,
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
  destino: {
    position: "absolute",
    top: -26,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill ?? 999,
  },
  destinoValido: {
    backgroundColor: colors.primary,
  },
  destinoInvalido: {
    backgroundColor: colors.textMuted,
  },
  destinoTexto: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: "700",
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