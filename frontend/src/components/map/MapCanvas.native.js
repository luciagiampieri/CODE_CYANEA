import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

const DEFAULT_CENTER = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.28,
  longitudeDelta: 0.28,
};

function buildInitialRegion(initialCenter) {
  if (typeof initialCenter?.lat === "number" && typeof initialCenter?.lng === "number") {
    return {
      latitude: initialCenter.lat,
      longitude: initialCenter.lng,
      latitudeDelta: 0.28,
      longitudeDelta: 0.28,
    };
  }

  return DEFAULT_CENTER;
}

function resolveMarkerColor(kind) {
  switch (kind) {
    case "tripDestination":
      return colors.accentStrong;
    case "savedPlace":
      return colors.primarySoft;
    default:
      return colors.danger;
  }
}

export default function MapCanvas({
  initialCenter,
  markers = [],
  offline = false,
  onMarkerPress,
  onPlacePick,
  onViewportChange,
}) {
  const mapRef = useRef(null);
  const hasMountedRegionRef = useRef(false);
  const [region, setRegion] = useState(() => buildInitialRegion(initialCenter));

  const validMarkers = useMemo(
    () =>
      markers.filter(
        (marker) => typeof marker?.lat === "number" && typeof marker?.lng === "number"
      ),
    [markers]
  );

  useEffect(() => {
    if (hasMountedRegionRef.current) return;
    const nextRegion = buildInitialRegion(initialCenter);
    setRegion(nextRegion);
    hasMountedRegionRef.current = true;
    onViewportChange?.({
      lat: nextRegion.latitude,
      lng: nextRegion.longitude,
    });
  }, [initialCenter, onViewportChange]);

  function handleRegionChangeComplete(nextRegion) {
    setRegion(nextRegion);
    onViewportChange?.({
      lat: nextRegion.latitude,
      lng: nextRegion.longitude,
    });
  }

  function handlePoiClick(event) {
    const poi = event?.nativeEvent;
    if (!poi?.placeId || !poi?.coordinate) return;

    onPlacePick?.({
      placeId: `google:${poi.placeId}`,
      name: poi.name ?? "Lugar de interés",
      address: poi.name ?? "Lugar de interés",
      lat: poi.coordinate.latitude,
      lng: poi.coordinate.longitude,
      category: "Lugar de interés",
      kind: "searchResult",
      alreadySaved: false,
      metadata: {
        source: "google-maps-poi",
      },
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.mapCard}>
        <MapView
          ref={mapRef}
          initialRegion={region}
          provider={PROVIDER_GOOGLE}
          poiClickEnabled
          onPoiClick={handlePoiClick}
          onRegionChangeComplete={handleRegionChangeComplete}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          showsCompass
          showsIndoors={false}
          showsTraffic={false}
          style={styles.map}
        >
          {validMarkers.map((marker) => (
            <Marker
              key={`${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`}
              coordinate={{ latitude: marker.lat, longitude: marker.lng }}
              onPress={() => onMarkerPress?.(marker)}
              pinColor={resolveMarkerColor(marker.kind)}
              title={marker.name}
              description={marker.address}
            />
          ))}
        </MapView>

        <View pointerEvents="none" style={styles.overlayTop}>
          <View style={styles.hintPill}>
            <FontAwesome6 color={colors.primary} name="hand-pointer" size={12} />
            <Text style={styles.hintText}>Toca un marcador o un punto de interés para ver el detalle</Text>
          </View>
        </View>

        {offline ? (
          <View style={styles.offlineOverlay}>
            <FontAwesome6 color={colors.warning} name="wifi" size={14} />
            <Text style={styles.offlineText}>Sin conexión. El mapa puede no actualizar resultados.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accentStrong }]} />
          <Text style={styles.legendText}>Destino</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primarySoft }]} />
          <Text style={styles.legendText}>Guardado</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>Resultado</Text>
        </View>
      </View>

      {validMarkers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Todavía no hay puntos para mostrar.</Text>
          <Text style={styles.emptyCopy}>
            Busca un lugar o agrega destinos base para empezar a explorar el mapa.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  mapCard: {
    ...surfaces.card,
    overflow: "hidden",
    minHeight: 360,
  },
  map: {
    width: "100%",
    minHeight: 360,
  },
  overlayTop: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  hintPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: {
    ...textStyles.meta,
    color: colors.primary,
  },
  offlineOverlay: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "rgba(255,244,198,0.96)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  offlineText: {
    ...textStyles.meta,
    color: colors.warning,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  emptyCard: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  emptyCopy: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
});
