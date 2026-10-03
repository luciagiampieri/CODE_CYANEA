import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, registerPushToken, updateCurrentUser } from "../services/api";
import { getExpoPushTokenForDevice, getPushAvailabilityReason } from "../services/pushNotifications";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

// Tipos de evento configurables por canal (US 60, criterio 1).
export const TIPOS_NOTIFICACION = [
  {
    emailKey: "recibeEmailsNuevasActividades",
    pushKey: "recibePushNuevasActividades",
    icon: "calendar-plus",
    title: "Nuevas actividades",
    subtitle: "Cuando alguien agrega una actividad al itinerario",
  },
  {
    emailKey: "recibeEmailsCambiosViaje",
    pushKey: "recibePushCambiosViaje",
    icon: "route",
    title: "Cambios en el itinerario",
    subtitle: "Actividades modificadas o eliminadas y cambios en la informacion del viaje",
  },
  {
    emailKey: "recibeEmailsNuevosGastos",
    pushKey: "recibePushNuevosGastos",
    icon: "receipt",
    title: "Nuevos gastos",
    subtitle: "Cuando alguien registra un gasto en un viaje",
  },
  {
    emailKey: "recibeEmailsNuevaVotacion",
    pushKey: "recibePushNuevaVotacion",
    icon: "square-poll-vertical",
    title: "Votaciones activas",
    subtitle: "Cuando se abre una votacion en alguno de tus viajes",
  },
  {
    emailKey: "recibeEmailsRecordatoriosDeuda",
    pushKey: "recibePushRecordatoriosDeuda",
    icon: "sack-dollar",
    title: "Deudas pendientes",
    subtitle: "Avisos relacionados con liquidaciones y saldos pendientes",
  },
  {
    emailKey: "recibeEmailsRecordatoriosReserva",
    pushKey: "recibePushRecordatoriosReserva",
    icon: "calendar-check",
    title: "Vencimientos de reservas",
    subtitle: "Avisos vinculados a reservas y sus vencimientos",
  },
  {
    emailKey: "recibeEmailsRecordatoriosActividad",
    pushKey: "recibePushRecordatoriosActividad",
    icon: "calendar-day",
    title: "Actividades proximas",
    subtitle: "Avisos antes del inicio de actividades del itinerario",
  },
];

const CAMPOS_PREFERENCIA = TIPOS_NOTIFICACION.flatMap((tipo) => [tipo.emailKey, tipo.pushKey]);

// Textos del consentimiento explicito por canal (US 60, criterio 3; RNF-13).
export const CONSENTIMIENTO_EMAIL = {
  titulo: "Activar notificaciones por email",
  mensaje:
    "Al aceptar, autorizas a Cyanea a enviarte correos con avisos sobre tus viajes, " +
    "solo para los tipos de aviso que actives. Podes revocar este consentimiento en " +
    "cualquier momento desde esta pantalla.",
};

export const CONSENTIMIENTO_PUSH = {
  titulo: "Activar notificaciones push",
  mensaje:
    "Al aceptar, autorizas a Cyanea a enviarte notificaciones push con avisos sobre tus " +
    "viajes, solo para los tipos de aviso que actives. A continuacion el sistema te va a " +
    "pedir permiso para este dispositivo. Podes revocar este consentimiento en cualquier " +
    "momento desde esta pantalla.",
};

export function isPushDisponible(platformOS, availabilityReason = getPushAvailabilityReason()) {
  return platformOS !== "web" && !availabilityReason;
}

