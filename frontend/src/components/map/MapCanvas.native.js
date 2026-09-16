import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { decodePolyline } from "../../utils/polyline";
import MapPin from "./MapPin";

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

export default function MapCanvas({
  initialCenter,
  markers = [],
  offline = false,
  onMarkerPress,
  onPlacePick,
  onViewportChange,
  routePolyline = null,
  highlightedMarkerId = null,
  fullscreen = false,
  topInset = 0,
  bottomInset = 0,
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

  const routeCoordinates = useMemo(
    () =>
      decodePolyline(routePolyline).map((point) => ({
        latitude: point.lat,
        longitude: point.lng,
      })),
    [routePolyline]
  );

  useEffect(() => {
    if (!mapRef.current || routeCoordinates.length === 0) return;
    mapRef.current.fitToCoordinates(routeCoordinates, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated: true,
    });
  }, [routeCoordinates]);

  // Centra el mapa en el lugar seleccionado (el padding deja el pin fuera del panel).
  useEffect(() => {
    if (!highlightedMarkerId || !mapRef.current) return;
    const target = validMarkers.find(
      (marker) => `${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}` === highlightedMarkerId
    );
    if (!target) return;
    mapRef.current.animateCamera(
      { center: { latitude: target.lat, longitude: target.lng } },
      { duration: 350 }
    );
  }, [highlightedMarkerId, validMarkers]);

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
    <View style={fullscreen ? styles.fullscreenWrap : styles.wrap}>
      <View style={fullscreen ? styles.fullscreenCard : styles.mapCard}>
        <MapView
          ref={mapRef}
          initialRegion={region}
          mapPadding={{ top: topInset, right: 0, bottom: bottomInset, left: 0 }}
          provider={PROVIDER_GOOGLE}
          poiClickEnabled
          onPoiClick={handlePoiClick}
          onRegionChangeComplete={handleRegionChangeComplete}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          showsCompass
          showsIndoors={false}
          showsTraffic={false}
          style={fullscreen ? styles.fullscreenMap : styles.map}
        >
          {validMarkers.map((marker) => {
            const key = `${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`;
            return (
              <MapPin
                key={key}
                dimmed={Boolean(highlightedMarkerId) && key !== highlightedMarkerId}
                highlighted={key === highlightedMarkerId}
                marker={marker}
                onPress={onMarkerPress}
                showCallout={!fullscreen}
              />
            );
          })}

          {routeCoordinates.length > 0 ? (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={colors.accentStrong}
              strokeWidth={4}
            />
          ) : null}
        </MapView>

        {!fullscreen ? (
        <View pointerEvents="none" style={styles.overlayTop}>
          <View style={styles.hintPill}>
            <FontAwesome6 color={colors.primary} name="hand-pointer" size={12} />
            <Text style={styles.hintText}>Toca un marcador o un punto de interés para ver el detalle</Text>
          </View>
        </View>
        ) : null}

        {offline && !fullscreen ? (
          <View style={styles.offlineOverlay}>
            <FontAwesome6 color={colors.warning} name="wifi" size={14} />
            <Text style={styles.offlineText}>Sin conexión. El mapa puede no actualizar resultados.</Text>
          </View>
        ) : null}
      </View>

      {!fullscreen ? (
      <View style={styles.footer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accentStrong }]} />
          <Text style={styles.legendText}>Destino</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Guardado</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotResult]} />
          <Text style={styles.legendText}>Resultado</Text>
        </View>
      </View>
      ) : null}

      {validMarkers.length === 0 && !fullscreen ? (
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
  fullscreenWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  fullscreenCard: {
    flex: 1,
  },
  fullscreenMap: {
    flex: 1,
  },
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
  legendDotResult: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
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