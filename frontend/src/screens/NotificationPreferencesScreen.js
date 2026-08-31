import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import useResponsive from "../hooks/useResponsive";
import { getCurrentUser, updateCurrentUser } from "../services/api";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const TIPOS_NOTIFICACION = [
  {
    key: "recibeEmailsNuevaVotacion",
    icon: "square-poll-vertical",
    title: "Nuevas votaciones",
    subtitle: "Cuando se abre una votación en alguno de tus viajes",
  },
  {
    key: "recibeEmailsCambiosViaje",
    icon: "route",
    title: "Cambios en el viaje",
    subtitle: "Actualizaciones del itinerario y bajas o altas de participantes",
  },
  {
    key: "recibeEmailsRecordatoriosDeuda",
    icon: "sack-dollar",
    title: "Recordatorios de deuda",
    subtitle: "Saldos pendientes de liquidar con el grupo",
  },
  {
    key: "recibeEmailsRecordatoriosReserva",
    icon: "calendar-check",
    title: "Recordatorios de reserva",
    subtitle: "Vencimientos y confirmaciones de reservas",
  },
];

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

  async function persistCambio(cambios) {
    if (!usuario || saving) return;

    const anterior = usuario;
    const actualizado = { ...usuario, ...cambios };
    setUsuario(actualizado);
    setSaving(true);
    try {
      await updateCurrentUser({
        nombre: actualizado.nombre,
        apellido: actualizado.apellido,
        nombreUsuario: actualizado.nombreUsuario,
        fotoUrl: actualizado.fotoUrl,
        consienteNotificacionesEmail: actualizado.consienteNotificacionesEmail,
        recibeEmailsNuevaVotacion: actualizado.recibeEmailsNuevaVotacion,
        recibeEmailsCambiosViaje: actualizado.recibeEmailsCambiosViaje,
        recibeEmailsRecordatoriosDeuda: actualizado.recibeEmailsRecordatoriosDeuda,
        recibeEmailsRecordatoriosReserva: actualizado.recibeEmailsRecordatoriosReserva,
      });
    } catch (error) {
      setUsuario(anterior);
      Alert.alert("No se pudo guardar", error.message || "Intentá nuevamente en unos segundos.");
    } finally {
      setSaving(false);
    }
  }

  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];
  const notificacionesActivas = Boolean(usuario?.consienteNotificacionesEmail);

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} tone="light" />
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
              <View style={styles.groupContainer}>
                <View style={styles.itemRow}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                      <FontAwesome6 name="envelope" size={16} color={colors.primaryStrong} />
                    </View>
                    <View style={styles.itemTexts}>
                      <Text style={styles.itemTitle}>Notificaciones por email</Text>
                      <Text style={styles.itemSubtitle}>
                        Activá esto para recibir avisos de tus viajes por correo
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={notificacionesActivas}
                    onValueChange={(value) =>
                      persistCambio({ consienteNotificacionesEmail: value })
                    }
                    disabled={saving}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={notificacionesActivas ? colors.accent : colors.surface}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Qué querés recibir</Text>
              <View style={styles.groupContainer}>
                {TIPOS_NOTIFICACION.map((tipo, index) => (
                  <View
                    key={tipo.key}
                    style={[
                      styles.itemRow,
                      index < TIPOS_NOTIFICACION.length - 1 && styles.itemRowDivider,
                      !notificacionesActivas && styles.itemRowDisabled,
                    ]}
                  >
                    <View style={styles.itemLeft}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                        <FontAwesome6 name={tipo.icon} size={15} color={colors.primary} />
                      </View>
                      <View style={styles.itemTexts}>
                        <Text style={styles.itemTitle}>{tipo.title}</Text>
                        <Text style={styles.itemSubtitle}>{tipo.subtitle}</Text>
                      </View>
                    </View>
                    <Switch
                      value={notificacionesActivas ? Boolean(usuario?.[tipo.key]) : false}
                      onValueChange={(value) => persistCambio({ [tipo.key]: value })}
                      disabled={saving || !notificacionesActivas}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={
                        notificacionesActivas && usuario?.[tipo.key] ? colors.accent : colors.surface
                      }
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.helperText}>
                Con las notificaciones por email apagadas no vas a recibir ningún correo de
                Cyanea, aunque los tipos de abajo estén activados.
              </Text>
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
    maxWidth: 520,
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