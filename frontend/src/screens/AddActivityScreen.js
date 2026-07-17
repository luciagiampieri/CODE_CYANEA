import { useState, useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

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

const ICON_KEYWORDS = {
    plane: ["vuelo", "avion", "avión", "aeropuerto", "embarque", "flight", "aterrizaje", "despegue", "boarding", "boarding pass", "aerolinea", "aerolínea", "airline", "gate", "escala", "conexion"],
    building: ["hotel", "alojamiento", "hostel", "check-in", "check in", "check-out", "check out","hospedaje", "apartamento", "cabaña", "resort", "bnb", "dormir", "habitación", "recepción", "reserva", "booking", "hostería", "hospedería", "hostal", "airbnb"],
    utensils: ["cena", "almuerzo", "desayuno", "comida", "restaurante", "brunch", "cafe", "café", "bar", "parrilla", "pizza", "gastronomia", "degustación", "fast food", "burger", "comedor", "cafetería", "cafeteria", "snack", "merienda", "tapas", "pub", "cerveza", "vino", "cocktail", "coctel", "drinks", "bebidas", "drink", "beverage", "cena romántica", "romantic dinner"],
    camera: ["visita", "museo", "tour", "turismo", "paseo", "recorrido", "monumento", "catedral", "iglesia", "plaza", "galeria","shopping", "compras", "tienda", "exposición", "mirador", "foto", "histórico", "ruinas", "arquitectura", "cultural", "artístico", "artístico", "arte", "fotografía", "photography", "sightseeing", "landmark", "attraction", "city tour", "walking tour","parque", "jardín", "zoológico", "acuario", "planetario", "observatorio", "cultural center", "cultural centre", "cultural site", "guiada","guiado", "guía", "guide", "guided tour", "tour guide", "excursión guiada", "visita guiada"],
    ticket: ["show", "teatro", "concierto", "evento", "espectaculo", "espectáculo", "partido", "cancha", "cine", "festival", "obra", "entrada", "recital", "ópera", "musical", "danza", "ballet", "performance", "ticket", "tickets", "entradas", "boletos", "boleto", "admisión", "admission", "pass", "passes", "conferencia", "charla", "workshop", "seminario", "exposición", "exhibition", "expo", "feria", "convention", "convención", "convocatoria"],
    car: ["traslado", "taxi", "bus", "colectivo", "transporte", "uber", "remis", "transfer", "shuttle", "metro", "tren", "subte", "alquiler", "renta", "conducción", "puerto", "ferry", "estación", "terminal", "autobús", "camioneta", "van", "vehículo", "carro", "coche", "auto", "ride", "transportation", "commute", "ave"],
    "person-hiking": ["excursion", "excursión", "senderismo", "trekking", "hiking", "caminata", "montaña", "playa","trek", "aventura", "naturaleza", "escalada", "ski", "buceo", "surf","nadar", "ski", "rafting", "kayak", "bosque","snorkel","yoga"],
};

function detectIcon(nombre) {
    if (!nombre.trim()) return "location-dot";
    const lower = nombre.toLowerCase();
    for (const [icon, keywords] of Object.entries(ICON_KEYWORDS)) {
        if (keywords.some((kw) => lower.includes(kw))) return icon;
    }
    return "location-dot";
}

function isValidTime(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function AddActivityScreen({ visible, onClose, onSubmit, dayLabel }) {
    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [horaInicio, setHoraInicio] = useState("");
    const [horaFin, setHoraFin] = useState("");
    const [icono, setIcono] = useState("location-dot");
    const [iconoModificadoManual, setIconoModificadoManual] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    useEffect(() => {
        if (!iconoModificadoManual) {
            setIcono(detectIcon(nombre));
        }
    }, [nombre]);

    function handleSelectIcon(iconName) {
        setIcono(iconName);
        setIconoModificadoManual(true);
    }

    function resetAndClose() {
        setNombre("");
        setDescripcion("");
        setHoraInicio("");
        setHoraFin("");
        setIcono("location-dot");
        setIconoModificadoManual(false);
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
                icono,
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

                        <Text style={styles.label}>Ícono</Text>
                        <Text style={styles.iconHint}>
                            Detectado automáticamente. Seleccioná otro para cambiarlo.
                        </Text>
                        <View style={styles.iconGrid}>
                            {ICON_OPTIONS.map((option) => {
                                const selected = icono === option.name;
                                return (
                                    <Pressable
                                        key={option.name}
                                        onPress={() => !successMessage && handleSelectIcon(option.name)}
                                        style={[styles.iconOption, selected && styles.iconOptionSelected]}
                                    >
                                        <FontAwesome6
                                            color={selected ? colors.textInverse : colors.primary}
                                            name={option.name}
                                            size={18}
                                        />
                                        <Text style={[styles.iconLabel, selected && styles.iconLabelSelected]}>
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

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
    iconHint: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    iconGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
    },
    iconOption: {
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xxs,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minWidth: 72,
    },
    iconOptionSelected: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    iconLabel: {
        ...textStyles.meta,
        fontSize: 11,
        color: colors.primary,
    },
    iconLabelSelected: {
        color: colors.textInverse,
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