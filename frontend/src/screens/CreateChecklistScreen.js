import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
} from "react-native";
import Modal from "../components/ui/AppModal";

import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";

import { createChecklist, updateChecklist, getChecklistCategories } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

import { appAlert } from "../components/ui/AppDialog";

// Igual que el nombre de las actividades: entran los nombres de lugares largos.
const NOMBRE_MAX_LENGTH = 150;

const ICONOS_CATEGORIAS = {
  "Documentación": "passport",
  "Transporte": "car",
  "Alojamiento": "hotel",
  "Equipamiento": "suitcase", 
  "Salud": "kit-medical",
  "Seguros": "shield-halved",
  "Finanzas": "money-bill-transfer",
  "Comida": "utensils",
  "Reservas y entradas": "ticket",
  "Otros": "list-check",
};


function mostrarAlertaConfirmacion(titulo, mensaje, onAceptar) {
  appAlert(
    titulo,
    mensaje,
    onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined
  );
}

/**
 * Hoja inferior que se dibuja DENTRO del modal del formulario (igual que en
 * AddGastoScreen). En iOS no se puede abrir un segundo <Modal> encima de otro
 * que ya está visible: el selector de categorías no aparecía.
 */
function SheetOverlay({ visible, onClose, children }) {
  const slide = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slide, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      slide.setValue(320);
    }
  }, [visible, slide]);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlayAbsolute}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="cerrar-selector-categoria" />
      <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slide }] }]}>
        <View style={styles.grabber} />
        {children}
      </Animated.View>
    </View>
  );
}

