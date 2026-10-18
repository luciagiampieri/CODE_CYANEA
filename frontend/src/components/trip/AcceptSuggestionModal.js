import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { acceptActivitySuggestion } from "../../services/api";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import {
  mensajeSuperposicion,
  normalizarHora,
  validarHorarioSugerencia,
} from "../../utils/aceptarSugerencia";
import { confirmar } from "../../utils/dialogs";

function hhmm(valor) {
  return String(valor ?? "").slice(0, 5);
}

// US 88: confirma la incorporación de una sugerencia al itinerario. Permite ajustar
// el horario y, si se superpone con otra actividad, pide confirmación antes de crearla.
export default function AcceptSuggestionModal({ visible, tripId, sugerencia, onClose, onAceptada }) {
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!visible || !sugerencia) return;
    setHoraInicio(hhmm(sugerencia.HoraInicio));
    setHoraFin(hhmm(sugerencia.HoraFin));
    setError("");
  }, [visible, sugerencia]);

  if (!sugerencia) return null;

  async function enviar(confirmarSuperposicion) {
    return acceptActivitySuggestion(tripId, sugerencia.IdSugerenciaActividad, {
      HoraInicio: normalizarHora(horaInicio),
      HoraFin: normalizarHora(horaFin),
      ConfirmarSuperposicion: confirmarSuperposicion,
    });
  }

  async function aceptar() {
    const errorHorario = validarHorarioSugerencia(horaInicio, horaFin);
    if (errorHorario) {
      setError(errorHorario);
      return;
    }

    setEnviando(true);
    setError("");
    try {
      let resultado = await enviar(false);
      if (resultado?.RequiereConfirmacion) {
        const continuar = await confirmar({
          titulo: "Horario superpuesto",
          mensaje: mensajeSuperposicion(resultado),
          textoConfirmar: "Agregar igual",
          tipo: "warning",
        });
        // Cancelar la advertencia no crea la actividad: la sugerencia sigue pendiente.
        if (!continuar) return;
        resultado = await enviar(true);
      }
      if (resultado?.Aceptada) onAceptada?.(resultado);
    } catch (err) {
      setError(err?.message || "No se pudo aceptar la sugerencia.");
    } finally {
      setEnviando(false);
    }
  }

  function editar(setter) {
    return (valor) => {
      setter(valor);
      setError("");
    };
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="aceptar-sugerencia-modal">
          <View style={styles.encabezado}>
            <Text style={styles.titulo}>Agregar al itinerario</Text>
            <Pressable
              accessibilityLabel="Cerrar"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              testID="aceptar-sugerencia-cerrar"
            >
              <FontAwesome6 name="xmark" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.nombre}>{sugerencia.Nombre}</Text>
          {sugerencia.LugarNombre ? (
            <View style={styles.fila}>
              <FontAwesome6 name="location-dot" size={11} color={colors.textMuted} />
              <Text style={styles.meta}>{sugerencia.LugarNombre}</Text>
            </View>
          ) : null}

          <Text style={styles.ayuda}>
            Podés ajustar el horario antes de confirmar. La actividad se agrega al día de la sugerencia.
          </Text>

          <View style={styles.horarios}>
            <View style={styles.campo}>
              <Text style={styles.label}>Hora de inicio</Text>
              <TextInput
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onChangeText={editar(setHoraInicio)}
                placeholder="HH:MM"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                testID="aceptar-sugerencia-inicio"
                value={horaInicio}
              />
            </View>
            <View style={styles.campo}>
              <Text style={styles.label}>Hora de fin</Text>
              <TextInput
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onChangeText={editar(setHoraFin)}
                placeholder="HH:MM"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                testID="aceptar-sugerencia-fin"
                value={horaFin}
              />
            </View>
          </View>

          {error ? (
            <View style={styles.error} testID="aceptar-sugerencia-error">
              <FontAwesome6 name="circle-exclamation" size={13} color={colors.danger} />
              <Text style={styles.errorTexto}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.acciones}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.botonSecundario, pressed && styles.presionado]}
            >
              <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
            </Pressable>
            <PrimaryButton
              icon="check"
              iconPosition="left"
              label="Agregar actividad"
              loading={enviando}
              onPress={aceptar}
              style={styles.botonPrimario}
              testID="aceptar-sugerencia-confirmar"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titulo: {
    ...textStyles.tripTitle,
    fontSize: 20,
    color: colors.primary,
  },
  nombre: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    color: colors.textPrimary,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meta: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  ayuda: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  horarios: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  campo: {
    flex: 1,
    gap: spacing.xxs,
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
  },
  input: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSurface,
  },
  errorTexto: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.danger,
    flex: 1,
  },
  acciones: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  botonSecundario: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  botonSecundarioTexto: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  botonPrimario: {
    flexShrink: 1,
  },
  presionado: {
    opacity: 0.8,
  },
});
