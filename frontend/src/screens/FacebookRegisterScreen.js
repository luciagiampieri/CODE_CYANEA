import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { registerWithFacebook } from "../services/api";
import {
  colors,
  radii,
  spacing,
  textStyles,
} from "../theme/tokens";

export default function FacebookRegisterScreen({ route }) {
  const { login } = useAuth();

  const {
    accessToken,
    nombre,
    apellido,
    email,
    fotoUrl,
  } = route.params;

  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleRegister() {
    setError(null);

    if (!aceptaTerminos) {
      setError("Debés aceptar los términos y condiciones.");
      return;
    }

    setLoading(true);

    try {
      const { access_token } = await registerWithFacebook(
        accessToken,
        aceptaTerminos
      );

      await login(access_token);
    } catch (err) {
      setError(
        err.message ||
          "No se pudo completar el registro."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {fotoUrl ? (
        <Image
          source={{ uri: fotoUrl }}
          style={styles.avatar}
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <FontAwesome6
            name="user"
            size={40}
            color={colors.textMuted}
          />
        </View>
      )}

      <Text style={styles.title}>
        Completar registro
      </Text>

      <Text style={styles.subtitle}>
        Revisá tus datos y aceptá los términos para
        finalizar tu registro.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Nombre</Text>
        <Text style={styles.value}>{nombre}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Apellido</Text>
        <Text style={styles.value}>{apellido}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Correo electrónico</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <View style={styles.termsRow}>
        <Switch
          value={aceptaTerminos}
          onValueChange={setAceptaTerminos}
          trackColor={{
            false: colors.border,
            true: colors.primary,
          }}
          thumbColor={colors.surface}
        />

        <Text style={styles.termsText}>
          Acepto los{" "}
          <Text style={styles.termsStrong}>
            Términos y Condiciones
          </Text>
        </Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <FontAwesome6
            name="circle-exclamation"
            size={14}
            color={colors.danger}
          />

          <Text style={styles.errorText}>
            {error}
          </Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          loading && styles.buttonDisabled,
        ]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator
            color={colors.textInverse}
          />
        ) : (
          <Text style={styles.buttonText}>
            Finalizar registro
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    backgroundColor: colors.background,
    justifyContent: "center",
  },

  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },

  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },

  title: {
    ...textStyles.title,
    textAlign: "center",
    color: colors.primary,
  },

  subtitle: {
    ...textStyles.body,
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },

  infoBox: {
    marginBottom: spacing.lg,
  },

  label: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },

  value: {
    ...textStyles.body,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },

  termsText: {
    marginLeft: spacing.sm,
    flex: 1,
    color: colors.textSecondary,
  },

  termsStrong: {
    color: colors.primary,
    fontWeight: "700",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.lg,
  },

  errorText: {
    marginLeft: spacing.sm,
    color: colors.danger,
    flex: 1,
  },

  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },

  buttonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },

  buttonPressed: {
    opacity: 0.85,
  },

  buttonDisabled: {
    opacity: 0.6,
  },
});