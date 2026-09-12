import React, { useState, useEffect } from "react";
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
    Modal,
    KeyboardAvoidingView,
} from "react-native";

import { FontAwesome6 } from "@expo/vector-icons";

import { createRepositorioItem, updateRepositorioItem } from "../services/api";
import { colors, radii, spacing, shadows, textStyles } from "../theme/tokens";

const TIPOS = [
    { key: "enlace", label: "Enlace", icon: "link" },
    { key: "direccion", label: "Dirección", icon: "location-dot" },
    { key: "contacto", label: "Contacto", icon: "address-book" },
    { key: "otro", label: "Otro", icon: "circle-info" },
];

function avisar(titulo, mensaje) {
    if (Platform.OS === "web") {
        window.alert(mensaje);
    } else {
        Alert.alert(titulo, mensaje);
    }
}

export default function GuardarInformacionScreen({ visible, onClose, tripId, item, onItemGuardado }) {
    const editando = Boolean(item);

    const [titulo, setTitulo] = useState("");
    const [tipo, setTipo] = useState("enlace");
    const [contenido, setContenido] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [esPublico, setEsPublico] = useState(true);
    const [errores, setErrores] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setTitulo(item?.Titulo || "");
            setTipo(item?.Tipo || "enlace");
            setContenido(item?.Contenido || "");
            setDescripcion(item?.Descripcion || "");
            setEsPublico(item ? item.EsPublico : true);
            setErrores({});
        } else {
            setTitulo("");
            setTipo("enlace");
            setContenido("");
            setDescripcion("");
            setEsPublico(true);
            setErrores({});
        }
    }, [visible, item]);

    function validar() {
        const nuevos = {};

        if (!titulo.trim()) {
            nuevos.titulo = "El título es obligatorio";
        }
        if (!contenido.trim()) {
            nuevos.contenido = "El contenido es obligatorio";
        }

        setErrores(nuevos);
        return Object.keys(nuevos).length === 0;
    }

    async function handleGuardar() {
        if (!validar()) return;

        const payload = {
            titulo: titulo.trim(),
            tipo,
            contenido: contenido.trim(),
            descripcion: descripcion.trim() || null,
            esPublico,
        };

        try {
            setSaving(true);
            const respuesta = editando
                ? await updateRepositorioItem(tripId, item.IdItemRepositorio, payload)
                : await createRepositorioItem(tripId, payload);

            avisar(
                editando ? "Actualizado" : "Guardado",
                respuesta?.message || "La información se guardó correctamente."
            );
            
            if (onItemGuardado) onItemGuardado(respuesta.item);
            onClose();
        } catch (error) {
            avisar("No se pudo guardar", error.message || "Ocurrió un error al guardar la información.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.overlay}
            >
                <View style={styles.sheet}>
                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <View style={styles.headerRow}>
                            <Text style={styles.title}>{editando ? "Editar información" : "Nueva información"}</Text>
                            <TouchableOpacity onPress={onClose} testID="close-modal-button">
                                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.content}>
                            <Text style={styles.label}>Título</Text>
                            <View style={[styles.inputBox, errores.titulo && { borderColor: "#dc2626" }]}>
                                <FontAwesome6 name="pen" size={14} color={colors.textMuted} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej: Hotel del viaje"
                                    placeholderTextColor="#00000059"
                                    value={titulo}
                                    onChangeText={setTitulo}
                                    maxLength={150}
                                />
                            </View>
                            {errores.titulo && <Text style={styles.error}>{errores.titulo}</Text>}

                            <Text style={styles.label}>Tipo</Text>
                            <View style={styles.tipoGrid}>
                                {TIPOS.map((t) => (
                                    <TouchableOpacity
                                        key={t.key}
                                        style={[styles.tipoOption, tipo === t.key && styles.tipoOptionActive]}
                                        onPress={() => setTipo(t.key)}
                                    >
                                        <FontAwesome6 name={t.icon} size={14} color={tipo === t.key ? "#fff" : colors.textMuted} />
                                        <Text style={[styles.tipoOptionText, tipo === t.key && styles.tipoOptionTextActive]}>
                                            {t.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>Contenido</Text>
                            <View style={[styles.inputBox, errores.contenido && { borderColor: "#dc2626" }]}>
                                <FontAwesome6 name="align-left" size={14} color={colors.textMuted} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="El enlace, la dirección o el contacto"
                                    placeholderTextColor="#00000059"
                                    value={contenido}
                                    onChangeText={setContenido}
                                />
                            </View>
                            {errores.contenido && <Text style={styles.error}>{errores.contenido}</Text>}

                            <Text style={styles.label}>Descripción (opcional)</Text>
                            <View style={styles.inputBox}>
                                <FontAwesome6 name="note-sticky" size={14} color={colors.textMuted} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Alguna aclaración adicional"
                                    placeholderTextColor="#00000059"
                                    value={descripcion}
                                    onChangeText={setDescripcion}
                                />
                            </View>

                            <Text style={styles.label}>Visibilidad</Text>
                            <View style={styles.selectorContainer}>
                                <TouchableOpacity
                                    style={[styles.selectorOption, esPublico && styles.selectorOptionActive]}
                                    onPress={() => setEsPublico(true)}
                                >
                                    <FontAwesome6 name="users" size={14} color={esPublico ? "#fff" : colors.textMuted} />
                                    <Text style={[styles.selectorOptionText, esPublico && styles.selectorOptionTextActive]}>
                                        Público
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.selectorOption, !esPublico && styles.selectorOptionActive]}
                                    onPress={() => setEsPublico(false)}
                                >
                                    <FontAwesome6 name="lock" size={14} color={!esPublico ? "#fff" : colors.textMuted} />
                                    <Text style={[styles.selectorOptionText, !esPublico && styles.selectorOptionTextActive]}>
                                        Privado
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
                                {esPublico
                                    ? "Visible para todos los participantes del viaje."
                                    : "Solo vos vas a poder verlo."}
                            </Text>

                            <TouchableOpacity style={styles.button} onPress={handleGuardar} disabled={saving}>
                                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{editando ? "Guardar cambios" : "Guardar información"}</Text>}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
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
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.xs,
    },
    title: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 20,
    },
    content: {
        paddingTop: spacing.sm,
        paddingBottom: spacing.lg,
    },
    label: { 
        ...textStyles.label,
        textTransform: "none", 
        color: colors.primary, 
        marginTop: 14, 
        marginBottom: 8 
    },
    inputBox: {
        backgroundColor: "#fff",
        minHeight: 52,
        borderRadius: radii.md || 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: 5,
        borderWidth: 1,
        borderColor: colors.border || "#e6edf5",
    },
    input: {
        flex: 1,
        minHeight: 24,
        fontSize: 15,
        color: colors.textPrimary,
        textAlignVertical: "center",
        ...textStyles.body,
    },
    button: {
        marginTop: 30,
        height: 55,
        borderRadius: radii.md || 12,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    buttonText: { color: "#fff", fontWeight: "800", ...textStyles.body },
    error: { color: "#dc2626", fontSize: 12, marginTop: 5, fontWeight: "600" },
    tipoGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tipoOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: radii.md || 10,
    },
    tipoOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tipoOptionText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
    tipoOptionTextActive: { color: "#fff" },
    selectorContainer: {
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: radii.md || 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 4,
        gap: 5,
    },
    selectorOption: {
        flex: 1,
        flexDirection: "row",
        height: 42,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
    },
    selectorOptionActive: { backgroundColor: colors.primary },
    selectorOptionText: { fontWeight: "700", color: colors.textMuted, fontSize: 14 },
    selectorOptionTextActive: { color: "#fff" },
});