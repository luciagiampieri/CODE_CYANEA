import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, registerPushToken, updateCurrentUser } from "../services/api";
import { getExpoPushTokenForDevice, getPushAvailabilityReason } from "../services/pushNotifications";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const TIPOS_NOTIFICACION = [
  {
    emailKey: "recibeEmailsNuevaVotacion",
    pushKey: "recibePushNuevaVotacion",
    icon: "square-poll-vertical",
    title: "Nuevas votaciones",
    subtitle: "Cuando se abre una votacion en alguno de tus viajes",
  },
  {
    emailKey: "recibeEmailsCambiosViaje",
    pushKey: "recibePushCambiosViaje",
    icon: "route",
    title: "Cambios en el viaje",
    subtitle: "Actividades nuevas, cambios de itinerario y novedades generales",
  },
  {
    emailKey: "recibeEmailsNuevosGastos",
    pushKey: "recibePushNuevosGastos",
    icon: "receipt",
    title: "Nuevos gastos",
    subtitle: "Cuando alguien registra un gasto en un viaje",
  },
  {
    emailKey: "recibeEmailsRecordatoriosDeuda",
    pushKey: "recibePushRecordatoriosDeuda",
    icon: "sack-dollar",
    title: "Recordatorios de deuda",
    subtitle: "Avisos relacionados con liquidaciones y saldos pendientes",
  },
  {
    emailKey: "recibeEmailsRecordatoriosActividad",
    pushKey: "recibePushRecordatoriosActividad",
    icon: "calendar-day",
    title: "Actividades proximas",
    subtitle: "Avisos antes del inicio de actividades del itinerario",
  },
  {
    emailKey: "recibeEmailsRecordatoriosReserva",
    pushKey: "recibePushRecordatoriosReserva",
    icon: "calendar-check",
    title: "Recordatorios de reservas",
    subtitle: "Avisos vinculados a reservas y vencimientos",
  },
];

export function isPushDisponible(platformOS, availabilityReason = getPushAvailabilityReason()) {
  return platformOS !== "web" && !availabilityReason;
}

function getPushUnavailableMessage(reason) {
  if (reason === "expo_go_android") {
    return "Disponible en una build movil instalada; Expo Go no soporta push remotas en Android.";
  }
  return "Solo disponible en la app movil.";
}

export default function NotificationPreferencesScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setLoadError("");
        const me = await getCurrentUser();
        setUsuario(me);
      } catch (error) {
        setLoadError(error.message || "No se pudieron cargar tus preferencias.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function buildUserPayload(actualizado) {
    return {
      nombre: actualizado.nombre,
      apellido: actualizado.apellido,
      nombreUsuario: actualizado.nombreUsuario,
      fotoUrl: actualizado.fotoUrl,
      consienteNotificacionesEmail: actualizado.consienteNotificacionesEmail,
      recibeEmailsNuevaVotacion: actualizado.recibeEmailsNuevaVotacion,
      recibeEmailsCambiosViaje: actualizado.recibeEmailsCambiosViaje,
      recibeEmailsNuevosGastos: actualizado.recibeEmailsNuevosGastos,
      recibeEmailsRecordatoriosDeuda: actualizado.recibeEmailsRecordatoriosDeuda,
      recibeEmailsRecordatoriosActividad: actualizado.recibeEmailsRecordatoriosActividad,
      recibeEmailsRecordatoriosReserva: actualizado.recibeEmailsRecordatoriosReserva,
      consienteNotificacionesPush: actualizado.consienteNotificacionesPush,
      recibePushNuevaVotacion: actualizado.recibePushNuevaVotacion,
      recibePushCambiosViaje: actualizado.recibePushCambiosViaje,
      recibePushNuevosGastos: actualizado.recibePushNuevosGastos,
      recibePushRecordatoriosDeuda: actualizado.recibePushRecordatoriosDeuda,
      recibePushRecordatoriosActividad: actualizado.recibePushRecordatoriosActividad,
      recibePushRecordatoriosReserva: actualizado.recibePushRecordatoriosReserva,
    };
  }

  async function persistCambio(cambios) {
    if (!usuario || saving) return;

    const anterior = usuario;
    const actualizado = { ...usuario, ...cambios };
    setUsuario(actualizado);
    setSaving(true);
    try {
      await updateCurrentUser(buildUserPayload(actualizado));
    } catch (error) {
      setUsuario(anterior);
      Alert.alert("No se pudo guardar", error.message || "Intenta nuevamente en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePushConsentChange(value) {
    if (!usuario || saving) return;
    if (!isPushDisponible(Platform.OS)) return;

    const anterior = usuario;

    if (!value) {
      await persistCambio({ consienteNotificacionesPush: false });
      return;
    }

    setSaving(true);
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

      await updateCurrentUser(buildUserPayload(actualizado));

      await registerPushToken({
        token: pushToken.token,
        plataforma: pushToken.plataforma,
        dispositivoId: pushToken.dispositivoId,
      });
    } catch (error) {
      setUsuario(anterior);
      Alert.alert("No se pudo activar push", error.message || "Intenta nuevamente en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];
  const emailActivo = Boolean(usuario?.consienteNotificacionesEmail);
  const pushActivo = Boolean(usuario?.consienteNotificacionesPush);
  const pushUnavailableReason = getPushAvailabilityReason();
  const pushDisponible = isPushDisponible(Platform.OS, pushUnavailableReason);

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
                    </View>
                  </View>
                  <Switch
                    testID="notification-prefs-master-switch"
                    value={emailActivo}
                    onValueChange={(value) => persistCambio({ consienteNotificacionesEmail: value })}
                    disabled={saving}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={emailActivo ? colors.accent : colors.surface}
                  />
                </View>
                <View style={[styles.itemRow, !pushDisponible && styles.itemRowDisabled]}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                      <FontAwesome6 name="bell" size={16} color={colors.primaryStrong} />
                    </View>
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>Push</Text>
                      <Text style={styles.itemSubtitle}>
                        {pushDisponible
                          ? "Permite recibir avisos en este dispositivo."
                          : getPushUnavailableMessage(pushUnavailableReason)}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    testID="notification-prefs-push-master-switch"
                    value={pushActivo}
                    onValueChange={handlePushConsentChange}
                    disabled={saving || !pushDisponible}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={pushActivo ? colors.accent : colors.surface}
                  />
                </View>
              </View>
              <Text style={styles.helperText}>
                Cada tipo de notificacion puede usar email, push o ambos canales.
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
                      <View
                        style={[
                          styles.channelControl,
                          (!pushActivo || !pushDisponible) && styles.itemRowDisabled,
                        ]}
                      >
                        <Text style={styles.channelLabel}>Push</Text>
                        <Switch
                          testID={`notification-prefs-switch-${tipo.pushKey}`}
                          value={pushActivo && pushDisponible ? Boolean(usuario?.[tipo.pushKey]) : false}
                          onValueChange={(value) => persistCambio({ [tipo.pushKey]: value })}
                          disabled={saving || !pushActivo || !pushDisponible}
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
  errorText: {
    ...textStyles.body,
    color: colors.danger,
  },
});
