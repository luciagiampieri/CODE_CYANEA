import { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Platform,
    Modal,
    Pressable,
    Keyboard,
    KeyboardAvoidingView,
} from "react-native";

import { FontAwesome6 } from "@expo/vector-icons";
import DatePickerModal from "../components/ui/DatePickerModal";     
import { toYMD, parseYMD, getTodayIso } from "../utils/dates";     


import PrimaryButton from "../components/ui/PrimaryButton";
import { createVotacion } from "../services/api";
import { colors, shadows, textStyles, radii, spacing } from "../theme/tokens";
import DateTimePicker from "@react-native-community/datetimepicker";

function fechaDefault() {
    const d = new Date();
    d.setDate(d.getDate());
    d.setHours(23, 59, 0, 0); 
    return d;
}

function toDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

export default function CrearVotacionScreen({ visible, onClose, IdViaje, onVotacionCreada }) {
    const [titulo, setTitulo] = useState("");
    const [tipo, setTipo] = useState("opcion_unica"); 
    const [fechaCierre, setFechaCierre] = useState(fechaDefault());
    const [propuestas, setPropuestas] = useState(["", ""]); 
    const [errores, setErrores] = useState({});
    const [saving, setSaving] = useState(false);
    
    // Estados para controlar los modales
    const [mostrarCalendario, setMostrarCalendario] = useState(false);
    const [mostrarSelectorHora, setMostrarSelectorHora] = useState(false);

    const [tempDate, setTempDate] = useState(new Date());

    const scrollRef = useRef(null);
    const contentY = useRef(0);
    const fieldY = useRef({});

    function scrollToField(key) {
        // Delay para esperar a que el teclado termine de aparecer
        setTimeout(() => {
            const y = fieldY.current[key];
            if (y == null) return;
            scrollRef.current?.scrollTo({
                y: Math.max(contentY.current + y - 80, 0),
                animated: true,
            });
        }, 300);
    }

    useEffect(() => {
        if (!visible) return;
        setTitulo("");
        setTipo("opcion_unica");
        const def = fechaDefault();
        setFechaCierre(def);
        setPropuestas(["", ""]);
        setErrores({});
    }, [visible]);

    function actualizarPropuesta(index, valor) {
        setPropuestas((prev) => prev.map((p, i) => (i === index ? valor : p)));
    }

    function agregarPropuesta() {
        setPropuestas((prev) => [...prev, ""]);
    }

    function quitarPropuesta(index) {
        setPropuestas((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    }

    function fechaCierreTexto() {
        return new Intl.DateTimeFormat("es-AR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(fechaCierre);
    }

    function validar() {
        const nuevos = {};

        if (!titulo.trim()) {
            nuevos.titulo = "El nombre de la votación es obligatorio";
        }

        const limpias = propuestas.map((p) => p.trim()).filter((p) => p.length > 0);
        const distintas = new Set(limpias.map((p) => p.toLowerCase()));
        if (limpias.length < 2) {
            nuevos.propuestas = "Debés cargar al menos dos propuestas";
        } else if (distintas.size < limpias.length) {
            nuevos.propuestas = "Hay propuestas repetidas";
        }

        if (fechaCierre <= new Date()) {
            nuevos.fechaCierre = "La fecha y hora de cierre debe ser futura";
        }

        setErrores(nuevos);
        return Object.keys(nuevos).length === 0;
    }

    async function handleCrear() {
        if (!validar()) return;

        const propuestasLimpias = propuestas.map((p) => p.trim()).filter((p) => p.length > 0);

        try {
            setSaving(true);
            const nuevaVotacion = await createVotacion({
                idViaje: IdViaje,
                nombre: titulo.trim(),
                tipo,
                fechaCierre: fechaCierre.toISOString(),
                propuestas: propuestasLimpias,
            });

            if (Platform.OS === "web") {
                window.alert("La votación se creó correctamente.");
            } else {
                Alert.alert("Votación creada", "La votación se creó correctamente.");
            }

            onVotacionCreada?.(nuevaVotacion);
            onClose();

        } catch (error) {
            Alert.alert("No se pudo crear", error.message);
        } finally {
            setSaving(false);
        }
    }

    function commitHora(date) {
        const nueva = new Date(fechaCierre);
        nueva.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setFechaCierre(nueva);
    }

    function handleTimeChange(event, selectedDate) {
        if (Platform.OS === "android") {
            setMostrarSelectorHora(false);
            if (event.type === "set" && selectedDate) commitHora(selectedDate);
            return;
        }
        // iOS: solo guarda el valor temporal; se confirma con "Listo"
        if (selectedDate) setTempDate(selectedDate);
    }

    function confirmarHora() {
        commitHora(tempDate);
        setMostrarSelectorHora(false);
    }

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
                        <View style={styles.headerRow}>
                            <Text style={styles.title}>Nueva votación</Text>
                            <TouchableOpacity onPress={onClose} testID="cerrar-votacion-modal">
                                <FontAwesome6 name="xmark" size={18} color={colors.overlay} />
                            </TouchableOpacity>
                        </View>

                        <View 
                            style={styles.content}
                            onLayout={(e) => {
                                contentY.current = e.nativeEvent.layout.y;
                            }}
                        >
                            <Text style={styles.label}>Nombre descriptivo</Text>
                            <View 
                                style={styles.inputBox}
                                onLayout={(e) => {
                                    fieldY.current.titulo = e.nativeEvent.layout.y;
                                }}
                            >
                                <FontAwesome6 name="pen" size={14} color={colors.overlay} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="¿Qué hacemos el segundo día?"
                                    placeholderTextColor={colors.overlay} 
                                    value={titulo}
                                    onChangeText={setTitulo}
                                    onFocus={() => scrollToField("titulo")}
                                    maxLength={150}
                                />
                            </View>
                            {errores.titulo && <Text style={styles.error}>{errores.titulo}</Text>}

                            <Text style={styles.label}>Tipo de votación</Text>
                            <View style={styles.selectorContainer}>
                                <TouchableOpacity
                                    style={[styles.selectorOption, tipo === "opcion_unica" && styles.selectorOptionActive]}
                                    onPress={() => setTipo("opcion_unica")}
                                >
                                    <FontAwesome6
                                        name="circle-dot"
                                        size={14}
                                        color={tipo === "opcion_unica" ? colors.textInverse : colors.primary} 
                                    />
                                    <Text style={[styles.selectorOptionText, tipo === "opcion_unica" && styles.selectorOptionTextActive]}>
                                        Opción única
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.selectorOption, tipo === "opcion_multiple" && styles.selectorOptionActive]}
                                    onPress={() => setTipo("opcion_multiple")}
                                >
                                    <FontAwesome6
                                        name="square-check"
                                        size={14}
                                        color={tipo === "opcion_multiple" ? colors.textInverse : colors.primary} 
                                    />
                                    <Text style={[styles.selectorOptionText, tipo === "opcion_multiple" && styles.selectorOptionTextActive]}>
                                        Opción múltiple
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.label}>Cierre (fecha y hora)</Text>
                            {Platform.OS === "web" ? (
                                <View style={styles.dateBox}>
                                    <input
                                        type="datetime-local"
                                        value={toDatetimeLocal(fechaCierre)}
                                        min={toDatetimeLocal(new Date())}
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            setFechaCierre(new Date(e.target.value));
                                        }}
                                        style={{ border: "none", width: "100%", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: "16px", color: 'inherit', cursor: 'pointer' }}
                                    />
                                </View>
                            ) : (
                                <>
                                    {/* Botón combinado para abrir Calendario o Selector Táctil de Hora */}
                                    <View style={[styles.dateBoxContainer, errores.fechaCierre && styles.inputError]}>
                                        <Pressable 
                                            style={styles.dateButtonPart} 
                                            onPress={() => {
                                                Keyboard.dismiss();
                                                setMostrarCalendario(true);
                                            }}
                                        >
                                            <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                                            <Text style={styles.inputText}>{fechaCierreTexto().split(",")[0] || fechaCierreTexto()}</Text>
                                        </Pressable>

                                        <View style={styles.dateDivider} />

                                        <Pressable 
                                            style={styles.timeButtonPart} 
                                            onPress={() => {
                                                Keyboard.dismiss();
                                                setTempDate(new Date(fechaCierre));
                                                setMostrarSelectorHora(true);
                                            }}
                                        >
                                            <FontAwesome6 name="clock" size={15} color={colors.primary} />
                                            <Text style={styles.inputText}>
                                                {String(fechaCierre.getHours()).padStart(2, "0")}:{String(fechaCierre.getMinutes()).padStart(2, "0")}
                                            </Text>
                                        </Pressable>
                                    </View>

                                    {/* Modal Calendario Estándar */}
                                    <DatePickerModal
                                        visible={mostrarCalendario}
                                        onClose={() => setMostrarCalendario(false)}
                                        title="Fecha de cierre"
                                        value={toYMD(fechaCierre)}
                                        onChange={(ymd) => {
                                            // Solo actualiza año/mes/día — la hora ya seteada en fechaCierre
                                            // (por el selector de hora aparte) se mantiene intacta.
                                            const [year, month, day] = ymd.split("-").map(Number);
                                            const nueva = new Date(fechaCierre);
                                            nueva.setFullYear(year, month - 1, day);
                                            setFechaCierre(nueva);
                                        }}
                                        minDate={parseYMD(getTodayIso(), 0)}
                                    />

                                    {mostrarSelectorHora && Platform.OS === "ios" ? (
                                        <Modal
                                            transparent
                                            animationType="fade"
                                            visible={mostrarSelectorHora}
                                            onRequestClose={() => setMostrarSelectorHora(false)}
                                        >
                                            <Pressable
                                                style={styles.modalOverlayCalendar}
                                                onPress={() => setMostrarSelectorHora(false)}
                                            >
                                                <Pressable style={styles.timePickerContainer} onPress={(e) => e.stopPropagation()}>
                                                    <DateTimePicker
                                                        mode="time"
                                                        value={tempDate}
                                                        onChange={handleTimeChange}
                                                        is24Hour={true}
                                                        display="spinner"
                                                        style={{ width: 220, height: 160 }}
                                                    />
                                                    <Pressable style={styles.timePickerDone} onPress={confirmarHora}>
                                                        <Text style={styles.timePickerDoneText}>Listo</Text>
                                                    </Pressable>
                                                </Pressable>
                                            </Pressable>
                                        </Modal>
                                    ) : mostrarSelectorHora ? (
                                        <DateTimePicker
                                            mode="time"
                                            value={tempDate}
                                            onChange={handleTimeChange}
                                            is24Hour={true}
                                            display="default"
                                        />
                                    ) : null}
                                </>
                            )}
                            {errores.fechaCierre && <Text style={styles.error}>{errores.fechaCierre}</Text>}

                            <View style={styles.propuestasHeader}>
                                <Text style={styles.label}>Propuestas</Text>
                                <TouchableOpacity style={styles.addChip} onPress={agregarPropuesta}>
                                    <FontAwesome6 name="plus" size={11} color={colors.textInverse} />
                                    <Text style={styles.addChipText}>Agregar</Text>
                                </TouchableOpacity>
                            </View>

                            {propuestas.map((propuesta, index) => (
                                <View
                                    key={index}
                                    style={styles.propuestaRow}
                                    onLayout={(e) => {
                                        fieldY.current[`propuesta-${index}`] = e.nativeEvent.layout.y;
                                    }}
                                >
                                    <View style={[styles.inputBox, { flex: 1, marginBottom: 0 }]}>
                                        <Text style={styles.propuestaIndex}>{index + 1}</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder={`Propuesta ${index + 1}`}
                                            placeholderTextColor={colors.overlay} 
                                            value={propuesta}
                                            onChangeText={(val) => actualizarPropuesta(index, val)}
                                            onFocus={() => scrollToField(`propuesta-${index}`)}
                                            maxLength={255}
                                        />
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.removeButton, propuestas.length <= 2 && styles.removeButtonDisabled]}
                                        onPress={() => quitarPropuesta(index)}
                                        disabled={propuestas.length <= 2}
                                        testID={`votacion-quitar-propuesta-${index}`}
                                    >
                                        <FontAwesome6
                                            name="trash"
                                            size={14}
                                            color={propuestas.length <= 2 ? colors.textMuted : colors.danger}
                                        />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {errores.propuestas && <Text style={styles.error}>{errores.propuestas}</Text>}

                            <PrimaryButton
                                label={saving ? "Creando..." : "Crear votación"}
                                loading={saving}
                                onPress={handleCrear}
                                disabled={saving}
                                style={styles.submitButton}
                            />
                        </View>
                    </ScrollView>
                </View>
            </View>
            </KeyboardAvoidingView>
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
        borderTopLeftRadius: radii.xl || 24,
        borderTopRightRadius: radii.xl || 24,
        padding: spacing.lg || 24,
        maxHeight: "90%",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    title: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 20,
    },
    content: {
        paddingVertical: 10,
    },
    label: {
        ...textStyles.label,
        textTransform: "none",
        color: colors.primary,
        marginTop: 14,
        marginBottom: 8,
    },
    inputBox: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border || "#dfe3ea",
        borderRadius: radii.md || 12,
        backgroundColor: colors.surface,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 5,
    },
    input: {
        flex: 1,
        color: colors.overlayStrong,
        paddingVertical: 8,
        fontWeight: "700",
        ...textStyles.body,
    },
    inputText: {
        color: colors.overlayStrong,
        fontWeight: "700",
        ...textStyles.body,
        fontSize: 13,
    },
    dateBoxContainer: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border || "#dfe3ea",
        borderRadius: radii.md || 12,
        backgroundColor: colors.surface,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
    },
    dateButtonPart: {
        flex: 1.3,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 8,
        height: "100%",
        paddingVertical: 12,
    },
    timeButtonPart: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 8,
        height: "100%",
        paddingVertical: 12,
    },
    dateDivider: {
        width: 1,
        height: "60%",
        backgroundColor: colors.border || "#dfe3ea",
    },
    dateBox: {
        minHeight: 48,
        borderWidth: 1,
        borderColor: colors.border || "#dfe3ea",
        borderRadius: radii.md || 12,
        backgroundColor: colors.surface,
        paddingHorizontal: 15,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },
    inputError: {
        borderColor: colors.danger,
    },
    submitButton: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
    },
    error: {
        color: colors.danger,
        fontSize: 12,
        marginTop: 5,
        fontWeight: "600",
    },
    selectorContainer: {
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: radii.md || 12,
        borderWidth: 1,
        borderColor: colors.border || "#dfe3ea",
        padding: 4,
        gap: 5,
    },
    selectorOption: {
        flex: 1,
        flexDirection: "row",
        height: 42,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
    },
    selectorOptionActive: {
        backgroundColor: colors.primary,
    },
    selectorOptionText: {
        ...textStyles.body,
        color: colors.primary,
    },
    selectorOptionTextActive: {
        color: colors.textInverse,
    },
    propuestasHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
        marginBottom: 8,
    },
    addChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.primary,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
    },
    addChipText: { color: colors.textInverse, fontWeight: "700", fontSize: 12 },
    propuestaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    propuestaIndex: {
        fontWeight: "800",
        color: colors.overlay,
        width: 16,
        textAlign: "center",
    },
    removeButton: {
        width: 44,
        height: 44,
        borderWidth: 1,
        borderColor: colors.border || "#dfe3ea",
        borderRadius: radii.md || 12,
        backgroundColor: colors.surface,
        justifyContent: "center",
        alignItems: "center",
    },
    removeButtonDisabled: { opacity: 0.5 },
    modalOverlayCalendar: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
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