import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
} from "react-native";

import DateTimePicker from "@react-native-community/datetimepicker";
import { FontAwesome6 } from "@expo/vector-icons";

import { createVotacion } from "../services/api";
import { colors, shadows } from "../theme/tokens";

// Fecha de cierre por defecto: dentro de 24 hs (asi arranca valida/futura).
function fechaDefault() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setSeconds(0, 0);
    return d;
}

// Formatea Date -> "YYYY-MM-DDTHH:mm" para <input type="datetime-local"> (hora local).
function toDatetimeLocal(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

export default function CrearVotacionScreen({ route, navigation }) {
    const { IdViaje } = route.params || {};

    const [titulo, setTitulo] = useState("");
    const [tipo, setTipo] = useState("opcion_unica"); // AC3
    const [fechaCierre, setFechaCierre] = useState(fechaDefault());
    const [propuestas, setPropuestas] = useState(["", ""]); // AC2: arranca con 2
    const [errores, setErrores] = useState({});
    const [saving, setSaving] = useState(false);

    // Control de pickers nativos (flujo fecha -> hora).
    const [mostrarFecha, setMostrarFecha] = useState(false);
    const [mostrarHora, setMostrarHora] = useState(false);

    function actualizarPropuesta(index, valor) {
        setPropuestas((prev) => prev.map((p, i) => (i === index ? valor : p)));
    }

    function agregarPropuesta() {
        setPropuestas((prev) => [...prev, ""]);
    }

    function quitarPropuesta(index) {
        // No permitimos bajar de 2 campos (AC2).
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

        // AC1: nombre descriptivo
        if (!titulo.trim()) {
            nuevos.titulo = "El nombre de la votación es obligatorio";
        }

        // AC2: al menos dos propuestas validas (no vacias, sin duplicados)
        const limpias = propuestas.map((p) => p.trim()).filter((p) => p.length > 0);
        const distintas = new Set(limpias.map((p) => p.toLowerCase()));
        if (limpias.length < 2) {
            nuevos.propuestas = "Debés cargar al menos dos propuestas";
        } else if (distintas.size < limpias.length) {
            nuevos.propuestas = "Hay propuestas repetidas";
        }

        // AC6: fecha y hora de cierre futura
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
                // ISO completo con offset; el backend valida que sea futura (AC6).
                fechaCierre: fechaCierre.toISOString(),
                propuestas: propuestasLimpias,
            });

            // AC9: mensaje de confirmacion. En web, Alert con botones no dispara
            // onPress, asi que confirmamos y navegamos de forma incondicional.
            if (Platform.OS === "web") {
                window.alert("La votación se creó correctamente.");
            } else {
                Alert.alert("Votación creada", "La votación se creó correctamente.");
            }

            // Volvemos al detalle del viaje pasando la votacion nueva para que
            // aparezca arriba de la lista (merge mantiene el resto de params).
            route.params?.onVotacionCreada?.(nuevaVotacion);
            navigation.goBack();
            return nuevaVotacion;
        } catch (error) {
            Alert.alert("No se pudo crear", error.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <FontAwesome6 name="arrow-left" size={18} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.title}>Nueva votación</Text>
            </View>

            {/* 1. NOMBRE DESCRIPTIVO (AC1) */}
            <Text style={styles.label}>Nombre descriptivo</Text>
            <View style={styles.inputBox}>
                <FontAwesome6 name="pen" size={14} color={colors.textMuted} />
                <TextInput
                    style={styles.input}
                    placeholder="Ej: ¿Qué hacemos el segundo día?"
                    value={titulo}
                    onChangeText={setTitulo}
                    maxLength={150}
                />
            </View>
            {errores.titulo && <Text style={styles.error}>{errores.titulo}</Text>}

            {/* 2. TIPO DE VOTACION (AC3/AC4/AC5) */}
            <Text style={styles.label}>Tipo de votación</Text>
            <View style={styles.selectorContainer}>
                <TouchableOpacity
                    style={[styles.selectorOption, tipo === "opcion_unica" && styles.selectorOptionActive]}
                    onPress={() => setTipo("opcion_unica")}
                >
                    <FontAwesome6
                        name="circle-dot"
                        size={14}
                        color={tipo === "opcion_unica" ? "#fff" : colors.textMuted}
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
                        color={tipo === "opcion_multiple" ? "#fff" : colors.textMuted}
                    />
                    <Text style={[styles.selectorOptionText, tipo === "opcion_multiple" && styles.selectorOptionTextActive]}>
                        Opción múltiple
                    </Text>
                </TouchableOpacity>
            </View>

            {/* 3. FECHA Y HORA DE CIERRE (AC1/AC6) */}
            <Text style={styles.label}>Cierre (fecha y hora)</Text>
            {Platform.OS === "web" ? (
                <View style={styles.dateBox}>
                    <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                    <input
                        type="datetime-local"
                        value={toDatetimeLocal(fechaCierre)}
                        min={toDatetimeLocal(new Date())}
                        onChange={(e) => {
                            if (!e.target.value) return;
                            setFechaCierre(new Date(e.target.value));
                        }}
                        style={{ border: "none", width: "100%", outline: "none", background: "transparent" }}
                    />
                </View>
            ) : (
                <>
                    <TouchableOpacity style={styles.dateBox} onPress={() => setMostrarFecha(true)}>
                        <FontAwesome6 name="calendar" size={15} color={colors.primary} />
                        <Text>{fechaCierreTexto()}</Text>
                    </TouchableOpacity>

                    {mostrarFecha && (
                        <DateTimePicker
                            value={fechaCierre}
                            mode="date"
                            minimumDate={new Date()}
                            onChange={(e, date) => {
                                setMostrarFecha(false);
                                if (date) {
                                    // Conservamos la hora ya elegida y luego pedimos la hora.
                                    const nueva = new Date(fechaCierre);
                                    nueva.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                                    setFechaCierre(nueva);
                                    setMostrarHora(true);
                                }
                            }}
                        />
                    )}

                    {mostrarHora && (
                        <DateTimePicker
                            value={fechaCierre}
                            mode="time"
                            onChange={(e, date) => {
                                setMostrarHora(false);
                                if (date) {
                                    const nueva = new Date(fechaCierre);
                                    nueva.setHours(date.getHours(), date.getMinutes(), 0, 0);
                                    setFechaCierre(nueva);
                                }
                            }}
                        />
                    )}
                </>
            )}
            {errores.fechaCierre && <Text style={styles.error}>{errores.fechaCierre}</Text>}

            {/* 4. PROPUESTAS (AC2) */}
            <View style={styles.propuestasHeader}>
                <Text style={styles.label}>Propuestas</Text>
                <TouchableOpacity style={styles.addChip} onPress={agregarPropuesta}>
                    <FontAwesome6 name="plus" size={11} color="#fff" />
                    <Text style={styles.addChipText}>Agregar</Text>
                </TouchableOpacity>
            </View>

            {propuestas.map((propuesta, index) => (
                <View key={index} style={styles.propuestaRow}>
                    <View style={[styles.inputBox, { flex: 1, marginBottom: 0 }]}>
                        <Text style={styles.propuestaIndex}>{index + 1}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder={`Propuesta ${index + 1}`}
                            value={propuesta}
                            onChangeText={(val) => actualizarPropuesta(index, val)}
                            maxLength={255}
                        />
                    </View>
                    <TouchableOpacity
                        style={[styles.removeButton, propuestas.length <= 2 && styles.removeButtonDisabled]}
                        onPress={() => quitarPropuesta(index)}
                        disabled={propuestas.length <= 2}
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

            <TouchableOpacity style={styles.button} onPress={handleCrear} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear votación</Text>}
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    header: {
        height: 50,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        position: "relative",
    },
    backButton: {
        position: "absolute",
        left: 0,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        ...shadows.card,
    },
    title: { fontSize: 28, fontWeight: "800", color: colors.primary, textAlign: "center" },
    label: { fontWeight: "700", color: colors.primary, marginTop: 14, marginBottom: 8 },
    inputBox: {
        backgroundColor: "#fff",
        height: 50,
        borderRadius: 12,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 5,
        ...shadows.card,
    },
    input: { flex: 1 },
    dateBox: {
        backgroundColor: "#fff",
        padding: 15,
        borderRadius: 12,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        ...shadows.card,
    },
    button: {
        marginTop: 30,
        height: 55,
        borderRadius: 12,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    buttonText: { color: "#fff", fontWeight: "800" },
    error: { color: "#dc2626", fontSize: 12, marginTop: 5, fontWeight: "600" },
    selectorContainer: {
        flexDirection: "row",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 4,
        gap: 5,
        ...shadows.card,
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
    selectorOptionActive: { backgroundColor: colors.primary },
    selectorOptionText: { fontWeight: "700", color: colors.textMuted, fontSize: 14 },
    selectorOptionTextActive: { color: "#fff" },
    propuestasHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    addChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.primary,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        marginTop: 10,
    },
    addChipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
    propuestaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    propuestaIndex: {
        fontWeight: "800",
        color: colors.textMuted,
        width: 16,
        textAlign: "center",
    },
    removeButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
        ...shadows.card,
    },
    removeButtonDisabled: { opacity: 0.5 },
});