function ResponsablesSelector({ participantes, seleccionados, onToggle }) {
  if (!participantes || participantes.length === 0) {
    return (
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>
        No hay participantes para asignar como responsables.
      </Text>
    );
  }

  return (
    <View style={styles.chipsWrap}>
      {participantes.map((participante) => {
        const id = participante.id ?? participante.IdUsuario;
        const activo = seleccionados.includes(id);
        return (
          <Pressable
            key={id}
            onPress={() => onToggle(id)}
            style={[styles.chip, activo && styles.chipActive]}
          >
            <Text style={[styles.chipText, activo && styles.chipTextActive]}>
              {participante.nombreCompleto || participante.NombreCompleto}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CrearChecklistScreen({
  visible,
  onClose,
  tripId,
  onChecklistGuardado,
  checklistToEdit,
  participantes,
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [modalCategoriaVisible, setModalCategoriaVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errores, setErrores] = useState({});
  const [responsablesSeleccionados, setResponsablesSeleccionados] = useState([]);
  const esEdicion = !!checklistToEdit;

  useEffect(() => {
    if (visible) {
      if (checklistToEdit) {
        setNombre(checklistToEdit.Nombre || "");
        setCategoria(checklistToEdit.CategoriaChecklist?.IdCategoriaChecklist || null);
        setResponsablesSeleccionados(
          (checklistToEdit.Responsables || []).map((r) => r.IdUsuario)
        );
      } else {
        setNombre("");
        setCategoria(null);
        setResponsablesSeleccionados([]);
      }
      setErrores({});

      async function cargarCats() {
        setLoadingCategorias(true);
        try {
          const cats = await getChecklistCategories();     
          setCategorias(cats);
        } catch (error) {
          console.error("No se pudieron cargar las categorías", error);
        } finally {
          setLoadingCategorias(false);
        }
      }
      cargarCats();
    }
  }, [visible, checklistToEdit]);

  function limpiarError(campo) {
    setErrores((current) => {
      if (!current[campo]) return current;
      const next = { ...current };
      delete next[campo];
      return next;
    });
  }

  function toggleResponsable(id) {
    setResponsablesSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((existente) => existente !== id) : [...prev, id]
    );
  }

  async function handleGuardar() {
    const nuevosErrores = {};
    const nombreLimpio = nombre.trim();

    if (!nombreLimpio) {
      nuevosErrores.nombre = "El título de la tarea es obligatorio.";
    } else if (nombreLimpio.length > NOMBRE_MAX_LENGTH) {
      nuevosErrores.nombre = `El título no puede superar los ${NOMBRE_MAX_LENGTH} caracteres.`;
    }

    if (!categoria) {
      nuevosErrores.categoria = "Seleccioná una categoría.";
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) {
      return;
    }

    try {
      setSaving(true);

      let resultado;
      if (esEdicion) {
        resultado = await updateChecklist(tripId, checklistToEdit.IdChecklist, {
          Nombre: nombreLimpio,
          IdCategoriaChecklist: categoria,
          IdsResponsables: responsablesSeleccionados,
        });
      } else {
        resultado = await createChecklist(tripId, {
          Nombre: nombreLimpio,
          IdCategoriaChecklist: categoria,
          IdsResponsables: responsablesSeleccionados,
        });
      }

      mostrarAlertaConfirmacion(
        "¡Listo!",
        esEdicion ? "La tarea se actualizó correctamente." : "La tarea se creó correctamente.",
        () => {
          if (onChecklistGuardado) onChecklistGuardado(resultado?.item, esEdicion);
          onClose();
        }
      );
    } catch (error) {
      const mensajeError = error?.message || "No se pudo guardar la tarea.";
      
      if (mensajeError.includes("Ya existe")) {
        setErrores((prev) => ({ ...prev, nombre: mensajeError }));
      } else {
        mostrarAlertaConfirmacion(
          "Error",
          mensajeError
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const categoriaSeleccionada = categorias.find((c) => c.IdCategoriaChecklist === categoria);

  function abrirSelectorCategoria() {
    Keyboard.dismiss();
    setModalCategoriaVisible(true);
  }

  function cerrarFormulario() {
    Keyboard.dismiss();
    setModalCategoriaVisible(false);
    onClose();
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={cerrarFormulario}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => Keyboard.dismiss()} />
        <KeyboardAvoidingView
          style={styles.mainKav}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <View style={styles.sheet}>
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <Text style={styles.title}>
                {esEdicion ? "Editar tarea" : "Crear tarea"}
              </Text>
              <TouchableOpacity onPress={cerrarFormulario} hitSlop={10} testID="close-checklist-modal">
                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.mainScroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.content}>
                <Text style={styles.label}>Título de la tarea</Text>
                <View style={[styles.inputBox, errores.nombre && { borderColor: colors.danger }]}>
                  <FontAwesome6 name="list-check" size={13} color={colors.overlay} />
                  <TextInput
                    style={styles.inputInner}
                    value={nombre}
                    onChangeText={(text) => {
                      setNombre(text);
                      limpiarError("nombre");
                    }}
                    placeholder="Comprar vuelos de ida y vuelta"
                    placeholderTextColor={colors.overlay}
                    maxLength={NOMBRE_MAX_LENGTH}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                {errores.nombre ? <Text style={styles.error}>{errores.nombre}</Text> : null}

                <Text style={styles.label}>Categoría</Text>
                <TouchableOpacity
                  style={[styles.dropdownButton, errores.categoria && { borderColor: colors.danger }]}
                  onPress={abrirSelectorCategoria}
                >
                  <View style={styles.dropdownLeftContent}>
                    <FontAwesome6
                      name={categoriaSeleccionada ? ICONOS_CATEGORIAS[categoriaSeleccionada.Nombre] || "tags" : "tags"}
                      size={14}
                      color={categoriaSeleccionada ? colors.primary : colors.overlay}
                      style={{ marginRight: 10, width: 20, textAlign: "center" }}
                    />
                    <Text style={categoria ? styles.dropdownText : styles.dropdownPlaceholder}>
                      {categoriaSeleccionada ? categoriaSeleccionada.Nombre : "Seleccioná una categoría"}
                    </Text>
                  </View>
                  <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
                </TouchableOpacity>
                {errores.categoria ? <Text style={styles.error}>{errores.categoria}</Text> : null}

                <Text style={styles.label}>Responsables (opcional)</Text>
                <ResponsablesSelector
                  participantes={participantes}
                  seleccionados={responsablesSeleccionados}
                  onToggle={(id) => {
                    Keyboard.dismiss();
                    toggleResponsable(id);
                  }}
                />

                <PrimaryButton
                  label={
                    saving
                      ? "Guardando..."
                      : esEdicion
                      ? "Guardar cambios"
                      : "Crear tarea"
                  }
                  loading={saving}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleGuardar();
                  }}
                  disabled={saving}
                  style={styles.submitButton}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <SheetOverlay visible={modalCategoriaVisible} onClose={() => setModalCategoriaVisible(false)}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Categoría</Text>
            <TouchableOpacity onPress={() => setModalCategoriaVisible(false)} hitSlop={10}>
              <FontAwesome6 name="xmark" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          {loadingCategorias ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={categorias}
              keyExtractor={(item) => item.IdCategoriaChecklist.toString()}
              contentContainerStyle={styles.listaCategorias}
              ListEmptyComponent={
                <Text style={styles.sinCategorias}>No hay categorías disponibles.</Text>
              }
              renderItem={({ item, index }) => {
                const iconoName = ICONOS_CATEGORIAS[item.Nombre] || "tags";
                const esActivo = categoria === item.IdCategoriaChecklist;
                const esElUltimo = index === categorias.length - 1;

                return (
                  <TouchableOpacity
                    style={[styles.modalItem, esActivo && styles.modalItemActive, esElUltimo && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      setCategoria(item.IdCategoriaChecklist);
                      limpiarError("categoria");
                      setModalCategoriaVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <FontAwesome6
                        name={iconoName}
                        size={16}
                        color={esActivo ? colors.primary : "#4b5563"}
                        style={{ marginRight: 12, width: 24, textAlign: "center" }}
                      />
                      <Text style={[styles.modalItemText, esActivo && styles.modalItemTextActive]}>
                        {item.Nombre}
                      </Text>
                    </View>
                    {esActivo && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SheetOverlay>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong || "rgba(9, 19, 45, 0.7)",
    justifyContent: "flex-end",
  },
  mainKav: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl || 24,
    borderTopRightRadius: radii.xl || 24,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxHeight: "92%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  mainScroll: {
    flexShrink: 1,
    minHeight: 0,
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
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill ?? 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  submitButton: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
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
  modalOverlayAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    elevation: 999,
  },
  bottomSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl || 24,
    borderTopRightRadius: radii.xl || 24,
    paddingTop: spacing.sm,
    paddingHorizontal: 20,
    maxHeight: "70%",
  },
  listaCategorias: {
    paddingBottom: spacing.xl,
  },
  sinCategorias: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  modalItemActive: {
    backgroundColor: "#f0f4f8",
    borderRadius: 8,
  },
  modalItemText: {
    fontSize: 15,
    color: "#333",
  },
  modalItemTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
});