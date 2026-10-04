import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";
import { decodePolyline } from "../../utils/polyline";

import MapPin from "./MapPin.native";

// Google Maps en Android; en iOS, Apple Maps. Google Maps en iOS requiere una
// build propia con su clave de API configurada y en Expo Go deja el mapa en
// blanco, mientras que Apple Maps funciona sin configuración.
export const MAP_PROVIDER = Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

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
    case "routeStop":
      return colors.primary;
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
          provider={MAP_PROVIDER}
          onRegionChangeComplete={handleRegionChangeComplete}
          mapPadding={{
            top: topInset,
            right: 0,
            bottom: bottomInset,
            left: 0,
          }}
          zoomEnabled={true}
          zoomControlEnabled={true}
          scrollEnabled={true}
          poiClickEnabled
          onPoiClick={handlePoiClick}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          showCompass
          showIndoors={false}
          showTraffic={false}
          style={fullscreen ? styles.fullscreenMap : styles.map}
        >
          {validMarkers.map((marker) => (
            <MapPin
              key={`${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`}
              marker={marker}
              highlighted={marker.id === highlightedMarkerId || marker.placeId === highlightedMarkerId}
              onPress={onMarkerPress}
              showCallout
            />
          ))}

          {routeCoordinates.length > 0 ? (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={colors.accentStrong}
              strokeWidth={4}
            />
          ) : null}
        </MapView>

        {offline ? (
          <View style={styles.offlineOverlay}>
            <FontAwesome6 color={colors.warning} name="wifi" size={14} />
            <Text style={styles.offlineText}>Sin conexión. El mapa puede no actualizar resultados.</Text>
          </View>
        ) : null}
      </View>

      {fullscreen ? null : (
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
      )}

      {!fullscreen && validMarkers.length === 0 ? (
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
    minHeight: 400,
  },
  // Con alto fijo: un alto en porcentaje dentro de una tarjeta que solo tiene
  // alto mínimo se resuelve como 0 en nativo y el mapa no se ve.
  map: {
    width: "100%",
    height: 400,
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
  // Posiciones escritas explícitamente en lugar de StyleSheet.absoluteFillObject:
  // si esa constante no está disponible en la versión de React Native, el
  // spread no aplica ningún estilo y el mapa queda con alto 0.
  fullscreenWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  fullscreenCard: {
    flex: 1,
    overflow: "hidden",
  },
  fullscreenMap: {
    flex: 1,
  },
});