export function confirmarConsentimiento({ titulo, mensaje }) {
  if (Platform.OS === "web") {
    const confirmado = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(`${titulo}\n\n${mensaje}`)
      : false;
    return Promise.resolve(Boolean(confirmado));
  }

  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      mensaje,
      [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Acepto", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

function formatearFechaConsentimiento(valor) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getPushChannelSubtitle({ pushDisponible, pushActivo, reason }) {
  if (pushDisponible) return "Permite recibir avisos en este dispositivo.";
  if (pushActivo) {
    return "Activadas desde la app movil. Desde aca podes ajustar los tipos de aviso o revocarlas.";
  }
  if (reason === "expo_go_android") {
    return "Disponible en una build movil instalada; Expo Go no soporta push remotas en Android.";
  }
  return "Se activan desde la app movil.";
}

export default function NotificationPreferencesScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [loadError, setLoadError] = useState("");
  const savingRef = useRef(false);
  const primerFocoRef = useRef(true);

  const cargarPreferencias = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) {
        setLoading(true);
        setLoadError("");
      }
      const me = await getCurrentUser();
      // Si hay un guardado en curso no se pisa el estado optimista.
      if (!savingRef.current) setUsuario(me);
    } catch (error) {
      if (!silencioso) setLoadError(error.message || "No se pudieron cargar tus preferencias.");
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarPreferencias();
  }, [cargarPreferencias]);

  // Al volver a la pantalla se recargan las preferencias, para reflejar
  // cambios hechos desde otro dispositivo de la cuenta (US 60, criterio 4).
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const unsubscribe = navigation.addListener("focus", () => {
      if (primerFocoRef.current) {
        primerFocoRef.current = false;
        return;
      }
      cargarPreferencias({ silencioso: true });
    });
    return unsubscribe;
  }, [navigation, cargarPreferencias]);

  function iniciarGuardado() {
    savingRef.current = true;
    setSaving(true);
  }

  function finalizarGuardado() {
    savingRef.current = false;
    setSaving(false);
  }

  function buildUserPayload(actualizado) {
    const payload = {
      nombre: actualizado.nombre,
      apellido: actualizado.apellido,
      nombreUsuario: actualizado.nombreUsuario,
      fotoUrl: actualizado.fotoUrl,
      consienteNotificacionesEmail: actualizado.consienteNotificacionesEmail,
      consienteNotificacionesPush: actualizado.consienteNotificacionesPush,
    };
    CAMPOS_PREFERENCIA.forEach((campo) => {
      payload[campo] = actualizado[campo];
    });
    return payload;
  }

  async function persistCambio(cambios) {
    if (!usuario || savingRef.current) return;

    const anterior = usuario;
    const optimista = { ...usuario, ...cambios };
    setUsuario(optimista);
    iniciarGuardado();
    try {
      const respuesta = await updateCurrentUser(buildUserPayload(optimista));
      if (respuesta && typeof respuesta === "object") {
        setUsuario((actual) => ({ ...actual, ...respuesta }));
      }
    } catch (error) {
      setUsuario(anterior);
      Alert.alert("No se pudo guardar", error.message || "Intenta nuevamente en unos segundos.");
    } finally {
      finalizarGuardado();
    }
  }

  async function handleEmailConsentChange(value) {
    if (!usuario || savingRef.current) return;

    if (value) {
      const acepta = await confirmarConsentimiento(CONSENTIMIENTO_EMAIL);
      if (!acepta) return;
    }
    await persistCambio({ consienteNotificacionesEmail: value });
  }

  async function handlePushConsentChange(value) {
    if (!usuario || savingRef.current) return;

    // Revocar se permite desde cualquier plataforma, incluida la web.
    if (!value) {
      await persistCambio({ consienteNotificacionesPush: false });
      return;
    }

    // Otorgar requiere un dispositivo capaz de recibir push.
    if (!isPushDisponible(Platform.OS)) return;

    const acepta = await confirmarConsentimiento(CONSENTIMIENTO_PUSH);
    if (!acepta) return;

    const anterior = usuario;
    iniciarGuardado();
    try {
      const pushToken = await getExpoPushTokenForDevice();

      if (!pushToken.token) {
        const mensajes = {
          unsupported_platform: "Las notificaciones push todavia no estan disponibles en web.",
          expo_go_android: "Disponible en una build movil instalada; Expo Go no soporta push remotas en Android.",
          permission_denied: "Necesitas aceptar el permiso del sistema para activar notificaciones push.",
          project_id_missing: "Falta configurar el proyecto Expo para obtener el token push.",
          firebase_not_configured: "Falta configurar Firebase/FCM en la build Android. Agrega google-services.json y recompila la dev build.",
        };
        Alert.alert(
          "No se activaron las notificaciones push",
          mensajes[pushToken.reason] || "No se pudo obtener el token push del dispositivo."
        );
        return;
      }

      const actualizado = { ...usuario, consienteNotificacionesPush: true };
      setUsuario(actualizado);

      const respuesta = await updateCurrentUser(buildUserPayload(actualizado));
      if (respuesta && typeof respuesta === "object") {
        setUsuario((actual) => ({ ...actual, ...respuesta }));
      }

      await registerPushToken({
        token: pushToken.token,
        plataforma: pushToken.plataforma,
        dispositivoId: pushToken.dispositivoId,
      });
    } catch (error) {
      setUsuario(anterior);
      Alert.alert("No se pudo activar push", error.message || "Intenta nuevamente en unos segundos.");
    } finally {
      finalizarGuardado();
    }
  }

  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];
  const emailActivo = Boolean(usuario?.consienteNotificacionesEmail);
  const pushActivo = Boolean(usuario?.consienteNotificacionesPush);
  const pushUnavailableReason = getPushAvailabilityReason();
  const pushDisponible = isPushDisponible(Platform.OS, pushUnavailableReason);
  // El switch general de push se puede tocar si el dispositivo soporta push
  // (para otorgar o revocar) o si ya hay consentimiento (para revocarlo).
  const pushMasterHabilitado = pushDisponible || pushActivo;
  const fechaEmail = formatearFechaConsentimiento(usuario?.fechaConsentimientoNotificacionesEmail);
  const fechaPush = formatearFechaConsentimiento(usuario?.fechaConsentimientoNotificacionesPush);

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton
              icon="arrow-left"
              onPress={() => navigation.goBack()}
              tone="light"
              testID="notification-prefs-back-button"
            />
          </View>
          <Text style={styles.title}>Notificaciones</Text>
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
              <Text style={styles.sectionLabel}>Canales</Text>
              <View style={styles.groupContainer}>
                <View style={[styles.itemRow, styles.itemRowDivider]}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                      <FontAwesome6 name="envelope" size={16} color={colors.primaryStrong} />
                    </View>
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>Email</Text>
                      <Text style={styles.itemSubtitle}>Permite recibir avisos por correo.</Text>
                      {emailActivo && fechaEmail ? (
                        <Text style={styles.consentDate} testID="notification-prefs-email-consent-date">
                          Consentimiento otorgado el {fechaEmail}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Switch
                    testID="notification-prefs-master-switch"
                    value={emailActivo}
                    onValueChange={handleEmailConsentChange}
                    disabled={saving}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={emailActivo ? colors.accent : colors.surface}
                  />
                </View>
                <View style={[styles.itemRow, !pushMasterHabilitado && styles.itemRowDisabled]}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                      <FontAwesome6 name="bell" size={16} color={colors.primaryStrong} />
                    </View>
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>Push</Text>
                      <Text style={styles.itemSubtitle}>
                        {getPushChannelSubtitle({
                          pushDisponible,
                          pushActivo,
                          reason: pushUnavailableReason,
                        })}
                      </Text>
                      {pushActivo && fechaPush ? (
                        <Text style={styles.consentDate} testID="notification-prefs-push-consent-date">
                          Consentimiento otorgado el {fechaPush}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Switch
                    testID="notification-prefs-push-master-switch"
                    value={pushActivo}
                    onValueChange={handlePushConsentChange}
                    disabled={saving || !pushMasterHabilitado}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={pushActivo ? colors.accent : colors.surface}
                  />
                </View>
              </View>
              <Text style={styles.helperText}>
                Cada tipo de notificacion puede usar email, push o ambos canales. Los cambios se
                aplican a todos los dispositivos de tu cuenta.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Preferencias por tipo</Text>
              <View style={styles.groupContainer}>
                {TIPOS_NOTIFICACION.map((tipo, index) => (
                  <View
                    key={tipo.emailKey}
                    style={[
                      styles.typeRow,
                      index < TIPOS_NOTIFICACION.length - 1 && styles.itemRowDivider,
                    ]}
                  >
                    <View style={styles.typeHeader}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                        <FontAwesome6 name={tipo.icon} size={15} color={colors.primary} />
                      </View>
                      <View style={styles.itemTexts}>
                        <Text style={styles.itemTitle}>{tipo.title}</Text>
                        <Text style={styles.itemSubtitle}>{tipo.subtitle}</Text>
                      </View>
                    </View>

                    <View style={styles.channelControls}>
                      <View style={[styles.channelControl, !emailActivo && styles.itemRowDisabled]}>
                        <Text style={styles.channelLabel}>Email</Text>
                        <Switch
                          testID={`notification-prefs-switch-${tipo.emailKey}`}
                          value={emailActivo ? Boolean(usuario?.[tipo.emailKey]) : false}
                          onValueChange={(value) => persistCambio({ [tipo.emailKey]: value })}
                          disabled={saving || !emailActivo}
                          trackColor={{ false: colors.border, true: colors.primarySoft }}
                          thumbColor={emailActivo && usuario?.[tipo.emailKey] ? colors.accent : colors.surface}
                        />
                      </View>
                      <View style={[styles.channelControl, !pushActivo && styles.itemRowDisabled]}>
                        <Text style={styles.channelLabel}>Push</Text>
                        <Switch
                          testID={`notification-prefs-switch-${tipo.pushKey}`}
                          value={pushActivo ? Boolean(usuario?.[tipo.pushKey]) : false}
                          onValueChange={(value) => persistCambio({ [tipo.pushKey]: value })}
                          disabled={saving || !pushActivo}
                          trackColor={{ false: colors.border, true: colors.primarySoft }}
                          thumbColor={pushActivo && usuario?.[tipo.pushKey] ? colors.accent : colors.surface}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
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
  typeRow: {
    padding: spacing.md,
    gap: spacing.md,
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowDisabled: {
    opacity: 0.5,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  itemTexts: {
    flex: 1,
    gap: 2,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
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
  channelControls: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  channelControl: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  channelLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  helperText: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    marginLeft: 4,
  },
  consentDate: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    ...textStyles.body,
    color: colors.danger,
  },
});
