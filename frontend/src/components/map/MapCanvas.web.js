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

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    markers.forEach((markerData) => {
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: markerData.lat, lng: markerData.lng },
        title: markerData.name,
        icon: markerIcon(markerData.kind),
      });

      marker.addListener("click", () => onMarkerPressRef.current?.(markerData));
      markerRefs.current.push(marker);
      bounds.extend(marker.getPosition());
    });

    const autoViewportKey = markers
      .map((marker) => `${marker.kind}:${marker.id ?? marker.placeId ?? marker.name}`)
      .sort()
      .join("|");
    const shouldAutoAdjustViewport =
      !hasUserMovedMapRef.current || autoViewportKey !== lastAutoViewportKeyRef.current;

    if (shouldAutoAdjustViewport) {
      if (markers.length > 1) {
        mapRef.current.fitBounds(bounds, 64);
      } else if (markers.length === 1) {
        mapRef.current.setCenter({ lat: markers[0].lat, lng: markers[0].lng });
        mapRef.current.setZoom(12);
      } else {
        mapRef.current.setCenter(fallbackCenter);
        mapRef.current.setZoom(initialCenter ? 6 : 4);
      }
      lastAutoViewportKeyRef.current = autoViewportKey;
    }
  }, [fallbackCenter, initialCenter, markers, onMarkerPress, status]);

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
