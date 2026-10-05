import { FontAwesome6 } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

// HU 71 - Visualizar invitaciones enviadas.
export const INVITATION_FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "pendiente", label: "Pendientes" },
  { id: "aceptada", label: "Aceptadas" },
  { id: "rechazada", label: "Rechazadas" },
];

const STATUS_META = {
  pendiente: { label: "Pendiente", color: colors.warning },
  aceptada: { label: "Aceptada", color: colors.success },
  rechazada: { label: "Rechazada", color: colors.danger },
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "28 sep" si es del año en curso, "28 sep 2025" si no.
export function formatInvitationDate(isoDateTime, today = new Date()) {
  if (!isoDateTime) return "";
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return "";
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

export default function SentInvitationsList({
  invitations = [],
  loading = false,
  error = "",
  onCancel,
  onResend,
  onRetry,
}) {
  const [filter, setFilter] = useState("todas");

  const counts = useMemo(() => {
    const result = { todas: invitations.length, pendiente: 0, aceptada: 0, rechazada: 0 };
    invitations.forEach((invitation) => {
      if (result[invitation.status] !== undefined) result[invitation.status] += 1;
    });
    return result;
  }, [invitations]);

  const visibleInvitations = useMemo(() => {
    if (filter === "todas") return invitations;
    return invitations.filter((invitation) => invitation.status === filter);
  }, [filter, invitations]);

  if (error && !loading) {
    return (
      <View style={styles.errorState}>
        <FontAwesome6 color={colors.danger} name="triangle-exclamation" size={16} />
        <Text style={styles.errorText}>{error}</Text>
        {typeof onRetry === "function" ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.retryButton}
            testID="sent-invitations-retry"
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const emptyMessage =
    invitations.length === 0
      ? "Todavía no enviaste invitaciones. Usá “Invitar” para sumar gente al viaje."
      : "No hay invitaciones con este estado.";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.filters}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {INVITATION_FILTERS.map((option) => {
          const selected = option.id === filter;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.id}
              onPress={() => setFilter(option.id)}
              style={[styles.filter, selected && styles.filterSelected]}
              testID={`invitation-filter-${option.id}`}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                {option.label}
              </Text>
              <Text style={[styles.filterCount, selected && styles.filterTextSelected]}>
                {counts[option.id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : visibleInvitations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      ) : (
        <View>
          {visibleInvitations.map((invitation, index) => {
            const meta = STATUS_META[invitation.status] ?? {
              label: invitation.status,
              color: colors.textMuted,
            };
            const canCancel =
              invitation.status === "pendiente" && typeof onCancel === "function";
            // Quien rechazó la invitación puede ser invitado de nuevo
            const canResend =
              invitation.status === "rechazada" && typeof onResend === "function";
            const isLast = index === visibleInvitations.length - 1;

            return (
              <View
                key={`sent-invitation-${invitation.userId}`}
                style={[styles.row, !isLast && styles.rowDivider]}
                testID={`sent-invitation-${invitation.userId}`}
              >
                <Avatar
                  imageUrl={invitation.fotoUrl}
                  name={invitation.nombreCompleto}
                  size={40}
                />
                <View style={styles.body}>
                  <Text numberOfLines={1} style={styles.username}>
                    @{invitation.nombreUsuario}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.dot, { backgroundColor: meta.color }]} />
                    <Text style={[styles.status, { color: meta.color }]}>{meta.label}</Text>
                    <Text style={styles.meta}>
                      · Enviada el {formatInvitationDate(invitation.invitedAt)}
                    </Text>
                  </View>
                </View>
                {canCancel ? (
                  <Pressable
                    accessibilityLabel={`Cancelar invitación de ${invitation.nombreUsuario}`}
                    hitSlop={8}
                    onPress={() => onCancel(invitation)}
                    testID={`sent-invitation-cancel-${invitation.userId}`}
                  >
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </Pressable>
                ) : null}
                {canResend ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Volver a invitar a ${invitation.nombreUsuario}`}
                    hitSlop={8}
                    onPress={() => onResend(invitation)}
                    testID={`sent-invitation-resend-${invitation.userId}`}
                  >
                    <Text style={styles.resendText}>Volver a invitar</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  filters: {
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterSelected: {
    borderBottomColor: colors.primary,
  },
  filterText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterCount: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  filterTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  loader: {
    paddingVertical: spacing.md,
  },
  emptyState: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    marginTop: spacing.xs,
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
  username: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  status: {
    ...textStyles.meta,
    fontWeight: "700",
  },
  meta: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  cancelText: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
  },
  resendText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  errorState: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    textAlign: "center",
  },
  retryButton: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  retryText: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
  },
});
