import { FontAwesome6 } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Lista del grupo en formato filas (tab "Grupo" del detalle del viaje).
 * Las acciones sobre cada integrante se abren desde el botón de tres puntos,
 * para no cargar cada fila con botones que casi nunca se usan.
 */
export default function GroupMemberList({ members = [], canManage = false, onRemove }) {
  const [openMenuKey, setOpenMenuKey] = useState(null);

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
        const hasActions = canManage && !isOrganizer && typeof onRemove === "function";
        const menuOpen = openMenuKey === member.key;
        const isLast = index === members.length - 1;

        return (
          <View
            key={member.key}
            style={[styles.row, !isLast && styles.rowDivider]}
            testID={`group-member-${member.key}`}
          >
            <View style={styles.rowMain}>
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

              {hasActions ? (
                <Pressable
                  accessibilityLabel={`Acciones para ${member.nombreCompleto}`}
                  hitSlop={8}
                  onPress={() => setOpenMenuKey(menuOpen ? null : member.key)}
                  style={[styles.menuButton, menuOpen && styles.menuButtonActive]}
                  testID={`group-member-menu-${member.key}`}
                >
                  <FontAwesome6 color={colors.textMuted} name="ellipsis-vertical" size={14} />
                </Pressable>
              ) : null}
            </View>

            {hasActions && menuOpen ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => {
                    setOpenMenuKey(null);
                    onRemove(member);
                  }}
                  style={styles.actionButton}
                  testID={`group-member-remove-${member.key}`}
                >
                  <FontAwesome6 color={colors.danger} name="user-minus" size={12} />
                  <Text style={styles.actionDanger}>Expulsar del viaje</Text>
                </Pressable>
              </View>
            ) : null}
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
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  menuButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButtonActive: {
    backgroundColor: colors.surfaceAlt,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionDanger: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
  },
});
