import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
    TextInput,
    Alert,
    ActivityIndicator,
    Modal,
    FlatList,
    Platform,
    KeyboardAvoidingView,
    TouchableOpacity,
} from "react-native";

import * as DocumentPicker from "expo-document-picker";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";

import {
    getDocumentCategories,
    updateTripDocument,
} from "../services/api";

import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

function mostrarAlertaConfirmacion(titulo, mensaje, onAceptar) {
    if (Platform.OS === "web") {
        window.alert(`${titulo}\n\n${mensaje}`);
        if (onAceptar) onAceptar();
    } else {
        Alert.alert(
            titulo,
            mensaje,
            onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined
        );
    }
}

export default function EditDocumentScreen({ route, navigation }) {
    const { tripId, documento } = route.params;

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [idCategoria, setIdCategoria] = useState(documento?.IdCategoriaDocumento || null);
    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);

    const [archivoNuevo, setArchivoNuevo] = useState(null);

    const nombreOriginal = documento?.NombreArchivo || "";
    const puntoIndex = nombreOriginal.lastIndexOf(".");
    const extInicial = puntoIndex !== -1 ? nombreOriginal.substring(puntoIndex + 1) : "";
    const nombreBaseInicial = puntoIndex !== -1 ? nombreOriginal.substring(0, puntoIndex) : nombreOriginal;

    const [nombreDocumento, setNombreDocumento] = useState(nombreBaseInicial);
    const [extensionArchivo, setExtensionArchivo] = useState(extInicial);

    const [esPublico, setEsPublico] = useState(documento?.EsPublico ?? true);

    const [errores, setErrores] = useState({});

    const categoriaSeleccionada = categorias.find(
        (c) => c.IdCategoriaDocumento === idCategoria
    );

    useEffect(() => {
        async function cargarCategorias() {
            try {
                setLoading(true);
                setLoadError("");
                const data = await getDocumentCategories();
                setCategorias(data);
            } catch (error) {
                console.log("📡 No se pudieron cargar las categorías de documentos:", error);
                setLoadError(
                    error?.message ||
                        "No se pudieron cargar las categorías. Intentá nuevamente más tarde."
                );
            } finally {
                setLoading(false);
            }
        }
        cargarCategorias();
    }, []);

    function limpiarError(campo) {
        setErrores((current) => {
            if (!current[campo]) return current;
            const next = { ...current };
            delete next[campo];
            return next;
        });
    }

    async function seleccionarNuevoArchivo() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ["application/pdf", "image/jpeg", "image/png"],
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (!result.canceled) {
                const doc = result.assets[0];
                const ext = doc.name.includes(".") ? doc.name.split(".").pop() : "";

                const extensionesPermitidas = ["pdf", "jpg", "jpeg", "png"];

                if (!extensionesPermitidas.includes(ext)) {
                    mostrarAlertaConfirmacion(
                        "Archivo inválido",
                        "Solo se permiten archivos PDF, JPG, JPEG o PNG."
                    );
                    return;
                }

                setArchivoNuevo(doc);
                setExtensionArchivo(ext); 
                limpiarError("archivo");
            }
        } catch (error) {
            console.log("⚠️ Error al seleccionar el nuevo archivo:", error);
            mostrarAlertaConfirmacion(
                "Error",
                "No se pudo seleccionar el archivo. Intentá nuevamente."
            );
        }
    }

    function eliminarNuevoArchivo() {
        setArchivoNuevo(null);
        // Restauramos la extensión original del documento por seguridad si cancela el reemplazo
        const extOriginal = puntoIndex !== -1 ? nombreOriginal.substring(puntoIndex + 1) : "";
        setExtensionArchivo(extOriginal);
    }

    async function handleActualizar() {
        const nuevosErrores = {};

        if (!nombreDocumento.trim()) {
            nuevosErrores.nombre = "El nombre del documento es obligatorio";
        }
        if (!idCategoria) {
            nuevosErrores.categoria = "Seleccioná una categoría";
        }

        setErrores(nuevosErrores);

        if (Object.keys(nuevosErrores).length > 0) {
            return;
        }

        try {
            setSaving(true);

            const nombreFinal = extensionArchivo
                ? `${nombreDocumento.trim()}.${extensionArchivo}`
                : nombreDocumento.trim();

            await updateTripDocument(
                tripId,
                documento.IdDocumento,
                archivoNuevo, 
                idCategoria,
                nombreFinal,
                esPublico
            );

            mostrarAlertaConfirmacion("Éxito", "Documento actualizado correctamente.", () =>
                navigation.goBack()
            );
        } catch (error) {
            console.log("ERROR updateTripDocument:", error);
            const mensajeError = (error?.message || "").toLowerCase();
            const esNombreDuplicado =
                mensajeError.includes("duplicate") ||
                mensajeError.includes("already exists") ||
                mensajeError.includes("resource already exists") ||
                mensajeError.includes("23505");

            if (esNombreDuplicado) {
                setErrores({ nombre: "Ya existe otro documento con ese nombre en este viaje." });
            } else {
                mostrarAlertaConfirmacion(
                    "Error",
                    error?.message || "No se pudo actualizar el documento."
                );
            }
        } finally {
            setSaving(false);
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
                    <PrimaryButton
                        label="Volver"
                        onPress={() => navigation.goBack()}
                        variant="secondary"
                    />
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
                >
                    <View style={styles.hero}>
                        <View style={styles.heroTopRow}>
                            <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} tone="light" />
                        </View>
                        <Text style={styles.heroTitle}>Editar documento</Text>
                        <Text style={styles.heroCopy}>
                            Modificá el nombre, la categoría o reemplazá el archivo adjunto.
                        </Text>
                    </View>

                    <View style={styles.body}>
                        <View style={[styles.card, { marginTop: spacing.lg }]}>
                            <Text style={styles.cardTitle}>Información del documento</Text>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Archivo</Text>

                                {!archivoNuevo ? (
                                    <Pressable
                                        style={styles.fileCardActive}
                                        onPress={seleccionarNuevoArchivo}
                                    >
                                        <FontAwesome6 name="file-lines" size={20} color={colors.primary} />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={styles.fileName} numberOfLines={1}>
                                                {documento.NombreArchivo}
                                            </Text>
                                            <Text style={styles.fileSize}>
                                                Archivo actual (Tocá para reemplazarlo)
                                            </Text>
                                        </View>
                                        <FontAwesome6 name="arrows-rotate" size={14} color={colors.primary} />
                                    </Pressable>
                                ) : (
                                    <View style={styles.fileCard}>
                                        <FontAwesome6 name="file" size={22} color={colors.primary} />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={styles.fileName} numberOfLines={1}>
                                                {archivoNuevo.name}
                                            </Text>
                                            <Text style={styles.fileSize}>
                                                Nuevo archivo seleccionado ({archivoNuevo.size ? `${(archivoNuevo.size / 1024).toFixed(1)} KB` : ""})
                                            </Text>
                                        </View>
                                        <Pressable onPress={eliminarNuevoArchivo} hitSlop={15}>
                                            <FontAwesome6
                                                name="trash"
                                                size={16}
                                                color={colors.danger || "#dc2626"}
                                            />
                                        </Pressable>
                                    </View>
                                )}
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Nombre del documento</Text>
                                <View
                                    style={[
                                        styles.input,
                                        styles.inputRow,
                                        errores.nombre && styles.inputError,
                                    ]}
                                >
                                    <FontAwesome6 name="pen" size={13} color={colors.textMuted} />
                                    <TextInput
                                        style={styles.inputInner}
                                        value={nombreDocumento}
                                        onChangeText={(text) => {
                                            setNombreDocumento(text);
                                            limpiarError("nombre");
                                        }}
                                        placeholder="Nombre del documento"
                                        placeholderTextColor={colors.textMuted}
                                    />
                                    {extensionArchivo ? (
                                        <Text style={styles.extensionText}>{`.${extensionArchivo}`}</Text>
                                    ) : null}
                                </View>
                                {errores.nombre ? (
                                    <Text style={styles.fieldError}>{errores.nombre}</Text>
                                ) : null}
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Categoría</Text>
                                <Pressable
                                    style={[
                                        styles.dateButton,
                                        errores.categoria && styles.inputError,
                                    ]}
                                    onPress={() => setModalCategoriaVisible(true)}
                                >
                                    <View style={styles.dropdownLeftContent}>
                                        <FontAwesome6
                                            name="tags"
                                            size={14}
                                            color={categoriaSeleccionada ? colors.primary : colors.textMuted}
                                            style={{ marginRight: 10, width: 18, textAlign: "center" }}
                                        />
                                        <Text
                                            style={
                                                idCategoria
                                                    ? styles.dateButtonText
                                                    : styles.datePlaceholder
                                            }
                                        >
                                            {categoriaSeleccionada
                                                ? categoriaSeleccionada.Nombre
                                                : "Seleccioná una categoría"}
                                        </Text>
                                    </View>
                                    <FontAwesome6
                                        name="chevron-down"
                                        size={13}
                                        color={colors.textMuted}
                                    />
                                </Pressable>
                                {errores.categoria ? (
                                    <Text style={styles.fieldError}>{errores.categoria}</Text>
                                ) : null}
                            </View>
                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Visibilidad</Text>
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
                            </View>
                        </View>

                        <View style={styles.actions}>
                            <PrimaryButton
                                label={saving ? "Guardando..." : "Guardar cambios"}
                                loading={saving}
                                onPress={handleActualizar}
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

            <Modal
                visible={modalCategoriaVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalCategoriaVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setModalCategoriaVisible(false)}
                >
                    <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation?.()}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Seleccionar categoría</Text>
                            <Pressable onPress={() => setModalCategoriaVisible(false)} hitSlop={10}>
                                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                            </Pressable>
                        </View>

                        <FlatList
                            data={categorias}
                            keyExtractor={(item) => item.IdCategoriaDocumento.toString()}
                            renderItem={({ item }) => {
                                const esActivo = idCategoria === item.IdCategoriaDocumento;
                                return (
                                    <Pressable
                                        style={[styles.modalItem, esActivo && styles.modalItemActive]}
                                        onPress={() => {
                                            setIdCategoria(item.IdCategoriaDocumento);
                                            limpiarError("categoria");
                                            setModalCategoriaVisible(false);
                                        }}
                                    >
                                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                            <FontAwesome6
                                                name="tags"
                                                size={15}
                                                color={esActivo ? colors.primary : colors.textSecondary}
                                                style={{ marginRight: 12, width: 20, textAlign: "center" }}
                                            />
                                            <Text
                                                style={[
                                                    styles.modalItemText,
                                                    esActivo && styles.modalItemTextActive,
                                                ]}
                                            >
                                                {item.Nombre}
                                            </Text>
                                        </View>
                                        {esActivo && (
                                            <FontAwesome6 name="check" size={13} color={colors.primary} />
                                        )}
                                    </Pressable>
                                );
                            }}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>No hay categorías disponibles.</Text>
                            }
                        />
                    </Pressable>
                </Pressable>
            </Modal>
        </ScreenContainer>
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
        paddingTop: spacing.sm,
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
    heroCopy: {
        ...textStyles.body,
        color: "rgba(255,255,255,0.8)",
        marginTop: spacing.xs,
        textAlign: "center",
    },
    body: {
        backgroundColor: colors.background,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
    },
    card: {
        ...surfaces.card,
        padding: spacing.lg,
        gap: spacing.md,
    },
    cardTitle: {
        ...textStyles.tripTitle,
        color: colors.primary,
        fontSize: 22,
    },
    field: { marginTop: spacing.md },
    fieldLabel: {
        ...textStyles.label,
        color: colors.primary,
        marginBottom: spacing.xs,
    },
    fieldError: {
        ...textStyles.meta,
        color: colors.danger || "#dc2626",
        marginTop: spacing.xs,
    },
    input: {
        minHeight: 52,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        color: colors.textPrimary,
        ...textStyles.body,
    },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    inputInner: {
        flex: 1,
        color: colors.textPrimary,
        ...textStyles.body,
    },
    inputError: { borderColor: colors.danger || "#dc2626" },
    extensionText: {
        ...textStyles.bodyStrong,
        color: colors.textMuted,
    },
    fileCard: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    fileCardActive: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceAlt || "#f0f4f8",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },
    fileName: {
        ...textStyles.bodyStrong,
        color: colors.textPrimary,
    },
    fileSize: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 2,
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
    dropdownLeftContent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    actions: {
        flexDirection: Platform.OS === "web" ? "row" : "column",
        gap: spacing.md,
        marginTop: spacing.xl,
    },
    actionPrimary: { flex: 1 },
    actionSecondary: { flex: 1 },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        padding: spacing.lg,
    },
    modalContainer: {
        backgroundColor: colors.surface,
        width: "100%",
        maxWidth: 480,
        maxHeight: "70%",
        borderRadius: radii.md,
        padding: spacing.lg,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.md,
        paddingBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        ...textStyles.bodyStrong,
        fontSize: 18,
        color: colors.primary,
    },
    modalItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing.sm + 4,
        paddingHorizontal: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
    },
    modalItemActive: {
        backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#f0f4f8",
        borderRadius: radii.sm || 8,
    },
    modalItemText: {
        ...textStyles.body,
        color: colors.textPrimary,
    },
    modalItemTextActive: {
        color: colors.primary,
        fontWeight: "700",
    },
    emptyText: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
        paddingVertical: spacing.lg,
    },
selectorContainer: {
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderRadius: radii.md,
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
    selectorOptionActive: {
        backgroundColor: colors.primary,
    },
    selectorOptionText: {
        ...textStyles.body,
        color: colors.textMuted,
        fontWeight: "600",
    },
    selectorOptionTextActive: {
        color: "#fff",
        fontWeight: "700",
    },
});