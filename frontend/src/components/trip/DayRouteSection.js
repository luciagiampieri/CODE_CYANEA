import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { buildRouteMarkers } from "../../utils/routeMarkers";
import { getRouteHint } from "../../utils/routeMessages";

export const MODOS_RUTA = [
  { valor: "walking", label: "Caminando", icono: "person-walking" },
  { valor: "driving", label: "Auto", icono: "car" },
  { valor: "bicycling", label: "Bici", icono: "person-biking" },
];

export default function DayRouteSection({
  dayId,
  actividades = [],
  ruta = null,
  canEdit = false,
  modoSeleccionado = "walking",
  generando = false,
  onCambiarModo,
  onGenerar,
  onVerMapa,
}) {
  const actividadesConUbicacion = actividades.filter(
    (item) => item.idLugarInteres || item.lugarInteres
  );
  const puedeGenerarRuta = actividadesConUbicacion.length >= 2;
  const routeMarkers = buildRouteMarkers(actividades, ruta);
  const routeHint = getRouteHint({
    hasRoute: Boolean(ruta),
    activitiesWithLocation: actividadesConUbicacion.length,
    canEdit,
  });
  const puedeEditarRuta = puedeGenerarRuta && canEdit && typeof onGenerar === "function";
  const destacarAccion = !ruta || modoSeleccionado !== ruta.modo;
  const mostrarCabecera = Boolean(ruta) || puedeEditarRuta;

  if (!mostrarCabecera && !routeHint) return null;

  return (
    <View style={styles.routeSection}>
      {mostrarCabecera ? (
        <View style={styles.routeHeaderRow}>
          <View style={styles.routeHeaderLeft}>
            <FontAwesome6 color={colors.textSecondary} name="route" size={12} />
            <Text style={styles.routeHeaderText}>
              {ruta
                ? `Ruta · ${(ruta.distanciaMetros / 1000).toFixed(1)} km · ${Math.round(
                    ruta.duracionSegundos / 60
                  )} min`
                : "Ruta del día"}
            </Text>
          </View>
          {ruta?.polilineaCodificada && onVerMapa ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() =>
                onVerMapa({ dayId, ruta, routeMarkers, actividadesConUbicacion })
              }
              style={styles.routeMapToggle}
            >
              <FontAwesome6 color={colors.primary} name="map-location-dot" size={12} />
              <Text style={styles.routeMapToggleText}>Ver mapa</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {routeHint ? <Text style={styles.routeHint}>{routeHint}</Text> : null}

      {puedeEditarRuta ? (
        <View style={styles.routeControls}>
          <View style={styles.segmented}>
            {MODOS_RUTA.map((modo) => {
              const active = modo.valor === modoSeleccionado;
              return (
                <Pressable
                  key={modo.valor}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: generando }}
                  disabled={generando}
                  onPress={() => onCambiarModo?.(modo.valor)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <FontAwesome6
                    color={active ? colors.textInverse : colors.primary}
                    name={modo.icono}
                    size={11}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {modo.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ruta ? "Regenerar ruta" : "Generar ruta"}
            disabled={generando}
            onPress={() => onGenerar(modoSeleccionado)}
            style={[
              styles.routeAction,
              destacarAccion && styles.routeActionDestacada,
              generando && styles.routeActionDisabled,
            ]}
            testID={`route-action-${dayId}`}
          >
            {generando ? (
              <ActivityIndicator
                color={destacarAccion ? colors.textInverse : colors.primary}
                size="small"
              />
            ) : (
              <FontAwesome6
                color={destacarAccion ? colors.textInverse : colors.primary}
                name={ruta ? "arrows-rotate" : "route"}
                size={13}
              />
            )}
            {!ruta && !generando ? (
              <Text style={[styles.routeActionText, styles.routeActionTextDestacada]}>
                Generar
              </Text>
            ) : null}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  routeSection: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  routeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  routeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  routeHeaderText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  routeMapToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  routeMapToggleText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  routeHint: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  routeControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  segmented: {
    flex: 1,
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  segmentItemActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 12,
  },
  segmentTextActive: {
    color: colors.textInverse,
  },
  routeAction: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  routeActionDestacada: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  routeActionDisabled: {
    opacity: 0.6,
  },
  routeActionText: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.primary,
  },
  routeActionTextDestacada: {
    color: colors.textInverse,
  },
});