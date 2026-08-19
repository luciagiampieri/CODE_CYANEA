import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import Avatar from "../components/ui/Avatar";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, updateCurrentUser, uploadProfilePhoto } from "../services/api";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

const initialForm = {
  nombre: "",
  apellido: "",
  nombreUsuario: "",
  email: "",
  fotoUrl: "",
};

export default function EditProfileScreen({ navigation }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const { isDesktop } = useResponsive();

  useEffect(() => {
    loadProfile();
  }, []);

  useFocusEffect(() => {
    setStatusMessage("");
    return () => {
      setStatusMessage("");
    };
  });

  async function loadProfile() {
    setLoading(true);
    setStatusMessage("");
    try {
      const profile = await getCurrentUser();
      setForm({
        nombre: profile.nombre ?? "",
        apellido: profile.apellido ?? "",
        nombreUsuario: profile.nombreUsuario ?? "",
        email: profile.email ?? "",
        fotoUrl: profile.fotoUrl ?? "",
      });
    } catch (error) {
      setStatusMessage(error.message || "No se pudo cargar el perfil.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
    setStatusMessage("");
  }

  function validateForm() {
    const nextErrors = {};
    if (!form.nombre.trim()) nextErrors.nombre = "El nombre es obligatorio.";
    if (!form.apellido.trim()) nextErrors.apellido = "El apellido es obligatorio.";
    if (!form.nombreUsuario.trim()) nextErrors.nombreUsuario = "El nombre de usuario es obligatorio.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setStatusMessage("");
    try {
      const updated = await updateCurrentUser({
        nombre: form.nombre,
        apellido: form.apellido,
        nombreUsuario: form.nombreUsuario,
        fotoUrl: form.fotoUrl || null,
      });

      setForm((current) => ({
        ...current,
        nombre: updated.nombre ?? current.nombre,
        apellido: updated.apellido ?? current.apellido,
        nombreUsuario: updated.nombreUsuario ?? current.nombreUsuario,
        email: updated.email ?? current.email,
        fotoUrl: updated.fotoUrl ?? current.fotoUrl,
      }));
      setStatusMessage("La información del perfil se actualizó correctamente.");
      Alert.alert("Perfil actualizado", "La información del perfil se actualizó correctamente.");
      navigation.goBack();
    } catch (error) {
      setStatusMessage(error.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSelectPhoto() {
    setStatusMessage("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      setUploadingPhoto(true);
      const upload = await uploadProfilePhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName || asset.file?.name || `perfil.${asset.uri.split(".").pop() || "jpg"}`,
        file: asset.file,
      });

      setForm((current) => ({
        ...current,
        fotoUrl: upload.fotoUrl,
      }));
      setStatusMessage(upload.message || "Foto de perfil actualizada correctamente.");
    } catch (error) {
      setStatusMessage(error.message || "No se pudo actualizar la foto de perfil.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handleDeletePhoto() {
    if (!form.fotoUrl) {
      return;
    }

    // Alert.alert con múltiples botones no está soportado en RN Web,
    // así que en web usamos window.confirm como alternativa.
    if (Platform.OS === "web") {
      const confirmado =
        typeof window !== "undefined" &&
        window.confirm("¿Querés quitar tu foto de perfil actual?");
      if (confirmado) {
        confirmDeletePhoto();
      }
      return;
    }

    Alert.alert(
      "Eliminar foto de perfil",
      "¿Querés quitar tu foto de perfil actual?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: confirmDeletePhoto,
        },
      ]
    );
  }

  async function confirmDeletePhoto() {
    setStatusMessage("");
    setDeletingPhoto(true);
    try {
      const updated = await updateCurrentUser({
        nombre: form.nombre,
        apellido: form.apellido,
        nombreUsuario: form.nombreUsuario,
        fotoUrl: null,
      });

      setForm((current) => ({
        ...current,
        nombre: updated.nombre ?? current.nombre,
        apellido: updated.apellido ?? current.apellido,
        nombreUsuario: updated.nombreUsuario ?? current.nombreUsuario,
        email: updated.email ?? current.email,
        fotoUrl: updated.fotoUrl ?? null,
      }));
      setStatusMessage("La foto de perfil se eliminó correctamente.");
    } catch (error) {
      setStatusMessage(error.message || "No se pudo eliminar la foto de perfil.");
    } finally {
      setDeletingPhoto(false);
    }
  }

  const fieldShellStyle = useMemo(
    () => [styles.formShell, isDesktop && styles.formShellDesktop],
    [isDesktop]
  );

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={fieldShellStyle}>
            <View style={styles.topBackButtonWrap}>
              <PrimaryButton
                icon="arrow-left"
                label=""
                onPress={() => navigation.goBack()}
                style={styles.topBackButton}
                variant="secondary"
              />
            </View>

            <Text style={styles.eyebrow}>Gestionar perfil</Text>
            <Text style={styles.title}>Edita tu cuenta</Text>
            <Text style={styles.copy}>
              Actualiza tus datos personales y tu foto para mantener el perfil al día.
            </Text>

            <View style={styles.avatarSection}>
              <View style={styles.avatarWrapper}>
                <Avatar imageUrl={form.fotoUrl} name={`${form.nombre} ${form.apellido}`} size={92} />
                {form.fotoUrl ? (
                  <Pressable
                    accessibilityLabel="Eliminar foto de perfil"
                    accessibilityRole="button"
                    disabled={deletingPhoto}
                    hitSlop={8}
                    onPress={handleDeletePhoto}
                    style={({ pressed }) => [
                      styles.avatarRemoveBadge,
                      pressed && styles.avatarRemoveBadgePressed,
                    ]}
                  >
                    {deletingPhoto ? (
                      <ActivityIndicator color={colors.surface ?? "#fff"} size="small" />
                    ) : (
                      <Text style={styles.avatarRemoveBadgeText}>✕</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
              <PrimaryButton
                icon="image"
                iconPosition="left"
                label={uploadingPhoto ? "Subiendo foto..." : "Cambiar foto"}
                loading={uploadingPhoto}
                onPress={handleSelectPhoto}
                style={styles.photoButton}
                variant="secondary"
              />
            </View>

            <View style={styles.formGrid}>
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  onChangeText={(value) => updateField("nombre", value)}
                  placeholder="Nombre"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, errors.nombre && styles.inputError]}
                  value={form.nombre}
                />
                {errors.nombre ? <Text style={styles.errorText}>{errors.nombre}</Text> : null}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Apellido</Text>
                <TextInput
                  onChangeText={(value) => updateField("apellido", value)}
                  placeholder="Apellido"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, errors.apellido && styles.inputError]}
                  value={form.apellido}
                />
                {errors.apellido ? <Text style={styles.errorText}>{errors.apellido}</Text> : null}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Nombre de usuario</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(value) => updateField("nombreUsuario", value)}
                  placeholder="Nombre de usuario"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, errors.nombreUsuario && styles.inputError]}
                  value={form.nombreUsuario}
                />
                {errors.nombreUsuario ? <Text style={styles.errorText}>{errors.nombreUsuario}</Text> : null}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Correo electrónico</Text>
                <TextInput
                  editable={false}
                  selectTextOnFocus={false}
                  style={[styles.input, styles.inputReadonly]}
                  value={form.email}
                />
                <Text style={styles.helperText}>Este dato es solo de lectura.</Text>
              </View>
            </View>

            {statusMessage ? (
              <Text style={styles.statusText}>{statusMessage}</Text>
            ) : null}

            <PrimaryButton
              icon="floppy-disk"
              label="Guardar cambios"
              loading={saving || loading}
              onPress={handleSave}
              style={styles.saveButton}
            />
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
  formShell: {
    ...surfaces.card,
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  formShellDesktop: {
    maxWidth: 720,
    alignSelf: "center",
    width: "100%",
  },
  topBackButton: {
    alignSelf: "flex-start",
  },
  eyebrow: {
    ...textStyles.sectionLabel,
    color: "#8b6c37",
    fontSize: 13,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 30,
  },
  copy: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  avatarSection: {
    marginTop: spacing.sm,
    alignItems: "center",
    gap: spacing.md,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarRemoveBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface ?? "#fff",
    zIndex: 10,
    elevation: 4,
  },
  avatarRemoveBadgePressed: {
    opacity: 0.8,
  },
  avatarRemoveBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 14,
  },
  photoButton: {
    minWidth: 190,
  },
  formGrid: {
    gap: spacing.md,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
  },
  input: {
    ...surfaces.input,
    ...textStyles.body,
    color: colors.textPrimary,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputReadonly: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textSecondary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  helperText: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
  },
  statusText: {
    ...textStyles.body,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});