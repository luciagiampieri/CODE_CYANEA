import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

function isValidTime(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function AddActivityScreen({ visible, onClose, onSubmit, dayLabel }) {
    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [horaInicio, setHoraInicio] = useState("");
    const [horaFin, setHoraFin] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    function resetAndClose() {
        setNombre("");
        setDescripcion("");
        setHoraInicio("");
        setHoraFin("");
        setError("");
        setSuccessMessage("");
        onClose();
    }

    async function handleSubmit() {
        if (!nombre.trim()) {
            setError("El nombre de la actividad es obligatorio.");
            return;
        }
        if (!isValidTime(horaInicio) || !isValidTime(horaFin)) {
            setError("Ingresá los horarios en formato HH:MM.");
            return;
        }
        if (horaFin <= horaInicio) {
            setError("La hora de fin debe ser posterior a la hora de inicio.");
            return;
        }

        setSubmitting(true);
        setError("");
        setSuccessMessage("");
        try {
            await onSubmit({
                nombre: nombre.trim(),
                descripcion: descripcion.trim() || null,
                horaInicio: `${horaInicio}:00`,
                horaFin: `${horaFin}:00`,
            });
            setSuccessMessage("¡Actividad creada correctamente!");
            setTimeout(() => {
                resetAndClose();
            }, 1200);
        } catch (err) {
            setError(err.message || "No se pudo crear la actividad.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal animationType="slide" transparent visible={visible} onRequestClose={resetAndClose}>
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                        <View style={styles.headerRow}>
                            <Text style={styles.title}>Nueva actividad</Text>
                            <Pressable onPress={resetAndClose}>
                                <FontAwesome6 color={colors.textMuted} name="xmark" size={18} />
                            </Pressable>
                        </View>
                        {dayLabel ? <Text style={styles.subtitle}>{dayLabel}</Text> : null}

                        <Text style={styles.label}>Nombre</Text>
                        <TextInput
                            onChangeText={setNombre}
                            placeholder="Visita al museo"
                            placeholderTextColor={colors.textMuted}
                            style={styles.input}
                            value={nombre}
                            editable={!successMessage}
                        />

                        <View style={styles.row}>
                            <View style={styles.timeField}>
                                <Text style={styles.label}>Hora de inicio</Text>
                                <TextInput
                                    onChangeText={setHoraInicio}
                                    placeholder="10:00"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.input}
                                    value={horaInicio}
                                    editable={!successMessage}
                                />
                            </View>
                            <View style={styles.timeField}>
                                <Text style={styles.label}>Hora de fin</Text>
                                <TextInput
                                    onChangeText={setHoraFin}
                                    placeholder="12:00"
                                    placeholderTextColor={colors.textMuted}
                                    style={styles.input}
                                    value={horaFin}
                                    editable={!successMessage}
                                />
                            </View>
                        </View>

                        <Text style={styles.label}>Descripción (opcional)</Text>
                        <TextInput
                            multiline
                            onChangeText={setDescripcion}
                            placeholder="Detalle del traslado, excursión o evento."
                            placeholderTextColor={colors.textMuted}
                            style={[styles.input, styles.inputMultiline]}
                            value={descripcion}
                            editable={!successMessage}
                        />

                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

                        <PrimaryButton
                            label={submitting ? "Guardando..." : "Guardar actividad"}
                            loading={submitting}
                            onPress={handleSubmit}
                            disabled={!!successMessage}
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
        maxHeight: "85%",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    title: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 20,
    },
    subtitle: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: spacing.xxs,
        marginBottom: spacing.md,
    },
    label: {
        ...textStyles.label,
        textTransform: "none",
        color: colors.primary,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
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
        minHeight: 90,
        textAlignVertical: "top",
        paddingTop: spacing.sm,
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
    success: {
        ...textStyles.meta,
        color: colors.success ?? "#1f9d55",
        marginTop: spacing.md,
        fontWeight: "700",
    },
    submitButton: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
    },
});