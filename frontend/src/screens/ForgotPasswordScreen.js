import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import RecoveryLayout, {
  RecoveryField,
  recoveryStyles as s,
} from "../components/ui/RecoveryLayout";
import { requestPasswordReset } from "../services/PasswordRecovery";
import { colors } from "../theme/tokens";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    const clean = email.trim().toLowerCase();
    if (!clean) {
      setError("Ingresá tu correo electrónico.");
      return;
    }
    if (!EMAIL_REGEX.test(clean)) {
      setError("Ingresá un correo electrónico válido (nombre_usuario@dominio).");
      return;
    }

    setLoading(true);
    try {
      const result = await requestPasswordReset(clean);
      setSuccess(result.message);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      const message = err?.message || "";
      const isNetworkError =
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network request failed");
      setError(
        isNetworkError
          ? "No se pudo conectar con el servidor. Intentá de nuevo."
          : message || "No se pudo enviar el enlace. Intentá de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || cooldown > 0;

  return (
    <RecoveryLayout
      title="Recuperar contraseña"
      subtitle="Ingresá el correo electrónico con el que te registraste y te enviaremos un enlace para restablecer tu contraseña."
      onBack={() => navigation.navigate("Login")}
    >
      <RecoveryField
        autoCapitalize="none"
        autoCorrect={false}
        icon="envelope"
        keyboardType="email-address"
        label="Correo electrónico"
        onChangeText={setEmail}
        testID="forgot-email-input"
        value={email}
      />

      {error ? (
        <View style={s.errorBox}>
          <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {success ? (
        <View style={s.infoBox}>
          <FontAwesome6 color={colors.primary} name="circle-check" size={14} />
          <Text style={s.infoText}>{success}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={disabled}
        onPress={handleSubmit}
        style={({ pressed }) => [
          s.primaryButton,
          pressed && s.buttonPressed,
          disabled && s.buttonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={s.primaryButtonText}>
            {cooldown > 0 ? `Podés reenviar en ${cooldown}s` : success ? "Reenviar enlace" : "Enviar enlace"}
          </Text>
        )}
      </Pressable>
    </RecoveryLayout>
  );
}