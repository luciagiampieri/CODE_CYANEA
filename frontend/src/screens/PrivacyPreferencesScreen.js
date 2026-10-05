import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import useResponsive from "../hooks/useResponsive";
import { getPrivacySettings, updatePrivacySettings } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

export const OPCIONES_VISIBILIDAD = [
  { value: "participantes", label: "Participantes del viaje" },
  { value: "privado", label: "Privado" },
];

// Campos del perfil que se pueden ocultar a los demás participantes (US 61, CA 1 y 2).
export const CAMPOS_VISIBILIDAD = [
  {
    key: "visibilidadNombre",
    icon: "id-card",
    title: "Nombre y apellido",
    privateHint: "Si es privado, los demás ven tu nombre de usuario.",
  },
  {
    key: "visibilidadEmail",
    icon: "envelope",
    title: "Correo electrónico",
    privateHint: "Si es privado, nadie más ve tu correo.",
  },
  {
    key: "visibilidadFotoPerfil",
    icon: "image-portrait",
    title: "Foto de perfil",
    privateHint: "Si es privada, los demás ven tus iniciales.",
  },
];

const CAMPOS_PAYLOAD = [
  "visibilidadNombre",
  "visibilidadEmail",
  "visibilidadFotoPerfil",
  "permiteBusquedaPorUsuario",
];

function soloPreferencias(datos) {
  return CAMPOS_PAYLOAD.reduce((acc, campo) => ({ ...acc, [campo]: datos?.[campo] }), {});
}

function sonIguales(a, b) {
  return CAMPOS_PAYLOAD.every((campo) => a?.[campo] === b?.[campo]);
}

export default function PrivacyPreferencesScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [guardadas, setGuardadas] = useState(null);
  const [form, setForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const datos = soloPreferencias(await getPrivacySettings());
      setGuardadas(datos);
      setForm(datos);
    } catch (error) {
      setLoadError(error.message || "No se pudieron cargar tus preferencias de privacidad.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function cambiar(campo, valor) {
    setMensaje(null);
    setForm((actual) => ({ ...actual, [campo]: valor }));
  }

  async function handleGuardar() {
    if (!form || saving) return;
    setSaving(true);
    setMensaje(null);
    try {
      const respuesta = await updatePrivacySettings(form);
      const datos = soloPreferencias(respuesta);
      setGuardadas(datos);
      setForm(datos);
      setMensaje({
        tipo: "exito",
        texto: respuesta?.message || "Tu información de privacidad se actualizó correctamente.",
      });
    } catch (error) {
      setMensaje({
        tipo: "error",
        texto: error.message || "No se pudieron guardar los cambios. Intentá nuevamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  const hayCambios = form && guardadas && !sonIguales(form, guardadas);
  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              tone="light"
              testID="privacy-prefs-back-button"
            />
          </View>
          <Text style={styles.title}>Privacidad</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : loadError ? (
          <View style={cardStyle}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <View style={cardStyle}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quién ve tu información</Text>
              <View style={styles.groupContainer}>
                {CAMPOS_VISIBILIDAD.map((campo, index) => (
                  <View
                    key={campo.key}
                    style={[
                      styles.fieldRow,
                      index < CAMPOS_VISIBILIDAD.length - 1 && styles.itemRowDivider,
                    ]}
                  >
                    <View style={styles.fieldHeader}>
                      <View style={styles.iconCircle}>
                        <FontAwesome6 name={campo.icon} size={15} color={colors.primary} />
                      </View>
                      <View style={styles.itemTexts}>
                        <Text style={styles.itemTitle}>{campo.title}</Text>
                        {form[campo.key] === "privado" ? (
                          <Text style={styles.itemSubtitle}>{campo.privateHint}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.options} accessibilityRole="radiogroup">
                      {OPCIONES_VISIBILIDAD.map((opcion) => {
                        const activa = form[campo.key] === opcion.value;
                        return (
                          <Pressable
                            key={opcion.value}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: activa, disabled: saving }}
                            disabled={saving}
                            onPress={() => cambiar(campo.key, opcion.value)}
                            style={[styles.option, activa && styles.optionActive]}
                            testID={`privacy-option-${campo.key}-${opcion.value}`}
                          >
                            <Text style={[styles.optionText, activa && styles.optionTextActive]}>
                              {opcion.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.helperText}>
                Tu nombre de usuario siempre es visible para los participantes de tus viajes,
                porque es lo que te identifica.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Búsqueda</Text>
              <View style={styles.groupContainer}>
                <View style={styles.itemRow}>
                  <View style={styles.fieldHeader}>
                    <View style={styles.iconCircle}>
                      <FontAwesome6 name="magnifying-glass" size={15} color={colors.primary} />
                    </View>
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>Permitir que me encuentren</Text>
                      <Text style={styles.itemSubtitle}>
                        Otros viajeros pueden buscarte por nombre de usuario para invitarte a un
                        viaje. Si lo desactivás, solo pueden invitarte con tu correo.
                      </Text>
                    </View>
                  </View>
                  <Switch
                    testID="privacy-search-switch"
                    value={Boolean(form.permiteBusquedaPorUsuario)}
                    onValueChange={(valor) => cambiar("permiteBusquedaPorUsuario", valor)}
                    disabled={saving}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={form.permiteBusquedaPorUsuario ? colors.accent : colors.surface}
                  />
                </View>
              </View>
            </View>

            {mensaje ? (
              <View
                style={[styles.message, mensaje.tipo === "error" ? styles.messageError : styles.messageOk]}
                testID={mensaje.tipo === "error" ? "privacy-error-message" : "privacy-success-message"}
              >
                <FontAwesome6
                  name={mensaje.tipo === "error" ? "circle-exclamation" : "circle-check"}
                  size={14}
                  color={mensaje.tipo === "error" ? colors.danger : colors.primary}
                />
                <Text style={[styles.messageText, mensaje.tipo === "error" && styles.errorText]}>
                  {mensaje.texto}
                </Text>
              </View>
            ) : null}

            <PrimaryButton
              icon="floppy-disk"
              label="Guardar cambios"
              loading={saving}
              onPress={hayCambios ? handleGuardar : undefined}
              style={!hayCambios && styles.saveDisabled}
              testID="privacy-save-button"
            />
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: "center",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 26,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  center: {
    padding: spacing.xxl,
    alignItems: "center",
  },
  card: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  cardDesktop: {
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  groupContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fieldRow: {
    padding: spacing.md,
    gap: spacing.md,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  itemTexts: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  itemSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
  },
  options: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  option: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
    textAlign: "center",
  },
  optionTextActive: {
    color: colors.textInverse,
  },
  helperText: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    marginLeft: 4,
  },
  message: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  messageOk: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primarySoft,
  },
  messageError: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
  },
  messageText: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  saveDisabled: {
    opacity: 0.5,
  },
  errorText: {
    ...textStyles.body,
    color: colors.danger,
  },
});
