import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import Modal from "../components/ui/AppModal";
import ScreenContainer from "../components/layout/ScreenContainer";
import ListRow from "../components/ui/ListRow";
import PrimaryButton from "../components/ui/PrimaryButton";
import ScreenHeader from "../components/ui/ScreenHeader";
import SectionCard from "../components/ui/SectionCard";
import { useAuth } from "../context/AuthContext";
import useResponsive from "../hooks/useResponsive";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";
import { appAlert } from "../components/ui/AppDialog";
import { puedeCambiarPassword } from "../utils/passwordRules";

export default function SettingsScreen({ navigation }) {
  const { logout, user } = useAuth();
  const { isDesktop } = useResponsive();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const tienePassword = puedeCambiarPassword(user);

  const handleLogoutPress = () => {
    if (Platform.OS === "web") {
      setShowLogoutModal(true);
      return;
    }
    appAlert("Cerrar sesión", "¿Estás seguro de que deseás cerrar sesión en CYANEA?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          title="Configuración"
          onBack={() => navigation.goBack()}
          backTestID="settings-back-button"
        />

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <SectionCard label="Mi cuenta">
            <ListRow
              icon="user-pen"
              title="Cuenta"
              onPress={() => navigation.navigate("EditarPerfil")}
              testID="settings-cuenta-row"
              divider
            />
            {/* US 101: solo cuentas registradas con correo tienen contraseña propia */}
            {tienePassword ? (
              <ListRow
                icon="key"
                title="Cambiar contraseña"
                onPress={() => navigation.navigate("CambiarPassword")}
                testID="settings-cambiar-password-row"
                divider
              />
            ) : null}
            <ListRow
              icon="crown"
              iconBackground={colors.accent}
              title="Plan y suscripción"
              subtitle="Tu plan, consumo y planes disponibles"
              onPress={() => navigation.navigate("MiSuscripcion")}
              testID="settings-planes-row"
            />
          </SectionCard>

          <SectionCard label="Preferencias">
            <ListRow
              icon="bell"
              title="Notificaciones"
              subtitle="Emails de votos, itinerarios y deudas"
              onPress={() => navigation.navigate("PreferenciasNotificaciones")}
              divider
            />
            <ListRow
              icon="user-shield"
              title="Privacidad"
              subtitle="Qué datos ven los demás viajeros"
              onPress={() => navigation.navigate("PreferenciasPrivacidad")}
              testID="settings-privacidad-row"
              divider
            />
            <ListRow
              icon="wand-magic-sparkles"
              title="Planificación de viajes"
              subtitle="Intereses, ritmo y presupuesto por viaje"
              onPress={() => navigation.navigate("PreferenciasPlanificacion")}
              testID="settings-planificacion-row"
            />
          </SectionCard>

          <SectionCard label="Acerca de">
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Versión de la aplicación</Text>
              <Text style={styles.infoValue}>1.0.0 (UTN FRC)</Text>
            </View>
          </SectionCard>

          <Pressable
            testID="logout-button"
            onPress={handleLogoutPress}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
          >
            <FontAwesome6 name="arrow-right-from-bracket" size={16} color={colors.danger} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Modal de confirmación para entorno Web */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cerrar sesión</Text>
            <Text style={styles.modalBody}>¿Estás seguro de que deseás cerrar tu sesión en CYANEA?</Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                label="Cancelar"
                variant="secondary"
                onPress={() => setShowLogoutModal(false)}
                style={{ flex: 1 }}
                testID="settings-modal-cancel-button"
              />
              <PrimaryButton
                label="Cerrar sesión"
                onPress={() => {
                  setShowLogoutModal(false);
                  logout();
                }}
                style={[{ flex: 1, backgroundColor: colors.danger }]}
                testID="settings-modal-confirm-logout-button"
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  bodyDesktop: {
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  infoLabel: {
    ...textStyles.body,
    color: colors.primary,
    fontSize: 14,
  },
  infoValue: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontWeight: "600",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutButtonPressed: {
    opacity: 0.75,
  },
  logoutText: {
    ...textStyles.button,
    color: colors.danger,
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  modalContent: {
    ...surfaces.card,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 400,
    gap: spacing.md,
  },
  modalTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 18,
  },
  modalBody: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});