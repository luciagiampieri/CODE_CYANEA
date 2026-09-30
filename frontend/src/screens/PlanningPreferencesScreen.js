import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "../components/ui/PrimaryButton";
import { getPlanningPreferences, savePlanningPreferences } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const MAX_CONSIDERACIONES_DEFAULT = 300;
const PRESUPUESTO_REGEX = /^\d+([.,]\d{1,2})?$/;

function mostrarAlerta(titulo, mensaje, onAceptar) {
  if (Platform.OS === "web") {
    window.alert(`${titulo}\n\n${mensaje}`);
    if (onAceptar) onAceptar();
  } else {
    Alert.alert(titulo, mensaje, onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined);
  }
}

export function validarPreferencias({ intereses, ritmo, presupuesto, consideraciones, maxConsideraciones }) {
  const errores = {};
  if (!intereses || intereses.length === 0) {
    errores.intereses = "Seleccioná al menos un interés.";
  }
  if (!ritmo) {
    errores.ritmo = "Seleccioná un ritmo de viaje.";
  }
  const presupuestoLimpio = (presupuesto || "").trim();
  if (presupuestoLimpio) {
    if (!PRESUPUESTO_REGEX.test(presupuestoLimpio)) {
      errores.presupuesto = "Ingresá un monto numérico (hasta 2 decimales).";
    } else if (Number(presupuestoLimpio.replace(",", ".")) <= 0) {
      errores.presupuesto = "El presupuesto debe ser mayor a cero.";
    }
  }
  if ((consideraciones || "").trim().length > maxConsideraciones) {
    errores.consideraciones = `Máximo ${maxConsideraciones} caracteres.`;
  }
  return errores;
}

