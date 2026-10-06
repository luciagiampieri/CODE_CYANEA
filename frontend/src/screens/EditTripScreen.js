import { useContext, useEffect, useRef, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Image,
    ImageBackground,
    FlatList,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Keyboard,
    StatusBar,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Modal from "../components/ui/AppModal";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import AICoverGenerator from "../components/trip/AICoverGenerator";
import DatePickerModal from "../components/ui/DatePickerModal";
import useResponsive from "../hooks/useResponsive";
import { 
    getTripDetail, 
    updateTrip, 
    searchDestinations, 
    resolveDestination, 
    uploadTripCover, 
    removeTripCover, 
    generateTripCoverAI, 
    acceptTripCoverAI 
} from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

import * as ImagePicker from "expo-image-picker";

const COLOR_SOFT = colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff";
const COLOR_DANGER = colors.danger || "#FF3B30";
const COLOR_DANGER_SOFT = colors.danger ? `${colors.danger}14` : "rgba(255,59,48,0.08)";
const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png"];

function isSameDestination(a, b) {
    return (a.placeId && b.placeId && a.placeId === b.placeId) || (a.name === b.name && a.country === b.country);
}

function makeSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// toISOString() convierte a UTC y en Argentina (UTC-3) corre el día por la noche; se usa la fecha local.
function dateToLocalISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// Valida que "YYYY-MM-DD" exista realmente en el calendario (rechaza 2026-02-31, etc.)
function isValidISODate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// El backend puede devolver la foto de un destino bajo distintos nombres: se toma la primera URL usable.
function pickDestinationImage(dest) {
    if (!dest) return null;
    const candidates = [
        dest.imageUrl,
        dest.image,
        dest.image_url,
        dest.imageURL,
        dest.photoUrl,
        dest.photoURL,
        dest.photoUri,
        dest.photo,
        dest.coverImage,
        dest.coverImageUrl,
        dest.thumbnail,
        dest.thumbnailUrl,
        dest.picture,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        if (candidate && typeof candidate === "object") {
            const uri = candidate.uri || candidate.url;
            if (typeof uri === "string" && uri.trim()) return uri.trim();
        }
    }
    return null;
}

// Los destinos guardados en el viaje pueden venir sin foto: se pide a Google (vía resolveDestination)
// con el placeId, o buscándolo por nombre y país si el destino no tiene placeId.
async function fetchDestinationImage(dest) {
    try {
        let placeId = dest.placeId;
        if (!placeId) {
            const query = [dest.name, dest.country].filter(Boolean).join(", ");
            const results = await searchDestinations(query, makeSessionToken());
            const match = (results || []).find(
                (r) =>
                    normalizeText(r.name) === normalizeText(dest.name) &&
                    (!dest.country || normalizeText(r.country) === normalizeText(dest.country))
            );
            // Si el país no coincide exacto (p. ej. otro idioma), se acepta un resultado cuyo nombre contenga al destino.
            const loose = (results || []).find((r) => normalizeText(r.name).includes(normalizeText(dest.name)));
            placeId = (match || loose)?.placeId;
        }
        if (!placeId) return null;
        const full = await resolveDestination(placeId, makeSessionToken());
        return pickDestinationImage(full);
    } catch {
        return null;
    }
}

// Miniatura de destino: si la imagen no carga, muestra el ícono en lugar de quedar en blanco.
function DestinationThumb({ uri }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [uri]);

    if (!uri || failed) {
        return (
            <View style={[styles.destinationThumb, styles.destinationThumbEmpty]}>
                <FontAwesome6 name="location-dot" size={16} color={colors.primary} />
            </View>
        );
    }
    return <Image source={{ uri }} style={styles.destinationThumb} onError={() => setFailed(true)} />;
}

function formatDateToDisplay(isoString) {
    if (!isoString) return "";
    const parts = isoString.split("-");
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }
    return isoString;
}

function computeTripDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diffMs = end.getTime() - start.getTime();
    const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (nights < 0) return 0;
    const days = nights + 1;
    return `${nights} ${nights === 1 ? "noche" : "noches"} · ${days} días`;
}

function CardHeader({ icon, title, subtitle }) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardIconCircle}>
        <FontAwesome6 name={icon} size={15} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function RouteRail({ children, topHeight = 18, showTop = true, showBottom = true }) {
  return (
    <View style={styles.routeRail}>
      <View style={[styles.routeLine, { height: topHeight }, !showTop && styles.routeLineHidden]} />
      {children}
      <View style={[styles.routeLineBottom, showBottom && styles.routeLine]} />
    </View>
  );
}

function HighlightMatch({ text, query, style, matchStyle }) {
  const value = String(text || "");
  const q = String(query || "").trim();
  const normalize = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const index = q ? normalize(value).indexOf(normalize(q)) : -1;

  if (index < 0) {
    return (
      <Text style={style} numberOfLines={1}>
        {value}
      </Text>
    );
  }
  return (
    <Text style={style} numberOfLines={1}>
      {value.slice(0, index)}
      <Text style={matchStyle}>{value.slice(index, index + q.length)}</Text>
      {value.slice(index + q.length)}
    </Text>
  );
}

