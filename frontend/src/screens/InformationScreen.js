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

import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import { createRepositorioItem, updateRepositorioItem } from "../services/api";
import { colors, shadows, textStyles } from "../theme/tokens";

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

export default function GuardarInformacionScreen({ route, navigation }) {
    const { tripId, item } = route.params || {};
    const editando = Boolean(item);

    const [titulo, setTitulo] = useState(item?.Titulo || "");
    const [tipo, setTipo] = useState(item?.Tipo || "enlace");
    const [contenido, setContenido] = useState(item?.Contenido || "");
    const [descripcion, setDescripcion] = useState(item?.Descripcion || "");
    const [esPublico, setEsPublico] = useState(item ? item.EsPublico : true);
    const [errores, setErrores] = useState({});
    const [saving, setSaving] = useState(false);

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

            route.params?.onItemGuardado?.(respuesta.item);
            navigation.goBack();
        } catch (error) {
            avisar("No se pudo guardar", error.message || "Ocurrió un error al guardar la información.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScreenContainer fullWidth padded={false}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <View style={styles.heroTopRow}>
                        <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} tone="light" />
                    </View>
                    <Text style={styles.heroTitle}>{editando ? "Editar información" : "Nueva información"}</Text>
                </View>

            <View style={styles.content}>
            <Text style={styles.label}>Título</Text>
            <View style={styles.inputBox}>
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
            <View style={styles.inputBox}>
                <FontAwesome6 name="align-left" size={14} color={colors.textMuted} />
                <TextInput
                    style={styles.input}
                    placeholder="El enlace, la dirección o el contacto"
                    placeholderTextColor="#00000059"
                    value={contenido}
                    onChangeText={setContenido}
                    multiline
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
                    multiline
                />
            </View>

            <Text style={styles.label}>Visibilidad</Text>
            <View style={styles.selectorContainer}>
                <TouchableOpacity
                    style={[styles.selectorOption, esPublico && styles.selectorOptionActive]}
                    onPress={() => setEsPublico(true)}
                >
                    <FontAwesome6 name="users" size={14} color={esPublico ? "#fff" : colors.overlayStrong} />
                    <Text style={[styles.selectorOptionText, esPublico && styles.selectorOptionTextActive]}>
                        Público
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.selectorOption, !esPublico && styles.selectorOptionActive]}
                    onPress={() => setEsPublico(false)}
                >
                    <FontAwesome6 name="lock" size={14} color={!esPublico ? "#fff" : colors.overlayStrong} />
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
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingBottom: 40 },
    content: { padding: 20 },
    hero: {
        backgroundColor: colors.primary,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 28,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        alignItems: "center",
    },
    heroTopRow: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
    },
    heroTitle: { ...textStyles.tripTitle, fontSize: 26, color: colors.textInverse, textAlign: "center", marginTop: 8 },
    label: { fontWeight: "700", color: colors.primary, marginTop: 14, marginBottom: 8 },
    inputBox: {
        backgroundColor: "#fff",
        minHeight: 56,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        marginBottom: 5,
        borderWidth: 1.5,
        borderColor: "#e6edf5",
        ...shadows.card,
    },
    input: {
        flex: 1,
        minHeight: 24,
        fontSize: 15,
        fontWeight: "600",
        color: colors.primary,
        textAlignVertical: "center",
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
    tipoGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tipoOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#fff",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        ...shadows.card,
    },
    tipoOptionActive: { backgroundColor: colors.primary },
    tipoOptionText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
    tipoOptionTextActive: { color: "#fff" },
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
    selectorOptionText: { fontWeight: "700", color: colors.overlayStrong, fontSize: 14 },
    selectorOptionTextActive: { color: "#fff" },
});