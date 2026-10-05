import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Modal from "../ui/AppModal";

import { sendTripAssistantMessage, updateAssistantConsent } from "../../services/api";
import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

function actionLabel(action) {
  if (!action) return "";
  return action.label || "Ejecutar accion propuesta";
}

function buildAssistantMessage(response) {
  return {
    role: "assistant",
    text: response.message,
    displayText: "",
    isTyping: true,
    action: response.suggestedAction,
  };
}

function buildConversation(messages) {
  return messages
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.text)
    .slice(-10)
    .map((item) => ({ role: item.role, text: item.text }));
}

export default function TripAssistantPanel({
  visible,
  onClose,
  tripId,
  currentUser,
  onConsentUpdated,
  onActionExecuted,
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Decime que queres organizar del viaje. Puedo sugerir actividades, tareas, votaciones o rutas, y te voy a pedir confirmacion antes de cambiar algo.",
    },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const [error, setError] = useState("");

  const hasConsent = Boolean(currentUser?.consienteAsistenteIA);
  const pendingAction = useMemo(
    () =>
      [...messages].reverse().find((item) => item.action && !item.actionResolved && !item.isTyping)
        ?.action,
    [messages]
  );

  useEffect(() => {
    const typingIndex = messages.findIndex((item) => item.role === "assistant" && item.isTyping);
    if (typingIndex === -1) return undefined;

    const timer = setInterval(() => {
      setMessages((prev) => {
        const next = [...prev];
        const current = next[typingIndex];
        if (!current || !current.isTyping) return prev;

        const visible = current.displayText ?? "";
        if (visible.length >= current.text.length) {
          next[typingIndex] = { ...current, displayText: current.text, isTyping: false };
          return next;
        }

        const step = current.text.length > 220 ? 4 : 2;
        next[typingIndex] = {
          ...current,
          displayText: current.text.slice(0, visible.length + step),
        };
        return next;
      });
    }, 18);

    return () => clearInterval(timer);
  }, [messages]);

  async function handleConsent() {
    try {
      setConsenting(true);
      setError("");
      const updated = await updateAssistantConsent(true);
      onConsentUpdated?.(updated);
    } catch (err) {
      setError(err.message || "No se pudo activar el asistente.");
    } finally {
      setConsenting(false);
    }
  }

  async function sendMessage() {
    const message = text.trim();
    if (!message || loading) return;
    setText("");
    setError("");
    const baseMessages = messages.map((item) =>
      item.action && !item.actionResolved ? { ...item, actionResolved: true } : item
    );
    setMessages([...baseMessages, { role: "user", text: message }]);

    try {
      setLoading(true);
      const response = await sendTripAssistantMessage(tripId, {
        message,
        conversation: buildConversation(baseMessages),
      });
      setMessages((prev) => [...prev, buildAssistantMessage(response)]);
    } catch (err) {
      setError(err.message || "No se pudo contactar al asistente.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(action) {
    if (!action?.id || loading) return;
    setError("");
    try {
      setLoading(true);
      const response = await sendTripAssistantMessage(tripId, { confirmActionId: action.id });
      setMessages((prev) =>
        prev
          .map((item) => (item.action?.id === action.id ? { ...item, actionResolved: true } : item))
          .concat(buildAssistantMessage(response))
      );
      onActionExecuted?.(response);
    } catch (err) {
      setError(err.message || "No se pudo ejecutar la accion.");
    } finally {
      setLoading(false);
    }
  }

  function discardAction(action) {
    if (!action?.id) return;
    setMessages((prev) =>
      prev.map((item) => (item.action?.id === action.id ? { ...item, actionResolved: true } : item))
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Asistente IA</Text>
              <Text style={styles.title}>Cyanea</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton} accessibilityLabel="Cerrar">
              <FontAwesome6 name="xmark" size={18} color={colors.primary} />
            </Pressable>
          </View>

          {!hasConsent ? (
            <View style={styles.consentBox}>
              <Text style={styles.consentTitle}>Activar asistente</Text>
              <Text style={styles.copy}>
                Para responder, Cyanea enviara al proveedor IA el mensaje que escribas y un
                resumen operativo del viaje. No compartas datos sensibles que no sean necesarios.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={handleConsent}
                disabled={consenting}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              >
                {consenting ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>Aceptar y continuar</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
                {messages.map((item, index) => (
                  <View
                    key={`${item.role}-${index}`}
                    style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}
                  >
                    <Text style={[styles.bubbleText, item.role === "user" && styles.userBubbleText]}>
                      {item.displayText ?? item.text}
                    </Text>
                    {item.action && !item.actionResolved && !item.isTyping ? (
                      <View style={styles.actionBox}>
                        <Text style={styles.actionTitle}>{actionLabel(item.action)}</Text>
                        <View style={styles.actionActions}>
                          <Pressable
                            onPress={() => discardAction(item.action)}
                            style={[styles.secondaryButton, loading && styles.disabled]}
                            disabled={loading}
                          >
                            <Text style={styles.secondaryButtonText}>Descartar</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmAction(item.action)}
                            style={[styles.primarySmallButton, loading && styles.disabled]}
                            disabled={loading}
                          >
                            <Text style={styles.primarySmallButtonText}>Confirmar</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ))}
                {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
              </ScrollView>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {pendingAction ? (
                <Text style={styles.pendingHint}>Hay una accion pendiente de confirmacion.</Text>
              ) : null}

              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="Pedile algo del viaje..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  multiline
                />
                <Pressable
                  onPress={sendMessage}
                  disabled={loading || !text.trim()}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (loading || !text.trim()) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <FontAwesome6 name="paper-plane" size={16} color={colors.textInverse} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlayStrong,
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    ...textStyles.label,
    color: colors.textSecondary,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  consentBox: {
    gap: spacing.md,
  },
  consentTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  copy: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  messages: {
    minHeight: 260,
  },
  messagesContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: radii.md,
    padding: spacing.md,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceAlt,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
  },
  bubbleText: {
    ...textStyles.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  userBubbleText: {
    color: colors.textInverse,
  },
  actionBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  actionTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  actionActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 108,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  primarySmallButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primarySmallButtonText: {
    ...textStyles.bodyStrong,
    color: colors.textInverse,
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    ...textStyles.bodyStrong,
    color: colors.textSecondary,
    fontSize: 13,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
  },
  pendingHint: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  loader: {
    marginVertical: spacing.sm,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.84,
  },
});
