import { useEffect, useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import ScreenContainer from "../components/layout/ScreenContainer";
import ParticipantList from "../components/trip/ParticipantList";
import ParticipantSearch from "../components/trip/ParticipantSearch";
import CurrencySelector from "../components/trip/CurrencySelector";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { createTrip, getCurrentUser, getUsers, getCurrencies, searchDestinations} from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

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

export default function CreateTripScreen({ navigation }) {
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

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!participantSearch.trim()) {
        setUserOptions([]);
        return;
      }

      try {
        const users = await getUsers(participantSearch, 8);
        setUserOptions(users);
      } catch {
        setUserOptions([]);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [participantSearch]);

  useEffect(() => {
    async function loadCurrencies() {
      try {
        const data = await getCurrencies();
        setCurrencies(data);
      } catch (error) {
        console.log("Error cargando monedas:", error);
        setCurrencies([]);
      }
    }

    loadCurrencies();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (!destinationSearch.trim()) {
        setDestinationOptions([]);
        return;
      }

      try {
        const results = await searchDestinations(destinationSearch);
        console.log("Resultados de búsqueda de destinos:", results);
        setDestinationOptions(results);
      } catch {
        setDestinationOptions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [destinationSearch]);

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

  function validateForm() {
    const localErrors = {};
    if (!form.title.trim()) localErrors.title = "El título del viaje no puede quedar vacío.";
    if (form.destinations.length === 0) localErrors.destinations = "Al menos un destino es requerido.";
    if (!form.startDate.trim()) localErrors.startDate = "La fecha de inicio es obligatoria.";
    if (!form.endDate.trim()) localErrors.endDate = "La fecha de finalización es obligatoria.";
    if (!form.currency.trim()) localErrors.currency = "La moneda es obligatoria.";

    if (form.startDate && form.endDate) {
      const start = new Date(`${form.startDate}T12:00:00`);
      const end = new Date(`${form.endDate}T12:00:00`);
      if (end < start) localErrors.endDate = "La fecha de regreso no puede ser anterior a la de inicio.";
    }

    setErrors(localErrors);
    return Object.keys(localErrors).length === 0;
  }

  function addDestination(dest) {
    const alreadyAdded = form.destinations.some(
      (d) => d.name === dest.name && d.country === dest.country 
    );

    if (alreadyAdded) return;

    setForm((current) => ({
      ...current,
      destinations: [...current.destinations, dest],
    }));

    setDestinationSearch("");
    setDestinationOptions([]);
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
      await createTrip({
        title: form.title,
        destinations: form.destinations,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        currency: form.currency,
        invitedEmails: form.invitedEmails,
        participantUserIds: form.participantUserIds.map(Number),
      });
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "height" : undefined} style={styles.flex}
      keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={styles.scrollContent}
         showsVerticalScrollIndicator={false}
         keyboardShouldPersistTaps="always"
         keyboardDismissMode="none">
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <View />
            </View>

            <Text style={styles.heroEyebrow}>Planificación colaborativa</Text>
            <Text style={styles.heroTitle}>Nuevo Viaje</Text>
            <Text style={styles.heroCopy}>Define destino, fechas y participantes en un solo flujo.</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.metricsRow}>
              <MetricCard label="Personas" value={Math.max(1, participantItems.length + 1)} />
              <MetricCard label="Destinos" value={form.destinations.length} />
              <MetricCard label="Fechas" value={form.startDate && form.endDate ? 2 : 0} />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Configuración</Text>
              <Text style={styles.sectionTitle}>Completa la información base del viaje</Text>
            </View>

            <View style={[styles.contentLayout, isDesktop && styles.contentLayoutDesktop]}>
              <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Información del viaje</Text>

                  <View style={[styles.row, isTablet && styles.rowTablet]}>
                    <Field
                      error={errors.title}
                      label="Título"
                      onChange={handleInputChange}
                      placeholder="Escapada a Córdoba"
                      value={form.title}
                      name="title"
                    />
                  </View>
                  
                  <Field
                    error={errors.description}
                    label="Descripción"
                    multiline
                    name="description"
                    onChange={handleInputChange}
                    placeholder="Notas del viaje, idea general o resumen para el grupo."
                    value={form.description}
                  />

                  <View style={[styles.field, styles.destinationSection]}>
                    <Text style={styles.fieldLabel}>Agregar destino</Text>

                    <TextInput
                      value={destinationSearch}
                      onChangeText={setDestinationSearch}
                      placeholder="Ej: Córdoba, Bariloche, Chile..."
                      style={styles.input}
                    />

                    {destinationOptions.length > 0 && (
                      <View style={styles.destinationResults}>
                        <ScrollView
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                        >
                          {destinationOptions.map((item, index) => (
                            <Pressable
                              key={`${item.name}-${item.country}-${index}`}
                              onPress={() => addDestination(item)}
                              style={styles.destinationItem}
                            >
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <FontAwesome6
                                  name="location-dot"
                                  size={15}
                                  color={colors.primary}
                                />

                                <View style={{ marginLeft: 10 }}>
                                  <Text style={styles.destinationName}>
                                    {item.name}
                                  </Text>

                                  <Text style={styles.destinationCountry}>
                                    {item.country}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={styles.selectedDestinationsContainer}>
                    <Text style={styles.fieldLabel}>Destinos seleccionados ({form.destinations.length})</Text>

                    <ScrollView
                      style={styles.selectedDestinationsScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={true}
                    >
                      {form.destinations.map((d, index) => (
                        <View 
                          key={`${d.name}-${d.country}-${index}`} 
                          style={styles.destinationCurrencyRow}
                        >

                          <View style={{ flex: 1 }}>
                            <Text style={styles.destinationChipText}>
                              {d.name}
                            </Text>

                            <Text style={styles.destinationCountry}>
                              {d.country}
                            </Text>
                          </View>

                          <Pressable
                            onPress={() => {
                              setForm((current) => ({
                                ...current,
                                destinations: current.destinations.filter(
                                  (item) =>
                                    !(item.name === d.name && item.country === d.country)
                                ),
                              }));
                            }}
                            hitSlop={15}
                          >
                            <FontAwesome6 
                              name="xmark" 
                              size={14} 
                              color={colors.danger || "#FF3B30"} 
                            />
                          </Pressable>

                        </View>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={[styles.row, isTablet && styles.rowTablet]}>
                    <DateField
                      error={errors.startDate}
                      label="Fecha ida"
                      onChange={handleInputChange}
                      onOpenPicker={() => setShowStartPicker(true)}
                      pickerVisible={showStartPicker}
                      pickerValue={form.startDate}
                      fieldName="startDate"
                      setPickerVisible={setShowStartPicker}
                    />
                    <DateField
                      error={errors.endDate}
                      label="Fecha vuelta"
                      onChange={handleInputChange}
                      onOpenPicker={() => setShowEndPicker(true)}
                      pickerVisible={showEndPicker}
                      pickerValue={form.endDate}
                      fieldName="endDate"
                      setPickerVisible={setShowEndPicker}
                      minDate={form.startDate ? new Date(`${form.startDate}T12:00:00`) : new Date()}
                    />
                  </View>

                  <CurrencySelector
                    currencies={currencies}
                    selectedCurrency={form.currency}
                    onSelectCurrency={(code) => handleInputChange("currency", code)}
                    error={errors.currency}
                  />

                  <View style={styles.ownerCard}>
                    <Text style={styles.ownerLabel}>Administrador</Text>
                    {currentUser ? (
                      <>
                        <Text style={styles.ownerName}>{currentUser.nombreCompleto}</Text>
                        <Text style={styles.ownerMeta}>@{currentUser.nombreUsuario} · {currentUser.email}</Text>
                      </>
                    ) : (
                      <Text style={styles.ownerMeta}>No se pudo resolver el usuario actual.</Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
                <View style={styles.card}>
                  <ParticipantSearch
                    canInviteExternal={canInviteExternal}
                    message={inviteMessage}
                    onInviteExternal={addExternalInvite}
                    onSearchChange={handleParticipantSearchChange}
                    onSelectUser={addParticipant}
                    search={participantSearch}
                    suggestions={selectableUsers}
                  />
                </View>

                <View style={styles.card}>
                  <ParticipantList onRemove={removeParticipant} participants={participantItems} />
                </View>
              </View>
            </View>

            {submitMessage ? (
              <Text style={[styles.submitMessage, submitStatus === "error" ? styles.submitError : styles.submitSuccess]}>
                {submitMessage}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                disabled={!currentUser}
                label={submitStatus === "submitting" ? "Creando..." : "Crear viaje"}
                loading={submitStatus === "submitting"}
                onPress={handleSubmit}
                style={styles.actionPrimary}
              />
              <PrimaryButton label="Cancelar" onPress={() => navigation.goBack()} variant="secondary" style={styles.actionSecondary} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({ label, name, onChange, value, placeholder, multiline = false, error = null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
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
}

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
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel]}>
        {label}
      </Text>
      {Platform.OS === "web" ? (
        <View style={[styles.input, error && styles.inputError, { justifyContent: 'center', paddingVertical: 0 }]}>
          <input
            type="date"
            min={minDate ? minDate.toISOString().split("T")[0] : undefined}
            value={pickerValue || ""}
            onChange={(e) => onChange(fieldName, e.target.value)}
            style={{ 
              border: 'none', 
              width: '100%', 
              outline: 'none',
              backgroundColor: 'transparent',
              fontFamily: 'inherit',
              fontSize: '16px',
              color: 'inherit',
              cursor: 'pointer'
            }}
          />
        </View>
      ) : (
        <>
          <Pressable 
          onPress={onOpenPicker} 
          style={[styles.dateButton, error && styles.inputError]}
          >
            <Text style={[styles.dateButtonText, !pickerValue && styles.datePlaceholder]}>
              {pickerValue || "Seleccionar fecha"}
            </Text>
            <FontAwesome6 color={colors.textPrimary} name="calendar" size={14} />
          </Pressable>
          
          {pickerVisible && (
            <DateTimePicker
              mode="date"
              minimumDate={minDate}
              value={pickerValue ? new Date(`${pickerValue}T12:00:00`) : (minDate || new Date())}
              onChange={(event, selectedDate) => {
                setPickerVisible(false);
                if (selectedDate) {
                  const year = selectedDate.getFullYear();
                  const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
                  const day = String(selectedDate.getDate()).padStart(2, "0");
                  onChange(fieldName, `${year}-${month}-${day}`);
                }
              }}
            />
          )}
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
    paddingBottom: 140,
  },
  hero: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: "#8b6c37",
    fontSize: 13,
  },
  sectionTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
    marginTop: spacing.xs,
  },
  contentLayout: {
    gap: spacing.lg,
  },
  contentLayoutDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  mainColumn: {
    gap: spacing.lg,
  },
  mainColumnDesktop: {
    flex: 1.1,
  },
  sideColumn: {
    gap: spacing.lg,
  },
  sideColumnDesktop: {
    flex: 0.9,
  },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  row: {
    gap: spacing.md,
  },
  rowTablet: {
    flexDirection: "row",
  },
  field: {
    flex: 1,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs,
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
    minHeight: 110,
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
  dateButtonText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    color: colors.textMuted,
  },
  currencySection: {
    marginTop: spacing.xs,
  },
  currencyRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  currencyChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  currencyChipText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  currencyChipTextSelected: {
    color: colors.textInverse,
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
    marginTop: spacing.lg,
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
    marginTop: spacing.xl,
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    flex: 1,
  },
  destinationResults: {
  maxHeight: 220,
  marginTop: 8,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radii.md,
  backgroundColor: colors.surface,
},
destinationItem: {
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderBottomWidth: 1,
  borderBottomColor: "#ECECEC",
},
destinationName: {
  ...textStyles.bodyStrong,
  color: colors.textPrimary,
},
destinationCountry: {
  ...textStyles.meta,
  color: colors.textSecondary,
  marginTop: 2,
},
selectedDestinationsScroll:{
  maxHeight: 170,
  marginTop: spacing.sm,
},
destinationCurrencyRow:{
  flexDirection:"row",
  alignItems:"center",
  borderWidth:1,
  borderColor:colors.border,
  borderRadius:radii.md,
  backgroundColor:colors.surface,
  paddingHorizontal:spacing.md,
  paddingVertical:spacing.sm,
  marginBottom:spacing.sm,
},
destinationChipText: {
  ...textStyles.bodyStrong,
  fontSize: 14,
  color: colors.primary,
},
toggleButton: {
  marginTop: 4,
  paddingVertical: 4,
},
showMoreText: {
  ...textStyles.bodyStrong,
  color: colors.primary,
  fontSize: 13,
},
destinationSection: {
  marginTop: spacing.lg,
},
});
