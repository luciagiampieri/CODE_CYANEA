import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

const GOOGLE_MAPS_SCRIPT_ID = "cyanea-google-maps-script";

function markerIcon(kind) {
  switch (kind) {
    case "tripDestination":
      return "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
    case "savedPlace":
      return "https://maps.google.com/mapfiles/ms/icons/blue-dot.png";
    default:
      return "https://maps.google.com/mapfiles/ms/icons/red-dot.png";
  }
}

function computeMarkerKey(markerData) {
  return `${markerData.kind}-${markerData.id ?? markerData.placeId ?? markerData.name}`;
}

function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps solo esta disponible en web."));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  return new Promise((resolve, reject) => {
    const resolveWhenReady = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
        return true;
      }
      return false;
    };

    const rejectOnTimeout = window.setTimeout(() => {
      reject(new Error("Google Maps no termino de inicializarse."));
    }, 15000);

    const finishResolve = () => {
      window.clearTimeout(rejectOnTimeout);
      resolveWhenReady();
    };

    const finishReject = (message) => {
      window.clearTimeout(rejectOnTimeout);
      reject(new Error(message));
    };

    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existing) {
      if (resolveWhenReady()) {
        window.clearTimeout(rejectOnTimeout);
        return;
      }

      existing.addEventListener(
        "load",
        () => {
          if (!window.google?.maps) {
            finishReject("Google Maps cargo el script pero no inicializo la libreria.");
            return;
          }
          finishResolve();
        },
        { once: true }
      );
      existing.addEventListener("error", () => finishReject("No se pudo cargar Google Maps."), { once: true });
      return;
    }

    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      finishReject("Agrega EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY para activar el mapa interactivo en web.");
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=es&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google?.maps) {
        finishReject("Google Maps cargo el script pero no inicializo la libreria.");
        return;
      }
      finishResolve();
    };
    script.onerror = () => finishReject("No se pudo cargar Google Maps.");
    document.head.appendChild(script);
  });
}

