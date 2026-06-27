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
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { loginUser } from "../services/api";
import AuthSwitch from "../components/ui/AuthSwitch";
import {
  colors,
  fontFamilies,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

import CyaneaLogo from "../../assets/cyanea_logo_manteca.png";

export default function LoginScreen({ navigation }) {
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
      const { access_token } = await loginUser(email.trim().toLowerCase(), password);
      await login(access_token);
    } catch (err) {
      setError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topPanel}>
            <View style={styles.brandRow}>
              <Image resizeMode="contain" source={CyaneaLogo} style={styles.logoImage} />
              <Text style={styles.brandName}>Cyanea</Text>
            </View>
            <Text style={styles.brandClaim}>MUCHAS MANOS, UN ÚNICO DESTINO</Text>
          </View>

          <View style={styles.body}>
            <AuthSwitch active="login" onChange={(key) => key === "register" && navigation.navigate("Register")} />

            <View style={styles.form}>
              <Field
                icon="envelope"
                keyboardType="email-address"
                label="Correo electrónico"
                onChangeText={setEmail}
                value={email}
              />

              <Field
                icon="lock"
                label="Contraseña"
                onChangeText={setPassword}
                rightIcon={showPassword ? "eye-slash" : "eye"}
                onPressRightIcon={() => setShowPassword((current) => !current)}
                secureTextEntry={!showPassword}
                value={password}
              />

              <Pressable style={styles.forgotWrap}>
                <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
              </Pressable>

              {error ? (
                <View style={styles.errorBox}>
                  <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable disabled={loading} onPress={handleLogin} style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}>
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <>
                    <Text style={styles.loginButtonText}>Entrar</Text>
                    <FontAwesome6 color={colors.textInverse} name="arrow-right" size={14} style={styles.loginButtonIcon} />
                  </>
                )}
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o continúa con</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialRow}>
                <SocialButton icon="G" label="Google" />
                <SocialButton apple label="Apple" />
              </View>

              <Pressable onPress={() => navigation.navigate("Register")} style={styles.registerLink}>
                <Text style={styles.registerCopy}>
                  ¿No tienes cuenta? <Text style={styles.registerStrong}>Regístrate</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  icon,
  rightIcon,
  onPressRightIcon,
  ...props
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <FontAwesome6 color={colors.textMuted} name={icon} size={14} style={styles.inputIcon} />
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
    </View>
  );
}

function SocialButton({ label, icon, apple = false }) {
  return (
    <Pressable style={({ pressed }) => [styles.socialButton, pressed && styles.buttonPressed]}>
      {apple ? (
        <FontAwesome6 color={colors.textPrimary} name="apple" size={17} style={styles.socialIcon} />
      ) : (
        <Text style={styles.googleGlyph}>{icon}</Text>
      )}
      <Text style={styles.socialLabel}>{label}</Text>
    </Pressable>
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
    gap: spacing.sm,
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
  field: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  inputIcon: {
    marginRight: spacing.sm,
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
    paddingVertical: spacing.sm,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  forgotText: {
    ...textStyles.meta,
    color: colors.primary,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    flex: 1,
  },
  loginButton: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: spacing.sm,
  },
  loginButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  loginButtonIcon: {
    marginLeft: spacing.sm,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderStrong,
  },
  dividerText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  socialRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  socialButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  socialIcon: {
    marginRight: spacing.sm,
  },
  googleGlyph: {
    marginRight: spacing.sm,
    color: "#db4437",
    fontFamily: fontFamilies.sans,
    fontSize: 20,
    fontWeight: "700",
  },
  socialLabel: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  registerLink: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  registerCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  registerStrong: {
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