// Avatar redondo de un destino ya elegido: foto de Google o, si no hay, ícono de ubicación.
function DestinationAvatar({ uri, size = 32 }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const box = { width: size, height: size, borderRadius: size / 2 };
  if (!uri || failed) {
    return (
      <View style={[styles.dpAvatarFallback, box]}>
        <FontAwesome6 name="location-dot" size={size * 0.4} color={colors.primary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.dpAvatarImage, box]} onError={() => setFailed(true)} />;
}

function DestinationPickerModal({
  visible,
  onClose,
  search,
  onSearchChange,
  options,
  searching,
  hasSearched,
  onSelect,
  selectedDestinations,
  onRemoveSelected,
  resolving,
  error,
}) {
  const query = search.trim();
  const tooShort = query.length < 2;
  const count = selectedDestinations.length;
  const [searchFocused, setSearchFocused] = useState(false);

  // El modal se abre a pantalla completa, por encima de la barra de estado / notch: se respeta el margen superior.
  // Sin SafeAreaProvider (p. ej. en tests) el contexto es null: se asume margen 0.
  const insets = useContext(SafeAreaInsetsContext) || { top: 0 };
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0);

  // Con el teclado abierto el pie se compacta (el contenido sube con KeyboardAvoidingView).
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setKeyboardVisible(false);
      return undefined;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  // Aviso breve al agregar un destino: confirma que se sumó aunque la lista de resultados siga a la vista.
  const prevCountRef = useRef(count);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let timer;
    if (!visible) {
      setToast("");
    } else if (count > prevCountRef.current) {
      setToast(selectedDestinations[count - 1]?.name || "Destino");
      timer = setTimeout(() => setToast(""), 2200);
    } else if (count < prevCountRef.current) {
      setToast("");
    }
    prevCountRef.current = count;
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <ScreenContainer fullWidth padded={false}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {/* View intermedia: TouchableWithoutFeedback necesita un hijo nativo para detectar el toque fuera del teclado. */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.flex}>
              {/* ENCABEZADO: volver, título, "Listo" y buscador */}
              <View style={[styles.dpHeader, keyboardVisible && styles.dpHeaderCompact, { paddingTop: Math.max(spacing.lg, topInset + spacing.sm) }]}>
                <View style={styles.dpHeaderRow}>
                  <IconCircleButton icon="arrow-left" onPress={onClose} tone="light" />
                  <View style={styles.dpTitleWrap} pointerEvents="none">
                    <Text style={styles.dpTitle}>Agregar destino</Text>
                  </View>
                </View>

                {!keyboardVisible && search.length === 0 ? (
                  <Text style={styles.dpHeaderHint}>¿A dónde vas? Buscá una ciudad o un país.</Text>
                ) : (
                  <View style={styles.dpHeaderGap} />
                )}

                <View style={[styles.dpSearch, searchFocused && styles.dpSearchFocused]}>
                  <FontAwesome6 name="magnifying-glass" size={15} color={colors.primary} />
                  <TextInput
                    value={search}
                    onChangeText={onSearchChange}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Ej: Bariloche, Roma, Chile..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.dpSearchInput}
                    autoFocus
                    autoCorrect={false}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {resolving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : search.length > 0 ? (
                    <Pressable
                      onPress={() => onSearchChange("")}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Borrar búsqueda"
                    >
                      <FontAwesome6 name="circle-xmark" size={17} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.dpBody}>
                {error ? (
                  <View style={styles.dpError}>
                    <FontAwesome6 name="circle-exclamation" size={13} color={COLOR_DANGER} />
                    <Text style={styles.dpErrorText}>{error}</Text>
                  </View>
                ) : null}

                {/* TU RUTA: lista de destinos elegidos. Sin buscar ocupa todo el espacio; al buscar se limita para dejar lugar a los resultados. */}

                {count > 0 && !tooShort ? (
                  <View style={styles.dpStrip}>
                    <View style={styles.dpStripRow}>
                      <Text style={styles.dpStripLabel}>Tu ruta ({count})</Text>
                      {keyboardVisible ? (
                        <Pressable
                          onPress={onClose}
                          hitSlop={8}
                          style={styles.dpStripDone}
                          accessibilityRole="button"
                          accessibilityLabel="Listo"
                        >
                          <Text style={styles.dpStripDoneText}>Listo</Text>
                          <FontAwesome6 name="check" size={11} color={colors.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.dpStripList}
                    >
                      {selectedDestinations.map((d, index) => (
                        <View key={`${d.name}-${d.country}-${index}`} style={styles.dpMiniChip}>
                          <DestinationAvatar uri={pickDestinationImage(d)} size={24} />
                          <Text style={styles.dpMiniChipText} numberOfLines={1}>{d.name}</Text>
                          <Pressable
                            onPress={() => onRemoveSelected(d)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar ${d.name}`}
                          >
                            <FontAwesome6 name="xmark" size={11} color={COLOR_DANGER} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {count > 0 && tooShort ? (
                  <View style={[styles.dpSelected, styles.dpSelectedFull]}>
                    <View style={styles.dpSectionRow}>
                      <Text style={styles.dpSectionLabel}>Tu ruta</Text>
                      <View style={styles.dpCountPill}>
                        <Text style={styles.dpCountPillText}>{count}</Text>
                      </View>
                    </View>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.dpRouteList}
                    >
                      {selectedDestinations.map((d, index) => (
                        <View key={`${d.name}-${d.country}-${index}`} style={styles.dpRouteRow}>
                          <View style={styles.dpRouteIndex}>
                            <Text style={styles.dpRouteIndexText}>{index + 1}</Text>
                          </View>
                          <DestinationAvatar uri={pickDestinationImage(d)} size={40} />
                          <View style={styles.flex}>
                            <Text style={styles.dpRouteName} numberOfLines={1}>{d.name}</Text>
                            <Text style={styles.dpRouteCountry} numberOfLines={1}>
                              {[d.provinceState, d.country].filter(Boolean).join(", ")}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => onRemoveSelected(d)}
                            hitSlop={10}
                            style={styles.dpChipRemove}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar ${d.name}`}
                          >
                            <FontAwesome6 name="xmark" size={11} color={COLOR_DANGER} />
                          </Pressable>
                        </View>
                      ))}
                      {tooShort ? (
                        <Text style={styles.dpRouteHint}>Escribí al menos 2 letras para sumar otro destino.</Text>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}

                {!(tooShort && count > 0) ? (
                <View style={styles.dpResults}>
                  {tooShort ? (
                    count === 0 ? (
                      <ScrollView
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.dpIdleContent}
                      >
                        <View style={styles.dpIdleHero}>
                          <View style={styles.dpIdleIcon}>
                            <FontAwesome6 name="earth-americas" size={24} color={colors.primary} />
                          </View>
                          <Text style={styles.dpIdleTitle}>Elegí tu primer destino</Text>
                        </View>
                        <Text style={styles.dpIdleText}>Escribí al menos 2 letras del nombre de una ciudad o país.</Text>
                      </ScrollView>
                    ) : null
                  ) : searching ? (
                    <View style={styles.dpListContent}>
                      {[0, 1, 2].map((n) => (
                        <View key={n} style={[styles.dpSkeletonRow, { opacity: 1 - n * 0.2 }]}>
                          <View style={styles.dpSkeletonCircle} />
                          <View style={styles.flex}>
                            <View style={styles.dpSkeletonLong} />
                            <View style={styles.dpSkeletonShort} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : options.length > 0 ? (
                    <FlatList
                      data={options}
                      keyExtractor={(item, index) => `${item.name}-${item.country}-${index}`}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.dpListContent}
                      ListHeaderComponent={keyboardVisible ? null : <Text style={styles.dpResultsLabel}>Resultados · tocá para agregar</Text>}
                      ItemSeparatorComponent={() => <View style={styles.dpSeparator} />}
                      renderItem={({ item }) => {
                        const selectedMatch = selectedDestinations.find(
                          (d) =>
                            (item.placeId && d.placeId === item.placeId) ||
                            (d.name === item.name && d.country === item.country)
                        );
                        const isSelected = Boolean(selectedMatch);
                        return (
                          <TouchableOpacity
                            onPress={() => (isSelected ? onRemoveSelected(selectedMatch) : onSelect(item))}
                            disabled={resolving && !isSelected}
                            activeOpacity={0.7}
                            style={[styles.dpItem, isSelected && styles.dpItemActive]}
                            accessibilityRole="button"
                            accessibilityLabel={`${isSelected ? "Quitar" : "Agregar"} ${item.name}`}
                          >
                            <View style={[styles.dpItemIcon, isSelected && styles.dpItemIconActive]}>
                              <FontAwesome6
                                name="location-dot"
                                size={14}
                                color={isSelected ? colors.textInverse : colors.primary}
                              />
                            </View>
                            <View style={styles.dpItemTexts}>
                              <HighlightMatch
                                text={item.name}
                                query={query}
                                style={[styles.dpItemName, isSelected && styles.dpItemNameActive]}
                                matchStyle={styles.dpItemMatch}
                              />
                              <Text style={styles.dpItemSub} numberOfLines={1}>
                                {[item.provinceState, item.country].filter(Boolean).join(", ")}
                              </Text>
                            </View>
                            {isSelected ? (
                              <View style={styles.dpAddedPill}>
                                <FontAwesome6 name="check" size={10} color={colors.textInverse} />
                                <Text style={styles.dpAddedText}>Agregado</Text>
                              </View>
                            ) : (
                              <View style={styles.dpAddButton}>
                                <FontAwesome6 name="plus" size={12} color={colors.primary} />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  ) : hasSearched ? (
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.dpIdleContent}
                    >
                      <View style={styles.dpIdleHero}>
                        <View style={styles.dpIdleIcon}>
                          <FontAwesome6 name="magnifying-glass" size={20} color={colors.textMuted} />
                        </View>
                        <Text style={styles.dpIdleTitle}>Sin resultados</Text>
                      </View>
                      <Text style={styles.dpIdleText}>
                        No encontramos destinos para "{query}". Probá con otro nombre o revisá la ortografía.
                      </Text>
                    </ScrollView>
                  ) : null}
                </View>
                ) : null}
                {toast ? (
                  <View style={styles.dpToast}>
                    <FontAwesome6 name="circle-check" size={14} color={colors.primary} />
                    <Text style={styles.dpToastText} numberOfLines={1}>{toast} agregado a tu ruta</Text>
                  </View>
                ) : null}
              </View>

              {/* PIE: botón principal siempre a la vista; sube junto con el teclado */}
              {!keyboardVisible ? (
              <View style={styles.dpFooter}>
                <PrimaryButton
                  label={
                    count > 0
                      ? `Listo · ${count} ${count === 1 ? "destino" : "destinos"}`
                      : "Cerrar"
                  }
                  onPress={onClose}
                />
              </View>
              ) : null}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </ScreenContainer>
    </Modal>
  );
}

export default function EditTripScreen({ navigation, route }) {
    const { tripId } = route.params;
    const { isTablet } = useResponsive();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    
    const [activeTab, setActiveTab] = useState("info"); // "info" | "destinations" | "cover"

    const [form, setForm] = useState({
        title: "",
        description: "",
        startDate: "",
        endDate: "",
        currency: "ARS",
        destinations: [],
    });
    const [originalStartDate, setOriginalStartDate] = useState("");
    const [errors, setErrors] = useState({});
    const [submitStatus, setSubmitStatus] = useState("idle");
    const [submitMessage, setSubmitMessage] = useState("");
    
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const sessionTokenRef = useRef(makeSessionToken());
    const navigationTimerRef = useRef(null);
    const [showDestinationPicker, setShowDestinationPicker] = useState(false);
    const [destinationSearch, setDestinationSearch] = useState("");
    const [destinationOptions, setDestinationOptions] = useState([]);
    const [searchingDestinations, setSearchingDestinations] = useState(false);
    const [hasSearchedDestinations, setHasSearchedDestinations] = useState(false);
    const [resolvingDestination, setResolvingDestination] = useState(false);
    const lastQueryLengthRef = useRef(0);

    useEffect(() => {
        return () => {
            if (navigationTimerRef.current) {
                clearTimeout(navigationTimerRef.current);
            }
        };
    }, []);

    const tripAlreadyStarted = originalStartDate ? originalStartDate <= todayISO() : false;

    const [coverImage, setCoverImage] = useState(null);
    const [coverError, setCoverError] = useState("");
    const [removeCoverRequested, setRemoveCoverRequested] = useState(false);
    const [hasCustomCover, setHasCustomCover] = useState(false);
    const [currentCoverUrl, setCurrentCoverUrl] = useState(null);
    const [defaultCoverUrl, setDefaultCoverUrl] = useState(null);

    function getExtensionFromAsset(asset) {
      const fromFileName = asset.fileName?.split(".").pop();
      if (fromFileName) return fromFileName.toLowerCase();
      const fromUri = asset.uri?.split(".").pop();
      return fromUri ? fromUri.toLowerCase().split("?")[0] : "";
    }

    useEffect(() => {
        async function loadTrip() {
            try {
                const trip = await getTripDetail(tripId);
                setForm({
                    title: trip.title ?? "",
                    description: trip.description ?? "",
                    startDate: trip.startDate ?? "",
                    endDate: trip.endDate ?? "",
                    currency: trip.currency ?? "ARS",
                    // La portada "de Google Maps" del viaje es la foto de su destino principal (el primero):
                    // se usa como respaldo inmediato mientras se piden las fotos faltantes.
                    destinations: (trip.destinations ?? []).map((d, index) => ({
                        ...d,
                        imageUrl:
                            pickDestinationImage(d) ||
                            (index === 0
                                ? pickDestinationImage({
                                      imageUrl: trip.defaultCoverImage || (!trip.hasCustomCover ? trip.image : null),
                                  })
                                : null),
                    })),
                });
                setOriginalStartDate(trip.startDate ?? "");
                setHasCustomCover(Boolean(trip.hasCustomCover));
                setCurrentCoverUrl(trip.image ?? null);
                setDefaultCoverUrl(trip.defaultCoverImage ?? null);
            } catch (error) {
                setLoadError(error.message || "No se pudo cargar la información del viaje.");
            } finally {
                setLoading(false);
            }
        }
        loadTrip();
    }, [tripId]);

    // Una vez cargado el viaje, completa la foto de Google de los destinos que vinieron sin imagen.
    useEffect(() => {
        if (loading) return undefined;
        let active = true;
        const pending = form.destinations.filter((d) => !d.imageUrl);

        pending.forEach(async (dest) => {
            const imageUrl = await fetchDestinationImage(dest);
            if (!active || !imageUrl) return;
            setForm((current) => ({
                ...current,
                destinations: current.destinations.map((d) =>
                    isSameDestination(d, dest) && !d.imageUrl ? { ...d, imageUrl } : d
                ),
            }));
        });

        return () => {
            active = false;
        };
        // Solo al terminar la carga inicial; los destinos nuevos ya traen su foto desde resolveDestination.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    useEffect(() => {
        let active = true;
        const queryLimpia = destinationSearch.trim();

        if (queryLimpia.length < 2) {
            setDestinationOptions([]);
            setSearchingDestinations(false);
            setHasSearchedDestinations(false);
            lastQueryLengthRef.current = 0;
            return;
        }

        const isFirstSearch = lastQueryLengthRef.current < 2;
        lastQueryLengthRef.current = queryLimpia.length;
        const delay = isFirstSearch ? 0 : 150;

        setSearchingDestinations(true);
        setHasSearchedDestinations(false);

        const timeout = setTimeout(async () => {
            try {
                const results = await searchDestinations(queryLimpia, sessionTokenRef.current);
                if (active) {
                    setDestinationOptions(results);
                    setSearchingDestinations(false);
                    setHasSearchedDestinations(true);
                }
            } catch {
                if (active) {
                    setDestinationOptions([]);
                    setSearchingDestinations(false);
                    setHasSearchedDestinations(true);
                }
            }
        }, delay);

        return () => {
            active = false;
            clearTimeout(timeout);
        };
    }, [destinationSearch]);

    async function handlePickCoverImage() {
      setCoverError("");
      if (Platform.OS !== "web") {
        const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          setCoverError(
            canAskAgain
              ? "Necesitamos tu permiso para acceder a las fotos."
              : "El acceso a las fotos está bloqueado desde los ajustes."
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (result.canceled) return;
      const asset = result.assets[0];
      const extension = getExtensionFromAsset(asset);

      if (!ALLOWED_COVER_EXTENSIONS.includes(extension)) {
        setCoverError("Solo se permiten archivos JPG, JPEG y PNG.");
        return;
      }

      setCoverImage({
        uri: asset.uri,
        fileName: asset.fileName || `portada.${extension}`,
        mimeType: asset.mimeType || (extension === "png" ? "image/png" : "image/jpeg"),
        file: asset.file,
      });
      setRemoveCoverRequested(false);
    }

    function handleCancelCoverSelection() {
      setCoverImage(null);
      setCoverError("");
    }

    function handleRequestGoogleCover() {
      setCoverImage(null);
      setCoverError("");
      setRemoveCoverRequested(true);
    }

    function handleCancelRemoveCover() {
      setRemoveCoverRequested(false);
    }

    async function handleAcceptAiCover(preview) {
      const result = await acceptTripCoverAI(tripId, preview.imageBase64, preview.mimeType);
      setCoverImage(null);
      setCoverError("");
      setRemoveCoverRequested(false);
      setHasCustomCover(true);
      setCurrentCoverUrl(result.image ?? null);
      return result.message;
    }

    function handleInputChange(name, value) {
        setForm((current) => {
            const next = { ...current, [name]: value };
            if (name === "startDate" && current.endDate && current.endDate < value) {
                next.endDate = "";
            }
            return next;
        });
        setErrors((current) => {
            if (!current[name] && !(name === "startDate" && current.endDate)) return current;
            return {
                ...current,
                [name]: null,
                // Al cambiar la ida, el error de la vuelta (rango) puede dejar de aplicar.
                ...(name === "startDate" ? { endDate: null } : {}),
            };
        });
        if (submitStatus === "error") {
            setSubmitStatus("idle");
            setSubmitMessage("");
        }
    }

    async function addDestination(suggestion) {
        const alreadyAdded = form.destinations.some((d) => isSameDestination(d, suggestion));
        if (alreadyAdded) return;

        setDestinationSearch("");
        setDestinationOptions([]);
        setResolvingDestination(true);
        setErrors((current) => ({ ...current, destinations: null }));
        try {
            const full = await resolveDestination(suggestion.placeId, sessionTokenRef.current);
            setForm((current) => ({
                ...current,
                destinations: [...current.destinations, {
                    ...full,
                    imageUrl: pickDestinationImage(full),
                }],
            }));
            sessionTokenRef.current = makeSessionToken();
        } catch {
            setErrors((current) => ({ ...current, destinations: "No se pudo agregar ese destino, probá de nuevo." }));
        } finally {
            setResolvingDestination(false);
        }
    }

    function removeDestination(destinationToRemove) {
        setForm((current) => ({
            ...current,
            destinations: current.destinations.filter(
                (item) => !isSameDestination(item, destinationToRemove)
            ),
        }));
    }

    function openDestinationPicker() {
        Keyboard.dismiss();
        setShowDestinationPicker(true);
    }

    function closeDestinationPicker() {
        setShowDestinationPicker(false);
        setDestinationSearch("");
        setDestinationOptions([]);
    }

    function validateForm() {
        const localErrors = {};
        const hoy = todayISO();
        const title = form.title.trim();

        // Título
        if (!title) {
            localErrors.title = "El título del viaje es obligatorio.";
        } else if (title.length < 3) {
            localErrors.title = "El título debe tener al menos 3 caracteres.";
        } else if (title.length > 100) {
            localErrors.title = "El título no puede superar los 100 caracteres.";
        }

        // Destinos
        if (form.destinations.length === 0) {
            localErrors.destinations = "Debes agregar al menos un destino.";
        }

        // Fecha de ida
        if (!form.startDate) {
            localErrors.startDate = "La fecha de ida es obligatoria.";
        } else if (!isValidISODate(form.startDate)) {
            localErrors.startDate = "La fecha de ida no es válida.";
        } else if (!tripAlreadyStarted && form.startDate < hoy) {
            localErrors.startDate = "La fecha de ida debe ser igual o posterior a hoy.";
        }

        // Fecha de vuelta
        if (!form.endDate) {
            localErrors.endDate = "La fecha de vuelta es obligatoria.";
        } else if (!isValidISODate(form.endDate)) {
            localErrors.endDate = "La fecha de vuelta no es válida.";
        } else if (!localErrors.startDate && form.startDate && form.endDate < form.startDate) {
            localErrors.endDate = "La fecha de vuelta no puede ser anterior a la de ida.";
        } else if (!tripAlreadyStarted && form.endDate < hoy) {
            localErrors.endDate = "La fecha de vuelta debe ser igual o posterior a hoy.";
        }

        setErrors(localErrors);

        // Con pestañas, un error puede quedar en una pestaña que no se está viendo:
        // se lleva al usuario a la primera que tenga errores para que sepa qué corregir.
        if (localErrors.title || localErrors.startDate || localErrors.endDate) {
            setActiveTab("info");
        } else if (localErrors.destinations) {
            setActiveTab("destinations");
        }

        return Object.keys(localErrors).length === 0;
    }

    async function handleSubmit() {
      if (!validateForm()) {
        setSubmitStatus("error");
        setSubmitMessage("Por favor, corrige los errores del formulario.");
        return;
      }

      setSubmitStatus("submitting");
      setSubmitMessage("");
      try {
        const response = await updateTrip(tripId, {
          title: form.title.trim(),
          description: form.description.trim() ? form.description.trim() : null,
          startDate: form.startDate,
          endDate: form.endDate,
          currency: form.currency,
          destinations: form.destinations.map(({ name, country, lat, lng, placeId, provinceState, imageUrl, image }) => ({
            name,
            country,
            lat,
            lng,
            placeId,
            provinceState,
            imageUrl: pickDestinationImage({ imageUrl, image }),
          })),
        });

        let coverWarning = "";
        if (coverImage) {
          try {
            await uploadTripCover(tripId, coverImage);
          } catch (uploadError) {
            coverWarning = ` No se pudo actualizar la portada (${uploadError.message}).`;
          }
        } else if (removeCoverRequested && hasCustomCover) {
          try {
            await removeTripCover(tripId);
          } catch (removeError) {
            coverWarning = ` No se pudo quitar la portada personalizada (${removeError.message}).`;
          }
        }

        setSubmitStatus("success");
        setSubmitMessage((response.message || "Cambios guardados correctamente.") + coverWarning);
        navigationTimerRef.current = setTimeout(() => {
          navigationTimerRef.current = null;
          navigation.goBack();
        }, 900);
      } catch (error) {
        setSubmitStatus("error");
        setSubmitMessage(error.message);
      }
    }

  if (loading) {
    return (
      <ScreenContainer fullWidth padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (loadError) {
    return (
      <ScreenContainer fullWidth padded={false}>
        <View style={styles.centered}>
          <Text style={styles.fieldError}>{loadError}</Text>
          <PrimaryButton label="Volver" onPress={() => navigation.goBack()} variant="secondary" />
        </View>
      </ScreenContainer>
    );
  }

  const tripDuration = computeTripDays(form.startDate, form.endDate);

  // Marca en la pestaña si tiene un error pendiente, para no perderlo de vista.
  const tabHasError = {
    info: Boolean(errors.title || errors.description || errors.startDate || errors.endDate),
    destinations: Boolean(errors.destinations),
    cover: Boolean(coverError),
  };

  return (
    <ScreenContainer fullWidth padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              tone="light"
            />
            <View style={styles.heroTitleWrap} pointerEvents="none">
              <Text style={styles.heroTitle}>Editar viaje</Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.body}>
            <View style={styles.metricsRow}>
              <MetricCard label="Destinos" value={form.destinations.length} />
              <MetricCard
                label="Duración"
                value={tripDuration || "Sin fechas"}
              />
            </View>

            <View style={styles.tabsContainer}>
              <Pressable
                style={[styles.tabButton, activeTab === "info" && styles.tabButtonActive]}
                onPress={() => setActiveTab("info")}
                testID="edit-trip-tab-info"
                accessibilityRole="tab"
              >
                <Text style={[styles.tabText, activeTab === "info" && styles.tabTextActive]}>Información</Text>
                {tabHasError.info ? <View style={styles.tabErrorDot} /> : null}
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === "destinations" && styles.tabButtonActive]}
                onPress={() => setActiveTab("destinations")}
                testID="edit-trip-tab-destinations"
                accessibilityRole="tab"
              >
                <Text style={[styles.tabText, activeTab === "destinations" && styles.tabTextActive]}>Destinos</Text>
                {tabHasError.destinations ? <View style={styles.tabErrorDot} /> : null}
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === "cover" && styles.tabButtonActive]}
                onPress={() => setActiveTab("cover")}
                testID="edit-trip-tab-cover"
                accessibilityRole="tab"
              >
                <Text style={[styles.tabText, activeTab === "cover" && styles.tabTextActive]}>Portada</Text>
                {tabHasError.cover ? <View style={styles.tabErrorDot} /> : null}
              </Pressable>
            </View>

            {/* PESTAÑA 1: INFORMACIÓN */}
            {activeTab === "info" && (
              <View style={styles.card}>
                <CardHeader
                  icon="suitcase-rolling"
                  title="Información Básica"
                  subtitle="Modificá los detalles principales de tu viaje."
                />

                <Field
                  error={errors.title}
                  icon="pen"
                  label="Título del viaje"
                  required
                  name="title"
                  onChange={handleInputChange}
                  placeholder="Escapada a Bariloche"
                  value={form.title}
                  maxLength={100}
                />

                <Field
                  error={errors.description}
                  icon="align-left"
                  label="Descripción"
                  optional
                  multiline
                  name="description"
                  onChange={handleInputChange}
                  placeholder="Notas, idea general o resumen para los participantes..."
                  value={form.description}
                />

                <View style={styles.sectionBlock}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>Fechas del viaje</Text>
                    <Text style={styles.requiredMark}>*</Text>
                  </View>

                  <View style={[styles.row, isTablet && styles.rowTablet]}>
                    {tripAlreadyStarted ? (
                      <View style={styles.dateField}>
                        <View style={styles.labelRow}>
                          <Text style={styles.fieldLabel}>Fecha de ida</Text>
                        </View>
                        <View style={[styles.dateTile, styles.dateTileDisabled]}>
                          <View style={styles.dateIconCircle}>
                            <FontAwesome6 name="plane-departure" size={14} color={colors.primary} />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.dateCaption}>Fecha de ida</Text>
                            <Text style={styles.dateValue}>{formatDateToDisplay(form.startDate)}</Text>
                          </View>
                        </View>
                        <Text style={styles.fieldHint}>El viaje ya comenzó, no se puede modificar.</Text>
                      </View>
                    ) : (
                      <DateField
                        error={errors.startDate}
                        icon="plane-departure"
                        label="Fecha de ida"
                        minDate={new Date()}
                        onChange={handleInputChange}
                        onOpenPicker={() => setShowStartPicker(true)}
                        pickerVisible={showStartPicker}
                        pickerValue={form.startDate}
                        fieldName="startDate"
                        setPickerVisible={setShowStartPicker}
                      />
                    )}

                    <DateField
                      error={errors.endDate}
                      icon="plane-arrival"
                      label="Fecha de vuelta"
                      disabled={!form.startDate}
                      disabledText="Elegí primero la fecha de ida"
                      minDate={form.startDate ? new Date(`${form.startDate}T12:00:00`) : new Date()}
                      onChange={handleInputChange}
                      onOpenPicker={() => {
                        if (!form.startDate) {
                          setErrors((current) => ({
                            ...current,
                            endDate: "Primero elegí la fecha de ida.",
                          }));
                          return;
                        }
                        setShowEndPicker(true);
                      }}
                      pickerVisible={showEndPicker}
                      pickerValue={form.endDate}
                      fieldName="endDate"
                      setPickerVisible={setShowEndPicker}
                    />
                  </View>

                  {tripDuration ? (
                    <View style={styles.durationChip}>
                      <FontAwesome6 name="moon" size={12} color={colors.primary} />
                      <Text style={styles.durationChipText}>{tripDuration}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {/* PESTAÑA 2: DESTINOS */}
            {activeTab === "destinations" && (
              <View style={styles.card}>
                <CardHeader
                  icon="location-dot"
                  title="Destinos y Ruta"
                  subtitle="Administrá las ciudades o países que vas a visitar."
                />

                <View style={styles.sectionBlock}>
                  <View style={styles.labelRow}>
                    <Text style={styles.fieldLabel}>Destino</Text>
                    <Text style={styles.requiredMark}>*</Text>
                  </View>

                  {form.destinations.length === 0 ? (
                    <>
                      <TouchableOpacity
                        style={[styles.searchBar, errors.destinations && styles.inputError]}
                        onPress={openDestinationPicker}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Buscar destino"
                      >
                        <FontAwesome6 name="magnifying-glass" size={15} color={colors.primary} />
                        <Text style={styles.searchBarText} numberOfLines={1}>Buscar ciudad o país...</Text>
                        <View style={styles.searchBarAction}>
                          <FontAwesome6 name="plus" size={13} color={colors.textInverse} />
                        </View>
                      </TouchableOpacity>
                      <Text style={styles.fieldHint}>Podés agregar más de un destino.</Text>
                    </>
                  ) : (
                    <View>
                      {form.destinations.map((d, index) => (
                        <View key={`${d.name}-${d.country}-${index}`} style={styles.routeRow}>
                          <RouteRail showTop={index > 0}>
                            <View style={styles.routeDot}>
                              <Text style={styles.routeDotText}>{index + 1}</Text>
                            </View>
                          </RouteRail>
                          <View style={styles.routeContent}>
                            <View style={styles.destinationCard}>
                              <DestinationThumb uri={pickDestinationImage(d)} />
                              <View style={styles.flex}>
                                <Text style={styles.destinationChipText} numberOfLines={1}>{d.name}</Text>
                                <Text style={styles.destinationCountry} numberOfLines={1}>
                                  {[d.provinceState, d.country].filter(Boolean).join(", ")}
                                </Text>
                              </View>
                              <Pressable
                                onPress={() => removeDestination(d)}
                                hitSlop={12}
                                testID={`edit-trip-remove-destination-${index}`}
                                style={styles.destinationRemoveButton}
                                accessibilityLabel={`Quitar ${d.name}`}
                              >
                                <FontAwesome6 name="xmark" size={12} color={COLOR_DANGER} />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      ))}

                      <View style={styles.routeRow}>
                        <RouteRail topHeight={9} showBottom={false}>
                          <View style={[styles.routeDot, styles.routeDotAdd]}>
                            <FontAwesome6 name="plus" size={11} color={colors.primary} />
                          </View>
                        </RouteRail>
                        <View style={styles.routeContent}>
                          <TouchableOpacity style={styles.addAnotherButton} onPress={openDestinationPicker} activeOpacity={0.8}>
                            <Text style={styles.addAnotherText}>Agregar otro destino</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  {errors.destinations ? (
                    <View style={styles.errorRow}>
                      <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
                      <Text style={styles.fieldError}>{errors.destinations}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {/* PESTAÑA 3: PORTADA */}
            {activeTab === "cover" && (
              <View style={styles.card}>
                <CardHeader
                  icon="image"
                  title="Portada del Viaje"
                  subtitle="Personaliza la imagen principal de tu experiencia."
                />

                {coverImage ? (
                  <ImageBackground
                    source={{ uri: coverImage.uri }}
                    imageStyle={styles.coverPreviewImage}
                    style={styles.coverPreview}
                  >
                    <View style={styles.coverBadge}>
                      <FontAwesome6 name="image" size={11} color={colors.primary} />
                      <Text style={styles.coverBadgeText}>Nueva imagen seleccionada</Text>
                    </View>
                  </ImageBackground>
                ) : removeCoverRequested ? (
                  defaultCoverUrl ? (
                    <ImageBackground
                      source={{ uri: defaultCoverUrl }}
                      imageStyle={styles.coverPreviewImage}
                      style={styles.coverPreview}
                    >
                      <View style={styles.coverBadge}>
                        <FontAwesome6 name="location-dot" size={11} color={colors.primary} />
                        <Text style={styles.coverBadgeText}>Portada de Google Maps</Text>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                      <View style={styles.coverEmptyIcon}>
                        <FontAwesome6 name="image" size={20} color={colors.primary} />
                      </View>
                      <Text style={styles.coverPreviewEmptyTitle}>Se usará una portada predeterminada</Text>
                    </View>
                  )
                ) : currentCoverUrl ? (
                  <ImageBackground
                    source={{ uri: currentCoverUrl }}
                    imageStyle={styles.coverPreviewImage}
                    style={styles.coverPreview}
                  >
                    <View style={styles.coverBadge}>
                      <FontAwesome6 name={hasCustomCover ? "image" : "location-dot"} size={11} color={colors.primary} />
                      <Text style={styles.coverBadgeText}>
                        {hasCustomCover ? "Portada personalizada actual" : "Portada según destino"}
                      </Text>
                    </View>
                  </ImageBackground>
                ) : (
                  <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                    <View style={styles.coverEmptyIcon}>
                      <FontAwesome6 name="image" size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.coverPreviewEmptyTitle}>Se usará una portada predeterminada</Text>
                  </View>
                )}

                <View style={styles.coverActions}>
                  <Pressable onPress={handlePickCoverImage} style={styles.coverActionButton}>
                    <FontAwesome6 name="image" size={14} color={colors.primary} />
                    <Text style={styles.coverActionText}>
                      {coverImage || hasCustomCover ? "Cambiar imagen de galería" : "Elegir de la galería"}
                    </Text>
                  </Pressable>
                </View>

                {coverImage || hasCustomCover || removeCoverRequested ? (
                  <View style={styles.coverActionsRowSecondary}>
                    {coverImage ? (
                      <Pressable onPress={handleCancelCoverSelection} style={styles.coverActionButtonSecondary}>
                        <Text style={styles.coverActionTextSecondary}>Cancelar</Text>
                      </Pressable>
                    ) : null}

                    {!coverImage && hasCustomCover && !removeCoverRequested ? (
                      <Pressable onPress={handleRequestGoogleCover} style={styles.coverActionButtonSecondary}>
                        <Text style={styles.coverActionTextSecondary}>Usar Google</Text>
                      </Pressable>
                    ) : null}

                    {removeCoverRequested ? (
                      <Pressable onPress={handleCancelRemoveCover} style={styles.coverActionButtonSecondary}>
                        <Text style={styles.coverActionTextSecondary}>Cancelar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {coverError ? (
                  <View style={styles.errorRow}>
                    <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
                    <Text style={styles.fieldError}>{coverError}</Text>
                  </View>
                ) : null}

                <AICoverGenerator
                  generate={(prompt) => generateTripCoverAI(tripId, prompt)}
                  onAccept={handleAcceptAiCover}
                />
              </View>
            )}

            {submitMessage ? (
              <View style={[styles.banner, submitStatus === "error" ? styles.bannerError : styles.bannerSuccess]}>
                <FontAwesome6
                  name={submitStatus === "error" ? "circle-exclamation" : "circle-check"}
                  size={14}
                  color={submitStatus === "error" ? COLOR_DANGER : colors.success}
                />
                <Text style={[styles.bannerText, submitStatus === "error" ? styles.submitError : styles.submitSuccess]}>
                  {submitMessage}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label="Cancelar"
                onPress={() => navigation.goBack()}
                variant="secondary"
                style={styles.actionSecondary}
              />
              <PrimaryButton
                label={submitStatus === "submitting" ? "Guardando..." : "Guardar cambios"}
                loading={submitStatus === "submitting"}
                onPress={handleSubmit}
                style={styles.actionPrimary}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        title="Fecha de ida"
        value={form.startDate}
        onChange={(ymd) => {
          handleInputChange("startDate", ymd);
          setShowStartPicker(false);
        }}
        minDate={new Date()}
      />

      <DatePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        title="Fecha de vuelta"
        value={form.endDate}
        onChange={(ymd) => {
          handleInputChange("endDate", ymd);
          setShowEndPicker(false);
        }}
        minDate={form.startDate ? new Date(`${form.startDate}T12:00:00`) : new Date()}
      />

      <DestinationPickerModal
        visible={showDestinationPicker}
        onClose={closeDestinationPicker}
        search={destinationSearch}
        onSearchChange={setDestinationSearch}
        options={destinationOptions}
        searching={searchingDestinations}
        hasSearched={hasSearchedDestinations}
        onSelect={addDestination}
        selectedDestinations={form.destinations}
        onRemoveSelected={removeDestination}
        resolving={resolvingDestination}
        error={errors.destinations}
      />
    </ScreenContainer>
  );
}

function Field({ label, name, onChange, value, placeholder, icon, multiline = false, required = false, optional = false, error = null, maxLength }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {required ? <Text style={styles.requiredMark}>*</Text> : null}
        {optional ? <Text style={styles.optionalTag}>Opcional</Text> : null}
      </View>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          focused && styles.inputWrapFocused,
          error && styles.inputError,
        ]}
      >
        {icon ? (
          <FontAwesome6
            name={icon}
            size={14}
            color={focused ? colors.primary : colors.textMuted}
            style={multiline ? styles.inputIconTop : null}
          />
        ) : null}
        <TextInput
          multiline={multiline}
          maxLength={maxLength}
          onChangeText={(text) => onChange(name, text)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
        />
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DateField({
  label,
  icon,
  fieldName,
  onChange,
  pickerVisible,
  setPickerVisible,
  pickerValue,
  onOpenPicker,
  error,
  minDate,
  disabled = false,
  disabledText = "",
}) {
  const valueText = pickerValue
    ? formatDateToDisplay(pickerValue)
    : disabled && disabledText
      ? disabledText
      : "Seleccionar fecha";

  const iconCircle = (
    <View style={[styles.dateIconCircle, pickerValue && styles.dateIconCircleOn]}>
      <FontAwesome6 name={icon} size={14} color={pickerValue ? colors.textInverse : colors.primary} />
    </View>
  );

  return (
    <View style={styles.dateField}>
      {Platform.OS === "web" ? (
        <View
          style={[
            styles.dateTile,
            pickerValue && styles.dateTileFilled,
            error && styles.inputError,
            disabled && styles.dateTileDisabled,
          ]}
        >
          {iconCircle}
          <View style={styles.flex}>
            <Text style={styles.dateCaption}>{label}</Text>
            <input
              type="date"
              disabled={disabled}
              min={minDate ? dateToLocalISO(minDate) : undefined}
              value={pickerValue || ""}
              onChange={(e) => onChange(fieldName, e.target.value)}
              style={{
                border: "none",
                width: "100%",
                outline: "none",
                backgroundColor: "transparent",
                fontFamily: "inherit",
                fontSize: "16px",
                color: "inherit",
                cursor: disabled ? "not-allowed" : "pointer",
                padding: 0,
              }}
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={onOpenPicker}
          style={[
            styles.dateTile,
            pickerValue && styles.dateTileFilled,
            error && styles.inputError,
            disabled && styles.dateTileDisabled,
          ]}
        >
          {iconCircle}
          <View style={styles.flex}>
            <Text style={styles.dateCaption}>{label}</Text>
            <Text numberOfLines={1} style={[styles.dateValue, !pickerValue && styles.datePlaceholder]}>
              {valueText}
            </Text>
          </View>
          <FontAwesome6 name="chevron-down" size={12} color={disabled ? colors.textMuted : colors.textSecondary} />
        </Pressable>
      )}
      {error ? (
        <View style={styles.errorRow}>
          <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  heroTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 20,
  },
  body: {
    gap: spacing.md,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted || "#E9ECEF",
    borderRadius: radii.md,
    padding: 4,
    marginTop: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
    fontSize: 14,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabErrorDot: {
    position: "absolute",
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR_DANGER,
  },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  cardSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  row: {
    gap: spacing.sm,
  },
  rowTablet: {
    flexDirection: "row",
  },
  field: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  fieldLabel: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginBottom: 0,
  },
  requiredMark: {
    ...textStyles.label,
    color: COLOR_DANGER,
  },
  optionalTag: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginLeft: 4,
  },
  inputWrap: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputWrapMultiline: {
    alignItems: "flex-start",
    minHeight: 96,
  },
  inputWrapFocused: {
    borderColor: colors.primary,
  },
  inputIconTop: {
    marginTop: 17,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 13,
    ...textStyles.body,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: COLOR_DANGER,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 2,
  },
  fieldError: {
    ...textStyles.meta,
    color: COLOR_DANGER,
    flex: 1,
  },
  fieldHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  dateField: {
    flex: 1,
    gap: spacing.xs,
  },
  dateTile: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dateTileFilled: {
    borderColor: colors.primary,
  },
  dateTileDisabled: {
    opacity: 0.55,
    backgroundColor: colors.surfaceMuted,
  },
  dateIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  dateIconCircleOn: {
    backgroundColor: colors.primary,
  },
  dateCaption: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  dateValue: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    marginTop: 1,
  },
  datePlaceholder: {
    color: colors.textMuted,
    fontWeight: "400",
  },
  durationChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLOR_SOFT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
  },
  durationChipText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  searchBar: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchBarText: {
    flex: 1,
    ...textStyles.body,
    color: colors.textMuted,
  },
  searchBarAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  routeRow: {
    flexDirection: "row",
    gap: 12,
  },
  routeRail: {
    width: 28,
    alignItems: "center",
  },
  routeLine: {
    width: 2,
    backgroundColor: colors.border,
  },
  routeLineHidden: {
    backgroundColor: "transparent",
  },
  routeLineBottom: {
    flex: 1,
    width: 2,
  },
  routeDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  routeDotText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
  },
  routeDotAdd: {
    backgroundColor: COLOR_SOFT,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
  },
  routeContent: {
    flex: 1,
    paddingBottom: spacing.xs,
  },
  destinationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 6,
    paddingRight: spacing.sm,
  },
  destinationThumb: {
    width: 52,
    height: 52,
    borderRadius: radii.sm || 8,
    backgroundColor: colors.surfaceMuted,
  },
  destinationThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  destinationChipText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  destinationRemoveButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_DANGER_SOFT,
  },
  addAnotherButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radii.md,
    backgroundColor: COLOR_SOFT,
  },
  addAnotherText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  bannerError: {
    backgroundColor: COLOR_DANGER_SOFT,
  },
  bannerSuccess: {
    backgroundColor: colors.successSurface || "rgba(34,197,94,0.1)",
  },
  bannerText: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    flex: 1,
  },
  submitError: {
    color: COLOR_DANGER,
  },
  submitSuccess: {
    color: colors.success,
  },
  actions: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionPrimary: { flex: 1 },
  actionSecondary: { flex: 1 },
  coverPreview: {
    height: 200,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  coverPreviewImage: {
    borderRadius: radii.lg,
  },
  coverBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  coverBadgeText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  coverPreviewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
  },
  coverEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  coverPreviewEmptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  coverActions: {
    gap: spacing.sm,
  },
  coverActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  coverActionText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
    textAlign: "center",
  },
  coverActionsRowSecondary: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  coverActionButtonSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  coverActionTextSecondary: {
    ...textStyles.bodyStrong,
    color: COLOR_DANGER,
    fontSize: 13,
    textAlign: "center",
  },
  destinationCountry: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dpHeader: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  dpHeaderRow: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  dpTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dpTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 20,
  },
  dpHeaderHint: {
    ...textStyles.body,
    color: colors.textInverse,
    opacity: 0.85,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  dpSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  dpSearchFocused: {
    borderColor: colors.accent || colors.surface,
  },
  dpSearchInput: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  dpBody: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  dpError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: COLOR_DANGER_SOFT,
  },
  dpErrorText: {
    ...textStyles.meta,
    color: COLOR_DANGER,
    fontWeight: "600",
    flex: 1,
  },
  dpSelected: {
    paddingTop: spacing.md,
    flexShrink: 0,
  },
  dpSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  dpSectionLabel: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
  },
  dpCountPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  dpCountPillText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 11,
  },
  dpAvatarImage: {
    backgroundColor: colors.surfaceMuted,
  },
  dpAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  dpResults: {
    flex: 1,
    minHeight: 0,
  },
  dpListContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  dpSeparator: {
    height: 6,
  },
  dpItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  dpItemActive: {
    borderColor: colors.primary,
    backgroundColor: COLOR_SOFT,
  },
  dpItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  dpItemIconActive: {
    backgroundColor: colors.primary,
  },
  dpItemTexts: {
    flex: 1,
  },
  dpItemName: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  dpItemNameActive: {
    color: colors.primary,
  },
  dpItemMatch: {
    color: colors.primary,
    fontWeight: "800",
  },
  dpItemSub: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dpAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  dpAddedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: colors.primary,
  },
  dpAddedText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 11,
  },
  dpIdleContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  dpIdleHero: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  dpIdleIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  dpIdleTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 16,
  },
  dpIdleText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  dpSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: spacing.sm + 4,
    marginBottom: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  dpSkeletonCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceMuted,
  },
  dpSkeletonLong: {
    width: "60%",
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
  dpSkeletonShort: {
    width: "35%",
    height: 10,
    borderRadius: 5,
    marginTop: 8,
    backgroundColor: colors.surfaceMuted,
  },
  dpFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  dpSelectedFull: {
    flex: 1,
    minHeight: 0,
  },
  dpSelectedCompact: {
    maxHeight: 190,
    flexShrink: 1,
  },
  dpRouteList: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  dpRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 12,
  },
  dpRouteIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  dpRouteIndexText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 11,
  },
  dpRouteName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  dpRouteCountry: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 1,
  },
  dpRouteHint: {
    ...textStyles.meta,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  dpChipRemove: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_DANGER_SOFT,
  },
  dpToast: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    zIndex: 10,
    elevation: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  dpToastText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
    flex: 1,
  },
  dpStrip: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    flexShrink: 0,
  },
  dpStripLabel: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
  },
  dpStripList: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: 2,
  },
  dpMiniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 190,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 6,
    paddingRight: 12,
  },
  dpMiniChipText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
    flexShrink: 1,
  },
  dpResultsLabel: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  dpFooterKeyboard: {
    paddingBottom: spacing.sm,
  },
  dpHeaderCompact: {
    paddingBottom: spacing.sm,
  },
  dpHeaderGap: {
    height: spacing.xs,
  },
  dpStripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  dpStripDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: COLOR_SOFT,
  },
  dpStripDoneText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
});