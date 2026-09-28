import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Plan de liquidación: quién le paga a quién. Las transferencias del usuario
 * actual van primero y las pendientes antes que las pagadas.
 */
export default function SettlementTransfers({
  transfers = [],
  balances = [],
  currency,
  currentUserId,
  canUpdate = false,
  updatingTransferId = null,
  onToggle,
  loading,
}) {
  if (transfers.length === 0) {
    return loading ? null : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No hay deudas pendientes. El grupo está al día.</Text>
      </View>
    );
  }

  // Las transferencias referencian IdParticipanteViaje; se busca cuál es el del usuario actual.
  const myParticipantId = balances.find(
    (item) =>
      currentUserId !== null &&
      currentUserId !== undefined &&
      String(item.IdUsuario) === String(currentUserId)
  )?.IdParticipanteViaje;

  const isMine = (transfer) =>
    myParticipantId !== undefined &&
    (transfer.IdParticipanteDeudor === myParticipantId ||
      transfer.IdParticipanteAcreedor === myParticipantId);

  const ordered = [...transfers].sort((a, b) => {
    const pendingDiff =
      Number(b.Estado === "pendiente") - Number(a.Estado === "pendiente");
    if (pendingDiff !== 0) return pendingDiff;
    return Number(isMine(b)) - Number(isMine(a));
  });

  const displayName = (participantId, name) =>
    myParticipantId !== undefined && participantId === myParticipantId ? "Vos" : name;

  // Texto del botón según el rol del usuario actual en la transferencia.
  const payLabel = (transfer) => {
    if (myParticipantId === undefined) return "Marcar pagada";
    if (transfer.IdParticipanteDeudor === myParticipantId) return "Ya pagué";
    if (transfer.IdParticipanteAcreedor === myParticipantId) return "Ya me pagó";
    return "Marcar pagada";
  };

  return (
    <View>
      {ordered.map((transfer, index) => {
        const pendiente = transfer.Estado === "pendiente";
        const updating = updatingTransferId === transfer.IdTransferenciaLiquidacion;
        const isLast = index === ordered.length - 1;
        const actionEnabled = canUpdate && typeof onToggle === "function";

        return (
          <View
            key={transfer.IdTransferenciaLiquidacion}
            style={[styles.row, !isLast && styles.rowDivider]}
            testID={`transfer-${transfer.IdTransferenciaLiquidacion}`}
          >
            <View style={[styles.body, !pendiente && styles.bodyDone]}>
              <Text numberOfLines={1} style={styles.parties}>
                <Text style={styles.partyName}>
                  {displayName(transfer.IdParticipanteDeudor, transfer.NombreDeudor)}
                </Text>
                {"  →  "}
                <Text style={styles.partyName}>
                  {displayName(transfer.IdParticipanteAcreedor, transfer.NombreAcreedor)}
                </Text>
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.amount, !pendiente && styles.amountDone]}>
                  {formatMoney(transfer.Monto, currency)}
                </Text>
                {!pendiente ? (
                  <View style={styles.doneBadge}>
                    <FontAwesome6 color={colors.success} name="circle-check" size={11} />
                    <Text style={styles.doneText}>Pagada</Text>
                  </View>
                ) : !actionEnabled ? (
                  <Text style={styles.pendingText}>Pendiente</Text>
                ) : null}
              </View>
            </View>

            {actionEnabled && pendiente ? (
              <Pressable
                accessibilityRole="button"
                disabled={updating}
                onPress={() => onToggle(transfer.IdTransferenciaLiquidacion, true)}
                style={({ pressed }) => [styles.payButton, pressed && styles.pressed]}
                testID={`transfer-pay-${transfer.IdTransferenciaLiquidacion}`}
              >
                {updating ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <FontAwesome6 color={colors.textInverse} name="check" size={11} />
                )}
                <Text style={styles.payButtonText}>{payLabel(transfer)}</Text>
              </Pressable>
            ) : null}

            {actionEnabled && !pendiente ? (
              <Pressable
                accessibilityRole="button"
                disabled={updating}
                hitSlop={8}
                onPress={() => onToggle(transfer.IdTransferenciaLiquidacion, false)}
                testID={`transfer-undo-${transfer.IdTransferenciaLiquidacion}`}
              >
                <Text style={styles.undoText}>{updating ? "..." : "Deshacer"}</Text>
              </Pressable>
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
  bodyDone: {
    opacity: 0.6,
  },
  parties: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  partyName: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  amount: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  amountDone: {
    color: colors.textSecondary,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  pressed: {
    opacity: 0.8,
  },
  payButtonText: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
  },
  pendingText: {
    ...textStyles.meta,
    color: colors.warning,
    fontWeight: "700",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  doneText: {
    ...textStyles.meta,
    color: colors.success,
    fontWeight: "700",
  },
  undoText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
});