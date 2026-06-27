import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function ParticipantList({ participants, onRemove }) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Lista del grupo</Text>
        <Text style={styles.counter}>{participants.length}</Text>
      </View>

      {participants.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Todavía no agregaste participantes al viaje.</Text>
        </View>
      ) : (
        participants.map((participant) => (
          <View key={participant.key} style={styles.card}>
            <Avatar imageUrl={participant.fotoUrl} name={participant.nombreCompleto} size={44} />
            <View style={styles.body}>
              <Text style={styles.name}>{participant.nombreCompleto}</Text>
              <Text numberOfLines={1} style={styles.email}>{participant.email}</Text>
              <View style={styles.statusRow}>
                <FontAwesome6
                  color={participant.kind === "external" ? colors.warning : colors.success}
                  name={participant.kind === "external" ? "clock" : "circle-check"}
                  size={12}
                />
                <Text
                  style={[
                    styles.statusText,
                    participant.kind === "external" ? styles.statusTextPending : styles.statusTextRegistered,
                  ]}
                >
                  {participant.kind === "external" ? "Invitación pendiente" : "Registrado"}
                </Text>
              </View>
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
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
  },
  counter: {
    ...textStyles.kpiValue,
    color: colors.primary,
    fontSize: 18,
  },
  emptyState: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  body: {
    flex: 1,
  },
  name: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  email: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statusText: {
    ...textStyles.meta,
    fontSize: 12,
  },
  statusTextPending: {
    color: colors.warning,
  },
  statusTextRegistered: {
    color: colors.success,
  },
  removeAction: {
    marginLeft: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
});
