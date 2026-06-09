import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export default function ParticipantList({ participants, onRemove }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Participantes agregados</Text>

      {participants.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Todavia no agregaste participantes al viaje.</Text>
        </View>
      ) : (
        participants.map((participant) => (
          <View key={participant.key} style={styles.card}>
            <Avatar imageUrl={participant.fotoUrl} name={participant.nombreCompleto} />
            <View style={styles.body}>
              <Text style={styles.name}>{participant.nombreCompleto}</Text>
              <Text style={styles.email}>{participant.email}</Text>
            </View>
            <View
              style={[
                styles.badge,
                participant.kind === "external" ? styles.badgePending : styles.badgeRegistered
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  participant.kind === "external"
                    ? styles.badgeTextPending
                    : styles.badgeTextRegistered
                ]}
              >
                {participant.kind === "external" ? "Invitacion pendiente" : "Registrado"}
              </Text>
            </View>
            <Pressable onPress={() => onRemove(participant)} style={styles.removeAction}>
              <FontAwesome6 color={colors.textMuted} name="xmark" size={14} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm
  },
  label: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: typography.small
  },
  emptyState: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  emptyText: {
    color: colors.textSecondary
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  body: {
    flex: 1
  },
  name: {
    color: colors.textPrimary,
    fontWeight: "800"
  },
  email: {
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: typography.micro
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7
  },
  badgePending: {
    backgroundColor: "#fff8da"
  },
  badgeRegistered: {
    backgroundColor: "#e5f5ed"
  },
  badgeText: {
    fontSize: typography.micro,
    fontWeight: "800"
  },
  badgeTextPending: {
    color: colors.warning
  },
  badgeTextRegistered: {
    color: colors.success
  },
  removeAction: {
    padding: 6
  }
});
