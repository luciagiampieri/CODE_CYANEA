import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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

export default function PlaceScheduleSheet({ days = [], onClose, onSubmit, place, visible }) {
  const [dayId, setDayId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [icono, setIcono] = useState("location-dot");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    if (!visible || !place) return;
    setDayId(dayOptions[0]?.id ?? null);
    setNombre(place.name ?? "");
    setDescripcion("");
    setHoraInicio("");
    setHoraFin("");
    setIcono(suggestIcon(place));
    setError("");
    setSubmitting(false);
  }, [dayOptions, place, visible]);

  async function handleSubmit() {
    if (!dayId) {
      setError("Selecciona un día del viaje.");
      return;
    }
    if (!nombre.trim()) {
      setError("El nombre de la actividad es obligatorio.");
      return;
    }
    if (!horaInicio.trim() || !horaFin.trim()) {
      setError("Completa hora de inicio y hora de fin.");
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
        horaInicio,
        horaFin,
        icono,
      });
      onClose();
    } catch (submitError) {
      setError(submitError.message || "No se pudo agregar el lugar al itinerario.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Agregar al itinerario</Text>
                <Text style={styles.subtitle}>{place?.name}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <FontAwesome6 color={colors.textSecondary} name="xmark" size={16} />
              </Pressable>
            </View>

            <Text style={styles.label}>Día del viaje</Text>
            <View style={styles.dayWrap}>
              {dayOptions.map((day) => {
                const active = day.id === dayId;
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => setDayId(day.id)}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                  >
                    <Text style={[styles.dayChipTitle, active && styles.dayChipTitleActive]}>{`Día ${day.index}`}</Text>
                    <Text style={[styles.dayChipDate, active && styles.dayChipDateActive]}>{day.date}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              onChangeText={setNombre}
              placeholder="Nombre de la actividad"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={nombre}
            />

            <Text style={styles.label}>Ubicación</Text>
            <TextInput
              editable={false}
              style={styles.input}
              value={place?.address ?? ""}
            />

            <Text style={styles.label}>Descripción</Text>
            <TextInput
              multiline
              onChangeText={setDescripcion}
              placeholder="Detalle breve del lugar o plan"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.inputMultiline]}
              value={descripcion}
            />

            <View style={styles.row}>
              <View style={styles.timeField}>
                <Text style={styles.label}>Hora inicio</Text>
                <TextInput
                  onChangeText={setHoraInicio}
                  placeholder="10:00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={horaInicio}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.label}>Hora fin</Text>
                <TextInput
                  onChangeText={setHoraFin}
                  placeholder="12:00"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={horaFin}
                />
              </View>
            </View>

            <Text style={styles.label}>Ícono</Text>
            <View style={styles.iconGrid}>
              {ICON_OPTIONS.map((option) => {
                const active = option.name === icono;
                return (
                  <Pressable
                    key={option.name}
                    onPress={() => setIcono(option.name)}
                    style={[styles.iconOption, active && styles.iconOptionActive]}
                  >
                    <FontAwesome6 color={active ? colors.textInverse : colors.primary} name={option.name} size={16} />
                    <Text style={[styles.iconOptionText, active && styles.iconOptionTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 22,
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
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dayWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dayChip: {
    minWidth: 92,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dayChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dayChipTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  dayChipTitleActive: {
    color: colors.textInverse,
  },
  dayChipDate: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  dayChipDateActive: {
    color: "#dbe6fb",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...textStyles.body,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: spacing.sm,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  timeField: {
    flex: 1,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  iconOption: {
    minWidth: 84,
    alignItems: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  iconOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  iconOptionText: {
    ...textStyles.meta,
    color: colors.primary,
    fontSize: 11,
  },
  iconOptionTextActive: {
    color: colors.textInverse,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.md,
  },
  submitButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
