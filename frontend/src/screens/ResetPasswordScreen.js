import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import RecoveryLayout, {
  RecoveryField,
  recoveryStyles as s,
} from "../components/ui/RecoveryLayout";
import { resetPassword, validateResetToken } from "../services/PasswordRecovery";
import { colors } from "../theme/tokens";

const LINK_ERROR = "El enlace de recuperación es inválido, venció o ya fue utilizado.";

const RULES = [
  { key: "len", label: "Al menos 8 caracteres", test: (p) => p.length >= 8 },
  { key: "upper", label: "Una letra mayúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Una letra minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "Un número", test: (p) => /\d/.test(p) },
  { key: "special", label: "Un carácter especial", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function isNetworkMessage(message = "") {
  const lower = message.toLowerCase();
  return lower.includes("failed to fetch") || lower.includes("network request failed");
}

export default function ResetPasswordScreen({ navigation, route }) {
  const token = route?.params?.token;

  const [status, setStatus] = useState(token ? "checking" : "invalid"); 
  const [invalidMessage, setInvalidMessage] = useState(LINK_ERROR);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isConfirmBlurred, setIsConfirmBlurred] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  function goToLogin() {
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  }

  useEffect(() => {
    if (!token) return undefined;
    let active = true;

    validateResetToken(token)
      .then(() => active && setStatus("valid"))
      .catch((err) => {
        if (!active) return;
        setInvalidMessage(
          isNetworkMessage(err?.message)
            ? "No se pudo conectar con el servidor. Intentá de nuevo."
            : err?.message || LINK_ERROR
        );
        setStatus("invalid");
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (status !== "done") return undefined;
    const id = setTimeout(goToLogin, 2500);
    return () => clearTimeout(id);
  }, [status]);

  async function handleSubmit() {
    setError(null);

    if (!password || !confirm) {
      setError("Ingresá y confirmá la nueva contraseña.");
      return;
    }
    if (RULES.some((rule) => !rule.test(password))) {
      setError("La contraseña no cumple con todas las reglas indicadas.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(token, password, confirm);
      setSuccessMessage(result.message || "Tu contraseña se restableció correctamente.");
      setStatus("done");
    } catch (err) {
      if (err?.status === 410) {
        setInvalidMessage(err.message || LINK_ERROR);
        setStatus("invalid");
      } else {
        setError(
          isNetworkMessage(err?.message)
            ? "No se pudo conectar con el servidor. Intentá de nuevo."
            : err?.message || "No se pudo restablecer la contraseña."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") {
    return (
      <RecoveryLayout title="Restablecer contraseña">
        <ActivityIndicator color={colors.primary} />
      </RecoveryLayout>
    );
  }

  if (status === "invalid") {
    return (
      <RecoveryLayout title="Enlace no válido" onBack={goToLogin}>
        <View style={s.errorBox}>
          <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
          <Text style={s.errorText}>{invalidMessage}</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("ForgotPassword")}
          style={({ pressed }) => [s.primaryButton, pressed && s.buttonPressed]}
        >
          <Text style={s.primaryButtonText}>Solicitar un nuevo enlace</Text>
        </Pressable>
      </RecoveryLayout>
    );
  }

  if (status === "done") {
    return (
      <RecoveryLayout title="¡Listo!">
        <View style={s.infoBox}>
          <FontAwesome6 color={colors.primary} name="circle-check" size={14} />
          <Text style={s.infoText}>{successMessage} Te llevamos al inicio de sesión…</Text>
        </View>
        <Pressable
          onPress={goToLogin}
          style={({ pressed }) => [s.primaryButton, pressed && s.buttonPressed]}
        >
          <Text style={s.primaryButtonText}>Ir a iniciar sesión</Text>
        </Pressable>
      </RecoveryLayout>
    );
  }

  const touched = password.length > 0;

  return (
    <RecoveryLayout
      title="Restablecer contraseña"
      subtitle="Elegí una nueva contraseña para tu cuenta."
      onBack={goToLogin}
    >
      <RecoveryField
        autoCapitalize="none"
        icon="lock"
        label="Nueva contraseña"
        onChangeText={(text) => {
          setPassword(text);
          setIsConfirmBlurred(false);
          setError(null);
        }}
        onPressRightIcon={() => setShowPassword((current) => !current)}
        rightIcon={showPassword ? "eye-slash" : "eye"}
        secureTextEntry={!showPassword}
        testID="reset-password-input"
        value={password}
      />

      <View style={s.rulesBox}>
        {RULES.map((rule) => {
          const ok = rule.test(password);
          const color = !touched ? colors.textMuted : ok ? colors.primary : colors.danger;
          return (
            <View key={rule.key} style={s.ruleRow}>
              <FontAwesome6
                color={color}
                name={touched && !ok ? "circle-xmark" : "circle-check"}
                size={12}
              />
              <Text style={[s.ruleText, { color }]}>{rule.label}</Text>
            </View>
          );
        })}
      </View>

      <RecoveryField
        autoCapitalize="none"
        icon="lock"
        label="Confirmar contraseña"
        onChangeText={(text) => {
          setConfirm(text);
          setIsConfirmBlurred(false);
          setError(null);
        }}
        onPressRightIcon={() => setShowConfirm((current) => !current)}
        onBlur={() => setIsConfirmBlurred(true)}
        rightIcon={showConfirm ? "eye-slash" : "eye"}
        secureTextEntry={!showConfirm}
        testID="reset-confirm-input"
        value={confirm}
      />

      {isConfirmBlurred && confirm.length > 0 && password !== confirm ? (
        <View style={s.errorBox}>
          <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
          <Text style={s.errorText}>Las contraseñas no coinciden.</Text>
        </View>
      ) : null}

      {error ? (
        <View style={s.errorBox}>
          <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={loading}
        onPress={handleSubmit}
        style={({ pressed }) => [
          s.primaryButton,
          pressed && s.buttonPressed,
          loading && s.buttonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={s.primaryButtonText}>Restablecer contraseña</Text>
        )}
      </Pressable>
    </RecoveryLayout>
  );
}