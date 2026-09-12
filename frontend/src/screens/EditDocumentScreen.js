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


export default function EditDocumentScreen({ visible, onClose, tripId, documento, onDocumentoEditado }) {

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [idCategoria, setIdCategoria] = useState(null);
    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
    const [archivoNuevo, setArchivoNuevo] = useState(null);
    const [nombreDocumento, setNombreDocumento] = useState("");
    const [extensionArchivo, setExtensionArchivo] = useState("");
    const [esPublico, setEsPublico] = useState(true);
    const [errores, setErrores] = useState({});

    useEffect(() => {
        if (visible && documento) {
            const nombreOriginal = documento?.NombreArchivo || "";
            const puntoIndex = nombreOriginal.lastIndexOf(".");
            const extInicial = puntoIndex !== -1 ? nombreOriginal.substring(puntoIndex + 1) : "";
            const nombreBaseInicial = puntoIndex !== -1 ? nombreOriginal.substring(0, puntoIndex) : nombreOriginal;

            setNombreDocumento(nombreBaseInicial);
            setExtensionArchivo(extInicial);
            setIdCategoria(documento?.IdCategoriaDocumento || null);
            setEsPublico(documento?.EsPublico ?? true);
            setArchivoNuevo(null);
            setErrores({});
        }
    }, [visible, documento]);

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
        
        if (visible) {
            cargarCategorias();
        }
    }, [visible]);

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

                if (!extensionesPermitidas.includes(ext.toLowerCase())) {
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
        const nombreOriginal = documento?.NombreArchivo || "";
        const puntoIndex = nombreOriginal.lastIndexOf(".");
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

            mostrarAlertaConfirmacion("Éxito", "Documento actualizado correctamente.", () => {
                if (onDocumentoEditado) onDocumentoEditado();
                onClose();
            });
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

    if (!documento) return null;

    return (
        <>
            <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
                <View style={styles.overlay}>
                    <View style={styles.sheet}>
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.headerRow}>
                                <Text style={styles.title}>Editar documento</Text>
                                <TouchableOpacity onPress={onClose}>
                                    <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                                </TouchableOpacity>
                            </View>

                            {loading ? (
                                <View style={styles.center}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                            ) : loadError ? (
                                <View style={styles.center}>
                                    <Text style={styles.error}>{loadError}</Text>
                                    <PrimaryButton label="Cerrar" onPress={onClose} variant="secondary" />
                                </View>
                            ) : (
                                <View style={styles.content}>
                                    <Text style={styles.label}>Archivo</Text>

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

                                    <Text style={styles.label}>Nombre del documento</Text>
                                    <View
                                        style={[
                                            styles.inputBox,
                                            errores.nombre && { borderColor: "#dc2626" },
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
                                        <Text style={styles.error}>{errores.nombre}</Text>
                                    ) : null}

                                    <Text style={styles.label}>Categoría</Text>
                                    <TouchableOpacity
                                        style={[
                                            styles.dropdownButton,
                                            errores.categoria && { borderColor: "#dc2626" },
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
                                                        ? styles.dropdownText
                                                        : styles.dropdownPlaceholder
                                                }
                                            >
                                                {categoriaSeleccionada
                                                    ? categoriaSeleccionada.Nombre
                                                    : "Seleccioná una categoría"}
                                            </Text>
                                        </View>
                                        <FontAwesome6
                                            name="chevron-down"
                                            size={14}
                                            color={colors.textMuted}
                                        />
                                    </TouchableOpacity>
                                    {errores.categoria ? (
                                        <Text style={styles.error}>{errores.categoria}</Text>
                                    ) : null}

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

                                    <TouchableOpacity style={styles.button} onPress={handleActualizar} disabled={saving}>
                                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar cambios</Text>}
                                    </TouchableOpacity>

                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={modalCategoriaVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalCategoriaVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlayC}
                    onPress={() => setModalCategoriaVisible(false)}
                >
                    <Pressable style={styles.modalContainerC} onPress={(e) => e.stopPropagation?.()}>
                        <View style={styles.modalHeaderC}>
                            <Text style={styles.modalTitleC}>Seleccionar categoría</Text>
                            <Pressable onPress={() => setModalCategoriaVisible(false)} hitSlop={10}>
                                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
                            </Pressable>
                        </View>

                        <FlatList
                            data={categorias}
                            keyExtractor={(item) => item.IdCategoriaDocumento.toString()}
                            renderItem={({ item, index }) => {
                                const esActivo = idCategoria === item.IdCategoriaDocumento;
                                const esElUltimo = index === categorias.length - 1;
                                return (
                                    <Pressable
                                        style={[styles.modalItemC, esActivo && styles.modalItemActiveC, esElUltimo && { borderBottomWidth: 0 }]}
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
                                                    styles.modalItemTextC,
                                                    esActivo && styles.modalItemTextActiveC,
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
                                <Text style={styles.emptyTextC}>No hay categorías disponibles.</Text>
                            }
                        />
                    </Pressable>
                </Pressable>
            </Modal>
        </>
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
    center: {
        paddingVertical: 60,
        alignItems: "center",
        justifyContent: "center",
    },
    content: {
        paddingTop: spacing.sm,
        paddingBottom: spacing.lg,
    },
    label: {
        ...textStyles.label,
        textTransform: "none",
        color: colors.primary,
        marginTop: spacing.md,
        marginBottom: spacing.xs,
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
    inputInner: {
        flex: 1,
        color: colors.textPrimary,
        paddingVertical: 8,
        ...textStyles.body,
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
    },
    dropdownPlaceholder: {
        ...textStyles.body,
        color: colors.textMuted,
    },
    dropdownText: {
        ...textStyles.body,
        color: colors.textPrimary,
    },
    button: {
        marginTop: spacing.xl,
        marginBottom: spacing.md,
        minHeight: 48,
        borderRadius: radii.md,
        backgroundColor: colors.primary,
        justifyContent: "center",
        alignItems: "center",
    },
    buttonText: {
        color: "#fff",
        fontWeight: "700",
        ...textStyles.body,
    },
    error: {
        color: "#dc2626",
        fontSize: 12,
        marginTop: 5,
        fontWeight: "600",
    },
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
    modalOverlayC: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        padding: spacing.lg,
    },
    modalContainerC: {
        backgroundColor: colors.surface,
        width: "100%",
        maxWidth: 480,
        maxHeight: "70%",
        borderRadius: radii.md,
        padding: spacing.lg,
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
    emptyTextC: {
        ...textStyles.meta,
        color: colors.textSecondary,
        textAlign: "center",
        paddingVertical: spacing.lg,
    },
});