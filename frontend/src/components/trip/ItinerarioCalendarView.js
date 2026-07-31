import { FontAwesome6 } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import useResponsive from "../../hooks/useResponsive";
import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { calcularActividadesSolapadas } from "../../utils/itinerarioOverlaps";

const ANCHO_MINIMO_COLUMNA = 240;
const MAXIMO_COLUMNAS = 4;


export default function ItinerarioCalendarView({
  dias,
  onEditActivity,
  onDeleteActivity,
  onAddActivity,
}) {
  const { width } = useResponsive();

  const columnas = useMemo(() => {
    const anchoDisponible = Math.max(width - spacing.lg * 2, ANCHO_MINIMO_COLUMNA);
    const calculadas = Math.floor(anchoDisponible / (ANCHO_MINIMO_COLUMNA + spacing.md));
    return Math.min(Math.max(calculadas, 1), MAXIMO_COLUMNAS);
  }, [width]);

  const anchoCelda = `${100 / columnas}%`;

  if (!dias || dias.length === 0) {
    return (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Fechas sin definir</Text>
        <Text style={styles.sectionCopy}>
          Establecé las fechas de ida y vuelta para estructurar el cronograma.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {dias.map((dia) => {
        const solapadas = calcularActividadesSolapadas(dia.actividades);
        const actividadesOrdenadas = [...dia.actividades].sort((a, b) =>
          (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "")
        );

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
                  <Text style={styles.celdaSubtitulo}>Día {dia.dayIndex}</Text>
                </View>
              </View>

              <View style={styles.celdaAgenda}>
                {actividadesOrdenadas.length > 0 ? (
                  actividadesOrdenadas.map((actividad) => {
                    const seSolapa = solapadas.has(actividad.id);
                    return (
                      <Pressable
                        key={actividad.id}
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

                        <View style={styles.actividadAcciones}>
                          <Pressable
                            hitSlop={8}
                            onPress={() => onEditActivity?.(dia, actividad)}
                            style={styles.actividadAccionBoton}
                          >
                            <FontAwesome6 color={colors.primary} name="pen" size={11} />
                          </Pressable>
                          <Pressable
                            hitSlop={8}
                            onPress={() => onDeleteActivity?.(dia, actividad)}
                            style={styles.actividadAccionBoton}
                          >
                            <FontAwesome6 color={colors.textMuted} name="trash" size={11} />
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.sinActividades}>Sin actividades agendadas.</Text>
                )}

                <Pressable onPress={() => onAddActivity?.(dia)} style={styles.agregarBoton}>
                  <FontAwesome6 color={colors.primary} name="plus" size={11} />
                  <Text style={styles.agregarTexto}>Agregar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}


const styles = StyleSheet.create({
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
        gap: spacing.xs,
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