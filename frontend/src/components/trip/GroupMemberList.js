import { FontAwesome6 } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import ActionMenu from "../ui/ActionMenu";
import Avatar from "../ui/Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";


export default function GroupMemberList({ members = [], canManage = false, onRemove, onTransferAdministration }) {
  if (members.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Todavía no hay integrantes en el grupo.</Text>
      </View>
    );
  }

  return (
    <View>
      {members.map((member, index) => {
        const isOrganizer = member.role === "administrador";
        const isPending = member.status === "invitado";
        const canRemove = canManage && !isOrganizer && typeof onRemove === "function";
        const canTransfer = canManage && !isOrganizer && member.status === "aceptado" &&
          member.kind !== "external" && Boolean(member.id) && typeof onTransferAdministration === "function";
        const isLast = index === members.length - 1;

        return (
          <View
            key={member.key}
            style={[styles.row, !isLast && styles.rowDivider]}
            testID={`group-member-${member.key}`}
          >
            <Avatar imageUrl={member.fotoUrl} name={member.nombreCompleto} size={40} />
            <View style={styles.body}>
              <Text numberOfLines={1} style={styles.name}>
                {member.nombreCompleto}
              </Text>
              {member.nombreUsuario || isPending ? (
                <Text numberOfLines={1} style={styles.meta}>
                  {member.nombreUsuario ? `@${member.nombreUsuario}` : ""}
                  {member.nombreUsuario && isPending ? " · " : ""}
                  {isPending ? <Text style={styles.pending}>Invitación pendiente</Text> : null}
                </Text>
              ) : null}
            </View>

            {isOrganizer ? (
              <View style={styles.organizerBadge}>
                <FontAwesome6 color={colors.warning} name="crown" size={10} />
                <Text style={styles.organizerText}>Organizador</Text>
              </View>
            ) : null}

            <ActionMenu
              accessibilityLabel={`Acciones para ${member.nombreCompleto}`}
              testID={`group-member-menu-${member.key}`}
              items={[
                canTransfer
                  ? {
                      label: "Transferir organización",
                      icon: "crown",
                      onPress: () => onTransferAdministration(member),
                      testID: `group-member-transfer-${member.key}`,
                    }
                  : null,
                canRemove
                  ? {
                      label: "Expulsar del viaje",
                      icon: "user-minus",
                      destructive: true,
                      onPress: () => onRemove(member),
                      testID: `group-member-remove-${member.key}`,
                    }
                  : null,
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  pending: {
    color: colors.warning,
    fontWeight: "600",
  },
  organizerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.warningSurface,
  },
  organizerText: {
    ...textStyles.meta,
    color: colors.warning,
    fontSize: 11,
    fontWeight: "700",
  },
});