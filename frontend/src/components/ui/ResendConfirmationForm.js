import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { RecoveryField, recoveryStyles as s } from "./RecoveryLayout";
import { resendConfirmation } from "../../services/api";
import { colors } from "../../theme/tokens";

export default function ResendConfirmationForm({ initialEmail = "", editable = true }) {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [until, setUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!until) return undefined;
    const update = () => setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [until]);

  function wait(seconds) {
    setRemaining(seconds);
    setUntil(Date.now() + seconds * 1000);
  }

  async function submit() {
    if (loading || remaining > 0) return;
    setError(null);
    setMessage(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || email.trim().length > 255) {
      setError("Ingresá un correo electrónico válido.");
      return;
    }
    setLoading(true);
    try {
      const result = await resendConfirmation(email);
      setMessage(result.message);
      wait(60);
    } catch (err) {
      setError(err.message || "No se pudo conectar con el servidor. Intentá nuevamente.");
      if (err.status === 429) wait(err.retryAfter || 60);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      {editable ? (
        <RecoveryField label="Correo electrónico" icon="envelope" value={email}
          onChangeText={(value) => { setEmail(value); setError(null); setMessage(null); }}
          autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          editable={!loading} testID="confirmation-email-input" />
      ) : null}
      {message ? <View style={s.infoBox}><Text accessibilityLiveRegion="polite" style={s.infoText}>{message}</Text></View> : null}
      {error ? <View style={s.errorBox}><Text accessibilityLiveRegion="polite" style={s.errorText}>{error}</Text></View> : null}
      <Pressable onPress={submit} disabled={loading || remaining > 0}
        accessibilityRole="button" testID="resend-confirmation-button"
        style={[s.primaryButton, (loading || remaining > 0) && s.buttonDisabled]}>
        {loading ? <ActivityIndicator color={colors.textInverse} /> : (
          <Text style={s.primaryButtonText}>{remaining > 0 ? `Podés reenviar en ${remaining}s` : "Reenviar correo de confirmación"}</Text>
        )}
      </Pressable>
    </View>
  );
}
