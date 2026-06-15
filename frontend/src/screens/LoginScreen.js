import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { loginUser } from "../services/api";
import { colors, radii, shadows, spacing, typography } from "../theme/tokens";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Completá el correo electrónico y la contraseña.");
      return;
    }

    setLoading(true);
    try {
      const { access_token } = await loginUser(email.trim(), password);
      await login(access_token);
      // AppNavigator reacciona automáticamente al cambio de token
    } catch (err) {
      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[colors.primaryStrong, colors.primary]} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.centered}
      >
        <View style={styles.card}>
          {/* Marca */}
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <FontAwesome6 color={colors.accent} name="location-dot" size={24} />
            </View>
            <View>
              <Text style={styles.brandName}>CYANEA</Text>
              <Text style={styles.brandSubtitle}>Planificación colaborativa</Text>
            </View>
          </View>

          <Text style={styles.heading}>Iniciar sesión</Text>

          {/* Campo email */}
          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <View style={styles.inputWrap}>
              <FontAwesome6
                color={colors.textMuted}
                name="envelope"
                size={13}
                style={styles.inputIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="usuario@ejemplo.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={email}
              />
            </View>
          </View>

          {/* Campo contraseña */}
          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputWrap}>
              <FontAwesome6
                color={colors.textMuted}
                name="lock"
                size={13}
                style={styles.inputIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                secureTextEntry={!showPassword}
                style={styles.input}
                value={password}
              />
              <Pressable
                accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
              >
                <FontAwesome6
                  color={colors.textMuted}
                  name={showPassword ? "eye-slash" : "eye"}
                  size={13}
                />
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <FontAwesome6 color={colors.danger} name="circle-exclamation" size={13} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Botón */}
          <Pressable
            disabled={loading}
            onPress={handleLogin}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryStrong} size="small" />
            ) : (
              <Text style={styles.btnText}>Ingresar</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    ...shadows.card,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: colors.textPrimary,
    fontSize: typography.subheading,
    fontWeight: "900",
    letterSpacing: 1,
  },
  brandSubtitle: {
    color: colors.textMuted,
    fontSize: typography.micro,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: "900",
    marginBottom: spacing.xl,
  },
  field: { marginBottom: spacing.md },
  label: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: typography.small,
    marginBottom: spacing.xs,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    height: 48,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  eyeBtn: { padding: spacing.sm },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fff1f1",
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.small,
    flex: 1,
  },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnPressed: { backgroundColor: colors.accentStrong },
  btnText: {
    color: colors.primaryStrong,
    fontWeight: "900",
    fontSize: typography.body,
  },
});