import { FontAwesome6 } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
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
import { loginUser, loginWithFacebook, loginWithGoogle } from "../services/api";
import AuthSwitch from "../components/ui/AuthSwitch";
import {
  colors,
  fontFamilies,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

import CyaneaLogo from "../../assets/cyanea_logo_manteca.png";

WebBrowser.maybeCompleteAuthSession();

const facebookDiscovery = {
  authorizationEndpoint: "https://www.facebook.com/v19.0/dialog/oauth",
};

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const handledGoogleResponse = useRef(null);
  const handledFacebookResponse = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
  const [fbRequest, fbResponse, promptFbAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID,
      responseType: AuthSession.ResponseType.Token,
      scopes: ["public_profile", "email"],
      redirectUri: AuthSession.makeRedirectUri(),
      usePKCE: false,
    },
    facebookDiscovery
  );

  const googleAuthAvailable = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  );

  const facebookAuthAvailable = Boolean(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID);

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
      const message = err?.message || "";
      const isNetworkError =
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network request failed");

      setError(isNetworkError ? "No se pudo conectar con el servidor. Intentá de nuevo." : message || "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGooglePress() {
    setError(null);
    if (!googleAuthAvailable) {
      setError("Falta configurar el acceso con Google para este entorno.");
      return;
    }

    if (!request) {
      setError("Google todavía no esta listo para iniciar sesión.");
      return;
    }

    setGoogleLoading(true);
    try {
      handledGoogleResponse.current = null;
      await promptAsync();
    } catch (err) {
      setError("No se pudo iniciar el flujo de Google.");
      setGoogleLoading(false);
    }
  }

  async function handleFacebookPress() {
    setError(null);
    if (!facebookAuthAvailable) {
      setError("Falta configurar el acceso con Facebook para este entorno.");
      return;
    }

    if (!fbRequest) {
      setError("Facebook todavía no esta listo para iniciar sesión.");
      return;
    }

    setFacebookLoading(true);
    try {
      handledFacebookResponse.current = null;
      await promptFbAsync();
    } catch (err) {
      setError("No se pudo iniciar el flujo de Facebook.");
      setFacebookLoading(false);
    }
  }

  useEffect(() => {
    if (!response?.type) return;

    console.log("Google auth response", {
      type: response.type,
      params: response.params,
      authentication: response.authentication,
      error: response.error,
      url: response.url,
    });

    const responseKey = JSON.stringify({
      type: response.type,
      params: response.params,
    });

    if (handledGoogleResponse.current === responseKey) {
      return;
    }
    handledGoogleResponse.current = responseKey;

    if (response.type === "success") {
      const googleToken =
        response.params?.id_token ??
        response.authentication?.idToken ??
        response.params?.access_token ??
        response.authentication?.accessToken;
      console.log("Google token selected", {
        hasParamsIdToken: Boolean(response.params?.id_token),
        hasAuthenticationIdToken: Boolean(response.authentication?.idToken),
        hasParamsAccessToken: Boolean(response.params?.access_token),
        hasAuthenticationAccessToken: Boolean(response.authentication?.accessToken),
        tokenPreview:
          typeof googleToken === "string" ? `${googleToken.slice(0, 20)}...` : null,
      });
      if (!googleToken) {
        setError("Google no devolvio un token válido.");
        setGoogleLoading(false);
        return;
      }

      (async () => {
        try {
          const { access_token } = await loginWithGoogle(googleToken);
          await login(access_token);
        } catch (err) {
          setError(err.message || "No se pudo iniciar sesión con Google.");
        } finally {
          setGoogleLoading(false);
        }
      })();
      return;
    }

    setGoogleLoading(false);
    if (response.type !== "dismiss") {
      setError("Se canceló o falló el inicio de sesión con Google.");
    }
  }, [googleLoading, login, response]);

  useEffect(() => {
    if (!fbResponse?.type) return;

    const responseKey = JSON.stringify({
      type: fbResponse.type,
      params: fbResponse.params,
    });

    if (handledFacebookResponse.current === responseKey) {
      return;
    }
    handledFacebookResponse.current = responseKey;

    if (fbResponse.type === "success") {
      const facebookToken =
        fbResponse.params?.access_token ?? fbResponse.authentication?.accessToken;

      if (!facebookToken) {
        setError("Facebook no devolvio un token válido.");
        setFacebookLoading(false);
        return;
      }

      (async () => {
        try {
          
          const result = await loginWithFacebook(facebookToken);

          if (!result.requiereRegistro) {
            await login(result.access_token);
            return;
          }

          navigation.navigate("FacebookRegister", {
            accessToken: facebookToken,
            nombre: result.nombre,
            apellido: result.apellido,
            email: result.email,
            fotoUrl: result.fotoUrl,
          });
        } catch (err) {
          setError(err.message || "No se pudo iniciar sesión con Facebook.");
        } finally {
          setFacebookLoading(false);
        }
      })();
      return;
    }

    setFacebookLoading(false);
    if (fbResponse.type !== "dismiss") {
      setError("Se canceló o falló el inicio de sesión con Facebook.");
    }
  }, [facebookLoading, login, fbResponse]);

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
                <SocialButton disabled={googleLoading} icon="G" label="Google" loading={googleLoading} onPress={handleGooglePress} />
                <SocialButton
                  disabled={facebookLoading}
                  iconName="facebook"
                  iconColor="#1877F2"
                  label="Facebook"
                  loading={facebookLoading}
                  onPress={handleFacebookPress}
                />
              </View>

              <Pressable onPress={() => navigation.navigate("Register")} style={styles.registerLink}>
                <Text style={styles.registerCopy}>
                  ¿No tenés cuenta? <Text style={styles.registerStrong}>Regístrate</Text>
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

function SocialButton({
  label,
  icon,
  iconName,
  iconColor,
  apple = false,
  loading = false,
  onPress,
  disabled = false,
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.socialButton, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="small" style={styles.socialIcon} />
      ) : iconName ? (
        <FontAwesome6 color={iconColor || colors.textPrimary} name={iconName} size={17} style={styles.socialIcon} />
      ) : apple ? (
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
    fontWeight: "bold",
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