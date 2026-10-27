import { useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  ActivityIndicator,
  ImageBackground,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const MAX_INDICACION = 300;

/**
 * Generador de portada con IA (US 57), compartido por la creación y la edición del viaje.
 *
 * Props:
 * - generate(prompt): Promise<{ imageBase64, mimeType }>. Genera la vista previa. Si falla,
 *   debe lanzar un Error con un mensaje apto para el usuario.
 * - onAccept(preview): Promise<string | void>. Se llama al aceptar la imagen; puede devolver
 *   el mensaje de confirmación a mostrar. Si falla, debe lanzar un Error.
 * - onInputFocus / onInputBlur (opcionales): avisan cuándo se escribe la indicación,
 *   para que la pantalla lleve el campo por encima del teclado.
 */
export default function AICoverGenerator({ generate, onAccept, onInputFocus, onInputBlur }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("idle"); // idle | generating | accepting
  const [preview, setPreview] = useState(null); // { imageBase64, mimeType }
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const busy = status !== "idle";

  function handleOpen() {
    setOpen(true);
    setError("");
    setSuccess("");
  }

  function handleClose() {
    if (busy) return;
    setOpen(false);
    setPreview(null);
    setError("");
  }

  async function handleGenerate() {
    // Se cierra el teclado para que se vea la imagen que se está generando.
    Keyboard.dismiss();
    setError("");
    setSuccess("");
    setStatus("generating");
    try {
      const result = await generate(prompt);
      setPreview({ imageBase64: result.imageBase64, mimeType: result.mimeType });
    } catch (err) {
      // Si ya había una vista previa se conserva; solo se informa el error.
      setError(err?.message || "No se pudo generar la imagen de portada.");
    } finally {
      setStatus("idle");
    }
  }

  function handleDiscard() {
    setPreview(null);
    setError("");
  }

  async function handleAccept() {
    if (!preview) return;
    setError("");
    setStatus("accepting");
    try {
      const message = await onAccept(preview);
      setPreview(null);
      setOpen(false);
      setSuccess(message || "La portada del viaje se actualizó correctamente.");
    } catch (err) {
      setError(err?.message || "No se pudo establecer la portada generada.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <View>
      {!open ? (
        <Pressable onPress={handleOpen} style={styles.openButton}>
          <FontAwesome6 name="wand-magic-sparkles" size={13} color={colors.primary} />
          <Text style={styles.buttonText}>Generar portada con IA</Text>
        </Pressable>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.title}>Generar portada con IA</Text>
          <Text style={styles.hint}>
            Usamos el nombre y los destinos del viaje. Si querés, contanos cómo te la imaginás.
          </Text>

          <View style={[styles.inputBox, busy && styles.disabled]}>
            <TextInput
              style={styles.input}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Ej: atardecer en la playa, colores cálidos"
              placeholderTextColor={colors.textMuted}
              maxLength={MAX_INDICACION}
              editable={!busy}
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              textAlignVertical="top"
              accessibilityLabel="Indicación para la portada (opcional)"
              testID="ai-cover-prompt"
            />
            <Text style={styles.counter}>{`${prompt.length}/${MAX_INDICACION}`}</Text>
          </View>

          {status === "generating" ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.hint}>Generando imagen, puede tardar unos segundos...</Text>
            </View>
          ) : preview ? (
            <ImageBackground
              source={{ uri: `data:${preview.mimeType};base64,${preview.imageBase64}` }}
              imageStyle={styles.previewImage}
              style={styles.preview}
            >
              <View style={styles.previewOverlay}>
                <Text style={styles.previewBadge}>Imagen generada con IA</Text>
              </View>
            </ImageBackground>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actionsRow}>
            {preview ? (
              <>
                <Pressable
                  onPress={handleAccept}
                  disabled={busy}
                  style={[styles.primaryButton, busy && styles.disabled]}
                >
                  {status === "accepting" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <FontAwesome6 name="check" size={13} color={colors.primary} />
                  )}
                  <Text style={styles.buttonText}>Aceptar</Text>
                </Pressable>

                <Pressable
                  onPress={handleGenerate}
                  disabled={busy}
                  style={[styles.secondaryButton, busy && styles.disabled]}
                >
                  <Text style={styles.neutralText}>Generar otra</Text>
                </Pressable>

                <Pressable
                  onPress={handleDiscard}
                  disabled={busy}
                  style={[styles.secondaryButton, busy && styles.disabled]}
                >
                  <Text style={styles.dangerText}>Descartar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={handleGenerate}
                  disabled={busy}
                  style={[styles.primaryButton, busy && styles.disabled]}
                >
                  <FontAwesome6 name="wand-magic-sparkles" size={13} color={colors.primary} />
                  <Text style={styles.buttonText}>Generar</Text>
                </Pressable>

                <Pressable
                  onPress={handleClose}
                  disabled={busy}
                  style={[styles.secondaryButton, busy && styles.disabled]}
                >
                  <Text style={styles.neutralText}>Cerrar</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {success ? <Text style={styles.success}>{success}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  panel: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  hint: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  inputBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  counter: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.textMuted,
    alignSelf: "flex-end",
  },
  input: {
    minHeight: 64,
    maxHeight: 120,
    padding: 0,
    color: colors.textPrimary,
    // Con menos de 16 px, Safari del iPhone hace zoom al tocar el campo y la
    // pantalla queda corrida y agrandada aunque se cierre el teclado.
    fontSize: 16,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 120,
  },
  preview: {
    minHeight: 180,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  previewImage: {
    borderRadius: radii.lg,
  },
  previewOverlay: {
    padding: spacing.lg,
    backgroundColor: "rgba(19, 39, 80, 0.42)",
  },
  previewBadge: {
    ...textStyles.label,
    color: colors.accent,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  buttonText: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 13,
    textAlign: "center",
  },
  neutralText: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  dangerText: {
    ...textStyles.bodyStrong,
    color: colors.danger || "#FF3B30",
    fontSize: 13,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    color: colors.danger,
  },
  success: {
    marginTop: spacing.sm,
    color: colors.success,
  },
});