export default function PlanningPreferencesScreen({ visible, onClose, tripId, tripTitle, onGuardado }) {
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [opciones, setOpciones] = useState({ Intereses: [], Ritmos: [] });
  const [maxConsideraciones, setMaxConsideraciones] = useState(MAX_CONSIDERACIONES_DEFAULT);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [configurada, setConfigurada] = useState(false);

  const [intereses, setIntereses] = useState([]);
  const [ritmo, setRitmo] = useState(null);
  const [presupuesto, setPresupuesto] = useState("");
  const [consideraciones, setConsideraciones] = useState("");

  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible || !tripId) return;
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setErrorCarga(null);
      setErrores({});
      try {
        const data = await getPlanningPreferences(tripId);
        if (cancelado) return;
        setOpciones(data.Opciones || { Intereses: [], Ritmos: [] });
        setMaxConsideraciones(data.Opciones?.MaxCaracteresConsideraciones || MAX_CONSIDERACIONES_DEFAULT);
        setPuedeEditar(Boolean(data.PuedeEditar));
        setConfigurada(Boolean(data.Configurada));

        const prefs = data.Preferencias;
        setIntereses(prefs?.IdsIntereses || []);
        setRitmo(prefs?.IdRitmoViaje ?? null);
        setPresupuesto(
          prefs?.PresupuestoDiarioARS != null ? String(prefs.PresupuestoDiarioARS) : ""
        );
        setConsideraciones(prefs?.Consideraciones || "");
      } catch (error) {
        if (!cancelado) setErrorCarga(error?.message || "No se pudieron cargar tus preferencias.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [visible, tripId]);

  function limpiarError(campo) {
    setErrores((actual) => {
      if (!actual[campo]) return actual;
      const siguiente = { ...actual };
      delete siguiente[campo];
      return siguiente;
    });
  }

  function toggleInteres(id) {
    if (!puedeEditar) return;
    setIntereses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    limpiarError("intereses");
  }

  async function handleGuardar() {
    const nuevosErrores = validarPreferencias({
      intereses,
      ritmo,
      presupuesto,
      consideraciones,
      maxConsideraciones,
    });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    const presupuestoLimpio = presupuesto.trim();
    try {
      setGuardando(true);
      const resultado = await savePlanningPreferences(tripId, {
        IdsIntereses: intereses,
        IdRitmoViaje: ritmo,
        PresupuestoDiarioARS: presupuestoLimpio ? Number(presupuestoLimpio.replace(",", ".")) : null,
        Consideraciones: consideraciones.trim() || null,
      });
      mostrarAlerta("¡Listo!", "Tus preferencias de planificación se guardaron correctamente.", () => {
        if (onGuardado) onGuardado(resultado);
        onClose();
      });
    } catch (error) {
      mostrarAlerta("Error", error?.message || "No se pudieron guardar tus preferencias.");
    } finally {
      setGuardando(false);
    }
  }

  function renderContenido() {
    if (cargando) {
      return (
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (errorCarga) {
      return (
        <View style={styles.centrado}>
          <Text style={styles.error}>{errorCarga}</Text>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <Text style={styles.intro}>
          El asistente usa las preferencias de todo el grupo para sugerir actividades. Tus
          preferencias son solo para este viaje.
        </Text>

        {!puedeEditar ? (
          <View style={styles.aviso} testID="preferencias-solo-lectura">
            <FontAwesome6 name="lock" size={12} color={colors.warning} />
            <Text style={styles.avisoTexto}>
              El viaje finalizó: las preferencias ya no se pueden modificar.
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>Intereses</Text>
        <Text style={styles.hint}>Elegí uno o más.</Text>
        <View style={styles.chipsWrap}>
          {opciones.Intereses.map((interes) => {
            const activo = intereses.includes(interes.IdInteresPlanificacion);
            return (
              <Pressable
                key={interes.IdInteresPlanificacion}
                onPress={() => toggleInteres(interes.IdInteresPlanificacion)}
                disabled={!puedeEditar}
                style={[styles.chip, activo && styles.chipActive]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: activo }}
              >
                <FontAwesome6
                  name={interes.Icono || "star"}
                  size={12}
                  color={activo ? colors.textInverse : colors.primary}
                />
                <Text style={[styles.chipText, activo && styles.chipTextActive]}>
                  {interes.Nombre}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errores.intereses ? <Text style={styles.error}>{errores.intereses}</Text> : null}

        <Text style={styles.label}>Ritmo de viaje</Text>
        {opciones.Ritmos.map((opcion) => {
          const activo = ritmo === opcion.IdRitmoViaje;
          return (
            <Pressable
              key={opcion.IdRitmoViaje}
              onPress={() => {
                if (!puedeEditar) return;
                setRitmo(opcion.IdRitmoViaje);
                limpiarError("ritmo");
              }}
              disabled={!puedeEditar}
              style={[styles.ritmoCard, activo && styles.ritmoCardActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo }}
            >
              <FontAwesome6
                name={activo ? "circle-dot" : "circle"}
                size={16}
                color={activo ? colors.primary : colors.textMuted}
              />
              <View style={styles.ritmoTextos}>
                <Text style={styles.ritmoNombre}>{opcion.Nombre}</Text>
                <Text style={styles.ritmoDescripcion}>{opcion.Descripcion}</Text>
              </View>
            </Pressable>
          );
        })}
        {errores.ritmo ? <Text style={styles.error}>{errores.ritmo}</Text> : null}

        <Text style={styles.label}>Presupuesto diario por persona (opcional)</Text>
        <Text style={styles.hint}>Estimado para actividades, en pesos argentinos (ARS).</Text>
        <View style={[styles.inputBox, errores.presupuesto && styles.inputError]}>
          <Text style={styles.prefijo}>ARS $</Text>
          <TextInput
            style={styles.inputInner}
            value={presupuesto}
            onChangeText={(texto) => {
              setPresupuesto(texto);
              limpiarError("presupuesto");
            }}
            editable={puedeEditar}
            keyboardType="decimal-pad"
            placeholder="40000"
            placeholderTextColor={colors.overlay}
          />
        </View>
        {errores.presupuesto ? <Text style={styles.error}>{errores.presupuesto}</Text> : null}

        <Text style={styles.label}>Consideraciones adicionales (opcional)</Text>
        <View
          style={[
            styles.inputBox,
            styles.textArea,
            errores.consideraciones && styles.inputError,
          ]}
        >
          <TextInput
            style={[styles.inputInner, styles.textAreaInner]}
            value={consideraciones}
            onChangeText={(texto) => {
              setConsideraciones(texto);
              limpiarError("consideraciones");
            }}
            editable={puedeEditar}
            multiline
            maxLength={maxConsideraciones}
            placeholder="Movilidad reducida, alimentación vegetariana, etc."
            placeholderTextColor={colors.overlay}
          />
        </View>
        <Text style={styles.contador}>
          {consideraciones.length}/{maxConsideraciones}
        </Text>
        {errores.consideraciones ? (
          <Text style={styles.error}>{errores.consideraciones}</Text>
        ) : null}
        <Text style={styles.privacidad}>
          Estas preferencias se envían de forma anónima al servicio de inteligencia artificial que
          genera las sugerencias. No incluyas nombres ni datos personales.
        </Text>

        {puedeEditar ? (
          <PrimaryButton
            label={guardando ? "Guardando..." : configurada ? "Guardar cambios" : "Guardar preferencias"}
            loading={guardando}
            disabled={guardando}
            onPress={handleGuardar}
            style={styles.submitButton}
            testID="guardar-preferencias"
          />
        ) : null}
      </View>
    );
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>Mis preferencias</Text>
                {tripTitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {tripTitle}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} testID="close-preferences-modal">
                <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {renderContenido()}
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
    maxHeight: "92%",
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerTexts: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  subtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  content: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  centrado: {
    padding: spacing.xxl,
    alignItems: "center",
  },
  intro: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.meta,
    color: colors.warning,
    flex: 1,
  },
  label: {
    ...textStyles.label,
    textTransform: "none",
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xxs,
  },
  hint: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  ritmoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  ritmoCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  ritmoTextos: {
    flex: 1,
  },
  ritmoNombre: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  ritmoDescripcion: {
    ...textStyles.meta,
    color: colors.textSecondary,
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
    gap: spacing.xs,
  },
  inputError: {
    borderColor: colors.danger,
  },
  prefijo: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
  },
  inputInner: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
    ...textStyles.body,
  },
  textArea: {
    alignItems: "flex-start",
    minHeight: 96,
  },
  textAreaInner: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  contador: {
    ...textStyles.meta,
    color: colors.textMuted,
    alignSelf: "flex-end",
    marginTop: spacing.xxs,
  },
  privacidad: {
    ...textStyles.meta,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  submitButton: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
