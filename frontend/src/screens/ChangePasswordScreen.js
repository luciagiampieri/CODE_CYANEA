import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import ScreenHeader from "../components/ui/ScreenHeader";
import PrimaryButton from "../components/ui/PrimaryButton";
import { RecoveryField, recoveryStyles as rs } from "../components/ui/RecoveryLayout";
import { useAuth } from "../context/AuthContext";
import useResponsive from "../hooks/useResponsive";
import { changePassword } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";
import { avisar } from "../utils/dialogs";
import {
  REGLAS_PASSWORD,
  puedeCambiarPassword,
  validarCambioPassword,
} from "../utils/passwordRules";

const PROVEEDORES = { google: "Google", facebook: "Facebook" };

// US 101: cambio de contraseña desde Configuración > Mi cuenta.
export default function ChangePasswordScreen({ navigation }) {
  const { user, login } = useAuth();
  const { isDesktop } = useResponsive();

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [visibles, setVisibles] = useState({ actual: false, nueva: false, confirmacion: false });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const disponible = puedeCambiarPassword(user);
  const tocada = passwordNueva.length > 0;

  function alternarVisible(campo) {
    setVisibles((actual) => ({ ...actual, [campo]: !actual[campo] }));
  }

  function editar(setter) {
    return (valor) => {
      setter(valor);
      setError("");
    };
  }

  async function guardar() {
    const datos = { passwordActual, passwordNueva, confirmacion };
    const errorLocal = validarCambioPassword(datos);
    if (errorLocal) {
      setError(errorLocal);
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const resultado = await changePassword(datos);
      // El token anterior dejó de valer: se guarda el nuevo para seguir conectado.
      if (resultado?.access_token) await login(resultado.access_token);
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmacion("");
      avisar(
        "Contraseña actualizada",
        resultado?.message ||
          "Tu contraseña se cambió correctamente. Cerramos tu sesión en los demás dispositivos.",
        () => navigation.goBack()
      );
    } catch (err) {
      setError(err?.message || "No se pudo cambiar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ScreenHeader
            title="Cambiar contraseña"
            onBack={() => navigation.goBack()}
            backTestID="change-password-back"
          />

          <View style={[styles.card, isDesktop && styles.cardDesktop]}>
            {!disponible ? (
              <View style={rs.infoBox} testID="change-password-unavailable">
                <FontAwesome6 color={colors.primary} name="circle-info" size={14} />
                <Text style={rs.infoText}>
                  {PROVEEDORES[user?.proveedorAutenticacion]
                    ? `Tu cuenta usa inicio de sesión con ${PROVEEDORES[user.proveedorAutenticacion]}, así que no tiene una contraseña de Cyanea para cambiar.`
                    : "El cambio de contraseña solo está disponible para cuentas registradas con correo electrónico."}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.intro}>
                  Por seguridad, al guardar se cerrará tu sesión en los demás dispositivos.
                </Text>

                <RecoveryField
                  autoCapitalize="none"
                  icon="lock"
                  label="Contraseña actual"
                  onChangeText={editar(setPasswordActual)}
                  onPressRightIcon={() => alternarVisible("actual")}
                  rightIcon={visibles.actual ? "eye-slash" : "eye"}
                  secureTextEntry={!visibles.actual}
                  testID="change-password-current"
                  value={passwordActual}
                />

                <RecoveryField
                  autoCapitalize="none"
                  icon="key"
                  label="Nueva contraseña"
                  onChangeText={editar(setPasswordNueva)}
                  onPressRightIcon={() => alternarVisible("nueva")}
                  rightIcon={visibles.nueva ? "eye-slash" : "eye"}
                  secureTextEntry={!visibles.nueva}
                  testID="change-password-new"
                  value={passwordNueva}
                />

                <View style={rs.rulesBox}>
                  {REGLAS_PASSWORD.map((regla) => {
                    const ok = regla.test(passwordNueva);
                    const color = !tocada ? colors.textMuted : ok ? colors.primary : colors.danger;
                    return (
                      <View key={regla.key} style={rs.ruleRow}>
                        <FontAwesome6
                          color={color}
                          name={tocada && !ok ? "circle-xmark" : "circle-check"}
                          size={12}
                        />
                        <Text style={[rs.ruleText, { color }]}>{regla.label}</Text>
                      </View>
                    );
                  })}
                </View>

                <RecoveryField
                  autoCapitalize="none"
                  icon="key"
                  label="Confirmar nueva contraseña"
                  onChangeText={editar(setConfirmacion)}
                  onPressRightIcon={() => alternarVisible("confirmacion")}
                  rightIcon={visibles.confirmacion ? "eye-slash" : "eye"}
                  secureTextEntry={!visibles.confirmacion}
                  testID="change-password-confirm"
                  value={confirmacion}
                />

                {error ? (
                  <View style={rs.errorBox} testID="change-password-error">
                    <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
                    <Text style={rs.errorText}>{error}</Text>
                  </View>
                ) : null}

                <PrimaryButton
                  icon="floppy-disk"
                  label="Guardar contraseña"
                  loading={guardando}
                  onPress={guardar}
                  testID="change-password-submit"
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  card: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderRadius: radii.md,
  },
  cardDesktop: {
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
  },
  intro: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
