import { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import ScreenContainer from "../components/layout/ScreenContainer";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useAuth } from "../context/AuthContext";
import useResponsive from "../hooks/useResponsive";
import { colors, radii, spacing, surfaces, textStyles } from "../theme/tokens";

export default function SettingsScreen({ navigation }) {
  const { logout } = useAuth();
  const { isDesktop } = useResponsive();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Diálogo / confirmación de logout compatible con Web y Mobile
  const handleLogoutPress = () => {
    if (Platform.OS === "web") {
      setShowLogoutModal(true);
    } else {
      Alert.alert(
        "Cerrar sesión",
        "¿Estás seguro de que deseás cerrar sesión en CYANEA?",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Cerrar sesión",
            style: "destructive",
            onPress: () => logout(),
          },
        ]
      );
    }
  };

  const cardStyle = [styles.card, isDesktop && styles.cardDesktop];

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={cardStyle}>
          {/* Header con botón para volver */}
          <View style={styles.header}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
              hitSlop={12}
            >
              <FontAwesome6 name="arrow-left" size={18} color={colors.primary} />
            </Pressable>
            <Text style={styles.title}>Configuración</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* SECCIÓN 1: CUENTA Y PERFIL */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cuenta</Text>
            <View style={styles.groupContainer}>
              <Pressable
                onPress={() => navigation.navigate("EditarPerfil")}
                style={({ pressed }) => [
                  styles.itemRow,
                  pressed && styles.itemRowPressed,
                ]}
              >
                <View style={styles.itemLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                    <FontAwesome6 name="user-pen" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.itemTitle}>Editar Perfil</Text>
                    <Text style={styles.itemSubtitle}>Nombre, usuario y foto</Text>
                  </View>
                </View>
                <FontAwesome6 name="chevron-right" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* SECCIÓN 2: PLAN Y MEMBRESÍA */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Membresía</Text>
            <View style={[styles.groupContainer, styles.proCardContainer]}>
              <View style={styles.proHeader}>
                <View style={styles.itemLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
                    <FontAwesome6 name="crown" size={16} color={colors.primaryStrong} />
                  </View>
                  <View>
                    <View style={styles.badgeRow}>
                      <Text style={styles.itemTitle}>Plan Gratuito</Text>
                      <View style={styles.freeBadge}>
                        <Text style={styles.freeBadgeText}>ACTUAL</Text>
                      </View>
                    </View>
                    <Text style={styles.itemSubtitle}>
                      Hasta 3 viajes activos simultáneos
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  Alert.alert(
                    "CYANEA Pro",
                    "La suscripción Pro estará disponible muy pronto con viajes ilimitados y funciones offline avanzadas."
                  );
                }}
                style={({ pressed }) => [
                  styles.upgradeBanner,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.upgradeText}>✨ Conocer beneficios de CYANEA Pro</Text>
                <FontAwesome6 name="arrow-right" size={12} color={colors.primaryStrong} />
              </Pressable>
            </View>
          </View>

          {/* SECCIÓN 3: PREFERENCIAS */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preferencias</Text>
            <View style={styles.groupContainer}>
              <Pressable
                onPress={() => {
                  Alert.alert("Notificaciones", "Ajustes de alertas por email y push.");
                }}
                style={({ pressed }) => [
                  styles.itemRow,
                  pressed && styles.itemRowPressed,
                ]}
              >
                <View style={styles.itemLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
                    <FontAwesome6 name="bell" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.itemTitle}>Notificaciones</Text>
                    <Text style={styles.itemSubtitle}>Emails de votos, itinerarios y deudas</Text>
                  </View>
                </View>
                <FontAwesome6 name="chevron-right" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* SECCIÓN 4: INFORMACIÓN */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Acerca de</Text>
            <View style={styles.groupContainer}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Versión de la aplicación</Text>
                <Text style={styles.infoValue}>1.0.0 (UTN FRC)</Text>
              </View>
            </View>
          </View>

          {/* SECCIÓN 5: CERRAR SESIÓN */}
          <View style={[styles.section, { marginTop: spacing.md }]}>
            <Pressable
                testID="logout-button"
                onPress={handleLogoutPress}
                style={({ pressed }) => [
                    styles.logoutButton,
                    pressed && styles.logoutButtonPressed,
                ]}
            >
              <FontAwesome6 name="arrow-right-from-bracket" size={16} color={colors.danger} />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Modal de confirmación para entorno Web */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cerrar sesión</Text>
            <Text style={styles.modalBody}>
              ¿Estás seguro de que deseás cerrar tu sesión en CYANEA?
            </Text>
            <View style={styles.modalActions}>
              <PrimaryButton
                label="Cancelar"
                variant="secondary"
                onPress={() => setShowLogoutModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                label="Cerrar sesión"
                onPress={() => {
                  setShowLogoutModal(false);
                  logout();
                }}
                style={[{ flex: 1, backgroundColor: colors.danger }]}
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
  card: {
    ...surfaces.card,
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  cardDesktop: {
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...textStyles.sectionLabel,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginLeft: 4,
  },
  groupContainer: {
    backgroundColor: colors.surfaceMuted,
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
  },
  itemRowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  itemLeft: {
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
  proCardContainer: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  proHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  freeBadge: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  freeBadgeText: {
    ...textStyles.label,
    fontSize: 9,
    color: colors.textSecondary,
  },
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accentMuted,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    marginTop: 4,
  },
  upgradeText: {
    ...textStyles.meta,
    color: colors.primaryStrong,
    fontWeight: "700",
    fontSize: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  infoLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
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
    borderRadius: radii.md,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: "rgba(200, 73, 73, 0.2)",
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