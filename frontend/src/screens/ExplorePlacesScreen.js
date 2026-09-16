import NetInfo from "@react-native-community/netinfo";
import { FontAwesome6 } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import CategoryChips from "../components/explore/CategoryChips";
import ExploreSearchBar, { SearchResultsPanel } from "../components/explore/ExploreSearchBar";
import ExploreSheet, {
  SIDE_PANEL_WIDTH,
  useIsSidePanel,
  useSheetHeights,
} from "../components/explore/ExploreSheet";
import PlaceListItem from "../components/explore/PlaceListItem";
import {
  NEARBY_CATEGORIES,
  NEARBY_PAGE_SIZE,
  formatDistance,
  getMarkerKey,
  groupSavedPlacesByDay,
  hasCoordinates,
  hasMovedEnough,
  mergeWithSaved,
  normalizeDestination,
  resolveTripDays,
  resolveVisibleCategory,
} from "../components/explore/exploreUtils";
import ScreenContainer from "../components/layout/ScreenContainer";
import MapCanvas from "../components/map/MapCanvas";
import PlaceDetailSheet from "../components/map/PlaceDetailSheet";
import PlaceScheduleSheet from "../components/map/PlaceScheduleSheet";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  getNearbyPlaces,
  getPlaceDetails,
  getTripDetail,
  getTripPlaces,
  getTripPopularPlaces,
  resolveTripPlace,
  saveTripPlace,
  scheduleTripPlace,
  searchTripPlaces,
} from "../services/api";
import { colors, radii, shadows, spacing, textStyles } from "../theme/tokens";
import { getTripLock } from "../utils/tripLock";

// Altura aproximada de buscador + chips; el mapa la usa como padding superior.
const TOP_OVERLAY_HEIGHT = 124;
const BANNER_HEIGHT = 40;

