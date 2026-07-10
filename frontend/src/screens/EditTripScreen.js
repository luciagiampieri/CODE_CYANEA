import { useEffect, useState } from "react";
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
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { getTripDetail, updateTrip, searchDestinations } from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

function isSameDestination(a, b) {
    return a.name === b.name && a.country === b.country;
}

function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function computeTripDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}


export default function EditTripScreen({ navigation, route }) {
    const { tripId } = route.params;
    const { isTablet } = useResponsive();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [form, setForm] = useState({
        title: "",
        description: "",
        startDate: "",
        endDate: "",
        destinations: [],
    });
    const [originalStartDate, setOriginalStartDate] = useState("");
    const [errors, setErrors] = useState({});
    const [submitStatus, setSubmitStatus] = useState("idle");
    const [submitMessage, setSubmitMessage] = useState("");
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [destinationSearch, setDestinationSearch] = useState("");
    const [destinationOptions, setDestinationOptions] = useState([]);

    const tripAlreadyStarted = originalStartDate ? originalStartDate <= todayISO() : false;

    useEffect(() => {
        async function loadTrip() {
            try {
                const trip = await getTripDetail(tripId);
                setForm({
                    title: trip.title ?? "",
                    description: trip.description ?? "",
                    startDate: trip.startDate ?? "",
                    endDate: trip.endDate ?? "",
                    destinations: trip.destinations ?? [],
                });
                setOriginalStartDate(trip.startDate ?? "");
            } catch (error) {
                setLoadError(error.message || "No se pudo cargar la información del viaje.");
            } finally {
                setLoading(false);
            }
        }
        loadTrip();
    }, [tripId]);

    useEffect(() => {
        const timeout = setTimeout(async () => {
            if (!destinationSearch.trim()) {
                setDestinationOptions([]);
                return;
            }
            try {
                const results = await searchDestinations(destinationSearch);
                setDestinationOptions(results);
            } catch {
                setDestinationOptions([]);
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [destinationSearch]);

    function handleInputChange(name, value) {
        setForm((current) => ({ ...current, [name]: value }));
        if (errors[name]) {
            setErrors((current) => ({ ...current, [name]: null }));
        }
    }

    function addDestination(dest) {
        setForm((current) => {
            if (current.destinations.some((d) => isSameDestination(d, dest))) return current;
            return { ...current, destinations: [...current.destinations, dest] };
        });
        setDestinationSearch("");
        setDestinationOptions([]);
        if (errors.destinations) {
            setErrors((current) => ({ ...current, destinations: null }));
        }
    }

    function removeDestination(dest) {
        setForm((current) => ({
            ...current,
            destinations: current.destinations.filter((d) => !isSameDestination(d, dest)),
        }));
    }

    function validateForm() {
        const localErrors = {};
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        if (!form.title.trim()) {
            localErrors.title = "El título del viaje no puede quedar vacío.";
        }
        if (form.destinations.length === 0) {
            localErrors.destinations = "El viaje debe mantener al menos un destino asignado.";
        }
        if (!form.startDate) {
            localErrors.startDate = "La fecha de inicio es obligatoria.";
        }
        if (!form.endDate) {
            localErrors.endDate = "La fecha de finalización es obligatoria.";
        }

        if (!tripAlreadyStarted && form.startDate) {
            const start = new Date(`${form.startDate}T12:00:00`);
            if (start < hoy) {
                localErrors.startDate = "La fecha de inicio debe ser igual o posterior a la fecha actual.";
    }
        }

    if (form.startDate && form.endDate) {
        const start = new Date(`${form.startDate}T12:00:00`);
        const end = new Date(`${form.endDate}T12:00:00`);
        if (end < start) {
            localErrors.endDate = "La fecha de finalización no puede ser anterior a la de inicio.";
        }
    }

        setErrors(localErrors);
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
            title: form.title,
            description: form.description.trim() ? form.description.trim() : null,
            startDate: form.startDate,
            endDate: form.endDate,
            destinations: form.destinations.map(({ name, country, lat, lng }) => ({
            name,
            country,
            lat,
            lng,
            })),
        });
        setSubmitStatus("success");
        setSubmitMessage(response.message || "Los cambios se guardaron correctamente.");
        setTimeout(() => {
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

  return (
    <ScreenContainer fullWidth padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "height" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
        >
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
              <View />
            </View>

            <Text style={styles.heroEyebrow}>Planificación colaborativa</Text>
            <Text style={styles.heroTitle}>Editar Viaje</Text>
            <Text style={styles.heroCopy}>Modifica los detalles de tu viaje.</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.metricsRow}>
              <MetricCard label="Destinos" value={form.destinations.length} />
              <MetricCard
                label="Días de viaje"
                value={computeTripDays(form.startDate, form.endDate)}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Información del viaje</Text>

              <Field
                error={errors.title}
                label="Título"
                onChange={handleInputChange}
                placeholder="Escapada a Córdoba"
                value={form.title}
                name="title"
              />

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Descripción (opcional)</Text>
                <TextInput
                  onChangeText={(text) => handleInputChange("description", text)}
                  placeholder="Contanos de qué se trata este viaje..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textArea]}
                  value={form.description}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={[styles.field, styles.destinationSection]}>
                <Text style={styles.fieldLabel}>Agregar destino</Text>

                <TextInput
                    value={destinationSearch}
                    onChangeText={setDestinationSearch}
                    placeholder="Ej: Córdoba, Bariloche, Chile..."
                    placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                {destinationOptions.length > 0 && (
                  <View style={styles.destinationResults}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {destinationOptions.map((item, index) => (
                        <Pressable
                          key={`${item.name}-${item.country}-${index}`}
                          onPress={() => addDestination(item)}
                          style={styles.destinationItem}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <FontAwesome6 name="location-dot" size={15} color={colors.primary} />
                            <View style={{ marginLeft: 10 }}>
                              <Text style={styles.destinationName}>{item.name}</Text>
                              <Text style={styles.destinationCountry}>{item.country}</Text>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {errors.destinations ? (
                  <Text style={styles.fieldError}>{errors.destinations}</Text>
                ) : null}
              </View>

              <View style={styles.selectedDestinationsContainer}>
                <Text style={styles.fieldLabel}>
                  Destinos seleccionados ({form.destinations.length})
                </Text>

                <ScrollView
                  style={styles.selectedDestinationsScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  {form.destinations.map((d, index) => (
                    <View key={`${d.name}-${d.country}-${index}`} style={styles.destinationCurrencyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.destinationChipText}>{d.name}</Text>
                        <Text style={styles.destinationCountry}>{d.country}</Text>
                      </View>

                      <Pressable onPress={() => removeDestination(d)} hitSlop={15}>
                        <FontAwesome6 name="xmark" size={14} color={colors.danger || "#FF3B30"} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={[styles.row, isTablet && styles.rowTablet]}>
                {tripAlreadyStarted ? (
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Fecha ida</Text>
                    <View style={[styles.input, styles.inputDisabled]}>
                      <Text style={styles.dateButtonText}>{form.startDate}</Text>
                    </View>
                    <Text style={styles.fieldHint}>
                      El viaje ya comenzó, la fecha de ida no se puede modificar.
                    </Text>
                  </View>
                ) : (
                  <DateField
                    error={errors.startDate}
                    label="Fecha ida"
                    onChange={handleInputChange}
                    onOpenPicker={() => setShowStartPicker(true)}
                    pickerVisible={showStartPicker}
                    pickerValue={form.startDate}
                    fieldName="startDate"
                    setPickerVisible={setShowStartPicker}
                    minDate={new Date()}
                  />
                )}
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
            </View>

            {submitMessage ? (
              <Text
                style={[
                  styles.submitMessage,
                  submitStatus === "error" ? styles.submitError : styles.submitSuccess,
                ]}
              >
                {submitMessage}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label={submitStatus === "submitting" ? "Guardando..." : "Guardar cambios"}
                loading={submitStatus === "submitting"}
                onPress={handleSubmit}
                style={styles.actionPrimary}
              />
              <PrimaryButton
                label="Cancelar"
                onPress={() => navigation.goBack()}
                variant="secondary"
                style={styles.actionSecondary}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({ label, name, onChange, value, placeholder, error = null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        onChangeText={(text) => onChange(name, text)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error && styles.inputError]}
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
      <Text style={styles.fieldLabel}>{label}</Text>
      {Platform.OS === "web" ? (
        <View style={[styles.input, error && styles.inputError, { justifyContent: "center", paddingVertical: 0 }]}>
          <input
            type="date"
            min={minDate ? minDate.toISOString().split("T")[0] : undefined}
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
              cursor: "pointer",
            }}
          />
        </View>
      ) : (
        <>
          <Pressable onPress={onOpenPicker} style={[styles.dateButton, error && styles.inputError]}>
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
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  scrollContent: { paddingBottom: 140 },
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
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  row: { gap: spacing.md },
  rowTablet: { flexDirection: "row" },
  field: { flex: 1 },
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
  inputError: { borderColor: colors.danger },
  textArea: {
    minHeight: 90,
    paddingTop: 13,
    textAlignVertical: "top",
  },
  inputDisabled: {
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted || "#F2F2F2",
  },
  fieldHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
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
  datePlaceholder: { color: colors.textMuted },
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
  selectedDestinationsScroll: {
    maxHeight: 170,
    marginTop: spacing.sm,
  },
  destinationCurrencyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  destinationChipText: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.primary,
  },
  destinationSection: { marginTop: spacing.lg },
  submitMessage: {
    ...textStyles.bodyStrong,
    marginTop: spacing.lg,
  },
  submitError: { color: colors.danger },
  submitSuccess: { color: colors.success },
  actions: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionPrimary: { flex: 1 },
  actionSecondary: { flex: 1 },
});