import { Fragment, useCallback, useContext, useEffect, useMemo, useState, useRef, forwardRef } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
  TouchableWithoutFeedback,
  StatusBar,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import Modal from "../components/ui/AppModal";

import { LocaleConfig } from "react-native-calendars";
import DatePickerModal from "../components/ui/DatePickerModal";
import { toYMD, parseYMD, getTodayIso, formatDateDisplay } from "../utils/dates";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantList from "../components/trip/ParticipantList";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import CurrencySelector from "../components/trip/CurrencySelector";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import AICoverGenerator from "../components/trip/AICoverGenerator";
import useResponsive from "../hooks/useResponsive";
import {
  createTrip,
  getCurrentUser,
  getUsers,
  getCurrencies,
  searchDestinations,
  resolveDestination,
  uploadTripCover,
  generateCoverPreviewAI,
  acceptTripCoverAI,
} from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";
import * as ImagePicker from "expo-image-picker";

const MONTH_NAMES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Configuración del calendario en Español (react-native-calendars)
LocaleConfig.locales["es"] = {
  monthNames: MONTH_NAMES_ES,
  monthNamesShort: ["Ene.", "Feb.", "Mar.", "Abr.", "May.", "Jun.", "Jul.", "Ago.", "Sep.", "Oct.", "Nov.", "Dic."],
  dayNames: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  dayNamesShort: ["Dom.", "Lun.", "Mar.", "Mié.", "Jue.", "Vie.", "Sáb."],
  today: "Hoy",
};
LocaleConfig.defaultLocale = "es";

const initialForm = {
  title: "",
  destinations: [],
  description: "",
  startDate: "",
  endDate: "",
  currency: "ARS",
  participantUserIds: [],
  invitedEmails: [],
};

const STEPS = [
  { id: 1, label: "Datos" },
  { id: 2, label: "Destinos" },
  { id: 3, label: "Invitados" },
];

const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png"];

const COLOR_SOFT = colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff";
const COLOR_DANGER = colors.danger || "#FF3B30";
const COLOR_DANGER_SOFT = colors.danger ? `${colors.danger}14` : "rgba(255,59,48,0.08)";

/* ───────────────────────── Utilidades ───────────────────────── */

function isValidEmail(email) {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getEmailLabel(email) {
  return email.split("@")[0].replace(/[._-]+/g, " ");
}

function makeSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getExtensionFromAsset(asset) {
  const fromFileName = asset.fileName?.split(".").pop();
  if (fromFileName) return fromFileName.toLowerCase();
  const fromUri = asset.uri?.split(".").pop();
  return fromUri ? fromUri.toLowerCase().split("?")[0] : "";
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function describeDuration(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const nights = Math.round((end - start) / 86400000);
  if (Number.isNaN(nights) || nights < 0) return null;
  const days = nights + 1;
  if (nights === 0) return "Viaje de un día";
  return `${nights} ${nights === 1 ? "noche" : "noches"} · ${days} días`;
}

/**
 * Indica si el teclado está abierto.
 * - Nativo: eventos de Keyboard.
 * - Web: en el navegador no existen esos eventos, así que se detecta comparando
 *   el alto de la ventana con el área visible (visualViewport), que se achica
 *   cuando aparece el teclado del celular.
 */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return undefined;
      const check = () => setVisible(window.innerHeight - vv.height > 150);
      check();
      vv.addEventListener("resize", check);
      return () => vv.removeEventListener("resize", check);
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return visible;
}

/**
 * Mantiene visible el campo que se está editando moviendo el scroll SOLO lo necesario,
 * para que quede justo por encima del teclado (sin empujarlo hasta arriba de todo).
 * `registrarBase` guarda la posición de la tarjeta que contiene los campos.
 */
function useScrollAlCampo(margen = 20) {
  const ref = useRef(null);
  const scrollY = useRef(0);
  const alturaVisible = useRef(0);
  const campos = useRef({});
  const base = useRef(0);
  const activo = useRef(null);

  const asegurarVisible = useCallback(() => {
    const campo = activo.current != null ? campos.current[activo.current] : null;
    if (!campo || !alturaVisible.current) return;

    const arriba = base.current + campo.y;
    const abajo = arriba + campo.h;
    const visibleArriba = scrollY.current;
    const visibleAbajo = scrollY.current + alturaVisible.current;

    let destino = null;
    if (abajo + margen > visibleAbajo) {
      destino = abajo + margen - alturaVisible.current;
    } else if (arriba - margen < visibleArriba) {
      destino = arriba - margen;
    }
    if (destino !== null) {
      ref.current?.scrollTo?.({ y: Math.max(0, destino), animated: true });
    }
  }, [margen]);

  const registrarBase = useCallback((e) => {
    base.current = e.nativeEvent.layout.y;
  }, []);

  const registrar = useCallback(
    (key) => (e) => {
      const { y, height } = e.nativeEvent.layout;
      campos.current[key] = { y, h: height };
    },
    []
  );

  const enfocar = useCallback(
    (key) => {
      activo.current = key;
      setTimeout(asegurarVisible, 120);
      setTimeout(asegurarVisible, 380);
    },
    [asegurarVisible]
  );

  const limpiar = useCallback(() => {
    activo.current = null;
  }, []);

  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: (e) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
    onLayout: (e) => {
      alturaVisible.current = e.nativeEvent.layout.height;
      if (activo.current != null) setTimeout(asegurarVisible, 50);
    },
  };

  return { ref, scrollProps, registrar, registrarBase, enfocar, limpiar };
}

