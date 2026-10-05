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
    ImageBackground,
    Alert,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import MetricCard from "../components/ui/MetricCard";
import PrimaryButton from "../components/ui/PrimaryButton";
import AICoverGenerator from "../components/trip/AICoverGenerator";
import DatePickerModal from "../components/ui/DatePickerModal";
import useResponsive from "../hooks/useResponsive";
import { getTripDetail, updateTrip, searchDestinations, uploadTripCover, removeTripCover, generateTripCoverAI, acceptTripCoverAI } from "../services/api.js";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

import * as ImagePicker from "expo-image-picker";

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
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export default function EditTripScreen({ navigation, route }) {
    const { tripId } = route.params;
    const { isTablet } = useResponsive();

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    
    // Pestañas para evitar vista de lista larga
    const [activeTab, setActiveTab] = useState("info"); // "info" | "destinations" | "cover"

    // La moneda base no se edita: se conserva el valor original y se reenvía tal cual.
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

    const [destinationSearch, setDestinationSearch] = useState("");
    const [destinationOptions, setDestinationOptions] = useState([]);

    const tripAlreadyStarted = originalStartDate ? originalStartDate <= todayISO() : false;

    const [coverImage, setCoverImage] = useState(null);
    const [coverError, setCoverError] = useState("");
    const [removeCoverRequested, setRemoveCoverRequested] = useState(false);
    const [hasCustomCover, setHasCustomCover] = useState(false);
    const [currentCoverUrl, setCurrentCoverUrl] = useState(null);
    const [defaultCoverUrl, setDefaultCoverUrl] = useState(null);

    const ALLOWED_COVER_EXTENSIONS = ["jpg", "jpeg", "png"];

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
                    destinations: trip.destinations ?? [],
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
                localErrors.startDate = "La fecha de inicio debe ser igual o posterior a la actual.";
            }
        }

        if (form.startDate && form.endDate) {
            const start = new Date(`${form.startDate}T12:00:00`);
            const end = new Date(`${form.endDate}T12:00:00`);
            if (end < start) {
                localErrors.endDate = "La fecha de fin no puede ser anterior a la de inicio.";
            }
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
          title: form.title,
          description: form.description.trim() ? form.description.trim() : null,
          startDate: form.startDate,
          endDate: form.endDate,
          currency: form.currency,
          destinations: form.destinations.map(({ name, country, lat, lng }) => ({
            name,
            country,
            lat,
            lng,
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <IconCircleButton
                icon="arrow-left"
                onPress={() => navigation.goBack()}
                tone="light"
              />
            </View>
            <Text style={styles.heroTitle}>Editar Viaje</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.metricsRow}>
              <MetricCard label="Destinos" value={form.destinations.length} />
              <MetricCard
                label="Días de viaje"
                value={computeTripDays(form.startDate, form.endDate)}
              />
            </View>

            {/* Pestañas de navegación interna para mejor UX */}
            <View style={styles.tabsContainer} accessibilityRole="tablist">
              <Pressable
                style={[styles.tabButton, activeTab === "info" && styles.tabButtonActive]}
                onPress={() => setActiveTab("info")}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "info" }}
                testID="edit-trip-tab-info"
              >
                <Text style={[styles.tabText, activeTab === "info" && styles.tabTextActive]}>Información</Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === "destinations" && styles.tabButtonActive]}
                onPress={() => setActiveTab("destinations")}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "destinations" }}
                testID="edit-trip-tab-destinations"
              >
                <Text style={[styles.tabText, activeTab === "destinations" && styles.tabTextActive]}>Destinos</Text>
              </Pressable>
              <Pressable
                style={[styles.tabButton, activeTab === "cover" && styles.tabButtonActive]}
                onPress={() => setActiveTab("cover")}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "cover" }}
                testID="edit-trip-tab-cover"
              >
                <Text style={[styles.tabText, activeTab === "cover" && styles.tabTextActive]}>Portada</Text>
              </Pressable>
            </View>

            {/* PESTAÑA 1: INFORMACIÓN */}
            {activeTab === "info" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Detalles Principales</Text>

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
                    placeholderTextColor="#00000059"
                    style={[styles.input, styles.textArea]}
                    value={form.description}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={[styles.row, isTablet && styles.rowTablet]}>
                  {tripAlreadyStarted ? (
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Fecha ida</Text>
                      <View style={[styles.input, styles.inputDisabled]}>
                        <Text style={styles.dateButtonText}>{formatDateToDisplay(form.startDate)}</Text>
                      </View>
                      <Text style={styles.fieldHint}>El viaje ya comenzó, no se puede modificar.</Text>
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
            )}

            {/* PESTAÑA 2: DESTINOS */}
            {activeTab === "destinations" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Destinos del Viaje</Text>

                <View style={[styles.field, styles.destinationSection]}>
                  <Text style={styles.fieldLabel}>Agregar destino</Text>
                  <TextInput
                      value={destinationSearch}
                      onChangeText={setDestinationSearch}
                      placeholder="Córdoba, Bariloche, Chile..."
                      placeholderTextColor="#00000059"
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
                  {errors.destinations ? <Text style={styles.fieldError}>{errors.destinations}</Text> : null}
                </View>

                <View style={styles.selectedDestinationsContainer}>
                  <Text style={styles.fieldLabel}>Seleccionados ({form.destinations.length})</Text>
                  <ScrollView style={styles.selectedDestinationsScroll} nestedScrollEnabled>
                    {form.destinations.map((d, index) => (
                      <View key={`${d.name}-${d.country}-${index}`} style={styles.destinationCurrencyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.destinationChipText}>{d.name}</Text>
                          <Text style={styles.destinationCountry}>{d.country}</Text>
                        </View>
                        <Pressable
                          onPress={() => removeDestination(d)}
                          hitSlop={15}
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar ${d.name}`}
                          testID={`edit-trip-remove-destination-${index}`}
                        >
                          <FontAwesome6 name="xmark" size={14} color={colors.danger || "#FF3B30"} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* PESTAÑA 3: PORTADA */}
            {activeTab === "cover" && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Personalizar Portada</Text>

                {coverImage ? (
                  <ImageBackground
                    source={{ uri: coverImage.uri }}
                    imageStyle={styles.coverPreviewImage}
                    style={styles.coverPreview}
                  >
                    <View style={styles.coverPreviewOverlay}>
                      <Text style={styles.coverPreviewBadge}>Nueva imagen seleccionada</Text>
                    </View>
                  </ImageBackground>
                ) : removeCoverRequested ? (
                  defaultCoverUrl ? (
                    <ImageBackground
                      source={{ uri: defaultCoverUrl }}
                      imageStyle={styles.coverPreviewImage}
                      style={styles.coverPreview}
                    >
                      <View style={styles.coverPreviewOverlay}>
                        <Text style={styles.coverPreviewBadge}>Portada de Google Maps</Text>
                      </View>
                    </ImageBackground>
                  ) : (
                    <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                      <FontAwesome6 name="image" size={20} color={colors.textMuted} />
                      <Text style={styles.coverPreviewEmptyText}>Se usará portada predeterminada</Text>
                    </View>
                  )
                ) : currentCoverUrl ? (
                  <ImageBackground
                    source={{ uri: currentCoverUrl }}
                    imageStyle={styles.coverPreviewImage}
                    style={styles.coverPreview}
                  >
                    <View style={styles.coverPreviewOverlay}>
                      <Text style={styles.coverPreviewBadge}>
                        {hasCustomCover ? "Portada personalizada actual" : "Portada según destino"}
                      </Text>
                    </View>
                  </ImageBackground>
                ) : (
                  <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                    <FontAwesome6 name="image" size={20} color={colors.textMuted} />
                    <Text style={styles.coverPreviewEmptyText}>Se usará una portada predeterminada</Text>
                  </View>
                )}

                {/* Acciones de portada: botones de ancho completo con el mismo estilo */}
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

                {coverError ? <Text style={styles.fieldError}>{coverError}</Text> : null}

                <AICoverGenerator
                  generate={(prompt) => generateTripCoverAI(tripId, prompt)}
                  onAccept={handleAcceptAiCover}
                />
              </View>
            )}

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

      <DatePickerModal
        visible={showStartPicker}
        onClose={() => setShowStartPicker(false)}
        onSelectDate={(date) => {
          handleInputChange("startDate", date);
          setShowStartPicker(false);
        }}
        selectedDate={form.startDate}
      />

      <DatePickerModal
        visible={showEndPicker}
        onClose={() => setShowEndPicker(false)}
        onSelectDate={(date) => {
          handleInputChange("endDate", date);
          setShowEndPicker(false);
        }}
        selectedDate={form.endDate}
      />
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
        placeholderTextColor="#00000059"
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
              {pickerValue ? formatDateToDisplay(pickerValue) : "Seleccionar fecha"}
            </Text>
            <FontAwesome6 color={colors.textPrimary} name="calendar" size={14} />
          </Pressable>
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
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  heroTitle: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 26,
    marginTop: spacing.xs,
    textAlign: "center",
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
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted || "#E9ECEF",
    borderRadius: radii.md,
    padding: 4,
    marginTop: spacing.md,
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
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
  },
  row: { 
    gap: spacing.md,
    marginTop: spacing.md,
  },
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
    position: "relative",
    zIndex: 30,
    elevation: 10,
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
  selectedDestinationsContainer: {
    zIndex: 1,
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
  destinationSection: {
    marginTop: spacing.lg,
    position: "relative",
    zIndex: 20,
  },
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
  coverPreviewSection: {
    marginTop: spacing.md,
  },
  coverPreview: {
    minHeight: 180,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  coverPreviewImage: {
    borderRadius: radii.lg,
  },
  coverPreviewOverlay: {
    padding: spacing.lg,
    backgroundColor: "rgba(19, 39, 80, 0.42)",
  },
  coverPreviewBadge: {
    ...textStyles.label,
    color: colors.accent,
    marginBottom: spacing.xs,
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
    color: colors.danger || "#FF3B30",
    fontSize: 13,
    textAlign: "center",
  },
});