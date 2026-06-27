import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import AuthSwitch from "../components/ui/AuthSwitch";
import {
  colors,
  fontFamilies,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

import CyaneaLogo from "../../assets/cyanea_logo_manteca.png";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    nombreUsuario: "",
    email: "",
    password: "",
    confirmarPassword: "",
    aceptaTerminos: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined, general: undefined }));
    }
  }

  function validate() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es requerido.";
    if (!form.apellido.trim()) e.apellido = "El apellido es requerido.";
    if (!form.nombreUsuario.trim()) e.nombreUsuario = "El nombre de usuario es requerido.";
    if (!form.email.trim()) e.email = "El correo es requerido.";
    else if (!EMAIL_REGEX.test(form.email)) e.email = "El correo no tiene un formato válido.";
    if (!form.password) e.password = "La contraseña es requerida.";
    else if (!PASSWORD_REGEX.test(form.password)) e.password = "La contraseña no cumple con la complejidad mínima.";
    if (!form.confirmarPassword) e.confirmarPassword = "Confirmá tu contraseña.";
    else if (form.password !== form.confirmarPassword) e.confirmarPassword = "Las contraseñas no coinciden.";
    if (!form.aceptaTerminos) e.aceptaTerminos = "Debés aceptar los términos y condiciones.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          nombreUsuario: form.nombreUsuario.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          aceptaTerminos: form.aceptaTerminos,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ general: data.detail ?? "Error al registrarse." });
        return;
      }
      navigation.replace("RegistrationSuccess", { email: form.email });
    } catch {
      setErrors({ general: "No se pudo conectar con el servidor." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topPanel}>
            <View style={styles.brandRow}>
                <Image resizeMode="contain" source={CyaneaLogo} style={styles.logoImage} />
              <Text style={styles.brandName}>Cyanea</Text>
            </View>
            <Text style={styles.brandClaim}>MUCHAS MANOS, UN ÚNICO DESTINO</Text>
          </View>

          <View style={styles.body}>
            <AuthSwitch active="register" onChange={(key) => key === "login" && navigation.navigate("Login")} />

            <View style={styles.form}>
              <View style={styles.row}>
                <Field label="Nombre" value={form.nombre} onChangeText={(value) => setField("nombre", value)} error={errors.nombre} />
                <Field label="Apellido" value={form.apellido} onChangeText={(value) => setField("apellido", value)} error={errors.apellido} />
              </View>

              <Field
                autoCapitalize="none"
                label="Usuario"
                value={form.nombreUsuario}
                onChangeText={(value) => setField("nombreUsuario", value)}
                error={errors.nombreUsuario}
              />

              <Field
                autoCapitalize="none"
                keyboardType="email-address"
                label="Correo electrónico"
                value={form.email}
                onChangeText={(value) => setField("email", value)}
                error={errors.email}
              />

              <Field
                autoCapitalize="none"
                label="Contraseña"
                secureTextEntry={!showPassword}
                value={form.password}
                onChangeText={(value) => setField("password", value)}
                rightIcon={showPassword ? "eye-slash" : "eye"}
                onPressRightIcon={() => setShowPassword((current) => !current)}
                error={errors.password}
              />

              <Field
                autoCapitalize="none"
                label="Confirmar contraseña"
                secureTextEntry={!showConfirm}
                value={form.confirmarPassword}
                onChangeText={(value) => setField("confirmarPassword", value)}
                rightIcon={showConfirm ? "eye-slash" : "eye"}
                onPressRightIcon={() => setShowConfirm((current) => !current)}
                error={errors.confirmarPassword}
              />

              <Text style={styles.hint}>
                Debe contener mayúscula, minúscula, número y carácter especial.
              </Text>

              <View style={styles.termsRow}>
                <Switch
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  thumbColor={form.aceptaTerminos ? colors.accent : colors.surface}
                  value={form.aceptaTerminos}
                  onValueChange={(value) => setField("aceptaTerminos", value)}
                />
                <Text style={styles.termsText}>
                  Acepto los <Text style={styles.termsStrong}>Términos y Condiciones</Text>
                </Text>
              </View>
              {errors.aceptaTerminos ? <Text style={styles.fieldError}>{errors.aceptaTerminos}</Text> : null}

              {errors.general ? (
                <View style={styles.errorBox}>
                  <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
                  <Text style={styles.errorText}>{errors.general}</Text>
                </View>
              ) : null}

              <Pressable disabled={loading} onPress={handleSubmit} style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}>
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.submitText}>Crear cuenta</Text>
                )}
              </Pressable>

              <Pressable onPress={() => navigation.navigate("Login")} style={styles.switchLink}>
                <Text style={styles.switchCopy}>
                  ¿Ya tienes cuenta? <Text style={styles.switchStrong}>Inicia sesión</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, error, rightIcon, onPressRightIcon, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, error && styles.inputShellError]}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          {...props}
        />
        {rightIcon ? (
          <Pressable onPress={onPressRightIcon} style={styles.trailingIcon}>
            <FontAwesome6 color={colors.textMuted} name={rightIcon} size={14} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundCanvas,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  topPanel: {
    backgroundColor: colors.primarySoft,
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 45,
    height: 45,
  },
  brandName: {
    ...textStyles.brandTitle,
    color: colors.accent,
    fontSize: 36,
    fontwight: "bold",
  },
  brandClaim: {
    ...textStyles.sectionLabel,
    color: "#9fb0d8",
    marginTop: spacing.sm,
    marginBottom: 10,
    fontSize: 12,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: -radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  form: {
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: spacing.md,
  },
  field: {
    flex: 1,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  inputShell: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  inputShellError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: colors.textPrimary,
    fontFamily: fontFamilies.sans,
    fontSize: 16,
  },
  trailingIcon: {
    paddingLeft: spacing.sm,
  },
  hint: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  termsText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  termsStrong: {
    color: colors.primary,
    fontWeight: "700",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginVertical: spacing.md,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    flex: 1,
  },
  fieldError: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  submitButton: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  submitText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  switchLink: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  switchCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  switchStrong: {
    color: colors.primary,
    fontWeight: "700",
  },
  buttonPressed: {
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
