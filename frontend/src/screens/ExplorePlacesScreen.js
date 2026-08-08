import NetInfo from "@react-native-community/netinfo";
import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import MapCanvas from "../components/map/MapCanvas";
import OfflineMapState from "../components/map/OfflineMapState";
import PlaceDetailSheet from "../components/map/PlaceDetailSheet";
import PlaceScheduleSheet from "../components/map/PlaceScheduleSheet";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  getPlaceDetails,
  getTripPopularPlaces,
  getTripDetail,
  getTripPlaces,
  saveTripPlace,
  scheduleTripPlace,
  searchTripPlaces,
} from "../services/api";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

function normalizeDestination(destination) {
  return {
    id: `destination-${destination.id ?? destination.name}`,
    kind: "tripDestination",
    placeId: null,
    name: destination.name,
    address: destination.country ? `${destination.name}, ${destination.country}` : destination.name,
    lat: destination.lat,
    lng: destination.lng,
    category: "Destino base",
    scheduledDays: [],
  };
}

function resolveTripDays(trip) {
  const rawDays = trip?.cronograma ?? trip?.Cronograma ?? trip?.dias ?? [];
  if (Array.isArray(rawDays) && rawDays.length > 0) {
    return rawDays;
  }

  if (!trip?.startDate || !trip?.endDate) {
    return [];
  }

  const start = new Date(`${trip.startDate}T12:00:00`);
  const end = new Date(`${trip.endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const days = [];
  const cursor = new Date(start);
  let index = 1;
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    days.push({
      id: `fallback-day-${index}`,
      idDiaCronograma: index,
      indiceDia: index,
      fecha: `${year}-${month}-${day}`,
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return days;
}

export default function ExplorePlacesScreen({ navigation, route }) {
  const tripId = route.params?.tripId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trip, setTrip] = useState(null);
  const [places, setPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [offline, setOffline] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [popularPlaces, setPopularPlaces] = useState([]);
  const [popularContext, setPopularContext] = useState("");
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState("");
  const [showPopularPanel, setShowPopularPanel] = useState(false);
  const [viewportCenter, setViewportCenter] = useState(null);
  const [loadingPlaceDetails, setLoadingPlaceDetails] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [savingAndScheduling, setSavingAndScheduling] = useState(false);
  const [schedulingPlace, setSchedulingPlace] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(Boolean(state.isConnected === false));
    });
    return unsubscribe;
  }, []);

  async function loadExploreData() {
    if (!tripId) {
      setError("No se pudo resolver el viaje.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const [tripDetail, tripPlaces] = await Promise.all([getTripDetail(tripId), getTripPlaces(tripId)]);
      setTrip(tripDetail);
      setPlaces(tripPlaces);
    } catch (loadError) {
      setError(loadError.message || "No se pudo cargar la exploración del viaje.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExploreData();
  }, [tripId]);

  const destinationMarkers = useMemo(
    () => (trip?.destinations || []).map(normalizeDestination).filter((item) => item.lat && item.lng),
    [trip?.destinations]
  );

  const savedPlacesByPlaceId = useMemo(() => {
    const map = new Map();
    places.forEach((place) => {
      if (place.placeId) {
        map.set(place.placeId, { ...place, kind: "savedPlace" });
      }
    });
    return map;
  }, [places]);

  const savedPlaceMarkers = useMemo(
    () =>
      places
        .map((place) => ({
          ...place,
          kind: "savedPlace",
        }))
        .filter((item) => item.lat && item.lng),
    [places]
  );

  const searchedMarkers = useMemo(
    () =>
      searchResults
        .map((item) => {
          const saved = savedPlacesByPlaceId.get(item.placeId);
          if (saved) {
            return { ...saved, alreadySaved: true };
          }
          return {
            ...item,
            kind: "searchResult",
            alreadySaved: false,
          };
        })
        .filter((item) => item.lat && item.lng),
    [savedPlacesByPlaceId, searchResults]
  );

  const mapMarkers = useMemo(() => {
    const unique = new Map();
    [...destinationMarkers, ...savedPlaceMarkers, ...searchedMarkers].forEach((marker) => {
      unique.set(`${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`, marker);
    });
    return Array.from(unique.values());
  }, [destinationMarkers, savedPlaceMarkers, searchedMarkers]);

  const scheduledDaysCount = useMemo(() => {
    const unique = new Set();
    places.forEach((place) => {
      (place.scheduledDays || []).forEach((day) => unique.add(day.dayId));
    });
    return unique.size;
  }, [places]);

  const sortedSummaryPlaces = useMemo(
    () =>
      [...places].sort((left, right) => {
        const leftDays = left.scheduledDays || [];
        const rightDays = right.scheduledDays || [];
        const leftHasDays = leftDays.length > 0;
        const rightHasDays = rightDays.length > 0;

        if (leftHasDays !== rightHasDays) {
          return leftHasDays ? 1 : -1;
        }

        if (!leftHasDays && !rightHasDays) {
          return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
        }

        const leftFirstDay = Math.min(...leftDays.map((day) => day.dayIndex));
        const rightFirstDay = Math.min(...rightDays.map((day) => day.dayIndex));

        if (leftFirstDay !== rightFirstDay) {
          return leftFirstDay - rightFirstDay;
        }

        return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
      }),
    [places]
  );

  const initialCenter = useMemo(() => {
    const firstMarker = mapMarkers[0];
    if (!firstMarker) return null;
    return { lat: firstMarker.lat, lng: firstMarker.lng };
  }, [mapMarkers]);

  const tripDays = useMemo(() => resolveTripDays(trip), [trip]);

  useEffect(() => {
    if (!initialCenter || viewportCenter) return;
    setViewportCenter(initialCenter);
  }, [initialCenter, viewportCenter]);

  useEffect(() => {
    if (!tripId || !viewportCenter?.lat || !viewportCenter?.lng) return undefined;

    const timeoutId = setTimeout(async () => {
      try {
        setPopularLoading(true);
        setPopularError("");
        const response = await getTripPopularPlaces(tripId, viewportCenter.lat, viewportCenter.lng, 6);
        const normalizedItems = (response.items || []).map((item) => {
          const saved = savedPlacesByPlaceId.get(item.placeId);
          if (saved) {
            return { ...saved, alreadySaved: true, rating: item.rating, userRatingsTotal: item.userRatingsTotal };
          }
          return {
            ...item,
            kind: "searchResult",
            alreadySaved: false,
          };
        });
        setPopularContext(response.contextLabel || "");
        setPopularPlaces(normalizedItems);
      } catch (loadError) {
        setPopularError(loadError.message || "No se pudo cargar el ranking de atracciones.");
      } finally {
        setPopularLoading(false);
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [tripId, viewportCenter, savedPlacesByPlaceId]);

  useEffect(() => {
    if (!tripId || !selectedPlace?.placeId) return undefined;
    let cancelled = false;

    const loadDetails = async () => {
      try {
        setLoadingPlaceDetails(true);
        const details = await getPlaceDetails(tripId, selectedPlace.placeId);
        if (cancelled) return;
        setSelectedPlace((current) => {
          if (!current || current.placeId !== selectedPlace.placeId) {
            return current;
          }
          return {
            ...current,
            name: details.name ?? current.name,
            address: details.address ?? current.address,
            rating: details.rating ?? current.rating,
            userRatingsTotal: details.userRatingsTotal ?? current.userRatingsTotal,
            googleMapsUri: details.googleMapsUri ?? current.googleMapsUri,
            reviews: details.reviews ?? [],
            category: details.category ?? current.category,
          };
        });
      } catch {
        if (cancelled) return;
        setSelectedPlace((current) => {
          if (!current || current.placeId !== selectedPlace.placeId) {
            return current;
          }
          return {
            ...current,
            reviews: current.reviews ?? [],
          };
        });
      } finally {
        if (!cancelled) {
          setLoadingPlaceDetails(false);
        }
      }
    };

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [tripId, selectedPlace?.placeId]);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");
      const results = await searchTripPlaces(tripId, searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No encontramos lugares para esa búsqueda.");
      }
    } catch (searchRequestError) {
      setSearchError(searchRequestError.message || "No se pudieron buscar lugares.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function persistSelectedPlace(placeToSave = selectedPlace) {
    if (!placeToSave || placeToSave.kind !== "searchResult") return null;

    const response = await saveTripPlace(tripId, {
      placeId: placeToSave.placeId,
      name: placeToSave.name,
      address: placeToSave.address,
      lat: placeToSave.lat,
      lng: placeToSave.lng,
      category: placeToSave.category,
      metadata: placeToSave.metadata,
    });

    await loadExploreData();
    return response;
  }

  async function handleSaveSelectedPlace() {
    if (!selectedPlace || selectedPlace.kind !== "searchResult") return;
    try {
      setSavingPlace(true);
      setFeedbackMessage("");
      const response = await persistSelectedPlace(selectedPlace);
      if (!response) return;
      setFeedbackMessage(response.message);
      setSelectedPlace({ ...response.place, kind: "savedPlace" });
    } catch (saveError) {
      setFeedbackMessage(saveError.message || "No se pudo guardar el lugar.");
    } finally {
      setSavingPlace(false);
    }
  }

  async function handleSaveAndScheduleSelectedPlace() {
    if (!selectedPlace) return;

    try {
      setSavingAndScheduling(true);
      setFeedbackMessage("");

      const resolvedPlace = resolveSelectedPlace(selectedPlace);
      if (resolvedPlace?.kind === "savedPlace") {
        setSelectedPlace(resolvedPlace);
        setScheduleTarget(resolvedPlace);
        return;
      }

      const response = await persistSelectedPlace(selectedPlace);
      if (!response?.place) return;

      const savedPlace = { ...response.place, kind: "savedPlace" };
      setFeedbackMessage(response.message);
      setSelectedPlace(savedPlace);
      setScheduleTarget(savedPlace);
    } catch (saveError) {
      setFeedbackMessage(saveError.message || "No se pudo preparar el lugar para el itinerario.");
    } finally {
      setSavingAndScheduling(false);
    }
  }

  async function handleSchedulePlace(payload) {
    if (!scheduleTarget?.id) return;
    setSchedulingPlace(true);
    try {
      await scheduleTripPlace(tripId, scheduleTarget.id, payload);
      setFeedbackMessage("Lugar agregado al itinerario correctamente.");
      setScheduleTarget(null);
      await loadExploreData();
      const updatedPlaces = await getTripPlaces(tripId);
      const updated = updatedPlaces.find((item) => item.id === scheduleTarget.id);
      if (updated) {
        setSelectedPlace({ ...updated, kind: "savedPlace" });
      }
    } finally {
      setSchedulingPlace(false);
    }
  }

  function resolveSelectedPlace(place) {
    if (!place) return null;
    if (place.kind === "savedPlace") {
      return place;
    }

    if (place.placeId) {
      const savedPlace = savedPlacesByPlaceId.get(place.placeId);
      if (savedPlace) {
        return savedPlace;
      }
    }

    return place;
  }

  function handleSelectPlace(place) {
    const resolvedPlace = resolveSelectedPlace(place);
    setSelectedPlace(resolvedPlace);
  }

  function handleSelectPopularPlace(place) {
    handleSelectPlace(place);
    setShowPopularPanel(false);
  }

  function handleOpenSchedule(place) {
    const resolvedPlace = resolveSelectedPlace(place);
    if (!resolvedPlace || resolvedPlace.kind !== "savedPlace") return;
    setScheduleTarget(resolvedPlace);
  }

  function handleViewportChange(nextCenter) {
    if (!nextCenter?.lat || !nextCenter?.lng) return;
    setViewportCenter((current) => {
      if (!current) return nextCenter;
      const latDiff = Math.abs(current.lat - nextCenter.lat);
      const lngDiff = Math.abs(current.lng - nextCenter.lng);
      if (latDiff < 0.005 && lngDiff < 0.005) {
        return current;
      }
      return nextCenter;
    });
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Pressable onPress={() => navigation.goBack()} style={styles.heroBack}>
              <FontAwesome6 color={colors.textInverse} name="arrow-left" size={16} />
            </Pressable>
          </View>
          <Text style={styles.heroEyebrow}>Exploración visual del viaje</Text>
          <Text style={styles.heroTitle}>Destinos de interés</Text>
          <Text style={styles.heroCopy}>
            Busca lugares con Google Places, guárdalos en el viaje y llévalos directo al itinerario.
          </Text>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : null}

          {!loading && error ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>No se pudo cargar la exploración</Text>
              <Text style={styles.infoCopy}>{error}</Text>
            </View>
          ) : null}

          {!loading && !error ? (
            <>
              <View style={styles.metricsRow}>
                <MetricCard label="Destinos base" value={destinationMarkers.length} />
                <MetricCard label="Lugares guardados" value={places.length} />
                <MetricCard label="Días con lugares" value={scheduledDaysCount} />
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Buscar lugar</Text>
                <Text style={styles.sectionTitle}>Explora nuevos puntos para el viaje</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearch}
                    placeholder="Ej: Catedral de Palma, playa, museo..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.searchInput}
                    value={searchQuery}
                  />
                  <PrimaryButton
                    label={searching ? "Buscando..." : "Buscar"}
                    loading={searching}
                    onPress={handleSearch}
                    style={styles.searchButton}
                  />
                </View>
                {searchError ? <Text style={styles.inlineMessage}>{searchError}</Text> : null}
                {feedbackMessage ? <Text style={styles.inlineSuccess}>{feedbackMessage}</Text> : null}

                {searchResults.length > 0 ? (
                  <View style={styles.resultList}>
                    {searchedMarkers.map((item) => (
                      <Pressable
                        key={`${item.placeId}-${item.name}`}
                        onPress={() => handleSelectPlace(item)}
                        style={styles.resultRow}
                      >
                        <View style={styles.resultIcon}>
                          <FontAwesome6
                            color={item.kind === "savedPlace" ? colors.primary : colors.warning}
                            name={item.kind === "savedPlace" ? "bookmark" : "magnifying-glass-location"}
                            size={14}
                          />
                        </View>
                        <View style={styles.resultCopy}>
                          <Text style={styles.resultName}>{item.name}</Text>
                          <Text style={styles.resultAddress}>{item.address}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionLabel}>Mapa del viaje</Text>
                    <Text style={styles.sectionTitle}>{trip?.title ?? "Viaje"}</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, styles.legendDotDestination]} />
                      <Text style={styles.legendText}>Destino</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, styles.legendDotSaved]} />
                      <Text style={styles.legendText}>Guardado</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, styles.legendDotSearch]} />
                      <Text style={styles.legendText}>Resultado</Text>
                    </View>
                  </View>
                </View>

                {offline ? <OfflineMapState compact /> : null}

                <View style={styles.mapWrap}>
                  <MapCanvas
                    initialCenter={initialCenter}
                    markers={mapMarkers}
                    offline={offline}
                    onMarkerPress={handleSelectPlace}
                    onPlacePick={handleSelectPlace}
                    onViewportChange={handleViewportChange}
                  />
                </View>

                <Text style={styles.sectionHint}>
                  Toca un marcador para revisar su detalle, guardarlo o sumarlo al itinerario.
                </Text>
                <PrimaryButton
                  icon="stars"
                  iconPosition="left"
                  label={popularContext ? `Ver imperdibles de ${popularContext}` : "Ver lugares recomendados"}
                  onPress={() => setShowPopularPanel(true)}
                  style={styles.popularTrigger}
                  variant="secondary"
                />
              </View>

              {selectedPlace ? (
                <PlaceDetailSheet
                  onClose={() => setSelectedPlace(null)}
                  onSave={handleSaveSelectedPlace}
                  onSaveAndSchedule={handleSaveAndScheduleSelectedPlace}
                  onSchedule={() => handleOpenSchedule(selectedPlace)}
                  place={selectedPlace}
                  loadingDetails={loadingPlaceDetails}
                  saving={savingPlace}
                  savingAndScheduling={savingAndScheduling}
                  scheduling={schedulingPlace}
                />
              ) : null}

              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>Lugares guardados</Text>
                <Text style={styles.sectionTitle}>Resumen del viaje</Text>

                {places.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Todavía no hay lugares guardados.</Text>
                    <Text style={styles.emptyCopy}>
                      Busca un punto en el mapa y guárdalo para que después puedas agendarlo en un día del viaje.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.placeList}>
                    {sortedSummaryPlaces.map((place) => (
                      <Pressable
                        key={place.id}
                        onPress={() => handleSelectPlace({ ...place, kind: "savedPlace" })}
                        style={styles.placeRow}
                      >
                        <View style={styles.placeIcon}>
                          <FontAwesome6 color={colors.primary} name="location-dot" size={16} />
                        </View>
                        <View style={styles.placeCopy}>
                          <Text style={styles.placeName}>{place.name}</Text>
                          <Text style={styles.placeAddress}>{place.address}</Text>
                          {place.scheduledDays?.length ? (
                            <Text style={styles.placeMeta}>
                              {place.scheduledDays.map((day) => `Día ${day.dayIndex}`).join(", ")}
                            </Text>
                          ) : (
                            <Text style={styles.placeMeta}>Guardado, todavía sin día asignado</Text>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <PlaceScheduleSheet
        days={tripDays}
        onClose={() => setScheduleTarget(null)}
        onSubmit={handleSchedulePlace}
        place={scheduleTarget}
        visible={!!scheduleTarget}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setShowPopularPanel(false)}
        transparent
        visible={showPopularPanel}
      >
        <View style={styles.popularOverlay}>
          <Pressable onPress={() => setShowPopularPanel(false)} style={styles.popularBackdrop} />
          <View style={styles.popularPanel}>
            <View style={styles.popularPanelHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionLabel}>Ranking sugerido</Text>
                <Text style={styles.popularPanelTitle}>
                  {popularContext ? `Imperdibles de ${popularContext}` : "Atracciones populares"}
                </Text>
              </View>
              <Pressable onPress={() => setShowPopularPanel(false)} style={styles.popularCloseButton}>
                <FontAwesome6 color={colors.textSecondary} name="xmark" size={16} />
              </Pressable>
            </View>

            {popularLoading ? (
              <View style={styles.popularPanelState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.sectionHint}>Buscando atracciones destacadas...</Text>
              </View>
            ) : null}

            {!popularLoading && popularError ? <Text style={styles.inlineMessage}>{popularError}</Text> : null}

            {!popularLoading && !popularError && popularPlaces.length === 0 ? (
              <Text style={styles.sectionHint}>Mueve el mapa o haz zoom para cargar atracciones populares.</Text>
            ) : null}

            {!popularLoading && popularPlaces.length > 0 ? (
              <ScrollView contentContainerStyle={styles.popularList} showsVerticalScrollIndicator={false}>
                {popularPlaces.map((place, index) => (
                  <Pressable
                    key={`popular-${place.placeId}-${index}`}
                    onPress={() => handleSelectPopularPlace(place)}
                    style={styles.popularRow}
                  >
                    <View style={styles.popularRank}>
                      <Text style={styles.popularRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.popularCopy}>
                      <Text style={styles.placeName}>{place.name}</Text>
                      <Text style={styles.placeAddress}>{place.address}</Text>
                      <Text style={styles.popularMeta}>
                        {place.rating ? `★ ${place.rating.toFixed(1)}` : "Sin rating"} ·{" "}
                        {place.userRatingsTotal ? `${place.userRatingsTotal} reseñas` : "Sin reseñas"} ·{" "}
                        {place.alreadySaved ? "Ya guardado" : "Toca para agregar"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
  },
  hero: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroBack: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.iconSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroEyebrow: {
    ...textStyles.meta,
    color: "#dbe6fb",
    marginTop: spacing.lg,
  },
  heroTitle: {
    ...textStyles.screenTitle,
    color: colors.textInverse,
    marginTop: spacing.xs,
  },
  heroCopy: {
    ...textStyles.body,
    color: "#edf2ff",
    marginTop: spacing.xs,
  },
  body: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingCard: {
    ...surfaces.card,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  infoTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  infoCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionCard: {
    ...surfaces.card,
    padding: spacing.lg,
  },
  sectionHeader: {
    gap: spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: "#8b6c37",
  },
  sectionTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
    marginTop: spacing.xs,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...textStyles.body,
  },
  searchButton: {
    minWidth: 112,
  },
  inlineMessage: {
    ...textStyles.meta,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  inlineSuccess: {
    ...textStyles.meta,
    color: colors.success,
    marginTop: spacing.sm,
  },
  resultList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCopy: {
    flex: 1,
  },
  resultName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  resultAddress: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
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
  legendDotDestination: {
    backgroundColor: colors.accentStrong,
  },
  legendDotSaved: {
    backgroundColor: colors.primarySoft,
  },
  legendDotSearch: {
    backgroundColor: colors.danger,
  },
  legendText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  mapWrap: {
    marginTop: spacing.lg,
  },
  sectionHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  popularTrigger: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
  },
  popularOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    flexDirection: Platform.OS === "web" ? "row" : "column",
    justifyContent: Platform.OS === "web" ? "flex-start" : "flex-end",
  },
  popularBackdrop: {
    flex: 1,
  },
  popularPanel: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 420 : undefined,
    maxHeight: Platform.OS === "web" ? "100%" : "78%",
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: Platform.OS === "web" ? radii.xl : radii.xl,
    borderTopRightRadius: Platform.OS === "web" ? 0 : radii.xl,
    borderBottomLeftRadius: Platform.OS === "web" ? radii.xl : 0,
    borderBottomRightRadius: 0,
    borderLeftWidth: Platform.OS === "web" ? 1 : 0,
    borderTopWidth: Platform.OS === "web" ? 0 : 1,
    borderColor: colors.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: Platform.OS === "web" ? 20 : 18,
    shadowOffset: Platform.OS === "web" ? { width: -6, height: 0 } : { width: 0, height: -6 },
    elevation: 12,
  },
  popularPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  popularPanelTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
    marginTop: spacing.xs,
  },
  popularCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  popularPanelState: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  popularList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  popularRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  popularRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentStrong,
    marginTop: 2,
  },
  popularRankText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  popularCopy: {
    flex: 1,
  },
  popularMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptyState: {
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  placeList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  placeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  placeCopy: {
    flex: 1,
  },
  placeName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  placeAddress: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  placeMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
