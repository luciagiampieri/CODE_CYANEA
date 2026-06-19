import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import ScreenContainer from "../components/layout/ScreenContainer";
import IconCircleButton from "../components/ui/IconCircleButton";
import PrimaryButton from "../components/ui/PrimaryButton";
import { getPendingInvitations, respondToInvitation } from "../services/api";
import { colors, spacing, surfaces, textStyles } from "../theme/tokens";

export default function InvitationsScreen({ navigation }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      const data = await getPendingInvitations();
      setInvitations(data);
    } catch (error) {
      Alert.alert("Error", error.message || "No se pudieron cargar las invitaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const handleResponse = async (idViaje, decision) => {
    if (submitting) return;

    try {
      setSubmitting(true);
      const result = await respondToInvitation(idViaje, decision);
      Alert.alert("Éxito", result.message || "Invitación procesada correctamente.");
      await loadInvitations();
    } catch (error) {
      Alert.alert("Atención", error.message || "Ocurrió un error al procesar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer fullWidth padded={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <IconCircleButton icon="arrow-left" onPress={() => navigation.goBack()} />
          </View>
          <Text style={styles.eyebrow}>Notificaciones</Text>
          <Text style={styles.title}>Invitaciones</Text>
          <Text style={styles.copy}>Gestiona las invitaciones pendientes para sumarte al grupo correcto.</Text>
        </View>

        <View style={styles.body}>
          {invitations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No tienes invitaciones pendientes.</Text>
              <Text style={styles.emptyCopy}>Cuando alguien te sume a un viaje, aparecerá aquí.</Text>
            </View>
          ) : (
            invitations.map((item) => {
              const idViaje = item.id || item.tripId || item.IdViaje;
              const titulo = item.title || item.titulo || item.Titulo;
              const destino = item.destination || item.destino || item.Destino;
              const rol = item.role || item.rol || "Participante";

              return (
                <View key={String(idViaje)} style={styles.card}>
                  <Text style={styles.cardTitle}>{titulo}</Text>
                  <Text style={styles.cardMeta}>Destino: {destino}</Text>
                  <Text style={styles.cardMeta}>Rol propuesto: {rol}</Text>

                  <View style={styles.actions}>
                    <PrimaryButton
                      label="Rechazar"
                      onPress={() => handleResponse(idViaje, "rechazar")}
                      disabled={submitting}
                      variant="secondary"
                      style={styles.secondaryAction}
                    />
                    <PrimaryButton
                      label="Unirme"
                      onPress={() => handleResponse(idViaje, "aceptar")}
                      disabled={submitting}
                      style={styles.primaryAction}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  eyebrow: {
    ...textStyles.meta,
    color: "#dbe6fb",
    marginTop: spacing.lg,
  },
  title: {
    ...textStyles.screenTitle,
    color: colors.textInverse,
    marginTop: spacing.xs,
  },
  copy: {
    ...textStyles.body,
    color: "#edf2ff",
    marginTop: spacing.xs,
  },
  body: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyCard: {
    ...surfaces.card,
    padding: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
  },
  emptyCopy: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 24,
  },
  cardMeta: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryAction: {
    flex: 1,
  },
  secondaryAction: {
    flex: 1,
  },
});
