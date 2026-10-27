import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  TouchableOpacity,
  Animated,
} from "react-native";
import Modal from "../components/ui/AppModal";

import * as DocumentPicker from "expo-document-picker";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import AddGastoScreen from "./AddGastoScreen";

import {
    getDocumentCategories,
    getTripStorage,
    uploadTripDocument,
} from "../services/api";

import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

import { esErrorDeLimite, irAPlanes, mostrarLimiteAlcanzado } from "../utils/limitesPlan";

import { appAlert } from "../components/ui/AppDialog";
import { TIPOS_CATEGORIA, iconoDeCategoria } from "../utils/iconosCategorias";

const BYTES_POR_MB = 1024 * 1024;

function mostrarAlertaConfirmacion(titulo, mensaje, onAceptar) {
    appAlert(
        titulo,
        mensaje,
        onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined
    );
}

function formatearMb(valor) {
    const numero = Number(valor ?? 0);
    return Number.isInteger(numero) ? `${numero}` : numero.toFixed(1);
}

const iconoCategoria = (categoria) =>
    iconoDeCategoria(TIPOS_CATEGORIA.DOCUMENTOS, categoria?.Nombre, categoria?.Icono);


export default function DocumentsScreen({
    visible,
    onClose,
    tripId,
    tripMoneda,
    tripFechaInicio = null,
    tripFechaFin = null,
    onDocumentoSubido,
    // Subida desde una tarea del checklist (las entradas, el pasaje, la reserva):
    // { IdChecklist, Nombre, IdCategoriaDocumento?, EsPublico?, NombreSugerido? }.
    // Se preselecciona la categoría y la visibilidad y el documento queda en la tarea.
    tarea = null,
}) {

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);

    const [categorias, setCategorias] = useState([]);
    const [idCategoria, setIdCategoria] = useState(null);
    const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);

    const [archivo, setArchivo] = useState(null);
    const [nombreDocumento, setNombreDocumento] = useState("");
    const [extensionArchivo, setExtensionArchivo] = useState("");

    const [esPublico, setEsPublico] = useState(true);

    const [errores, setErrores] = useState({});

    const [almacenamiento, setAlmacenamiento] = useState(null);

    const [gastoSugeridoModalVisible, setGastoSugeridoModalVisible] = useState(false);
    const [datosGastoSugerido, setDatosGastoSugerido] = useState(null);
    const gastoRegistradoRef = useRef(false);
    const subiendoRef = useRef(false);
    // El nombre propuesto por la tarea se usa solo para el primer documento.
    const usarNombreTareaRef = useRef(true);

    const categoriaSeleccionada = categorias.find(
        (c) => c.IdCategoriaDocumento === idCategoria
    );

    const almacenamientoLimitado = Boolean(almacenamiento) && !almacenamiento.ilimitado && almacenamiento.limite != null;
    const porcentajeUsado = almacenamientoLimitado
        ? Math.min(100, Math.round((almacenamiento.usoActual / almacenamiento.limite) * 100))
        : 0;
    const tamanoArchivoMb = archivo?.size ? archivo.size / BYTES_POR_MB : 0;
    const archivoNoEntra =
        almacenamientoLimitado && almacenamiento.usoActual + tamanoArchivoMb > almacenamiento.limite;

    const slideAnimCategoria = useRef(new Animated.Value(300)).current;

    useEffect(() => {
        if (modalCategoriaVisible) {
            Animated.timing(slideAnimCategoria, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        } else {
            slideAnimCategoria.setValue(300);
        }
    }, [modalCategoriaVisible]);

    async function cargarAlmacenamiento() {
        if (!tripId) return;
        try {
            const data = await getTripStorage(tripId);
            setAlmacenamiento(data);
        } catch {
            setAlmacenamiento(null);
        }
    }

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
            cargarAlmacenamiento();
            usarNombreTareaRef.current = true;
            if (tarea) {
                setIdCategoria(tarea.IdCategoriaDocumento ?? null);
                setEsPublico(tarea.EsPublico ?? true);
            }
        } else {
            setArchivo(null);
            setNombreDocumento("");
            setExtensionArchivo("");
            setIdCategoria(null);
            setEsPublico(true);
            setErrores({});
            setAlmacenamiento(null);
            gastoRegistradoRef.current = false;
        }
    }, [visible, tripId, tarea?.IdChecklist]);

    function limpiarError(campo) {
        setErrores((current) => {
            if (!current[campo]) return current;
            const next = { ...current };
            delete next[campo];
            return next;
        });
    }

    function verPlanes() {
        onClose?.();
        irAPlanes();
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
                // Desde una tarea se propone su nombre («Entradas – Museo del Prado»).
                setNombreDocumento(
                    (usarNombreTareaRef.current && tarea?.NombreSugerido) || nombreSinExtension
                );

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

    function prepararOtroDocumento() {
        // Mismo formulario de la tarea, para el comprobante de pago u otro archivo.
        usarNombreTareaRef.current = false;
        setArchivo(null);
        setNombreDocumento("");
        setExtensionArchivo("");
        setErrores({});
        cargarAlmacenamiento();
    }

    async function handleSubir() {
        const nuevosErrores = {};

        if (!archivo) {
            nuevosErrores.archivo = "Selecciona un documento";
        }
        if (!nombreDocumento.trim()) {
            nuevosErrores.nombre = "El nombre del documento es obligatorio";
        }
        if (!idCategoria) {
            nuevosErrores.categoria = "Selecciona una categoría";
        }

        setErrores(nuevosErrores);

        if (Object.keys(nuevosErrores).length > 0) {
            return;
        }

        if (subiendoRef.current) return;
        subiendoRef.current = true;

        try {
            setSaving(true);

            const nombreFinal = extensionArchivo
                ? `${nombreDocumento}.${extensionArchivo}`
                : nombreDocumento;

            const respuesta = tarea
                ? await uploadTripDocument(tripId, archivo, idCategoria, nombreFinal, esPublico, tarea.IdChecklist)
                : await uploadTripDocument(tripId, archivo, idCategoria, nombreFinal, esPublico);

            if (onDocumentoSubido) onDocumentoSubido();

            if (respuesta && respuesta.sugerencia_gasto) {
                const sugg = respuesta.sugerencia_gasto;
                setSaving(false); 
                gastoRegistradoRef.current = false;
                
                const concepto = sugg.Nombre || "Sin nombre";
                const monto = `${sugg.MonedaOriginal || ""} ${sugg.MontoOriginal || ""}`.trim();
                appAlert(
                    "¡Gasto detectado!",
                    "El sistema analizó el documento y encontró un posible gasto asociado.\n\n" +
                    `Concepto: ${concepto}` +
                    (monto ? `\nMonto: ${monto}` : "") +
                    "\n\n¿Deseás registrarlo?",
                    [
                        {
                            text: "No",
                            style: "cancel",
                            onPress: () => {
                                mostrarAlertaConfirmacion("Éxito", "Documento subido correctamente.", () => {
                                    onClose();
                                });
                            }
                        },
                        {
                            text: "Sí, registrar",
                            onPress: () => {
                                setDatosGastoSugerido(sugg);
                                setGastoSugeridoModalVisible(true);
                            }
                        }
                    ]
                );
                return;
            }

            setSaving(false);
            if (tarea) {
                // Se puede subir aparte el comprobante de pago (o las demás entradas).
                appAlert("Documento guardado", `Lo guardamos en la tarea «${tarea.Nombre}».`, [
                    { text: "Subir otro", onPress: prepararOtroDocumento },
                    { text: "Listo", onPress: () => onClose() },
                ]);
                return;
            }
            mostrarAlertaConfirmacion("Éxito", "Documento subido correctamente.", () => {
                onClose();
            });
        } catch (error) {
            setSaving(false);
            console.log("ERROR uploadTripDocument:", error);

            if (esErrorDeLimite(error)) {
                cargarAlmacenamiento();
                mostrarLimiteAlcanzado(error, {
                    titulo: "El viaje se quedó sin espacio",
                    antesDeIr: onClose,
                });
                return;
            }

            const mensajeError = (error?.message || "").toLowerCase();
            const esNombreDuplicado =
                mensajeError.includes("ya existe") ||
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
            subiendoRef.current = false;
        }
    }


    return (
            <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
                <View style={styles.overlay}>
                    <View style={styles.sheet}>
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <View style={styles.headerRow}>
                                <Text style={styles.title}>Subir documento</Text>
                                <TouchableOpacity onPress={onClose} testID="close-modal-button">
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
                                </View>
                            ) : (
                                <View style={styles.content}>

                                    {tarea ? (
                                        <View style={styles.tareaBox} testID="documentos-tarea">
                                            <FontAwesome6 name="paperclip" size={13} color={colors.primary} />
                                            <Text style={styles.tareaTexto}>
                                                Se guarda en la tarea{" "}
                                                <Text style={styles.tareaNombre}>«{tarea.Nombre}»</Text>
                                            </Text>
                                        </View>
                                    ) : null}

                                    {almacenamientoLimitado ? (
                                        <View style={styles.storageBox} testID="documentos-almacenamiento">
                                            <View style={styles.storageRow}>
                                                <FontAwesome6 name="hard-drive" size={13} color={colors.primary} />
                                                <Text style={styles.storageText}>
                                                    Espacio del viaje: {formatearMb(almacenamiento.usoActual)} MB de{" "}
                                                    {formatearMb(almacenamiento.limite)} MB
                                                </Text>
                                            </View>
                                            <View style={styles.storageTrack}>
                                                <View
                                                    style={[
                                                        styles.storageFill,
                                                        porcentajeUsado >= 90 && styles.storageFillAlto,
                                                        { width: `${porcentajeUsado}%` },
                                                    ]}
                                                />
                                            </View>
                                        </View>
                                    ) : null}
                                    
                                    <Text style={styles.label}>Documento del viaje</Text>
                                    {!archivo ? (
                                        <TouchableOpacity
                                            style={[styles.uploadBox, errores.archivo && { borderColor: colors.danger }]}
                                            onPress={seleccionarArchivo}
                                        >
                                            <FontAwesome6 name="cloud-arrow-up" size={32} color={colors.primary} />
                                            <Text style={styles.uploadTitle}>Seleccionar archivo</Text>
                                            <Text style={styles.uploadDescription}>PDF, JPG, JPEG o PNG</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View style={[styles.fileCard, archivoNoEntra && { borderColor: colors.danger }]}>
                                            <FontAwesome6 name="file" size={22} color={colors.primary} />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text style={styles.fileName} numberOfLines={1}>{archivo.name}</Text>
                                                <Text style={styles.fileSize}>
                                                    {archivo.size ? `${(archivo.size / 1024).toFixed(1)} KB` : ""}
                                                </Text>
                                            </View>
                                            <TouchableOpacity onPress={eliminarArchivo} hitSlop={15} testID="documentos-eliminar-archivo">
                                                <FontAwesome6 name="trash" size={16} color={colors.danger} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {errores.archivo && <Text style={styles.error}>{errores.archivo}</Text>}
                                    {archivoNoEntra ? (
                                        <View style={styles.limiteBox} testID="documentos-sin-espacio">
                                            <Text style={styles.error}>
                                                Este archivo supera el espacio disponible del viaje según el plan de su administrador.
                                            </Text>
                                            <Pressable onPress={verPlanes} hitSlop={8} style={styles.linkPlanes}>
                                                <FontAwesome6 name="crown" size={12} color={colors.primary} />
                                                <Text style={styles.linkPlanesTexto}>Ver planes</Text>
                                            </Pressable>
                                        </View>
                                    ) : null}

                                    <Text style={styles.label}>Nombre del documento</Text>
                                    <View style={[styles.inputBox, errores.nombre && { borderColor: colors.danger }]}>
                                        <FontAwesome6 name="pen" size={13} color={colors.overlay} />
                                        <TextInput
                                            style={styles.inputInner}
                                            value={nombreDocumento}
                                            onChangeText={(text) => {
                                                setNombreDocumento(text);
                                                limpiarError("nombre");
                                            }}
                                            placeholder="Seguro médico"
                                            placeholderTextColor={colors.overlay}
                                        />
                                        {extensionArchivo ? (
                                            <Text style={styles.extensionText}>{`.${extensionArchivo}`}</Text>
                                        ) : null}
                                    </View>
                                    {errores.nombre && <Text style={styles.error}>{errores.nombre}</Text>}

                                    <Text style={styles.label}>Categoría</Text>
                                    <TouchableOpacity
                                        style={[styles.dropdownButton, errores.categoria && { borderColor: colors.danger }]}
                                        onPress={() => setModalCategoriaVisible(true)}
                                    >
                                        <View style={styles.dropdownLeftContent}>
                                            <FontAwesome6
                                                name={categoriaSeleccionada ? iconoCategoria(categoriaSeleccionada) : "tags"}
                                                size={14}
                                                color={categoriaSeleccionada ? colors.primary : colors.overlay}
                                                style={{ marginRight: 10, width: 18, textAlign: "center" }}
                                            />
                                            <Text style={idCategoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                                                {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Selecciona una categoría"}
                                            </Text>
                                        </View>
                                        <FontAwesome6 name="chevron-down" size={14} color={colors.overlay} />
                                    </TouchableOpacity>
                                    {errores.categoria && <Text style={styles.error}>{errores.categoria}</Text>}

                                    <Text style={styles.label}>Visibilidad</Text>
                                    <View style={styles.selectorContainer}>
                                        <TouchableOpacity
                                            style={[styles.selectorOption, esPublico && styles.selectorOptionActive]}
                                            onPress={() => setEsPublico(true)}
                                        >
                                            <FontAwesome6 name="users" size={14} color={esPublico ? colors.textInverse : colors.primary} />
                                            <Text style={[styles.selectorOptionText, esPublico && styles.selectorOptionTextActive]}>
                                                Público
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.selectorOption, !esPublico && styles.selectorOptionActive]}
                                            onPress={() => setEsPublico(false)}
                                        >
                                            <FontAwesome6 name="lock" size={14} color={!esPublico ? colors.textInverse : colors.primary} />
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

                                    {/* Indicador de estado visible mientras sube y analiza con IA */}
                                    {saving && (
                                        <View style={styles.analyzingBox}>
                                            <ActivityIndicator size="small" color={colors.primary} />
                                            <Text style={styles.analyzingText}>Subiendo documento y analizando si tiene gastos...</Text>
                                        </View>
                                    )}

                                    <PrimaryButton
                                        label="Subir documento"
                                        loading={false}
                                        onPress={handleSubir}
                                        disabled={saving || archivoNoEntra}
                                        style={styles.submitButton}
                                    />
                                </View>
                            )}
                        </ScrollView>
                    </View>

                    {modalCategoriaVisible && (
                        <View style={styles.modalOverlayC}>
                            <Pressable
                                style={StyleSheet.absoluteFill}
                                onPress={() => setModalCategoriaVisible(false)}
                            />
                            <Animated.View style={[styles.bottomSheetC, { transform: [{ translateY: slideAnimCategoria }] }]}>
                                <View style={styles.modalHeaderC}>
                                    <Text style={styles.modalTitleC}>Seleccionar categoría</Text>
                                    <TouchableOpacity onPress={() => setModalCategoriaVisible(false)} hitSlop={10} testID="close-category-modal">
                                        <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                <FlatList
                                    data={categorias}
                                    keyExtractor={(item) => item.IdCategoriaDocumento.toString()}
                                    renderItem={({ item, index }) => {
                                        const esActivo = idCategoria === item.IdCategoriaDocumento;
                                        const esElUltimo = index === categorias.length - 1;
                                        return (
                                            <TouchableOpacity
                                                style={[styles.modalItemC, esActivo && styles.modalItemActiveC, esElUltimo && { borderBottomWidth: 0 }]}
                                                onPress={() => {
                                                    setIdCategoria(item.IdCategoriaDocumento);
                                                    limpiarError("categoria");
                                                    setModalCategoriaVisible(false);
                                                }}
                                            >
                                                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                                                    <FontAwesome6
                                                        name={iconoCategoria(item)}
                                                        size={16}
                                                        color={esActivo ? colors.primary : "#4b5563"}
                                                        style={{ marginRight: 12, width: 24, textAlign: "center" }}
                                                    />
                                                    <Text style={[styles.modalItemTextC, esActivo && styles.modalItemTextActiveC]}>
                                                        {item.Nombre}
                                                    </Text>
                                                </View>
                                                {esActivo && (
                                                    <FontAwesome6 name="check" size={14} color={colors.primary} />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    }}
                                    ListEmptyComponent={
                                        <Text style={styles.emptyTextC}>No hay categorías disponibles.</Text>
                                    }
                                />
                            </Animated.View>
                        </View>
                    )}
                </View>

                {/* Modal de AddGastoScreen que se abre automáticamente con los datos sugeridos por la IA (US 84) */}
                {gastoSugeridoModalVisible && datosGastoSugerido && (
                    <AddGastoScreen
                        visible={gastoSugeridoModalVisible}
                        mostrarAlertaExito={false}
                        onClose={() => {
                            setGastoSugeridoModalVisible(false);
                            if (gastoRegistradoRef.current) return;
                            mostrarAlertaConfirmacion("Éxito", "Documento subido correctamente.", () => {
                                onClose();
                            });
                        }}
                        IdViaje={tripId}
                        Moneda={tripMoneda}
                        FechaInicioViaje={tripFechaInicio}
                        FechaFinViaje={tripFechaFin}
                        onGastoCreado={() => {
                            gastoRegistradoRef.current = true;
                            setGastoSugeridoModalVisible(false);
                            mostrarAlertaConfirmacion("Éxito", "El documento y el gasto se registraron correctamente.", () => {
                                onClose();
                            });
                        }}
                        initialData={datosGastoSugerido}
                        puedeEscanear={false}
                    />
                )}
            </Modal>
    );
}

const styles = StyleSheet.create({
    tareaBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceAlt,
        // Separado del aviso de espacio del viaje que puede venir debajo.
        marginBottom: spacing.sm,
    },
    tareaTexto: {
        flex: 1,
        fontSize: 13,
        color: colors.textPrimary,
    },
    tareaNombre: {
        fontWeight: "600",
    },
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
    storageBox: {
        gap: spacing.xs,
        padding: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceAlt,
    },
    storageRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
    },
    storageText: {
        ...textStyles.meta,
        color: colors.textSecondary,
        fontSize: 12,
        flex: 1,
    },
    storageTrack: {
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.border,
        overflow: "hidden",
    },
    storageFill: {
        height: "100%",
        borderRadius: 3,
        backgroundColor: colors.primary,
    },
    storageFillAlto: {
        backgroundColor: colors.danger,
    },
    limiteBox: {
        gap: spacing.xxs,
    },
    linkPlanes: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: spacing.xs,
        paddingVertical: spacing.xs,
    },
    linkPlanesTexto: {
        ...textStyles.bodyStrong,
        color: colors.primary,
        fontSize: 13,
    },
    analyzingBox: {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#eef4ff",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radii.md,
        marginTop: spacing.md,
    },
    analyzingText: {
        ...textStyles.body,
        color: colors.primary,
        fontWeight: "600",
        fontSize: 13,
        textAlign: "center",
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
        color: colors.overlay,
    },
    dropdownText: {
        ...textStyles.body,
        color: colors.textPrimary,
    },
    submitButton: {
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },
    error: {
        ...textStyles.meta,
        color: colors.danger,
        marginTop: spacing.xs,
        fontWeight: "600",
    },
    extensionText: {
        ...textStyles.bodyStrong,
        color: colors.textMuted,
    },
    uploadBox: {
        minHeight: 120,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: "dashed",
        borderRadius: radii.md,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.md,
    },
    uploadTitle: {
        ...textStyles.bodyStrong,
        color: colors.primary,
        marginTop: spacing.sm,
    },
    uploadDescription: {
        ...textStyles.meta,
        color: colors.textSecondary,
        marginTop: 4,
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
        color: colors.primary,
        fontWeight: "600",
    },
    selectorOptionTextActive: {
        color: colors.textInverse,
        fontWeight: "700",
    },
    modalOverlayC: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "flex-end",
        elevation: 999,
    },
    bottomSheetC: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radii.xl || 24,
        borderTopRightRadius: radii.xl || 24,
        padding: 20,
        maxHeight: "70%",
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