/* ───────────────────────── Componentes ───────────────────────── */

function Stepper({ step }) {
  return (
    <View style={styles.stepper}>
      {STEPS.map((s, i) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <Fragment key={s.id}>
            {i > 0 ? <View style={[styles.stepLine, step >= s.id && styles.stepLineOn]} /> : null}
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, (done || active) && styles.stepCircleOn]}>
                {done ? (
                  <FontAwesome6 name="check" size={12} color={colors.primary} />
                ) : (
                  <Text style={[styles.stepCircleText, active && styles.stepCircleTextOn]}>{s.id}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, (done || active) && styles.stepLabelOn]}>{s.label}</Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
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

const Field = forwardRef(function Field(
  {
    label,
    name,
    onChange,
    value,
    placeholder,
    icon,
    multiline = false,
    required = false,
    optional = false,
    error = null,
    onFocus,
    onLayout,
    returnKeyType,
    onSubmitEditing,
  },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field} onLayout={onLayout}>
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
            color={focused ? colors.primary : colors.overlay}
            style={multiline ? styles.inputIconTop : null}
          />
        ) : null}
        <TextInput
          ref={ref}
          multiline={multiline}
          onChangeText={(text) => onChange(name, text)}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.overlay}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={!multiline && returnKeyType !== "next"}
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
});

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
  const minYMD = minDate ? toYMD(minDate) : null;

  const valueText = pickerValue
    ? formatDateDisplay(pickerValue)
    : disabled && disabledText
      ? disabledText
      : "Seleccionar fecha";

  const iconCircle = (
    <View style={[styles.dateIconCircle, pickerValue && styles.dateIconCircleOn]}>
      <FontAwesome6 name={icon} size={14} color={pickerValue ? colors.textInverse : colors.primary} />
    </View>
  );

  const tileContent = (
    <>
      {iconCircle}
      <View style={styles.flex}>
        <Text style={styles.dateCaption}>{label}</Text>
        <Text numberOfLines={1} style={[styles.dateValue, !pickerValue && styles.datePlaceholder]}>
          {valueText}
        </Text>
      </View>
      <FontAwesome6 name="chevron-down" size={12} color={disabled ? colors.overlay : colors.textSecondary} />
    </>
  );

  return (
    <View style={styles.dateField}>
      {Platform.OS === "web" ? (
        // Web: se muestra el mismo diseño que en la app y encima va el <input type="date">
        // invisible, ocupando toda la tarjeta. Al tocarlo se abre el calendario nativo del navegador.
        <View
          style={[
            styles.dateTile,
            pickerValue && styles.dateTileFilled,
            error && styles.inputError,
            disabled && styles.dateTileDisabled,
          ]}
        >
          {tileContent}
          <input
            type="date"
            aria-label={label}
            disabled={disabled}
            min={minYMD ?? undefined}
            value={pickerValue || ""}
            onChange={(e) => onChange(fieldName, e.target.value)}
            onClick={(e) => {
              // En escritorio el calendario solo se abre tocando el iconito; showPicker lo abre siempre.
              try {
                e.currentTarget.showPicker?.();
              } catch {
                // Algunos navegadores no lo permiten: se ignora y queda el comportamiento por defecto.
              }
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              margin: 0,
              padding: 0,
              border: "none",
              boxSizing: "border-box",
              fontSize: 16, // evita el zoom automático de iPhone al tocar el campo
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          />
        </View>
      ) : (
        <>
          <Pressable
            onPress={onOpenPicker}
            style={[
              styles.dateTile,
              pickerValue && styles.dateTileFilled,
              error && styles.inputError,
              disabled && styles.dateTileDisabled,
            ]}
          >
            {tileContent}
          </Pressable>

          <DatePickerModal
            visible={pickerVisible}
            onClose={() => setPickerVisible(false)}
            title={label}
            value={pickerValue}
            onChange={(ymd) => onChange(fieldName, ymd)}
            minDate={minDate}
          />
        </>
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

function RouteRail({ children, topHeight = 18, showTop = true, showBottom = true }) {
  return (
    <View style={styles.routeRail}>
      <View style={[styles.routeLine, { height: topHeight }, !showTop && styles.routeLineHidden]} />
      {children}
      <View style={[styles.routeLineBottom, showBottom && styles.routeLine]} />
    </View>
  );
}

function CoverOption({ icon, label, sub, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.coverOption, active && styles.coverOptionActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <View style={[styles.coverOptionIcon, active && styles.coverOptionIconActive]}>
        <FontAwesome6 name={icon} size={14} color={active ? colors.textInverse : colors.primary} />
      </View>
      <Text style={[styles.coverOptionLabel, active && styles.coverOptionLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.coverOptionSub} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <View style={styles.summaryItem}>
      <View style={styles.summaryIcon}>
        <FontAwesome6 name={icon} size={13} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
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
  // useKeyboardVisible también funciona en web.
  const keyboardOpen = useKeyboardVisible();
  const keyboardVisible = visible && keyboardOpen;

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

export default function CreateTripScreen({ navigation }) {
  const [step, setStep] = useState(1); // Control del paso actual (1, 2, 3)

  const [currentUser, setCurrentUser] = useState(null);
  const [userOptions, setUserOptions] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const { isTablet } = useResponsive();
  const normalizedSearch = participantSearch.trim().toLowerCase();
  const [currencies, setCurrencies] = useState([]);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const primaryDestination = form.destinations[0] ?? null;
  const [resolvingDestination, setResolvingDestination] = useState(false);
  const sessionTokenRef = useRef(makeSessionToken());
  const [searchingDestinations, setSearchingDestinations] = useState(false);
  const [hasSearchedDestinations, setHasSearchedDestinations] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [coverError, setCoverError] = useState("");
  const [aiCover, setAiCover] = useState(null); // { imageBase64, mimeType } generada con IA, se aplica al crear
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const lastContentHeightRef = useRef(0);
  const coverMode = coverImage ? "gallery" : aiCover ? "ai" : "destination";

  const tecladoVisible = useKeyboardVisible();
  const formScroll = useScrollAlCampo();

  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);

  function dismissAllInputs() {
    Keyboard.dismiss();
    titleInputRef.current?.blur();
    descriptionInputRef.current?.blur();
  }

  useEffect(() => {
    if (!tecladoVisible) formScroll.limpiar();
  }, [tecladoVisible]);

  useEffect(() => {
    formScroll.ref.current?.scrollTo?.({ y: 0, animated: false });
  }, [step]);

  async function handlePickCoverImage() {
    setCoverError("");

    if (Platform.OS !== "web") {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setCoverError(
          canAskAgain
            ? "Necesitamos tu permiso para acceder a las fotos y poder elegir una portada."
            : "El acceso a las fotos está bloqueado. Habilitalo desde los ajustes del dispositivo para elegir una portada."
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
      setCoverError("Tipo de archivo no permitido. Solo se permiten JPG, JPEG y PNG.");
      return;
    }

    setCoverImage({
      uri: asset.uri,
      fileName: asset.fileName || `portada.${extension}`,
      mimeType: asset.mimeType || (extension === "png" ? "image/png" : "image/jpeg"),
      file: asset.file,
    });
    setAiCover(null);
  }

  function handleRemoveCoverImage() {
    setCoverImage(null);
    setCoverError("");
  }

  function handleGenerateAiCover(prompt) {
    return generateCoverPreviewAI({
      title: form.title,
      destinations: form.destinations.map((d) => (d.country ? `${d.name}, ${d.country}` : d.name)),
      prompt,
    });
  }

  async function handleAcceptAiCover(preview) {
    setAiCover(preview);
    setCoverImage(null);
    setCoverError("");
    return "Portada generada seleccionada. Se aplicará al crear el viaje.";
  }

  function handleRemoveAiCover() {
    setAiCover(null);
  }

  function handleUseDestinationCover() {
    setCoverImage(null);
    setAiCover(null);
    setCoverError("");
    setShowAiGenerator(false);
  }

  function handleToggleAiGenerator() {
    const willShow = !showAiGenerator;
    setShowAiGenerator(willShow);
    if (willShow) {
      setTimeout(() => formScroll.ref.current?.scrollToEnd?.({ animated: true }), 150);
      setTimeout(() => formScroll.ref.current?.scrollToEnd?.({ animated: true }), 400);
    }
  }

  function handleChooseGallery() {
    setShowAiGenerator(false);
    handlePickCoverImage();
  }

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
      } catch {
        setCurrentUser(null);
      }
    }
    loadCurrentUser();
  }, []);

  const lastQueryLengthRef = useRef(0);

  useEffect(() => {
    let active = true;
    const query = participantSearch.trim();

    if (query.length < 2) {
      setUserOptions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const results = await getUsers(query);
        if (active) setUserOptions(Array.isArray(results) ? results : []);
      } catch (error) {
        console.warn("Error buscando usuarios:", error.message);
        if (active) setUserOptions([]);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [participantSearch]);

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

  useEffect(() => {
    async function loadCurrencies() {
      try {
        const data = await getCurrencies();
        setCurrencies(data);
      } catch (error) {
        setCurrencies([]);
      }
    }
    loadCurrencies();
  }, []);

  const selectableUsers = useMemo(
    () =>
      userOptions.filter((user) => {
        if (currentUser && user.id === currentUser.id) {
          return false;
        }
        return !form.participantUserIds.includes(user.id);
      }),
    [currentUser, form.participantUserIds, userOptions]
  );

  const canInviteExternal = useMemo(() => {
    if (!isValidEmail(normalizedSearch)) return false;
    if (currentUser && currentUser.email.toLowerCase() === normalizedSearch) return false;
    if (selectedParticipants.some((user) => user.email.toLowerCase() === normalizedSearch)) return false;
    if (form.invitedEmails.includes(normalizedSearch)) return false;
    return !selectableUsers.some((user) => user.email.toLowerCase() === normalizedSearch);
  }, [currentUser, form.invitedEmails, normalizedSearch, selectableUsers, selectedParticipants]);

  const participantItems = useMemo(() => {
    const registered = selectedParticipants.map((user) => ({
      key: `user-${user.id}`,
      kind: "registered",
      id: user.id,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      fotoUrl: user.fotoUrl ?? "",
    }));

    const invited = form.invitedEmails.map((email) => ({
      key: `external-${email}`,
      kind: "external",
      email,
      nombreCompleto: getEmailLabel(email),
      fotoUrl: "",
    }));

    return [...registered, ...invited];
  }, [form.invitedEmails, selectedParticipants]);

  const tripDuration = useMemo(
    () => describeDuration(form.startDate, form.endDate),
    [form.startDate, form.endDate]
  );

  function handleInputChange(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: null }));
    }
  }

  function handleDateChange(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "startDate" && current.endDate && current.endDate < value) {
        next.endDate = "";
      }
      return next;
    });
    setErrors((current) => ({
      ...current,
      [name]: null,
      ...(name === "startDate" ? { endDate: null } : {}),
    }));
  }

  function handleParticipantSearchChange(value) {
    setParticipantSearch(value);
    setInviteMessage("");
  }

  function addParticipant(user) {
    if (form.participantUserIds.includes(user.id)) return;

    setSelectedParticipants((current) => [...current, user]);
    setForm((current) => ({
      ...current,
      participantUserIds: [...current.participantUserIds, user.id],
    }));
    setParticipantSearch("");
    setUserOptions([]);
    setInviteMessage("");
  }

  function addExternalInvite() {
    const email = normalizedSearch;
    if (!email) return;
    if (!isValidEmail(email)) {
      setInviteMessage("El correo ingresado no tiene un formato válido.");
      return;
    }
    if (currentUser && currentUser.email.toLowerCase() === email) {
      setInviteMessage("No puedes invitar al creador del viaje como invitado externo.");
      return;
    }
    if (selectedParticipants.some((user) => user.email.toLowerCase() === email)) {
      setInviteMessage("Ese correo ya corresponde a un participante registrado.");
      return;
    }
    if (form.invitedEmails.includes(email)) {
      setInviteMessage("Ese correo ya fue agregado como invitado externo.");
      return;
    }

    setForm((current) => ({
      ...current,
      invitedEmails: [...current.invitedEmails, email],
    }));
    setParticipantSearch("");
    setUserOptions([]);
    setInviteMessage("");
  }

  function removeParticipant(participant) {
    if (participant.kind === "external") {
      setForm((current) => ({
        ...current,
        invitedEmails: current.invitedEmails.filter((item) => item !== participant.email),
      }));
      return;
    }

    setSelectedParticipants((current) => current.filter((user) => user.id !== participant.id));
    setForm((current) => ({
      ...current,
      participantUserIds: current.participantUserIds.filter((id) => id !== participant.id),
    }));
  }

  async function addDestination(suggestion) {
    const alreadyAdded = form.destinations.some((d) => d.placeId === suggestion.placeId);
    if (alreadyAdded) return;

    setDestinationSearch("");
    setDestinationOptions([]);
    setResolvingDestination(true);
    setErrors((current) => ({ ...current, destinations: null }));
    try {
      const full = await resolveDestination(suggestion.placeId, sessionTokenRef.current);
      setForm((current) => ({
        ...current,
        destinations: [...current.destinations, full],
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
        (item) => !(item.name === destinationToRemove.name && item.country === destinationToRemove.country)
      ),
    }));
  }

  function openDestinationPicker() {
    dismissAllInputs();
    setShowDestinationPicker(true);
  }

  function closeDestinationPicker() {
    setShowDestinationPicker(false);
    setDestinationSearch("");
    setDestinationOptions([]);
  }

  // Validaciones por cada paso
  function validateStep1() {
    const localErrors = {};
    if (!form.title.trim()) localErrors.title = "El título del viaje no puede quedar vacío.";
    if (!form.startDate.trim()) localErrors.startDate = "La fecha de inicio es obligatoria.";
    if (!form.endDate.trim()) {
      localErrors.endDate = form.startDate.trim()
        ? "La fecha de finalización es obligatoria."
        : "Primero elegí la fecha de ida.";
    }
    if (!form.currency.trim()) localErrors.currency = "La moneda es obligatoria.";

    // Comparación de strings "YYYY-MM-DD": getTodayIso() tiene que devolver la fecha LOCAL (ver utils/dates).
    if (form.startDate && form.startDate < getTodayIso()) {
      localErrors.startDate = "La fecha de inicio no puede ser anterior a la fecha actual.";
    }

    if (form.startDate && form.endDate) {
      const start = new Date(`${form.startDate}T12:00:00`);
      const end = new Date(`${form.endDate}T12:00:00`);
      if (end < start) localErrors.endDate = "La fecha de regreso no puede ser anterior a la de inicio.";
    }

    setErrors(localErrors);
    return Object.keys(localErrors).length === 0;
  }

  function validateStep2() {
    const localErrors = {};
    if (form.destinations.length === 0) {
      localErrors.destinations = "Al menos un destino es requerido.";
    }
    setErrors(localErrors);
    return Object.keys(localErrors).length === 0;
  }

  function handleNext() {
    dismissAllInputs();
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  }

  function handleBack() {
    dismissAllInputs();
    if (step > 1) {
      setErrors({});
      setSubmitMessage("");
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  }

  async function handleSubmit() {
    if (submitStatus === "submitting") return;
    setSubmitStatus("submitting");
    setSubmitMessage("");
    try {
      const createdTrip = await createTrip({
        title: form.title,
        destinations: form.destinations,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        currency: form.currency,
        invitedEmails: form.invitedEmails,
        participantUserIds: form.participantUserIds.map(Number),
      });

      if (coverImage) {
        try {
          await uploadTripCover(createdTrip.id, coverImage);
        } catch (uploadError) {
          setSubmitStatus("success");
          setSubmitMessage(
            `El viaje se creó, pero no se pudo cargar la portada seleccionada (${uploadError.message}). Se usará la portada predeterminada.`
          );
          navigation.navigate("Tabs", { screen: "Inicio" });
          return;
        }
      }

      if (aiCover) {
        try {
          await acceptTripCoverAI(createdTrip.id, aiCover.imageBase64, aiCover.mimeType);
        } catch (aiError) {
          setSubmitStatus("success");
          setSubmitMessage(
            `El viaje se creó, pero no se pudo asignar la portada generada (${aiError.message}). Se usará la portada predeterminada.`
          );
          navigation.navigate("Tabs", { screen: "Inicio" });
          return;
        }
      }

      setSubmitStatus("success");
      setSubmitMessage("Viaje creado correctamente.");
      navigation.navigate("Tabs", { screen: "Inicio" });
    } catch (error) {
      setSubmitStatus("error");
      setSubmitMessage(error.message);
    }
  }

  const coverTitle = form.title.trim() || primaryDestination?.name || "";
  const submitting = submitStatus === "submitting";

  function renderCoverPreview() {
    let source = null;
    let badgeText = "";
    let badgeIcon = "image";

    if (coverImage) {
      source = { uri: coverImage.uri };
      badgeText = "Tu foto";
      badgeIcon = "image";
    } else if (aiCover) {
      source = { uri: `data:${aiCover.mimeType};base64,${aiCover.imageBase64}` };
      badgeText = "Creada con IA";
      badgeIcon = "wand-magic-sparkles";
    } else if (primaryDestination?.imageUrl) {
      source = { uri: primaryDestination.imageUrl };
      badgeText = "Foto del destino";
      badgeIcon = "location-dot";
    }

    if (!source) {
      return (
        <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
          <View style={styles.coverEmptyIcon}>
            <FontAwesome6 name="image" size={20} color={colors.primary} />
          </View>
          <Text style={styles.coverPreviewEmptyTitle}>Se usará una portada predeterminada</Text>
          <Text style={styles.coverPreviewEmptyText}>También podés elegir una foto o generar una con IA.</Text>
        </View>
      );
    }

    const destinationNames = form.destinations.map((d) => d.name);
    const destinationSummary =
      destinationNames.length === 1 && coverTitle === primaryDestination?.name
        ? primaryDestination?.country || ""
        : destinationNames.slice(0, 2).join(" · ") +
          (destinationNames.length > 2 ? ` +${destinationNames.length - 2}` : "");
    const coverSubtitle = [destinationSummary, tripDuration].filter(Boolean).join(" · ");

    return (
      <ImageBackground source={source} imageStyle={styles.coverPreviewImage} style={styles.coverPreview}>
        <View style={styles.coverPreviewTop}>
          <View style={styles.coverBadge}>
            <FontAwesome6 name={badgeIcon} size={11} color={colors.primary} />
            <Text style={styles.coverBadgeText}>{badgeText}</Text>
          </View>
          {coverMode !== "destination" ? (
            <Pressable
              onPress={handleUseDestinationCover}
              hitSlop={10}
              style={styles.coverRemoveButton}
              accessibilityLabel="Quitar portada y usar la del destino"
            >
              <FontAwesome6 name="xmark" size={13} color={colors.textInverse} />
            </Pressable>
          ) : null}
        </View>
        {coverTitle || coverSubtitle ? (
          <View style={styles.coverPreviewOverlay}>
            {coverTitle ? (
              <Text style={styles.coverPreviewTitle} numberOfLines={1}>
                {coverTitle}
              </Text>
            ) : null}
            {coverSubtitle ? (
              <Text style={styles.coverPreviewSubtitle} numberOfLines={1}>
                {coverSubtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ImageBackground>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        enabled={Platform.OS !== "web"}
      >
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton icon="arrow-left" onPress={handleBack} tone="light" />
            <View style={styles.heroTitleWrap} pointerEvents="none">
              <Text style={styles.heroTitle}>Nuevo viaje</Text>
            </View>
          </View>
          {!tecladoVisible ? <Stepper step={step} /> : null}
        </View>

        <ScrollView
          ref={formScroll.ref}
          {...formScroll.scrollProps}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          onContentSizeChange={(_w, h) => {
            const grew = h > lastContentHeightRef.current;
            lastContentHeightRef.current = h;
            if (grew && showAiGenerator && step === 2) {
              formScroll.ref.current?.scrollToEnd?.({ animated: true });
            }
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* PASO 1: DATOS BÁSICOS Y FECHAS */}
          {step === 1 && (
            <View style={styles.card} onLayout={formScroll.registrarBase}>
              <CardHeader
                icon="suitcase-rolling"
                title="Información Básica"
                subtitle="Contanos lo esencial para empezar a planificar."
              />

              <Field
                ref={titleInputRef}
                error={errors.title}
                icon="pen"
                label="Título del viaje"
                required
                name="title"
                onChange={handleInputChange}
                onFocus={() => formScroll.enfocar("title")}
                onLayout={formScroll.registrar("title")}
                placeholder="Escapada a Bariloche"
                returnKeyType="next"
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                value={form.title}
              />

              <Field
                ref={descriptionInputRef}
                error={errors.description}
                icon="align-left"
                label="Descripción"
                optional
                multiline
                name="description"
                onChange={handleInputChange}
                onFocus={() => formScroll.enfocar("description")}
                onLayout={formScroll.registrar("description")}
                placeholder="Notas, idea general o resumen para los participantes..."
                value={form.description}
              />

              <View style={styles.sectionBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabel}>Fechas del viaje</Text>
                  <Text style={styles.requiredMark}>*</Text>
                </View>

                <View style={[styles.row, isTablet && styles.rowTablet]}>
                  {/* Fecha de ida: desde hoy (inclusive) en adelante */}
                  <DateField
                    error={errors.startDate}
                    icon="plane-departure"
                    label="Fecha de ida"
                    minDate={parseYMD(getTodayIso(), 0)}
                    onChange={handleDateChange}
                    onOpenPicker={() => {
                      dismissAllInputs();
                      setShowStartPicker(true);
                    }}
                    pickerVisible={showStartPicker}
                    pickerValue={form.startDate}
                    fieldName="startDate"
                    setPickerVisible={setShowStartPicker}
                  />

                  {/* Fecha de vuelta: requiere fecha de ida, y desde ese mismo día (inclusive) en adelante */}
                  <DateField
                    error={errors.endDate}
                    icon="plane-arrival"
                    label="Fecha de vuelta"
                    disabled={!form.startDate}
                    disabledText="Elegí primero la fecha de ida"
                    minDate={form.startDate ? parseYMD(form.startDate, 0) : undefined}
                    onChange={handleDateChange}
                    onOpenPicker={() => {
                      dismissAllInputs();
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

              <View style={styles.sectionBlock}>
                <CurrencySelector
                  currencies={currencies}
                  selectedCurrency={form.currency}
                  onSelectCurrency={(code) => handleInputChange("currency", code)}
                  error={errors.currency}
                  onOpen={dismissAllInputs}
                />
                <Text style={styles.fieldHint}>
                  Es la moneda base para registrar y dividir los gastos del viaje.
                </Text>
              </View>
            </View>
          )}

          {/* PASO 2: DESTINOS Y PORTADA */}
          {step === 2 && (
            <View style={styles.card}>
              <CardHeader
                icon="location-dot"
                title="Destinos y Portada"
                subtitle="Elegí a dónde van y cómo se va a ver tu viaje."
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
                            {d.imageUrl ? (
                              <Image source={{ uri: d.imageUrl }} style={styles.destinationThumb} />
                            ) : (
                              <View style={[styles.destinationThumb, styles.destinationThumbEmpty]}>
                                <FontAwesome6 name="location-dot" size={16} color={colors.primary} />
                              </View>
                            )}
                            <View style={styles.flex}>
                              <Text style={styles.destinationChipText} numberOfLines={1}>{d.name}</Text>
                              <Text style={styles.destinationCountry} numberOfLines={1}>
                                {[d.provinceState, d.country].filter(Boolean).join(", ")}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => removeDestination(d)}
                              hitSlop={12}
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

                {/* Con el buscador abierto, el error se muestra dentro del buscador para que el usuario lo vea */}
                {errors.destinations && !showDestinationPicker ? (
                  <View style={styles.errorRow}>
                    <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
                    <Text style={styles.fieldError}>{errors.destinations}</Text>
                  </View>
                ) : null}
              </View>

              {/* PORTADA DEL VIAJE */}
              <View style={styles.sectionBlock}>
                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabel}>Portada del viaje</Text>
                  <Text style={styles.optionalTag}>Opcional</Text>
                </View>

                {renderCoverPreview()}

                <View style={styles.coverOptionsRow}>
                  <CoverOption
                    icon="location-dot"
                    label="Destino"
                    sub="Automática"
                    active={coverMode === "destination"}
                    onPress={handleUseDestinationCover}
                  />
                  <CoverOption
                    icon="image"
                    label="Galería"
                    sub={coverImage ? "Cambiar" : "Elegir foto"}
                    active={coverMode === "gallery"}
                    onPress={handleChooseGallery}
                  />
                  <CoverOption
                    icon="wand-magic-sparkles"
                    label="Con IA"
                    sub={aiCover ? "Lista" : "Generar"}
                    active={coverMode === "ai" || showAiGenerator}
                    onPress={handleToggleAiGenerator}
                  />
                </View>

                <Text style={styles.fieldHint}>
                  {coverMode === "gallery"
                    ? "Formatos permitidos: JPG y PNG."
                    : coverMode === "ai"
                      ? "La portada generada se aplica al crear el viaje."
                      : primaryDestination?.imageUrl
                        ? `Usamos la foto de ${primaryDestination.name}.`
                        : "Si no elegís una imagen, usamos una portada predeterminada."}
                </Text>

                {coverError ? (
                  <View style={styles.errorRow}>
                    <FontAwesome6 name="circle-exclamation" size={12} color={COLOR_DANGER} />
                    <Text style={styles.fieldError}>{coverError}</Text>
                  </View>
                ) : null}

                {/* Siempre montado (solo oculto) para no perder lo que el usuario ya escribió o generó */}
                <View style={!showAiGenerator && styles.hidden}>
                  <AICoverGenerator
                    generate={handleGenerateAiCover}
                    onAccept={handleAcceptAiCover}
                  />
                </View>
              </View>
            </View>
          )}

          {/* PASO 3: PARTICIPANTES Y CONFIRMACIÓN */}
          {step === 3 && (
            <>
              <View style={styles.card}>
                <CardHeader
                  icon="user-plus"
                  title="Invitar participantes (Opcional)"
                  subtitle="Buscá por nombre, usuario o correo. Si no tiene cuenta, escribí su correo para invitarlo."
                />

                <ParticipantSearch
                  canInviteExternal={canInviteExternal}
                  message={inviteMessage}
                  onInviteExternal={addExternalInvite}
                  onSearchChange={handleParticipantSearchChange}
                  onSelectUser={addParticipant}
                  search={participantSearch}
                  suggestions={selectableUsers}
                />

                <ParticipantList onRemove={removeParticipant} participants={participantItems} />

                <View style={styles.ownerCard}>
                  <View style={styles.ownerAvatar}>
                    <Text style={styles.ownerAvatarText}>{getInitials(currentUser?.nombreCompleto)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.ownerLabel}>Administrador del viaje</Text>
                    {currentUser ? (
                      <>
                        <Text style={styles.ownerName}>{currentUser.nombreCompleto}</Text>
                        <Text style={styles.ownerMeta}>@{currentUser.nombreUsuario} · {currentUser.email}</Text>
                      </>
                    ) : (
                      <Text style={styles.ownerMeta}>Cargando usuario...</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Resumen final: el usuario revisa todo antes de crear el viaje */}
              <View style={[styles.card, styles.summaryCard]}>
                <Text style={styles.summaryTitle}>Resumen del viaje</Text>
                <SummaryItem icon="suitcase-rolling" label="Viaje" value={form.title} />
                <SummaryItem
                  icon="calendar-days"
                  label="Fechas"
                  value={`${formatDateDisplay(form.startDate)} al ${formatDateDisplay(form.endDate)}${
                    tripDuration ? ` (${tripDuration})` : ""
                  }`}
                />
                <SummaryItem
                  icon="location-dot"
                  label={form.destinations.length > 1 ? "Destinos" : "Destino"}
                  value={form.destinations.map((d) => d.name).join(", ")}
                />
                <SummaryItem icon="coins" label="Moneda" value={form.currency} />
              </View>
            </>
          )}
        </ScrollView>

        {/* Mensaje de resultado visible junto a los botones */}
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

        {/* Barra de acciones: no se muestra mientras el teclado está abierto */}
        {!tecladoVisible && (
          <View style={styles.actionBar}>
            <PrimaryButton
              label={step === 1 ? "Cancelar" : "Anterior"}
              onPress={handleBack}
              variant="secondary"
              disabled={submitting}
              style={styles.actionSecondary}
            />
            {step < 3 ? (
              <PrimaryButton label="Siguiente" onPress={handleNext} style={styles.actionPrimary} />
            ) : (
              <PrimaryButton
                disabled={!currentUser}
                label={submitting ? "Creando..." : "Crear viaje"}
                loading={submitting}
                onPress={handleSubmit}
                style={styles.actionPrimary}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>

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

/* ───────────────────────── Estilos ───────────────────────── */

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxs,
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
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  stepItem: {
    width: 72,
    alignItems: "center",
    gap: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleOn: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  stepCircleText: {
    ...textStyles.meta,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
  },
  stepCircleTextOn: {
    color: colors.primary,
  },
  stepLabel: {
    ...textStyles.meta,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  stepLabelOn: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 13,
    marginHorizontal: -18,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  stepLineOn: {
    backgroundColor: "#FFFFFF",
  },

  /* Contenido */
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
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

  /* Campos de texto */
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
    color: colors.overlay,
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

  /* Fechas */
  dateField: {
    flex: 1,
    gap: spacing.xs,
  },
  dateTile: {
    position: "relative",
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
    overflow: "hidden",
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
    color: colors.overlay,
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

  /* Destinos (paso 2) */
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
    color: colors.overlay,
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

  /* Portada */
  coverPreview: {
    height: 200,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  coverPreviewImage: {
    borderRadius: radii.lg,
  },
  coverPreviewTop: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  coverBadge: {
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
  coverRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(19, 39, 80, 0.6)",
  },
  coverPreviewOverlay: {
    padding: spacing.md,
    backgroundColor: "rgba(19, 39, 80, 0.5)",
  },
  coverPreviewTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 22,
  },
  coverPreviewSubtitle: {
    ...textStyles.meta,
    color: "#edf2ff",
    marginTop: 2,
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
  coverPreviewEmptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  coverOptionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coverOption: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  coverOptionActive: {
    borderColor: colors.primary,
    backgroundColor: COLOR_SOFT,
  },
  coverOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  coverOptionIconActive: {
    backgroundColor: colors.primary,
  },
  coverOptionLabel: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  coverOptionLabelActive: {
    color: colors.primary,
  },
  coverOptionSub: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  hidden: {
    display: "none",
  },

  /* Administrador y resumen (paso 3) */
  ownerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  ownerAvatarText: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
  },
  ownerLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  ownerName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    marginTop: 2,
  },
  ownerMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryTitle: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  summaryLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...textStyles.body,
    color: colors.textPrimary,
  },

  /* Mensaje de resultado y barra de acciones */
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: spacing.lg,
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
  actionBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionPrimary: {
    flex: 2,
  },
  actionSecondary: {
    flex: 1,
  },

  /* Buscador de destinos (modal) */
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