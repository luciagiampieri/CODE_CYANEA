import { useEffect, useMemo, useState, useRef, forwardRef } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";

import { LocaleConfig } from "react-native-calendars";
import DatePickerModal from "../components/ui/DatePickerModal";
import {toYMD, parseYMD, getTodayIso, formatDateDisplay} from "../utils/dates";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantList from "../components/trip/ParticipantList";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import CurrencySelector from "../components/trip/CurrencySelector";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import AICoverGenerator from "../components/trip/AICoverGenerator";
import useResponsive from "../hooks/useResponsive";
import { createTrip, getCurrentUser, getUsers, getCurrencies, searchDestinations, resolveDestination, uploadTripCover, generateCoverPreviewAI, acceptTripCoverAI} from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";
import * as ImagePicker from "expo-image-picker";

const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Configuración del calendario en Español (react-native-calendars)
LocaleConfig.locales['es'] = {
  monthNames: MONTH_NAMES_ES,
  monthNamesShort: ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'],
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  dayNamesShort: ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'],
  today: 'Hoy'
};
LocaleConfig.defaultLocale = 'es';

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

function isValidEmail(email) {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function getEmailLabel(email) {
  return email.split("@")[0].replace(/[._-]+/g, " ");
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
}) {
  const showEmptyState = search.trim().length < 2 && selectedDestinations.length === 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <ScreenContainer fullWidth padded={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.pickerBackButton}>
              <FontAwesome6 name="chevron-left" size={16} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Agregar destino</Text>
            <View style={styles.pickerHeaderRight}>
              {selectedDestinations.length > 0 ? (
                <View style={styles.pickerCountBadge}>
                  <Text style={styles.pickerCountBadgeText}>{selectedDestinations.length}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Tocar cualquier zona vacía cierra el teclado, igual que en el resto de la pantalla */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.flex}>
              <View style={styles.pickerSearchBox}>
                <FontAwesome6 name="magnifying-glass" size={14} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={onSearchChange}
                  placeholder="Buscar ciudad o país..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.pickerSearchInput}
                  autoFocus
                  returnKeyType="search"
                />
                {resolving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : search.length > 0 ? (
                  <Pressable onPress={() => onSearchChange("")} hitSlop={10}>
                    <FontAwesome6 name="circle-xmark" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {selectedDestinations.length > 0 && (
                <View style={styles.pickerSelectedSection}>
                  <Text style={styles.pickerSelectedLabel}>
                    Destinos seleccionados ({selectedDestinations.length})
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.pickerChipsRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {selectedDestinations.map((d, index) => (
                      <View key={`${d.name}-${d.country}-${index}`} style={styles.pickerChip}>
                        <FontAwesome6 name="location-dot" size={11} color={colors.primary} />
                        <Text style={styles.pickerChipText} numberOfLines={1}>{d.name}</Text>
                        <Pressable onPress={() => onRemoveSelected(d)} hitSlop={10}>
                          <FontAwesome6 name="xmark" size={11} color={colors.primary} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.pickerListContainer}>
                {showEmptyState ? (
                  <View style={styles.pickerEmptyState}>
                    <View style={styles.pickerEmptyIconCircle}>
                      <FontAwesome6 name="earth-americas" size={22} color={colors.primary} />
                    </View>
                    <Text style={styles.pickerEmptyTitle}>Buscá tu próximo destino</Text>
                    <Text style={styles.pickerEmptyText}>
                      Escribí al menos 2 letras del nombre de una ciudad o país.
                    </Text>
                  </View>
                ) : search.trim().length < 2 ? (
                  <View style={styles.pickerStatusRow}>
                    <Text style={styles.destinationStatusText}>Escribí al menos 2 letras para buscar.</Text>
                  </View>
                ) : searching ? (
                  <View style={styles.pickerStatusRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.destinationStatusText}>Buscando destinos...</Text>
                  </View>
                ) : options.length > 0 ? (
                  <FlatList
                    data={options}
                    keyExtractor={(item, index) => `${item.name}-${item.country}-${index}`}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.pickerListContent}
                    renderItem={({ item }) => {
                      const isSelected = selectedDestinations.some(
                        (d) =>
                          (item.placeId && d.placeId === item.placeId) ||
                          (d.name === item.name && d.country === item.country)
                      );
                      return (
                        <TouchableOpacity
                          onPress={() => onSelect(item)}
                          style={[styles.destinationItem, isSelected && styles.destinationItemActive]}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <View style={[styles.destinationIconCircle, isSelected && styles.destinationIconCircleActive]}>
                              <FontAwesome6
                                name="location-dot"
                                size={14}
                                color={isSelected ? colors.textInverse : colors.primary}
                              />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Text
                                style={[styles.destinationName, isSelected && styles.destinationNameActive]}
                                numberOfLines={1}
                              >
                                {item.name}
                              </Text>
                              <Text style={styles.destinationCountry} numberOfLines={1}>{item.country}</Text>
                            </View>
                          </View>
                          <FontAwesome6
                            name={isSelected ? "check" : "plus"}
                            size={14}
                            color={isSelected ? colors.primary : colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    }}
                  />
                ) : hasSearched ? (
                  <View style={styles.pickerEmptyState}>
                    <View style={styles.pickerEmptyIconCircle}>
                      <FontAwesome6 name="magnifying-glass" size={20} color={colors.textMuted} />
                    </View>
                    <Text style={styles.pickerEmptyTitle}>Sin resultados</Text>
                    <Text style={styles.pickerEmptyText}>
                      No encontramos destinos para "{search.trim()}"
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </TouchableWithoutFeedback>

          <View style={styles.pickerFooter}>
            <PrimaryButton
              label={selectedDestinations.length > 0 ? "Listo" : "Cerrar"}
              onPress={onClose}
            />
          </View>
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
  const { isTablet, isDesktop } = useResponsive();
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

  // Refs de los TextInput de texto libre. Se usan para sacarles el foco
  // explícitamente antes de abrir cualquier modal/picker, así el teclado
  // no se queda abierto "fantasma" cuando el modal se cierra (fix #2).
  const titleInputRef = useRef(null);
  const descriptionInputRef = useRef(null);

  function dismissAllInputs() {
    Keyboard.dismiss();
    titleInputRef.current?.blur();
    descriptionInputRef.current?.blur();
  }

  const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png"];

  function getExtensionFromAsset(asset) {
    const fromFileName = asset.fileName?.split(".").pop();
    if (fromFileName) return fromFileName.toLowerCase();
    const fromUri = asset.uri?.split(".").pop();
    return fromUri ? fromUri.toLowerCase().split("?")[0] : "";
  }

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
    setAiCover(null); // una sola portada personalizada: la de galería reemplaza a la de IA
  }

  function handleRemoveCoverImage() {
    setCoverImage(null);
    setCoverError("");
  }

  // US 57: en la creación el viaje todavía no existe, así que la imagen aceptada se
  // guarda en memoria y se asigna como portada apenas se crea el viaje.
  function handleGenerateAiCover(prompt) {
    return generateCoverPreviewAI({
      title: form.title,
      destinations: form.destinations.map((d) => (d.country ? `${d.name}, ${d.country}` : d.name)),
      prompt,
    });
  }

  async function handleAcceptAiCover(preview) {
    setAiCover(preview);
    setCoverImage(null); // la de IA reemplaza a una imagen de galería elegida antes
    setCoverError("");
    return "Portada generada seleccionada. Se aplicará al crear el viaje.";
  }

  function handleRemoveAiCover() {
    setAiCover(null);
  }

  function makeSessionToken() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  function handleInputChange(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) {
      setErrors((current) => ({ ...current, [name]: null }));
    }
  }

  // Cambio de fechas de ida / vuelta. Si la fecha de ida pasa a ser posterior
  // a la de vuelta ya elegida, se limpia la de vuelta para no dejar un rango inválido.
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
    try {
      const full = await resolveDestination(suggestion.placeId, sessionTokenRef.current);
      setForm((current) => ({
        ...current,
        destinations: [...current.destinations, full],
      }));
      if (errors.destinations) {
        setErrors((current) => ({ ...current, destinations: null }));
      }
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
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  }

  async function handleSubmit() {
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

  return (
    <ScreenContainer fullWidth padded={false}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
          keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header / Banner Azul Superior */}
            <View style={styles.hero}>
              <View style={styles.heroTopRow}>
                <IconCircleButton icon="arrow-left" onPress={handleBack} tone="light" />
              </View>
              <Text style={styles.heroTitle}>Nuevo Viaje</Text>
              <Text style={styles.heroCopy}>Paso {step} de 3</Text>

              {/* Indicador de pasos (Stepper Visual) */}
              <View style={styles.stepperDots}>
                <View style={[styles.dot, step >= 1 && styles.dotActive]} />
                <View style={[styles.dot, step >= 2 && styles.dotActive]} />
                <View style={[styles.dot, step >= 3 && styles.dotActive]} />
              </View>
            </View>

            <View style={styles.body}>
              {/* PASO 1: DATOS BÁSICOS Y FECHAS */}
              {step === 1 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Información Básica</Text>

                  <Field
                    ref={titleInputRef}
                    error={errors.title}
                    label="Título del viaje *"
                    name="title"
                    onChange={handleInputChange}
                    placeholder="Ej: Escapada a Bariloche"
                    value={form.title}
                  />

                  <Field
                    ref={descriptionInputRef}
                    error={errors.description}
                    label="Descripción"
                    multiline
                    name="description"
                    onChange={handleInputChange}
                    placeholder="Notas, idea general o resumen para los participantes..."
                    value={form.description}
                  />

                  <View style={[styles.row, isTablet && styles.rowTablet]}>
                    {/* Fecha de ida: desde hoy (inclusive) en adelante */}
                    <DateField
                      error={errors.startDate}
                      label="Fecha de ida *"
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
                      label="Fecha de vuelta *"
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

                  <CurrencySelector
                    currencies={currencies}
                    selectedCurrency={form.currency}
                    onSelectCurrency={(code) => handleInputChange("currency", code)}
                    error={errors.currency}
                    onOpen={dismissAllInputs}
                  />
                </View>
              )}

              {/* PASO 2: DESTINOS Y PORTADA */}
              {step === 2 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Destinos y Portada</Text>

                  <View style={[styles.field, styles.destinationSection]}>
                    <Text style={styles.fieldLabel}>Destino *</Text>

                    <TouchableOpacity
                      style={[styles.dropdownButton, errors.destinations && styles.inputError]}
                      onPress={() => {
                        dismissAllInputs();
                        setShowDestinationPicker(true);
                      }}
                    >
                      <View style={styles.dropdownLeftContent}>
                        <FontAwesome6
                          name="location-dot"
                          size={14}
                          color={form.destinations.length ? colors.primary : colors.textMuted}
                          style={{ marginRight: 10 }}
                        />
                        <Text
                          style={form.destinations.length ? styles.dropdownText : styles.dropdownPlaceholder}
                          numberOfLines={1}
                        >
                          {form.destinations.length
                            ? `${form.destinations.length} destino${form.destinations.length > 1 ? "s" : ""} seleccionado${form.destinations.length > 1 ? "s" : ""}`
                            : "Buscar ciudad o país..."}
                        </Text>
                      </View>
                      <FontAwesome6 name="chevron-right" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                    {errors.destinations ? <Text style={styles.fieldError}>{errors.destinations}</Text> : null}
                  </View>

                  {form.destinations.length > 0 && (
                    <View style={styles.selectedDestinationsContainer}>
                      <Text style={styles.fieldLabel}>Destinos seleccionados ({form.destinations.length})</Text>

                      <ScrollView style={styles.selectedDestinationsScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {form.destinations.map((d, index) => (
                          <View key={`${d.name}-${d.country}-${index}`} style={styles.destinationCurrencyRow}>
                            <View style={styles.destinationRowIconCircle}>
                              <FontAwesome6 name="location-dot" size={14} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <Text style={styles.destinationChipText} numberOfLines={1}>{d.name}</Text>
                              <Text style={styles.destinationCountry} numberOfLines={1}>{d.country}</Text>
                            </View>

                            <Pressable
                              onPress={() => removeDestination(d)}
                              hitSlop={15}
                              style={styles.destinationRemoveButton}
                            >
                              <FontAwesome6 name="xmark" size={12} color={colors.danger || "#FF3B30"} />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* PORTADA DEL VIAJE */}
                  <View style={styles.coverPreviewSection}>
                    <Text style={styles.fieldLabel}>Portada del viaje</Text>

                    {coverImage ? (
                      <ImageBackground source={{ uri: coverImage.uri }} imageStyle={styles.coverPreviewImage} style={styles.coverPreview}>
                        <View style={styles.coverPreviewOverlay}>
                          <Text style={styles.coverPreviewBadge}>Imagen personalizada</Text>
                        </View>
                      </ImageBackground>
                    ) : aiCover ? (
                      <ImageBackground
                        source={{ uri: `data:${aiCover.mimeType};base64,${aiCover.imageBase64}` }}
                        imageStyle={styles.coverPreviewImage}
                        style={styles.coverPreview}
                      >
                        <View style={styles.coverPreviewOverlay}>
                          <Text style={styles.coverPreviewBadge}>Portada generada con IA</Text>
                        </View>
                      </ImageBackground>
                    ) : primaryDestination?.imageUrl ? (
                      <ImageBackground source={{ uri: primaryDestination.imageUrl }} imageStyle={styles.coverPreviewImage} style={styles.coverPreview}>
                        <View style={styles.coverPreviewOverlay}>
                          <Text style={styles.coverPreviewBadge}>Primer destino</Text>
                          <Text style={styles.coverPreviewTitle}>{primaryDestination.name}</Text>
                          <Text style={styles.coverPreviewSubtitle}>{primaryDestination.country}</Text>
                        </View>
                      </ImageBackground>
                    ) : (
                      <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                        <FontAwesome6 name="image" size={20} color={colors.textMuted} />
                        <Text style={styles.coverPreviewEmptyText}>Se usará una portada predeterminada</Text>
                      </View>
                    )}

                    <View style={styles.coverActionsRow}>
                      <Pressable onPress={handlePickCoverImage} style={styles.coverActionButton}>
                        <FontAwesome6 name="image" size={13} color={colors.primary} />
                        <Text style={styles.coverActionText}>{coverImage ? "Cambiar imagen" : "Elegir de la galería"}</Text>
                      </Pressable>

                      {coverImage ? (
                        <Pressable onPress={handleRemoveCoverImage} style={styles.coverActionButtonSecondary}>
                          <Text style={styles.coverActionTextSecondary}>Cancelar selección</Text>
                        </Pressable>
                      ) : null}

                      {aiCover ? (
                        <Pressable onPress={handleRemoveAiCover} style={styles.coverActionButtonSecondary}>
                          <Text style={styles.coverActionTextSecondary}>Quitar imagen de IA</Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {coverError ? <Text style={styles.fieldError}>{coverError}</Text> : null}

                    <AICoverGenerator
                      generate={handleGenerateAiCover}
                      onAccept={handleAcceptAiCover}
                    />
                  </View>
                </View>
              )}

              {/* PASO 3: PARTICIPANTES Y CONFIRMACIÓN */}
              {step === 3 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Invitar participantes (Opcional)</Text>

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
              )}

              {submitMessage ? (
                <Text style={[styles.submitMessage, submitStatus === "error" ? styles.submitError : styles.submitSuccess]}>
                  {submitMessage}
                </Text>
              ) : null}

              {/* BOTONES DE NAVEGACIÓN ENTRE PASOS */}
              <View style={styles.actions}>
                {step < 3 ? (
                  <PrimaryButton label="Siguiente" onPress={handleNext} style={styles.actionPrimary} />
                ) : (
                  <PrimaryButton
                    disabled={!currentUser}
                    label={submitStatus === "submitting" ? "Creando..." : "Crear viaje"}
                    loading={submitStatus === "submitting"}
                    onPress={handleSubmit}
                    style={styles.actionPrimary}
                  />
                )}

                <PrimaryButton
                  label={step === 1 ? "Cancelar" : "Anterior"}
                  onPress={handleBack}
                  variant="secondary"
                  style={styles.actionSecondary}
                />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>

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
      />
    </ScreenContainer>
  );
}

const Field = forwardRef(function Field(
  { label, name, onChange, value, placeholder, multiline = false, error = null },
  ref
) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={ref}
        multiline={multiline}
        onChangeText={(text) => onChange(name, text)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.inputMultiline, error && styles.inputError]}
        value={value}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
});

function DateField({
  label,
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
  const cleanLabel = label.replace(/\s*\*$/, "");

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {Platform.OS === "web" ? (
        <View
          style={[
            styles.input,
            error && styles.inputError,
            disabled && styles.dateButtonDisabled,
            { justifyContent: "center", paddingVertical: 0 },
          ]}
        >
          <input
            type="date"
            disabled={disabled}
            min={minYMD ?? undefined}
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
            }}
          />
        </View>
      ) : (
        <>
          <Pressable
            onPress={onOpenPicker}
            style={[styles.dateButton, error && styles.inputError, disabled && styles.dateButtonDisabled]}
          >
            <Text style={[styles.dateButtonText, !pickerValue && styles.datePlaceholder]}>
              {pickerValue
                ? formatDateDisplay(pickerValue)
                : disabled && disabledText
                  ? disabledText
                  : "Seleccionar fecha"}
            </Text>
            <FontAwesome6 color={disabled ? colors.textMuted : colors.textPrimary} name="calendar" size={14} />
          </Pressable>

          <DatePickerModal
            visible={pickerVisible}
            onClose={() => setPickerVisible(false)}
            title={cleanLabel}
            value={pickerValue}
            onChange={(ymd) => onChange(fieldName, ymd)}
            minDate={minDate}
          />
        </>
      )}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
  },
  heroBackLabel: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
    fontSize: 13,
  },
  heroTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 24,
    marginTop: 2,
    textAlign: "center",
  },
  heroCopy: {
    ...textStyles.body,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    textAlign: "center",
    fontSize: 12,
  },
  stepperDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.xxs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    backgroundColor: "#FFFFFF",
    width: 16,
  },
  body: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  row: {
    gap: spacing.md,
  },
  rowTablet: {
    flexDirection: "row",
  },
  field: {
    flex: 1,
    gap: spacing.xs,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: 0,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    color: colors.textPrimary,
    ...textStyles.body,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  dateButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
  },
  dateButtonDisabled: {
    opacity: 0.55,
    backgroundColor: colors.surfaceMuted,
  },
  dateButtonText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    color: colors.textMuted,
  },
  dropdownButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dropdownPlaceholder: {
    ...textStyles.body,
    color: colors.textMuted,
  },
  dropdownText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  ownerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  ownerLabel: {
    ...textStyles.label,
    color: colors.textSecondary,
  },
  ownerName: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  ownerMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  submitMessage: {
    ...textStyles.bodyStrong,
    marginTop: spacing.md,
  },
  submitError: {
    color: colors.danger,
  },
  submitSuccess: {
    color: colors.success,
  },
  actions: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    flex: 1,
  },
  destinationItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  destinationItemActive: {
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#f0f4f8",
    borderRadius: radii.sm || 8,
  },
  destinationIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff",
  },
  destinationIconCircleActive: {
    backgroundColor: colors.primary,
  },
  destinationName: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  destinationNameActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  destinationCountry: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  selectedDestinationsContainer: {
    gap: spacing.xs,
  },
  selectedDestinationsScroll: {
    maxHeight: 190,
  },
  destinationCurrencyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  destinationRowIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff",
  },
  destinationRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger ? `${colors.danger}14` : "rgba(255,59,48,0.08)",
    marginLeft: spacing.xs,
  },
  destinationChipText: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  destinationSection: {
    gap: spacing.xs,
  },
  coverPreviewSection: {
    gap: spacing.xs,
  },
  coverPreview: {
    minHeight: 160,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  coverPreviewImage: {
    borderRadius: radii.lg,
  },
  coverPreviewOverlay: {
    padding: spacing.md,
    backgroundColor: "rgba(19, 39, 80, 0.42)",
  },
  coverPreviewBadge: {
    ...textStyles.label,
    color: colors.accent,
    marginBottom: spacing.xxs,
  },
  coverPreviewTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 22,
  },
  coverPreviewSubtitle: {
    ...textStyles.body,
    color: "#edf2ff",
    marginTop: 2,
  },
  destinationStatusText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  coverPreviewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  coverPreviewEmptyText: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  coverActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
  },
  coverActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  coverActionText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  coverActionButtonSecondary: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: "center",
  },
  coverActionTextSecondary: {
    ...textStyles.bodyStrong,
    color: colors.danger || "#FF3B30",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 70,
  },
  pickerBackText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "600",
  },
  pickerTitle: {
    ...textStyles.bodyStrong,
    fontSize: 17,
    color: colors.primary,
  },
  pickerHeaderRight: {
    width: 70,
    alignItems: "flex-end",
  },
  pickerCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerCountBadgeText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 12,
  },
  pickerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  pickerSearchInput: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
  },
  pickerSelectedSection: {
    marginBottom: spacing.sm,
  },
  pickerSelectedLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  pickerChipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  pickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  pickerChipText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "600",
  },
  pickerListContainer: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  pickerListContent: {
    paddingHorizontal: spacing.xs,
  },
  pickerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
  },
  pickerEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  pickerEmptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}33` : "#eef2ff",
    marginBottom: spacing.xs,
  },
  pickerEmptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  pickerEmptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  pickerFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});