export default function MapCanvas({
  initialCenter,
  markers = [],
  offline = false,
  highlightedMarkerId = null,
  onMarkerPress,
  onPlacePick,
  onViewportChange,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRefs = useRef([]);
  const placesServiceRef = useRef(null);
  const hasUserMovedMapRef = useRef(false);
  const lastAutoViewportKeyRef = useRef("");
  const onMarkerPressRef = useRef(onMarkerPress);
  const onPlacePickRef = useRef(onPlacePick);
  const onViewportChangeRef = useRef(onViewportChange);
  const highlightedMarkerIdRef = useRef(highlightedMarkerId);
  const highlightTimeoutRef = useRef(null);
  const previousHighlightedKeyRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const fallbackCenter = useMemo(() => {
    if (typeof initialCenter?.lat === "number" && typeof initialCenter?.lng === "number") {
      return initialCenter;
    }
    return { lat: -34.6037, lng: -58.3816 };
  }, [initialCenter]);

  useEffect(() => {
    onMarkerPressRef.current = onMarkerPress;
  }, [onMarkerPress]);

  useEffect(() => {
    onPlacePickRef.current = onPlacePick;
  }, [onPlacePick]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    highlightedMarkerIdRef.current = highlightedMarkerId;
  }, [highlightedMarkerId]);

  useEffect(() => {
    if (offline) {
      setStatus("error");
      setError("Sin conexion para cargar el mapa.");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setError("");

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;
        if (!containerRef.current) {
          setStatus("error");
          setError("No se pudo preparar el contenedor del mapa.");
          return;
        }

        mapRef.current = new maps.Map(containerRef.current, {
          center: fallbackCenter,
          zoom: initialCenter ? 6 : 4,
          disableDefaultUI: false,
          clickableIcons: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        if (maps.places?.PlacesService) {
          placesServiceRef.current = new maps.places.PlacesService(mapRef.current);
        }

        const emitViewport = () => {
          const center = mapRef.current?.getCenter?.();
          if (!center) return;
          onViewportChangeRef.current?.({
            lat: center.lat(),
            lng: center.lng(),
          });
        };

        mapRef.current.addListener("click", (event) => {
          if (!event.placeId || !placesServiceRef.current) {
            return;
          }

          if (typeof event.stop === "function") {
            event.stop();
          }

          placesServiceRef.current.getDetails(
            {
              placeId: event.placeId,
              fields: ["place_id", "name", "formatted_address", "geometry", "types", "url"],
            },
            (placeResult, detailsStatus) => {
              if (
                detailsStatus !== window.google.maps.places.PlacesServiceStatus.OK ||
                !placeResult?.geometry?.location
              ) {
                return;
              }

              onPlacePickRef.current?.({
                placeId: placeResult.place_id,
                name: placeResult.name ?? "Lugar sin nombre",
                address: placeResult.formatted_address ?? "",
                lat: placeResult.geometry.location.lat(),
                lng: placeResult.geometry.location.lng(),
                category: placeResult.types?.[0] ?? "Lugar de interes",
                kind: "searchResult",
                alreadySaved: false,
                metadata: {
                  googleMapsUrl: placeResult.url ?? null,
                  source: "google-maps-click",
                  types: placeResult.types ?? [],
                },
              });
            }
          );
        });
        mapRef.current.addListener("dragstart", () => {
          hasUserMovedMapRef.current = true;
        });
        mapRef.current.addListener("zoom_changed", () => {
          hasUserMovedMapRef.current = true;
        });
        mapRef.current.addListener("idle", emitViewport);
        emitViewport();

        setStatus("ready");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setStatus("error");
        setError(loadError.message || "No se pudo inicializar Google Maps.");
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackCenter, initialCenter, offline]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !window.google?.maps) return;

    markerRefs.current.forEach((entry) => entry.marker.setMap(null));
    markerRefs.current = [];

    const stableMarkers = markers.filter((marker) => !marker.volatile);

    markers.forEach((markerData) => {
      const key = computeMarkerKey(markerData);
      const isHighlighted = highlightedMarkerIdRef.current === key;
      const icon = isHighlighted
        ? { url: markerIcon(markerData.kind), scaledSize: new window.google.maps.Size(50, 50) }
        : markerIcon(markerData.kind);

      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: markerData.lat, lng: markerData.lng },
        title: markerData.name,
        icon,
        zIndex: isHighlighted ? 999 : undefined,
      });

      marker.addListener("click", () => onMarkerPressRef.current?.(markerData));
      markerRefs.current.push({ key, marker, data: markerData });
    });

    const bounds = new window.google.maps.LatLngBounds();
    stableMarkers.forEach((markerData) => {
      bounds.extend({ lat: markerData.lat, lng: markerData.lng });
    });

    const stableMarkersKey = stableMarkers
      .map((marker) => `${marker.kind}:${marker.id ?? marker.placeId ?? marker.name}`)
      .sort()
      .join("|");
    const shouldAutoAdjustViewport =
      !hasUserMovedMapRef.current || stableMarkersKey !== lastAutoViewportKeyRef.current;

    if (shouldAutoAdjustViewport) {
      if (stableMarkers.length > 1) {
        mapRef.current.fitBounds(bounds, 64);
      } else if (stableMarkers.length === 1) {
        mapRef.current.setCenter({ lat: stableMarkers[0].lat, lng: stableMarkers[0].lng });
        mapRef.current.setZoom(12);
      } else {
        mapRef.current.setCenter(fallbackCenter);
        mapRef.current.setZoom(initialCenter ? 6 : 4);
      }
      lastAutoViewportKeyRef.current = stableMarkersKey;
    }
  }, [fallbackCenter, initialCenter, markers, onMarkerPress, status]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !window.google?.maps) return undefined;

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    if (previousHighlightedKeyRef.current && previousHighlightedKeyRef.current !== highlightedMarkerId) {
      const previousEntry = markerRefs.current.find((entry) => entry.key === previousHighlightedKeyRef.current);
      if (previousEntry) {
        previousEntry.marker.setAnimation(null);
        previousEntry.marker.setIcon(markerIcon(previousEntry.data.kind));
        previousEntry.marker.setZIndex(undefined);
      }
    }

    if (!highlightedMarkerId) {
      previousHighlightedKeyRef.current = null;
      return undefined;
    }

    const entry = markerRefs.current.find((item) => item.key === highlightedMarkerId);
    if (!entry) {
      previousHighlightedKeyRef.current = null;
      return undefined;
    }

    entry.marker.setIcon({
      url: markerIcon(entry.data.kind),
      scaledSize: new window.google.maps.Size(50, 50),
    });
    entry.marker.setZIndex(999);
    entry.marker.setAnimation(window.google.maps.Animation.BOUNCE);
    mapRef.current.panTo(entry.marker.getPosition());

    highlightTimeoutRef.current = window.setTimeout(() => {
      entry.marker.setAnimation(null);
    }, 1400);

    previousHighlightedKeyRef.current = highlightedMarkerId;

    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, [highlightedMarkerId, status]);

  return (
    <View style={styles.wrap}>
      <div ref={containerRef} style={mapDomStyle} />

      {status === "loading" ? (
        <View style={[styles.overlay, styles.feedback]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.feedbackText}>Cargando Google Maps...</Text>
        </View>
      ) : null}

      {status === "error" ? (
        <View style={[styles.overlay, styles.feedback, styles.errorOverlay]}>
          <Text style={styles.feedbackTitle}>Configuracion pendiente de Google Maps</Text>
          <Text style={styles.feedbackText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const mapDomStyle = {
  width: "100%",
  height: "360px",
  borderRadius: `${radii.lg}px`,
};

const styles = StyleSheet.create({
  wrap: {
    ...surfaces.card,
    overflow: "hidden",
    minHeight: 320,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  feedback: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: "rgba(255, 250, 239, 0.92)",
  },
  errorOverlay: {
    backgroundColor: "rgba(255, 250, 239, 0.96)",
  },
  feedbackTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    textAlign: "center",
  },
  feedbackText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
});