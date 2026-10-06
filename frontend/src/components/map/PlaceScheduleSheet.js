import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import WebPickerOverlay from "../ui/WebPickerOverlay";
import Modal from "../ui/AppModal";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../ui/PrimaryButton";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const ICON_OPTIONS = [
  { name: "plane", label: "Vuelo" },
  { name: "building", label: "Hotel" },
  { name: "utensils", label: "Comida" },
  { name: "camera", label: "Turismo" },
  { name: "ticket", label: "Evento" },
  { name: "car", label: "Traslado" },
  { name: "person-hiking", label: "Excursión" },
  { name: "location-dot", label: "Otro" },
];

function suggestIcon(place) {
  const text = `${place?.category ?? ""} ${place?.name ?? ""}`.toLowerCase();
  if (text.includes("hotel") || text.includes("hostel")) return "building";
  if (text.includes("rest") || text.includes("comida") || text.includes("cafe")) return "utensils";
  if (text.includes("muse") || text.includes("tour") || text.includes("playa")) return "camera";
  if (text.includes("aero") || text.includes("vuelo")) return "plane";
  return "location-dot";
}

// Función auxiliar para formatear la fecha a dd/mm/aaaa
function formatDateToDisplay(dateString) {
  if (!dateString) return "";
  // Si viene en formato yyyy-mm-dd o similar
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateString;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

// Deja la hora como "HH:MM" aunque venga con segundos ("10:00:00") o espacios:
// el backend espera exactamente ese formato.
function toHHMM(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export default function PlaceScheduleSheet({ days = [], onClose, onSubmit, place, visible }) {
  const [dayId, setDayId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [icono, setIcono] = useState("location-dot");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Estados para el selector de hora idéntico a AddActivityScreen
  const [showTimePicker, setShowTimePicker] = useState(null);
  const [tempDate, setTempDate] = useState(new Date());

  // Estados para el selector desplegable de días
  const [modalDiaVisible, setModalDiaVisible] = useState(false);
  const slideAnimDia = useRef(new Animated.Value(300)).current;

  // Estados para el selector desplegable de íconos
  const [modalIconoVisible, setModalIconoVisible] = useState(false);
  const slideAnimIcono = useRef(new Animated.Value(300)).current;

  const scrollRef = useRef(null);
  const fieldY = useRef({});

  function scrollToField(key) {
    setTimeout(() => {
      const y = fieldY.current[key];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
    }, 300);
  }

  const dayOptions = useMemo(
    () =>
      days.map((day) => ({
        id: day.IdDiaCronograma ?? day.idDiaCronograma ?? day.id ?? day.dayId,
        index: day.IndiceDia ?? day.indiceDia ?? day.dayIndex,
        date: day.Fecha ?? day.fecha ?? day.fechaRaw,
      })),
    [days]
  );

  useEffect(() => {
    if (modalDiaVisible || modalIconoVisible) {
      Animated.timing(slideAnimDia, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      Animated.timing(slideAnimIcono, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      slideAnimDia.setValue(300);
      slideAnimIcono.setValue(300);
    }
  }, [modalDiaVisible, modalIconoVisible]);

  useEffect(() => {
    if (!visible || !place) return;
    setDayId(dayOptions[0]?.id ?? null);
    setNombre(place.name ?? "");
    setDescripcion("");
    setHoraInicio("");
    setHoraFin("");
    setIcono(suggestIcon(place));
    setError("");
    setSubmitting(false);
    setShowTimePicker(null);
    setModalDiaVisible(false);
    setModalIconoVisible(false);
  }, [dayOptions, place, visible]);

  function openTimePicker(type) {
    Keyboard.dismiss();
    if (type === "fin" && !horaInicio) {
      setError("Primero seleccioná una hora de inicio.");
      return;
    }

    const baseDate = new Date();
    if (type === "inicio") {
      if (horaInicio && isValidTime(horaInicio)) {
        const [h, m] = horaInicio.split(":");
        baseDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
      }
    } else if (horaFin && isValidTime(horaFin)) {
      const [h, m] = horaFin.split(":");
      baseDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    } else {
      const [h, m] = (horaInicio || "10:00").split(":");
      const total = Math.min(parseInt(h, 10) * 60 + parseInt(m, 10) + 60, 23 * 60 + 59);
      baseDate.setHours(Math.floor(total / 60), total % 60, 0, 0);
    }

    setTempDate(baseDate);
    setShowTimePicker(type);
    setError("");
  }

  function commitTime(type, date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const selectedTime = `${hours}:${minutes}`;

    if (type === "inicio") {
      setHoraInicio(selectedTime);
      if (horaFin && selectedTime >= horaFin) setHoraFin("");
      setError("");
    } else if (type === "fin") {
      if (horaInicio && selectedTime <= horaInicio) {
        setError("La hora de fin debe ser posterior a la hora de inicio.");
        setHoraFin("");
      } else {
        setHoraFin(selectedTime);
        setError("");
      }
    }
  }

  // Web: el <input type="time"> del navegador devuelve "HH:MM". Se guarda tal cual y
  // las reglas (fin posterior al inicio, 00:00, etc.) se validan al guardar, como antes.
  function handleWebTimeChange(type, value) {
    const hora = toHHMM(value);
    if (!isValidTime(hora)) return;
    if (type === "inicio") setHoraInicio(hora);
    else setHoraFin(hora);
    setError("");
  }

  function handleTimeChange(event, selectedDate) {
    if (Platform.OS === "android") {
      const type = showTimePicker;
      setShowTimePicker(null);
      if (event.type === "set" && selectedDate) commitTime(type, selectedDate);
      return;
    }
    if (selectedDate) setTempDate(selectedDate);
  }

  function confirmTimePicker() {
    commitTime(showTimePicker, tempDate);
    setShowTimePicker(null);
  }

  function closeTimePicker() {
    setShowTimePicker(null);
  }

  async function handleSubmit() {
    if (!dayId) {
      setError("Selecciona un día del viaje.");
      return;
    }
    if (!nombre.trim()) {
      setError("El nombre de la actividad es obligatorio.");
      return;
    }
    const inicio = toHHMM(horaInicio);
    const fin = toHHMM(horaFin);
    if (!isValidTime(inicio) || !isValidTime(fin)) {
      setError("Completa hora de inicio y hora de fin válidas en formato HH:MM.");
      return;
    }
    if (fin <= inicio) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await onSubmit({
        dayId,
        dayIndex: dayOptions.find((day) => day.id === dayId)?.index ?? null,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        // Antes se mandaba `${hora}:00`: si la hora ya traía segundos quedaba
        // "10:00:00:00" y el backend respondía "horaInicio debe tener formato HH:MM".
        horaInicio: inicio,
        horaFin: fin,
        icono,
      });
      onClose();
    } catch (submitError) {
      setError(submitError.message || "No se pudo agregar el lugar al itinerario.");
    } finally {
      setSubmitting(false);
    }
  }

  const diaSeleccionadoObj = dayOptions.find((d) => d.id === dayId);
  const iconoSeleccionadoObj = ICON_OPTIONS.find((opt) => opt.name === icono);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
            >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>Agregar al itinerario</Text>
                  <Text style={styles.subtitle}>{place?.name}</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <FontAwesome6 color={colors.textSecondary} name="xmark" size={16} />
                </Pressable>
              </View>

              {/* Selector de día en formato desplegable (evita lista larga) */}
              <Text style={styles.label}>Día del viaje</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setModalDiaVisible(true);
                }}
              >
                <View style={styles.dropdownLeftContent}>
                  <FontAwesome6 name="calendar-days" size={14} color={colors.primary} style={{ marginRight: 10, width: 18, textAlign: "center" }} />
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {diaSeleccionadoObj
                      ? `Día ${diaSeleccionadoObj.index} (${formatDateToDisplay(diaSeleccionadoObj.date)})`
                      : "Seleccionar día del viaje"}
                  </Text>
                </View>
                <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
              </TouchableOpacity>

              {/* Nombre de la actividad */}
              <Text style={styles.label}>Nombre</Text>
              <View
                style={styles.inputBox}
                onLayout={(e) => { fieldY.current.nombre = e.nativeEvent.layout.y; }}
              >
                <FontAwesome6 name="pen" size={14} color={colors.overlay} />
                <TextInput
                  onChangeText={(text) => {
                    setNombre(text);
                    if (error) setError("");
                  }}
                  onFocus={() => scrollToField("nombre")}
                  placeholder="Nombre de la actividad"
                  placeholderTextColor={colors.overlay}
                  style={styles.inputInner}
                  value={nombre}
                />
              </View>

              {/* Ubicación fija / No modificable */}
              <Text style={styles.label}>Ubicación</Text>
              <View style={[styles.inputBox, styles.inputDisabled]}>
                <FontAwesome6 name="location-dot" size={14} color={colors.primary} />
                <TextInput
                  editable={false}
                  style={[styles.inputInner, { color: colors.textSecondary }]}
                  value={place?.address ?? place?.name ?? ""}
                />
              </View>

              {/* Descripción */}
              <Text style={styles.label}>Descripción</Text>
              <View
                style={[styles.inputBox, styles.inputBoxMultiline]}
                onLayout={(e) => { fieldY.current.descripcion = e.nativeEvent.layout.y; }}
              >
                <FontAwesome6 name="note-sticky" size={14} color={colors.overlay} style={styles.inputBoxMultilineIcon} />
                <TextInput
                  multiline
                  onChangeText={setDescripcion}
                  onFocus={() => scrollToField("descripcion")}
                  placeholder="Detalle breve del lugar o plan"
                  placeholderTextColor={colors.overlay}
                  style={[styles.inputInner, styles.inputMultiline]}
                  value={descripcion}
                />
              </View>

              {/* Selector de Horarios idéntico a AddActivityScreen */}
              <View style={styles.row}>
                <View style={styles.timeField}>
                  <Text style={styles.label}>Hora inicio</Text>
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBox}>
                      <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                      <Text style={horaInicio ? styles.timeText : styles.placeholderText}>
                        {horaInicio || "10:00"}
                      </Text>
                      <WebPickerOverlay
                        type="time"
                        label="Hora de inicio"
                        value={horaInicio}
                        onChange={(value) => handleWebTimeChange("inicio", value)}
                      />
                    </View>
                  ) : (
                    <Pressable onPress={() => openTimePicker("inicio")} style={styles.dateBox}>
                      <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                      <Text style={horaInicio ? styles.timeText : styles.placeholderText}>
                        {horaInicio || "10:00"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.timeField}>
                  <Text style={styles.label}>Hora fin</Text>
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBox}>
                      <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                      <Text style={horaFin ? styles.timeText : styles.placeholderText}>
                        {horaFin || "12:00"}
                      </Text>
                      <WebPickerOverlay
                        type="time"
                        label="Hora de fin"
                        value={horaFin}
                        onChange={(value) => handleWebTimeChange("fin", value)}
                      />
                    </View>
                  ) : (
                    <Pressable onPress={() => openTimePicker("fin")} style={styles.dateBox}>
                      <FontAwesome6 name="clock" size={14} color={colors.overlay} />
                      <Text style={horaFin ? styles.timeText : styles.placeholderText}>
                        {horaFin || "12:00"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Selector de Ícono */}
              <Text style={styles.label}>Ícono</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setModalIconoVisible(true);
                }}
              >
                <View style={styles.dropdownLeftContent}>
                  <FontAwesome6
                    name={iconoSeleccionadoObj ? iconoSeleccionadoObj.name : "location-dot"}
                    size={14}
                    color={colors.primary}
                    style={{ marginRight: 10, width: 18, textAlign: "center" }}
                  />
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {iconoSeleccionadoObj ? iconoSeleccionadoObj.label : "Selecciona un ícono"}
                  </Text>
                </View>
                <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
              </TouchableOpacity>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                label={submitting ? "Guardando..." : "Agregar al itinerario"}
                loading={submitting}
                onPress={handleSubmit}
                style={styles.submitButton}
              />
            </ScrollView>
          </View>
        </View>

        {/* MODAL DESPLEGABLE PARA SELECCIONAR DÍA */}
        {modalDiaVisible && (
          <View style={styles.modalOverlayC}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalDiaVisible(false)} />
            <Animated.View style={[styles.bottomSheetC, { transform: [{ translateY: slideAnimDia }] }]}>
              <View style={styles.modalHeaderC}>
                <Text style={styles.modalTitleC}>Seleccionar día del viaje</Text>
                <TouchableOpacity onPress={() => setModalDiaVisible(false)} hitSlop={10}>
                  <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={dayOptions}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item, index }) => {
                  const esActivo = item.id === dayId;
                  const esElUltimo = index === dayOptions.length - 1;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItemC, esActivo && styles.modalItemActiveC, esElUltimo && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setDayId(item.id);
                        setModalDiaVisible(false);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <FontAwesome6 name="calendar-day" size={15} color={esActivo ? colors.primary : "#4b5563"} style={{ marginRight: 12, width: 24, textAlign: "center" }} />
                        <View>
                          <Text style={[styles.modalItemTextC, esActivo && styles.modalItemTextActiveC]}>
                            {`Día ${item.index}`}
                          </Text>
                          <Text style={styles.modalItemSubText}>
                            {formatDateToDisplay(item.date)}
                          </Text>
                        </View>
                      </View>
                      {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>
          </View>
        )}

        {/* MODAL DESPLEGABLE PARA SELECCIONAR ÍCONO */}
        {modalIconoVisible && (
          <View style={styles.modalOverlayC}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalIconoVisible(false)} />
            <Animated.View style={[styles.bottomSheetC, { transform: [{ translateY: slideAnimIcono }] }]}>
              <View style={styles.modalHeaderC}>
                <Text style={styles.modalTitleC}>Seleccionar ícono</Text>
                <TouchableOpacity onPress={() => setModalIconoVisible(false)} hitSlop={10}>
                  <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <FlatList
                data={ICON_OPTIONS}
                keyExtractor={(item) => item.name}
                renderItem={({ item, index }) => {
                  const esActivo = icono === item.name;
                  const esElUltimo = index === ICON_OPTIONS.length - 1;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItemC, esActivo && styles.modalItemActiveC, esElUltimo && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        setIcono(item.name);
                        setModalIconoVisible(false);
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <FontAwesome6 name={item.name} size={16} color={esActivo ? colors.primary : "#4b5563"} style={{ marginRight: 12, width: 24, textAlign: "center" }} />
                        <Text style={[styles.modalItemTextC, esActivo && styles.modalItemTextActiveC]}>
                          {item.label}
                        </Text>
                      </View>
                      {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </Animated.View>
          </View>
        )}

        {/* Date / Time Pickers nativos idénticos a AddActivityScreen */}
        {Platform.OS !== "web" && showTimePicker !== null && Platform.OS === "ios" ? (
          <Modal transparent animationType="fade" visible={showTimePicker !== null} onRequestClose={closeTimePicker}>
            <Pressable style={styles.timePickerOverlay} onPress={closeTimePicker}>
              <Pressable style={styles.timePickerContainer} onPress={(e) => e.stopPropagation()}>
                <DateTimePicker
                  mode="time"
                  value={tempDate}
                  onChange={handleTimeChange}
                  is24Hour={true}
                  display="spinner"
                  style={{ width: 220, height: 160 }}
                />
                <Pressable style={styles.timePickerDone} onPress={confirmTimePicker}>
                  <Text style={styles.timePickerDoneText}>Listo</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        ) : Platform.OS !== "web" && showTimePicker !== null ? (
          <DateTimePicker
            mode="time"
            value={tempDate}
            onChange={handleTimeChange}
            is24Hour={true}
            display="default"
          />
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong || "rgba(9, 19, 45, 0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl || 24,
    borderTopRightRadius: radii.xl || 24,
    padding: spacing.lg,
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt || "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dropdownButton: {
    minHeight: 48,
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
    marginRight: 10,
  },
  dropdownText: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  inputBox: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted || "#F2F2F2",
  },
  inputBoxMultiline: {
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  inputBoxMultilineIcon: {
    marginTop: 4,
  },
  inputInner: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 8,
    ...textStyles.body,
  },
  inputMultiline: {
    minHeight: 90,
    maxHeight: 140,
    textAlignVertical: "top",
    paddingTop: 0,
  },
  dateBox: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  timeText: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  placeholderText: {
    ...textStyles.body,
    color: colors.overlay,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  timeField: {
    flex: 1,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.md,
  },
  submitButton: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  modalOverlayC: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    elevation: 999,
    zIndex: 1000,
  },
  bottomSheetC: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl || 24,
    borderTopRightRadius: radii.xl || 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeaderC: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitleC: {
    ...textStyles.bodyStrong,
    fontSize: 18,
    color: colors.primary,
  },
  modalItemC: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  modalItemActiveC: {
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#f0f4f8",
    borderRadius: radii.sm || 8,
  },
  modalItemTextC: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  modalItemTextActiveC: {
    color: colors.primary,
    fontWeight: "700",
  },
  modalItemSubText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  timePickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
    minWidth: 260,
  },
  timePickerDone: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  timePickerDoneText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "700",
  },
});