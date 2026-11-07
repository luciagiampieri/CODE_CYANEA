import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { buildRouteMarkers } from "../../utils/routeMarkers";
import {
  MIN_ACTIVIDADES_PARA_RUTA,
  faltanActividadesEnDestino,
  getRouteHintDelDia,
} from "../../utils/routeMessages";
import { TIPOS_DIA } from "../../utils/destinosDias";

export const MODOS_RUTA = [
  { valor: "walking", label: "Caminando", icono: "person-walking" },
  { valor: "driving", label: "Auto", icono: "car" },
  { valor: "bicycling", label: "Bici", icono: "person-biking" },
];

function conUbicacion(actividades) {
  return actividades.filter((item) => !item.traslado && (item.idLugarInteres || item.lugarInteres));
}

function textoRuta(ruta) {
  const destino = ruta.nombreDestino ? ` en ${ruta.nombreDestino}` : "";
  return `Ruta${destino} · ${(ruta.distanciaMetros / 1000).toFixed(1)} km · ${Math.round(
    ruta.duracionSegundos / 60
  )} min`;
}

function ControlesRuta({
  color = colors.primary,
  destacar,
  generando,
  hayRuta,
  modoSeleccionado,
  onCambiarModo,
  onGenerar,
  testID,
}) {
  return (
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
              style={[styles.segmentItem, active && { backgroundColor: color }]}
            >
              <FontAwesome6
                color={active ? colors.textInverse : color}
                name={modo.icono}
                size={11}
              />
              <Text style={[styles.segmentText, { color }, active && styles.segmentTextActive]}>
                {modo.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hayRuta ? "Regenerar ruta" : "Generar ruta"}
        disabled={generando}
        onPress={() => onGenerar(modoSeleccionado)}
        style={[
          styles.routeAction,
          destacar && { backgroundColor: color, borderColor: color },
          generando && styles.routeActionDisabled,
        ]}
        testID={testID}
      >
        {generando ? (
          <ActivityIndicator color={destacar ? colors.textInverse : color} size="small" />
        ) : (
          <FontAwesome6
            color={destacar ? colors.textInverse : color}
            name={hayRuta ? "arrows-rotate" : "route"}
            size={13}
          />
        )}
        {!hayRuta && !generando ? (
          <Text style={[styles.routeActionText, styles.routeActionTextDestacada]}>Generar</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

// Ruta de un destino en un día de traslado, con su propio modo.
function RutaDestino({
  dayId,
  destino,
  actividades,
  ruta,
  canEdit,
  modo,
  generando,
  onCambiarModo,
  onGenerar,
  onVerMapa,
}) {
  const conLugar = conUbicacion(actividades);
  const alcanza = conLugar.length >= MIN_ACTIVIDADES_PARA_RUTA;
  const puedeEditar = alcanza && canEdit && typeof onGenerar === "function";
  const avisar = !ruta && !alcanza && actividades.length > 0;

  if (!ruta && !puedeEditar && !avisar) return null;

  return (
    <View style={styles.routeDestino} testID={`ruta-destino-${destino.nombre}`}>
      {ruta ? (
        <View style={styles.routeHeaderRow}>
          <View style={styles.routeHeaderLeft}>
            <FontAwesome6 color={destino.color} name="route" size={12} />
            <Text style={styles.routeHeaderText}>{textoRuta(ruta)}</Text>
          </View>
          {ruta.polilineaCodificada && onVerMapa ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() =>
                onVerMapa({
                  dayId,
                  ruta,
                  routeMarkers: buildRouteMarkers(actividades, ruta),
                  actividadesConUbicacion: conLugar.filter((a) =>
                    (ruta.idsActividadesOrdenadas ?? []).includes(a.id)
                  ),
                })
              }
              style={styles.routeMapToggle}
            >
              <FontAwesome6 color={destino.color} name="map-location-dot" size={12} />
              <Text style={[styles.routeMapToggleText, { color: destino.color }]}>Ver mapa</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {avisar ? <Text style={styles.routeHint}>{faltanActividadesEnDestino(destino.nombre)}</Text> : null}

      {puedeEditar ? (
        <ControlesRuta
          color={destino.color}
          destacar={!ruta || modo !== ruta.modo}
          generando={generando}
          hayRuta={Boolean(ruta)}
          modoSeleccionado={modo}
          onCambiarModo={onCambiarModo}
          onGenerar={onGenerar}
          testID={`route-action-${dayId}-${destino.idDestino}`}
        />
      ) : null}
    </View>
  );
}

export default function DayRouteSection({
  dayId,
  actividades = [],
  ruta = null,
  // Un día de traslado tiene una ruta por destino (US 138).
  rutas = [],
  infoDestino = null,
  separacion = null,
  canEdit = false,
  modoSeleccionado = "walking",
  generando = false,
  onCambiarModo,
  onGenerar,
  onVerMapa,
  // Día de traslado agendado: `destino` ("salida" o "llegada") dibuja solo esa ruta.
  destino = null,
  modoDeDestino,
  generandoDestino = null,
  onCambiarModoDestino,
  onGenerarDestino,
  onVerMapaDestino,
}) {
  if (separacion) {
    const grupos = [
      { clave: "salida", ...separacion.salida, actividades: separacion.antes },
      { clave: "llegada", ...separacion.llegada, actividades: separacion.despues },
    ].filter((grupo) => !destino || grupo.clave === destino);

    return grupos.map((grupo) => {
      const rutaDestino = rutas.find((item) => item.idDestino === grupo.idDestino) ?? null;
      return (
        <RutaDestino
          key={grupo.clave}
          actividades={grupo.actividades}
          canEdit={canEdit}
          dayId={dayId}
          destino={grupo}
          generando={generandoDestino === grupo.idDestino}
          modo={modoDeDestino?.(grupo.idDestino, rutaDestino) ?? rutaDestino?.modo ?? "walking"}
          onCambiarModo={(modo) => onCambiarModoDestino?.(grupo.idDestino, modo)}
          onGenerar={onGenerarDestino ? (modo) => onGenerarDestino(grupo.idDestino, modo) : undefined}
          onVerMapa={onVerMapaDestino}
          ruta={rutaDestino}
        />
      );
    });
  }

  const lista = rutas.length > 0 ? rutas : ruta ? [ruta] : [];
  const actividadesConUbicacion = conUbicacion(actividades);
  const sinAgendar = infoDestino?.tipo === TIPOS_DIA.TRASLADO && !separacion;

  let puedeGenerarRuta = actividadesConUbicacion.length >= MIN_ACTIVIDADES_PARA_RUTA;
  if (sinAgendar) puedeGenerarRuta = false;

  const routeHint = getRouteHintDelDia({
    hasRoute: lista.length > 0,
    activitiesWithLocation: actividadesConUbicacion.length,
    canEdit,
    sinAgendar,
  });
  const puedeEditarRuta = puedeGenerarRuta && canEdit && typeof onGenerar === "function";
  const hayRuta = lista.length > 0;
  const destacarAccion = !hayRuta || modoSeleccionado !== lista[0].modo;
  const mostrarCabecera = hayRuta || puedeEditarRuta;

  if (!mostrarCabecera && !routeHint) return null;

  function verMapa(item) {
    const ids = new Set(item.idsActividadesOrdenadas ?? []);
    onVerMapa({
      dayId,
      ruta: item,
      routeMarkers: buildRouteMarkers(actividades, item),
      actividadesConUbicacion: actividadesConUbicacion.filter((a) => ids.has(a.id)),
    });
  }

  return (
    <View style={styles.routeSection}>
      {mostrarCabecera && !hayRuta ? (
        <View style={styles.routeHeaderRow}>
          <View style={styles.routeHeaderLeft}>
            <FontAwesome6 color={colors.textSecondary} name="route" size={12} />
            <Text style={styles.routeHeaderText}>Ruta del día</Text>
          </View>
        </View>
      ) : null}

      {lista.map((item) => (
        <View key={item.id ?? item.idDestino ?? "ruta"} style={styles.routeHeaderRow}>
          <View style={styles.routeHeaderLeft}>
            <FontAwesome6 color={colors.textSecondary} name="route" size={12} />
            <Text style={styles.routeHeaderText}>{textoRuta(item)}</Text>
          </View>
          {item.polilineaCodificada && onVerMapa ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => verMapa(item)}
              style={styles.routeMapToggle}
            >
              <FontAwesome6 color={colors.primary} name="map-location-dot" size={12} />
              <Text style={styles.routeMapToggleText}>Ver mapa</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {routeHint ? <Text style={styles.routeHint}>{routeHint}</Text> : null}

      {puedeEditarRuta ? (
        <ControlesRuta
          destacar={destacarAccion}
          generando={generando}
          hayRuta={hayRuta}
          modoSeleccionado={modoSeleccionado}
          onCambiarModo={onCambiarModo}
          onGenerar={onGenerar}
          testID={`route-action-${dayId}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  routeDestino: {
    marginTop: spacing.xxs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
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