export default function ExplorePlacesScreen({ navigation, route }) {
  const tripId = route.params?.tripId;
  const isSidePanel = useIsSidePanel();
  const [containerHeight, setContainerHeight] = useState(0);
  const sheetHeights = useSheetHeights(containerHeight);
  const searchInputRef = useRef(null);

  // --- Datos del viaje ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trip, setTrip] = useState(null);
  const [places, setPlaces] = useState([]);
  const [offline, setOffline] = useState(false);

  // --- Búsqueda ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  // --- Zona del mapa ---
  // viewportCenter: dónde está mirando el usuario ahora.
  // searchCenter: sobre qué zona se cargaron imperdibles y cercanos.
  const [viewportCenter, setViewportCenter] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);

  // --- Imperdibles ---
  const [popularRaw, setPopularRaw] = useState([]);
  const [popularContext, setPopularContext] = useState("");
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState("");

  // --- Cercanos por categoría ---
  const [activeCategory, setActiveCategory] = useState(null);
  const [nearbyRaw, setNearbyRaw] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState("");
  const [nearbyVisibleCount, setNearbyVisibleCount] = useState(NEARBY_PAGE_SIZE);

  // --- Panel ---
  const [activeTab, setActiveTab] = useState("discover");
  const [sheetSnap, setSheetSnap] = useState("half");

  // --- Lugar seleccionado y acciones ---
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [loadingPlaceDetails, setLoadingPlaceDetails] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [savingAndScheduling, setSavingAndScheduling] = useState(false);
  const [schedulingPlace, setSchedulingPlace] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);

  // --- Toast ---
  const [toast, setToast] = useState(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = useRef(null);

  const lock = useMemo(() => getTripLock(trip), [trip]);
  const readOnly = !lock.canEdit("itinerario");

  // ---------------------------------------------------------------------------
  // Carga
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    },
    []
  );

  /**
   * silent = true refresca sin desmontar el mapa (después de guardar/agendar).
   * Devuelve los lugares actualizados para poder usarlos en el mismo handler.
   */
  const loadExploreData = useCallback(
    async ({ silent = false } = {}) => {
      if (!tripId) {
        setError("No encontramos el viaje. Volvé atrás y abrilo de nuevo.");
        setLoading(false);
        return [];
      }

      try {
        if (!silent) {
          setLoading(true);
          setError("");
        }
        const [tripDetail, tripPlaces] = await Promise.all([
          getTripDetail(tripId),
          getTripPlaces(tripId),
        ]);
        setTrip({ ...tripDetail, hasLeft: tripDetail.hasLeft ?? tripDetail.HasLeft ?? false });
        setPlaces(tripPlaces);
        return tripPlaces;
      } catch (loadError) {
        if (!silent) {
          setError(loadError.message || "No se pudo cargar el mapa del viaje.");
        }
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tripId]
  );

  useEffect(() => {
    loadExploreData();
  }, [loadExploreData]);

  // ---------------------------------------------------------------------------
  // Datos derivados
  // ---------------------------------------------------------------------------

  const destinationMarkers = useMemo(
    () => (trip?.destinations || []).map(normalizeDestination).filter(hasCoordinates),
    [trip?.destinations]
  );

  const savedPlacesByPlaceId = useMemo(() => {
    const map = new Map();
    places.forEach((place) => {
      if (place.placeId) map.set(place.placeId, { ...place, kind: "savedPlace" });
    });
    return map;
  }, [places]);

  const savedPlaceMarkers = useMemo(
    () => places.map((place) => ({ ...place, kind: "savedPlace" })).filter(hasCoordinates),
    [places]
  );

  const searchSuggestions = useMemo(
    () => searchResults.map((item) => mergeWithSaved(item, savedPlacesByPlaceId)),
    [savedPlacesByPlaceId, searchResults]
  );

  // "volatile" = el mapa no reencuadra por estos pines (el usuario ya eligió la zona).
  const popularPlaces = useMemo(
    () => popularRaw.map((item) => mergeWithSaved(item, savedPlacesByPlaceId, { volatile: true })),
    [popularRaw, savedPlacesByPlaceId]
  );

  const nearbyPlaces = useMemo(
    () =>
      nearbyRaw
        .map((item) => mergeWithSaved(item, savedPlacesByPlaceId, { volatile: true }))
        .filter(hasCoordinates),
    [nearbyRaw, savedPlacesByPlaceId]
  );

  const tripDays = useMemo(() => resolveTripDays(trip), [trip]);

  const savedGroups = useMemo(() => groupSavedPlacesByDay(places, tripDays), [places, tripDays]);

  const activeCategoryConfig = NEARBY_CATEGORIES.find((item) => item.key === activeCategory) ?? null;

  const listMode = activeTab === "saved" ? "saved" : activeCategory ? "nearby" : "popular";

  const initialCenter = useMemo(() => {
    const first = destinationMarkers[0] ?? savedPlaceMarkers[0];
    return first ? { lat: first.lat, lng: first.lng } : null;
  }, [destinationMarkers, savedPlaceMarkers]);

  // El mapa muestra lo que corresponde a la lista abierta, para que ambos cuenten lo mismo.
  const mapMarkers = useMemo(() => {
    const unique = new Map();
    const add = (marker) => unique.set(getMarkerKey(marker), marker);

    destinationMarkers.forEach(add);
    savedPlaceMarkers.forEach(add);
    // El número del pin coincide con el puesto en la lista de imperdibles.
    if (listMode === "popular") {
      popularPlaces.forEach((place, index) => {
        if (hasCoordinates(place)) add({ ...place, pinLabel: String(index + 1) });
      });
    }
    if (listMode === "nearby") {
      nearbyPlaces.forEach((place) => add({ ...place, pinIcon: activeCategoryConfig?.icon }));
    }
    if (selectedPlace && hasCoordinates(selectedPlace)) {
      // Conserva el número o ícono que ya tenía el pin al seleccionarlo.
      const existing = unique.get(getMarkerKey(selectedPlace));
      add({ ...existing, ...selectedPlace, volatile: true });
    }

    return Array.from(unique.values());
  }, [
    activeCategoryConfig,
    destinationMarkers,
    listMode,
    nearbyPlaces,
    popularPlaces,
    savedPlaceMarkers,
    selectedPlace,
  ]);

  const highlightedMarkerKey = selectedPlace ? getMarkerKey(selectedPlace) : null;

  const visibleSheetHeight = isSidePanel ? 0 : sheetHeights[sheetSnap];

  const showSearchHere =
    !searchFocused &&
    !selectedPlace &&
    listMode !== "saved" &&
    hasMovedEnough(searchCenter, viewportCenter);

  // ---------------------------------------------------------------------------
  // Efectos de red
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!initialCenter) return;
    setViewportCenter((current) => current ?? initialCenter);
    setSearchCenter((current) => current ?? initialCenter);
  }, [initialCenter]);

  // Imperdibles: se piden solo cuando cambia la zona elegida, no en cada movimiento.
  useEffect(() => {
    if (!tripId || !searchCenter) return undefined;

    if (offline) {
      setPopularError("Sin conexión. Conectate a internet para ver los imperdibles de la zona.");
      setPopularRaw([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        setPopularLoading(true);
        setPopularError("");
        const response = await getTripPopularPlaces(tripId, searchCenter.lat, searchCenter.lng, 8);
        if (cancelled) return;
        setPopularContext(response.contextLabel || "");
        setPopularRaw(response.items || []);
      } catch (loadError) {
        if (!cancelled) {
          setPopularError(loadError.message || "No se pudieron cargar los imperdibles de la zona.");
        }
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, searchCenter, offline]);

  useEffect(() => {
    if (!tripId || !searchCenter || !activeCategoryConfig) {
      setNearbyRaw([]);
      setNearbyError("");
      setNearbyLoading(false);
      return undefined;
    }

    if (offline) {
      setNearbyError("Sin conexión. Conectate a internet para buscar lugares cercanos.");
      setNearbyRaw([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        setNearbyLoading(true);
        setNearbyError("");
        const response = await getNearbyPlaces(
          tripId,
          searchCenter.lat,
          searchCenter.lng,
          activeCategoryConfig.apiKey
        );
        if (cancelled) return;
        const items = response.items || [];
        setNearbyRaw(items);
        if (items.length === 0) {
          setNearbyError("No hay resultados de esta categoría en la zona. Mové el mapa y probá de nuevo.");
        }
      } catch (loadError) {
        if (!cancelled) {
          setNearbyError(loadError.message || "No se pudieron buscar lugares cercanos.");
          setNearbyRaw([]);
        }
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, searchCenter, activeCategoryConfig, offline]);

  useEffect(() => {
    setNearbyVisibleCount(NEARBY_PAGE_SIZE);
  }, [activeCategory, searchCenter]);

  // Autocompletado del buscador.
  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearching(false);
      return undefined;
    }

    if (offline) {
      setSearchResults([]);
      setSearchError("Sin conexión. Conectate a internet para buscar lugares.");
      return undefined;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError("");
        const results = await searchTripPlaces(tripId, query);
        if (cancelled) return;
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError(`No encontramos lugares para "${query}". Probá con otro nombre.`);
        }
      } catch (searchRequestError) {
        if (cancelled) return;
        setSearchError(searchRequestError.message || "No se pudieron buscar lugares.");
        setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, tripId, offline]);

  // Reseñas y datos extra del lugar seleccionado.
  useEffect(() => {
    if (!tripId || !selectedPlace?.placeId) return undefined;
    let cancelled = false;
    const placeId = selectedPlace.placeId;

    (async () => {
      try {
        setLoadingPlaceDetails(true);
        const details = await getPlaceDetails(tripId, placeId);
        if (cancelled) return;
        setSelectedPlace((current) =>
          current?.placeId !== placeId
            ? current
            : {
                ...current,
                name: details.name ?? current.name,
                address: details.address ?? current.address,
                rating: details.rating ?? current.rating,
                userRatingsTotal: details.userRatingsTotal ?? current.userRatingsTotal,
                googleMapsUri: details.googleMapsUri ?? current.googleMapsUri,
                reviews: details.reviews ?? [],
                category: details.category ?? current.category,
              }
        );
      } catch {
        if (cancelled) return;
        setSelectedPlace((current) =>
          current?.placeId !== placeId ? current : { ...current, reviews: current.reviews ?? [] }
        );
      } finally {
        if (!cancelled) setLoadingPlaceDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, selectedPlace?.placeId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function showToast(message, tone = "success") {
    if (!message) return;
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, tone });
    Animated.timing(toastOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    toastTimeoutRef.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
        setToast(null)
      );
    }, 2600);
  }

  const handleViewportChange = useCallback((nextCenter) => {
    if (!nextCenter?.lat || !nextCenter?.lng) return;
    setViewportCenter((current) => {
      if (!current) return nextCenter;
      const unchanged =
        Math.abs(current.lat - nextCenter.lat) < 0.002 &&
        Math.abs(current.lng - nextCenter.lng) < 0.002;
      return unchanged ? current : nextCenter;
    });
  }, []);

  function handleSearchHere() {
    if (viewportCenter) setSearchCenter(viewportCenter);
    if (sheetSnap === "peek") setSheetSnap("half");
  }

  function closeSearch({ clear = true } = {}) {
    Keyboard.dismiss();
    searchInputRef.current?.blur?.();
    setSearchFocused(false);
    if (clear) {
      setSearchQuery("");
      setSearchResults([]);
      setSearchError("");
    }
  }

  function handleBack() {
    if (searchFocused) {
      closeSearch();
      return;
    }
    if (selectedPlace) {
      setSelectedPlace(null);
      return;
    }
    navigation.goBack();
  }

  function handleCategoryPress(categoryKey) {
    setSelectedPlace(null);
    setActiveTab("discover");
    if (categoryKey === activeCategory) {
      setActiveCategory(null);
      return;
    }
    setActiveCategory(categoryKey);
    // Buscamos donde el usuario está mirando ahora.
    if (viewportCenter) setSearchCenter(viewportCenter);
    setSheetSnap("half");
  }

  function handleTabChange(tab) {
    setSelectedPlace(null);
    setActiveTab(tab);
    if (sheetSnap === "peek") setSheetSnap("half");
  }

  function resolveSaved(place) {
    if (!place) return null;
    if (place.kind === "savedPlace") return place;
    return (place.placeId && savedPlacesByPlaceId.get(place.placeId)) || place;
  }

  async function handleSelectPlace(place) {
    if (!place) return;
    closeSearch();
    setSheetSnap((current) => (current === "peek" ? "half" : current));

    if (place.kind === "savedPlace" || place.kind === "tripDestination" || !place.placeId) {
      setSelectedPlace(place);
      return;
    }

    const saved = savedPlacesByPlaceId.get(place.placeId);
    if (saved) {
      setSelectedPlace({ ...saved, alreadySaved: true });
      return;
    }

    // Mostramos lo que ya tenemos mientras se resuelve el lugar completo.
    setSelectedPlace({ ...place, kind: "searchResult", alreadySaved: false });

    try {
      setLoadingPlaceDetails(true);
      const resolved = await resolveTripPlace(tripId, place.placeId);
      const resolvedSaved = savedPlacesByPlaceId.get(resolved.placeId);
      setSelectedPlace((current) => {
        if (current?.placeId !== place.placeId) return current;
        return resolvedSaved
          ? { ...resolvedSaved, alreadySaved: true }
          : { ...current, ...resolved, kind: "searchResult", alreadySaved: false };
      });
    } catch (resolveError) {
      showToast(resolveError.message || "No se pudo abrir la información del lugar.", "error");
    } finally {
      setLoadingPlaceDetails(false);
    }
  }

  async function persistPlace(placeToSave) {
    if (readOnly || !placeToSave || placeToSave.kind !== "searchResult") return null;

    const response = await saveTripPlace(tripId, {
      placeId: placeToSave.placeId,
      name: placeToSave.name,
      address: placeToSave.address,
      lat: placeToSave.lat,
      lng: placeToSave.lng,
      category: placeToSave.category,
      metadata: placeToSave.metadata,
    });

    await loadExploreData({ silent: true });
    return response;
  }

  async function handleSaveSelectedPlace() {
    if (!selectedPlace || selectedPlace.kind !== "searchResult") return;
    try {
      setSavingPlace(true);
      const response = await persistPlace(selectedPlace);
      if (!response) return;
      setSelectedPlace({ ...response.place, kind: "savedPlace" });
      showToast(response.message || "Guardado en el viaje");
    } catch (saveError) {
      showToast(saveError.message || "No se pudo guardar el lugar.", "error");
    } finally {
      setSavingPlace(false);
    }
  }

  async function handleSaveAndScheduleSelectedPlace() {
    if (!selectedPlace) return;
    try {
      setSavingAndScheduling(true);

      const alreadySaved = resolveSaved(selectedPlace);
      if (alreadySaved?.kind === "savedPlace") {
        setSelectedPlace(alreadySaved);
        setScheduleTarget(alreadySaved);
        return;
      }

      const response = await persistPlace(selectedPlace);
      if (!response?.place) return;

      const savedPlace = { ...response.place, kind: "savedPlace" };
      setSelectedPlace(savedPlace);
      setScheduleTarget(savedPlace);
    } catch (saveError) {
      showToast(saveError.message || "No se pudo preparar el lugar para el itinerario.", "error");
    } finally {
      setSavingAndScheduling(false);
    }
  }

  function handleOpenSchedule(place) {
    if (readOnly) return;
    const saved = resolveSaved(place);
    if (saved?.kind === "savedPlace") setScheduleTarget(saved);
  }

  async function handleSchedulePlace(payload) {
    if (!scheduleTarget?.id) return;
    const targetId = scheduleTarget.id;
    setSchedulingPlace(true);
    try {
      await scheduleTripPlace(tripId, targetId, payload);
      setScheduleTarget(null);
      showToast("Agregado al itinerario");
      const updatedPlaces = await loadExploreData({ silent: true });
      const updated = updatedPlaces.find((item) => item.id === targetId);
      if (updated) {
        setSelectedPlace((current) =>
          current && current.id === targetId ? { ...updated, kind: "savedPlace" } : current
        );
      }
    } finally {
      setSchedulingPlace(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render del panel
  // ---------------------------------------------------------------------------

  function renderSheetHeader() {
    if (selectedPlace) {
      return (
        <View style={styles.detailHeader}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setSelectedPlace(null)}
            style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}
          >
            <FontAwesome6 color={colors.primary} name="chevron-left" size={12} />
            <Text style={styles.backLinkText}>
              {listMode === "saved"
                ? "Guardados"
                : listMode === "nearby"
                  ? activeCategoryConfig?.label
                  : "Imperdibles"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar detalle"
            hitSlop={8}
            onPress={() => setSelectedPlace(null)}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <FontAwesome6 color={colors.textSecondary} name="xmark" size={14} />
          </Pressable>
        </View>
      );
    }

    const pendingCount = savedGroups.unscheduled.length;

    return (
      <View>
        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "discover" }}
            onPress={() => handleTabChange("discover")}
            style={[styles.tab, activeTab === "discover" && styles.tabActive]}
          >
            <FontAwesome6
              color={activeTab === "discover" ? colors.primary : colors.textSecondary}
              name="compass"
              size={13}
            />
            <Text style={[styles.tabText, activeTab === "discover" && styles.tabTextActive]}>Descubrir</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "saved" }}
            onPress={() => handleTabChange("saved")}
            style={[styles.tab, activeTab === "saved" && styles.tabActive]}
          >
            <FontAwesome6
              color={activeTab === "saved" ? colors.primary : colors.textSecondary}
              name="bookmark"
              size={13}
            />
            <Text style={[styles.tabText, activeTab === "saved" && styles.tabTextActive]}>Guardados</Text>
            <View style={[styles.countBubble, pendingCount > 0 && styles.countBubblePending]}>
              <Text style={[styles.countText, pendingCount > 0 && styles.countTextPending]}>
                {places.length}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.listHeading}>{renderListTitle()}</View>
      </View>
    );
  }

  function renderListTitle() {
    if (listMode === "saved") {
      const pending = savedGroups.unscheduled.length;
      return (
        <>
          <Text style={styles.listTitle}>Tus lugares del viaje</Text>
          <Text style={styles.listSubtitle}>
            {places.length === 0
              ? "Todavía no guardaste ninguno"
              : pending > 0
                ? `${pending} ${pending === 1 ? "lugar espera" : "lugares esperan"} un día en el itinerario`
                : "Todos tienen un día asignado"}
          </Text>
        </>
      );
    }

    if (listMode === "nearby") {
      return (
        <>
          <Text style={styles.listTitle}>{activeCategoryConfig?.label} en esta zona</Text>
          <Text style={styles.listSubtitle}>
            {nearbyLoading
              ? "Buscando…"
              : nearbyPlaces.length > 0
                ? `${nearbyPlaces.length} resultados, del más cercano al más lejano`
                : "Ordenados por distancia al centro del mapa"}
          </Text>
        </>
      );
    }

    return (
      <>
        <Text style={styles.listTitle}>
          {popularContext ? `Imperdibles de ${popularContext}` : "Imperdibles de la zona"}
        </Text>
        <Text style={styles.listSubtitle}>Los lugares mejor valorados cerca del centro del mapa</Text>
      </>
    );
  }

  function renderStateMessage({ icon, title, copy, tone = "neutral" }) {
    return (
      <View style={styles.stateBox}>
        <FontAwesome6
          color={tone === "warning" ? colors.warning : colors.primarySoft}
          name={icon}
          size={20}
        />
        <Text style={styles.stateTitle}>{title}</Text>
        {copy ? <Text style={styles.stateCopy}>{copy}</Text> : null}
      </View>
    );
  }

  function renderLoadingRows() {
    return (
      <View style={styles.loadingRows}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  function renderPopular() {
    if (popularLoading) return renderLoadingRows();
    if (popularError) {
      return renderStateMessage({ icon: "wifi", title: popularError, tone: "warning" });
    }
    if (popularPlaces.length === 0) {
      return renderStateMessage({
        icon: "map",
        title: "No hay imperdibles para esta zona",
        copy: "Mové el mapa hacia uno de los destinos del viaje y tocá “Buscar en esta zona”.",
      });
    }
    return popularPlaces.map((place, index) => (
      <PlaceListItem
        key={`popular-${place.placeId ?? place.id}-${index}`}
        highlighted={highlightedMarkerKey === getMarkerKey(place)}
        onPress={handleSelectPlace}
        place={place}
        rank={index + 1}
        detail={resolveVisibleCategory(place.category)}
        badge={place.alreadySaved ? { label: "Guardado" } : null}
      />
    ));
  }

  function renderNearby() {
    if (nearbyLoading) return renderLoadingRows();
    if (nearbyError) {
      return renderStateMessage({ icon: activeCategoryConfig?.icon ?? "location-dot", title: nearbyError, tone: "warning" });
    }

    const visible = nearbyPlaces.slice(0, nearbyVisibleCount);
    const remaining = nearbyPlaces.length - visible.length;

    return (
      <>
        {visible.map((place) => (
          <PlaceListItem
            key={`nearby-${place.placeId ?? place.id}-${place.name}`}
            highlighted={highlightedMarkerKey === getMarkerKey(place)}
            icon={activeCategoryConfig?.icon}
            onPress={handleSelectPlace}
            place={place}
            detail={[formatDistance(place.distanceMeters), resolveVisibleCategory(place.category)]
              .filter(Boolean)
              .join(", ")}
            badge={place.alreadySaved ? { label: "Guardado" } : null}
          />
        ))}
        {remaining > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setNearbyVisibleCount((count) => count + NEARBY_PAGE_SIZE)}
            style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
          >
            <Text style={styles.moreText}>
              Mostrar {Math.min(NEARBY_PAGE_SIZE, remaining)} más
            </Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  function renderSaved() {
    if (places.length === 0) {
      return renderStateMessage({
        icon: "bookmark",
        title: "Guardá lugares para armar tu itinerario",
        copy: "Buscá un sitio o tocá un imperdible y elegí “Guardar en el viaje”.",
      });
    }

    const scheduleAction = readOnly ? null : { label: "Agendar", onPress: handleOpenSchedule };

    return (
      <>
        {savedGroups.unscheduled.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Sin día asignado</Text>
            {savedGroups.unscheduled.map((place) => (
              <PlaceListItem
                key={`unscheduled-${place.id}`}
                action={scheduleAction}
                highlighted={highlightedMarkerKey === getMarkerKey({ ...place, kind: "savedPlace" })}
                onPress={(item) => handleSelectPlace({ ...item, kind: "savedPlace" })}
                place={{ ...place, kind: "savedPlace" }}
                detail={place.address}
                badge={scheduleAction ? null : { label: "Sin día", tone: "pending" }}
              />
            ))}
          </View>
        ) : null}

        {savedGroups.dayGroups.map((group) => (
          <View key={`day-${group.dayIndex}`} style={styles.group}>
            <View style={styles.groupHeading}>
              <Text style={styles.groupTitle}>Día {group.dayIndex}</Text>
              {group.dateLabel ? <Text style={styles.groupDate}>{group.dateLabel}</Text> : null}
            </View>
            {group.places.map((place) => (
              <PlaceListItem
                key={`day-${group.dayIndex}-${place.id}`}
                onPress={(item) => handleSelectPlace({ ...item, kind: "savedPlace" })}
                place={{ ...place, kind: "savedPlace" }}
                detail={place.address}
              />
            ))}
          </View>
        ))}
      </>
    );
  }

  function renderSheetBody() {
    if (selectedPlace) {
      return (
        <PlaceDetailSheet
          embedded
          readOnly={readOnly}
          loadingDetails={loadingPlaceDetails}
          onClose={() => setSelectedPlace(null)}
          onSave={handleSaveSelectedPlace}
          onSaveAndSchedule={handleSaveAndScheduleSelectedPlace}
          onSchedule={() => handleOpenSchedule(selectedPlace)}
          place={selectedPlace}
          saving={savingPlace}
          savingAndScheduling={savingAndScheduling}
          scheduling={schedulingPlace}
        />
      );
    }
    if (listMode === "saved") return renderSaved();
    if (listMode === "nearby") return renderNearby();
    return renderPopular();
  }

  // ---------------------------------------------------------------------------
  // Render principal
  // ---------------------------------------------------------------------------

  if (loading || error) {
    return (
      <ScreenContainer fullWidth padded={false}>
        <View style={styles.fullState}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.stateCopy}>Cargando el mapa del viaje…</Text>
            </>
          ) : (
            <>
              {renderStateMessage({ icon: "map-location-dot", title: "No se pudo abrir el mapa", copy: error })}
              <View style={styles.fullStateActions}>
                <PrimaryButton label="Reintentar" onPress={() => loadExploreData()} />
                <PrimaryButton label="Volver" onPress={() => navigation.goBack()} variant="secondary" />
              </View>
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const bannerCount = Number(readOnly) + Number(offline);
  const topAreaStyle = isSidePanel ? { width: SIDE_PANEL_WIDTH } : null;
  const sheetKey = selectedPlace ? `detail-${getMarkerKey(selectedPlace)}` : `${listMode}-${activeCategory}`;

  return (
    <ScreenContainer fullWidth padded={false}>
      <View
        onLayout={(event) => setContainerHeight(event.nativeEvent.layout.height)}
        style={styles.screen}
      >
        <MapCanvas
          fullscreen
          bottomInset={visibleSheetHeight}
          highlightedMarkerId={highlightedMarkerKey}
          initialCenter={initialCenter}
          leftInset={isSidePanel ? SIDE_PANEL_WIDTH : 0}
          markers={mapMarkers}
          offline={offline}
          onMarkerPress={handleSelectPlace}
          onPlacePick={handleSelectPlace}
          onViewportChange={handleViewportChange}
          topInset={isSidePanel ? 0 : TOP_OVERLAY_HEIGHT}
        />

        {!searchFocused ? (
          <ExploreSheet
            containerHeight={containerHeight}
            header={renderSheetHeader()}
            onSnapChange={setSheetSnap}
            scrollKey={sheetKey}
            snap={sheetSnap}
          >
            {renderSheetBody()}
          </ExploreSheet>
        ) : null}

        {searchFocused ? (
          <SearchResultsPanel
            error={searchError}
            onSelect={handleSelectPlace}
            query={searchQuery}
            results={searchSuggestions}
            style={[styles.searchPanel, topAreaStyle]}
          />
        ) : null}

        <View pointerEvents="box-none" style={[styles.topArea, topAreaStyle]}>
          <View style={styles.searchWrap}>
            <ExploreSearchBar
              ref={searchInputRef}
              focused={searchFocused}
              loading={searching}
              onBack={handleBack}
              onChangeText={setSearchQuery}
              onClear={() => {
                setSearchQuery("");
                searchInputRef.current?.focus?.();
              }}
              onFocus={() => setSearchFocused(true)}
              placeholder={trip?.title ? `Buscar en ${trip.title}` : "Buscar lugares"}
              value={searchQuery}
            />
          </View>

          {!searchFocused ? (
            <>
              <CategoryChips
                activeKey={activeCategory}
                categories={NEARBY_CATEGORIES}
                onPress={handleCategoryPress}
              />

              {readOnly ? (
                <View style={[styles.banner, lock.hasLeft ? styles.bannerWarning : styles.bannerInfo]}>
                  <FontAwesome6
                    color={lock.hasLeft ? colors.warning : colors.primary}
                    name={lock.hasLeft ? "eye" : "flag-checkered"}
                    size={12}
                  />
                  <Text style={styles.bannerText}>
                    {lock.hasLeft
                      ? "Ya no sos parte de este viaje: solo podés mirar."
                      : "El viaje terminó: podés mirar el mapa, pero no guardar ni agendar lugares."}
                  </Text>
                </View>
              ) : null}

              {offline ? (
                <View style={[styles.banner, styles.bannerWarning]}>
                  <FontAwesome6 color={colors.warning} name="wifi" size={12} />
                  <Text style={styles.bannerText}>Sin conexión. Mostramos solo lo que ya estaba guardado.</Text>
                </View>
              ) : null}

            </>
          ) : null}
        </View>

        {!searchFocused ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.mapOverlay,
              isSidePanel
                ? { left: SIDE_PANEL_WIDTH, top: spacing.md }
                : { top: TOP_OVERLAY_HEIGHT + bannerCount * BANNER_HEIGHT },
            ]}
          >
            {showSearchHere ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleSearchHere}
                style={({ pressed }) => [styles.searchHere, pressed && styles.pressed]}
              >
                <FontAwesome6 color={colors.primary} name="rotate-right" size={12} />
                <Text style={styles.searchHereText}>Buscar en esta zona</Text>
              </Pressable>
            ) : null}

            {toast ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.toast, toast.tone === "error" && styles.toastError, { opacity: toastOpacity }]}
              >
                <FontAwesome6
                  color={colors.textInverse}
                  name={toast.tone === "error" ? "circle-exclamation" : "circle-check"}
                  size={14}
                />
                <Text style={styles.toastText}>{toast.message}</Text>
              </Animated.View>
            ) : null}
          </View>
        ) : null}
      </View>

      <PlaceScheduleSheet
        days={tripDays}
        onClose={() => setScheduleTarget(null)}
        onSubmit={handleSchedulePlace}
        place={scheduleTarget}
        visible={!!scheduleTarget}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.6,
  },

  // Capa superior flotante
  topArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
  },
  mapOverlay: {
    position: "absolute",
    right: 0,
    left: 0,
    alignItems: "center",
    gap: spacing.xs,
  },
  searchPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 76,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  bannerWarning: {
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.accentStrong,
  },
  bannerInfo: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  bannerText: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  searchHere: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  searchHereText: {
    ...textStyles.meta,
    fontWeight: "700",
    color: colors.primary,
  },
  toast: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    ...shadows.floating,
  },
  toastError: {
    backgroundColor: colors.danger,
  },
  toastText: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.textInverse,
    flexShrink: 1,
  },

  // Encabezado del panel
  tabs: {
    flexDirection: "row",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  tabActive: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tabText: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  countBubble: {
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  countBubblePending: {
    backgroundColor: colors.accentStrong,
  },
  countText: {
    ...textStyles.meta,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  countTextPending: {
    color: colors.primary,
  },
  listHeading: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xxs,
  },
  listTitle: {
    ...textStyles.tripTitle,
    fontSize: 21,
    lineHeight: 26,
    color: colors.primary,
  },
  listSubtitle: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: spacing.xxs,
  },
  backLinkText: {
    ...textStyles.meta,
    fontWeight: "700",
    color: colors.primary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },

  // Contenido del panel
  group: {
    marginTop: spacing.md,
  },
  groupHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  groupTitle: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xxs,
  },
  groupDate: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
  },
  moreButton: {
    alignItems: "center",
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  moreText: {
    ...textStyles.meta,
    fontWeight: "700",
    color: colors.primary,
  },
  loadingRows: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  stateBox: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  stateTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  stateCopy: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Estados de pantalla completa
  fullState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  fullStateActions: {
    gap: spacing.sm,
    width: "100%",
    maxWidth: 320,
  },
});