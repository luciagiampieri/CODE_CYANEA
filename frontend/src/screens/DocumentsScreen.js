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
    Linking,
} from "react-native";

import * as DocumentPicker from "expo-document-picker";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";

import {
    getDocumentCategories,
    getTripDocuments,
    uploadTripDocument,
} from "../services/api";

import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

// Alert.alert() no tiene implementación real en web (react-native-web no
// muestra ningún diálogo y nunca dispara el callback onPress). Por eso, en
// web usamos window.alert (bloqueante) y ejecutamos la acción manualmente
// después; en nativo usamos Alert.alert con su botón de confirmación.
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

export default function DocumentsScreen({ route, navigation }) {
    const { tripId } = route.params;

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [idCategoria, setIdCategoria] = useState(null);

    const [documentos, setDocumentos] = useState([]);
    const [loadingDocumentos, setLoadingDocumentos] = useState(true);
    const [errorDocumentos, setErrorDocumentos] = useState("");

    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);

    const [archivo, setArchivo] = useState(null);
    const [nombreDocumento, setNombreDocumento] = useState("");
    const [extensionArchivo, setExtensionArchivo] = useState("");

    const [errores, setErrores] = useState({});

    const categoriaSeleccionada = categorias.find(
        (c) => c.IdCategoriaDocumento === idCategoria
    );

    async function cargarDocumentos() {
        try {
            setLoadingDocumentos(true);
            setErrorDocumentos("");
            const data = await getTripDocuments(tripId);
            setDocumentos(data);
        } catch (error) {
            console.log("📡 No se pudieron cargar los documentos del viaje:", error);
            setErrorDocumentos(
                error?.message ||
                    "No se pudieron cargar los documentos. Intentá nuevamente más tarde."
            );
        } finally {
            setLoadingDocumentos(false);
        }
    }

    async function abrirDocumento(url) {
        try {
            await Linking.openURL(url);
        } catch (error) {
            console.log("⚠️ Error al abrir el documento:", error);
            mostrarAlertaConfirmacion(
                "Error",
                "No se pudo abrir el documento. Intentá nuevamente."
            );
        }
    }

    useEffect(() => {
        async function cargarDatos() {
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
        cargarDatos();
        cargarDocumentos();
    }, [tripId]);

    function limpiarError(campo) {
        setErrores((current) => {
            if (!current[campo]) return current;
            const next = { ...current };
            delete next[campo];
            return next;
        });
    }

    async function seleccionarArchivo() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ["application/pdf", "image/jpeg", "image/png"],
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (!result.canceled) {
                const documento = result.assets[0];

                const extension = documento.name.includes(".")
                    ? documento.name.split(".").pop()
                    : "";
                const nombreSinExtension = documento.name.replace(/\.[^/.]+$/, "");

                setArchivo(documento);
                setExtensionArchivo(extension);
                setNombreDocumento(nombreSinExtension);

                limpiarError("archivo");
            }
        } catch (error) {
            console.log("⚠️ Error al seleccionar el archivo:", error);
            mostrarAlertaConfirmacion(
                "Error",
                "No se pudo seleccionar el archivo. Intentá nuevamente."
            );
        }
    }

    function eliminarArchivo() {
        setArchivo(null);
        setNombreDocumento("");
        setExtensionArchivo("");
    }

    async function handleSubir() {
        const nuevosErrores = {};

        if (!archivo) {
            nuevosErrores.archivo = "Seleccioná un documento";
        }
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
                ? `${nombreDocumento}.${extensionArchivo}`
                : nombreDocumento;

            await uploadTripDocument(tripId, archivo, idCategoria, nombreFinal);

            await cargarDocumentos();

            mostrarAlertaConfirmacion("Éxito", "Documento subido correctamente.", () =>
                navigation.goBack()
            );
        } catch (error) {
            console.log("ERROR uploadTripDocument:", error);

            // Detectar específicamente el caso de nombre duplicado.
            // Ajustar el texto según lo que devuelva realmente el backend
            // (revisar el console.log de arriba en la consola).
            const mensajeError = (error?.message || "").toLowerCase();
            const esNombreDuplicado =
                mensajeError.includes("duplicate") ||
                mensajeError.includes("already exists") ||
                mensajeError.includes("resource already exists") ||
                mensajeError.includes("23505");

            if (esNombreDuplicado) {
                setErrores({ nombre: "Ya existe un documento con ese nombre. Elegí otro." });
            } else {
                mostrarAlertaConfirmacion(
                    "Error",
                    error?.message || "No se pudo subir el documento."
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
                    keyboardDismissMode="none"
                >
                    <View style={styles.hero}>
                        <View style={styles.heroTopRow}>
                            <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
                            <View />
                        </View>

                        <Text style={styles.heroEyebrow}>Documentación del viaje</Text>
                        <Text style={styles.heroTitle}>Subir documento</Text>
                        <Text style={styles.heroCopy}>
                            Adjuntá archivos importantes para este viaje.
                        </Text>
                    </View>

                    <View style={styles.body}>
                        <View style={styles.card}>
                            <Text style={styles.cardTitle}>Documentos del viaje</Text>

                            {loadingDocumentos ? (
                                <View style={styles.centeredInline}>
                                    <ActivityIndicator size="small" color={colors.primary} />
                                </View>
                            ) : errorDocumentos ? (
                                <Text style={styles.fieldError}>{errorDocumentos}</Text>
                            ) : documentos.length === 0 ? (
                                <Text style={styles.emptyText}>
                                    Todavía no se subió ningún documento a este viaje.
                                </Text>
                            ) : (
                                <View style={styles.documentList}>
                                    {documentos.map((documento) => (
                                        <Pressable
                                            key={documento.IdDocumento}
                                            style={styles.documentRow}
                                            onPress={() => abrirDocumento(documento.UrlArchivo)}
                                        >
                                            <FontAwesome6
                                                name="file-lines"
                                                size={18}
                                                color={colors.primary}
                                                style={{ marginRight: 12 }}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.fileName}>{documento.NombreArchivo}</Text>
                                                <Text style={styles.fileSize}>
                                                    {documento.NombreCategoria} · Subido por {documento.NombreUsuarioSubida}
                                                </Text>
                                            </View>
                                            <FontAwesome6 name="up-right-from-square" size={14} color={colors.textSecondary} />
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        </View>

                        <View style={[styles.card, { marginTop: spacing.lg }]}>
                            <Text style={styles.cardTitle}>Información del documento</Text>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Documento del viaje</Text>

                                {!archivo ? (
                                    <Pressable
                                        style={[
                                            styles.uploadBox,
                                            errores.archivo && styles.inputError,
                                        ]}
                                        onPress={seleccionarArchivo}
                                    >
                                        <FontAwesome6
                                            name="cloud-arrow-up"
                                            size={40}
                                            color={colors.primary}
                                        />
                                        <Text style={styles.uploadTitle}>Seleccionar archivo</Text>
                                        <Text style={styles.uploadDescription}>
                                            PDF, JPG, JPEG o PNG
                                        </Text>
                                    </Pressable>
                                ) : (
                                    <View style={styles.fileCard}>
                                        <FontAwesome6 name="file" size={22} color={colors.primary} />

                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Text style={styles.fileName} numberOfLines={1}>
                                                {archivo.name}
                                            </Text>
                                            <Text style={styles.fileSize}>
                                                {archivo.size ? `${(archivo.size / 1024).toFixed(1)} KB` : ""}
                                            </Text>
                                        </View>

                                        <Pressable onPress={eliminarArchivo} hitSlop={15}>
                                            <FontAwesome6
                                                name="trash"
                                                size={16}
                                                color={colors.danger || "#dc2626"}
                                            />
                                        </Pressable>
                                    </View>
                                )}
                                {errores.archivo ? (
                                    <Text style={styles.fieldError}>{errores.archivo}</Text>
                                ) : null}
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
                                        placeholder="Ej: Seguro médico"
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
                        </View>

                        <View style={styles.actions}>
                            <PrimaryButton
                                label={saving ? "Subiendo..." : "Subir documento"}
                                loading={saving}
                                onPress={handleSubir}
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
        backgroundColor: colors.primarySoft,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.xl,
    },
    heroTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    heroEyebrow: {
        ...textStyles.meta,
        color: "#dbe6fb",
        marginTop: spacing.lg,
    },
    heroTitle: {
        ...textStyles.screenTitle,
        color: colors.textInverse,
        marginTop: spacing.xs,
    },
    heroCopy: {
        ...textStyles.body,
        color: "#edf2ff",
        marginTop: spacing.xs,
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
    centeredInline: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.md,
    },
    documentList: {
        gap: spacing.sm,
    },
    documentRow: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceMuted || colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
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
    uploadBox: {
        minHeight: 170,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: "dashed",
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    uploadTitle: {
        ...textStyles.bodyStrong,
        color: colors.primary,
        marginTop: spacing.sm,
    },
    uploadDescription: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: spacing.xs,
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
});