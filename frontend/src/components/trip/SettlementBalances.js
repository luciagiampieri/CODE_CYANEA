import { StyleSheet, Text, View } from "react-native";

import { formatMoney, formatSignedMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Saldos por participante en formato filas. El usuario actual va primero y
 * marcado con "(vos)". El signo y el color del monto indican si debe o le deben.
 */
export default function SettlementBalances({ balances = [], currency, currentUserId, loading }) {
  if (balances.length === 0) {
    return loading ? null : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Todavía no hay participantes aceptados para calcular los saldos.
        </Text>
      </View>
    );
  }

  const isMe = (item) =>
    currentUserId !== null &&
    currentUserId !== undefined &&
    String(item.IdUsuario) === String(currentUserId);

  const ordered = [...balances].sort((a, b) => Number(isMe(b)) - Number(isMe(a)));

  return (
    <View>
      {ordered.map((item, index) => {
        const pendiente = Number(item.BalancePendiente ?? 0);
        const isLast = index === ordered.length - 1;
        const amountStyle =
          pendiente < 0 ? styles.amountDebt : pendiente > 0 ? styles.amountCredit : styles.amountEven;

        return (
          <View
            key={item.IdParticipanteViaje}
            style={[styles.row, !isLast && styles.rowDivider]}
            testID={`balance-${item.IdParticipanteViaje}`}
          >
            <View style={styles.body}>
              <Text numberOfLines={1} style={styles.name}>
                {item.NombreCompleto}
                {isMe(item) ? <Text style={styles.me}> (vos)</Text> : null}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                Pagó {formatMoney(item.TotalPagado, currency)} · le toca{" "}
                {formatMoney(item.GastoIndividual, currency)}
              </Text>
            </View>
            <Text style={[styles.amount, amountStyle]}>
              {pendiente === 0 ? "Al día" : formatSignedMoney(pendiente, currency)}
            </Text>
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
  me: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontWeight: "400",
  },
  meta: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  amount: {
    ...textStyles.bodyStrong,
  },
  amountDebt: {
    color: colors.danger,
  },
  amountCredit: {
    color: colors.success,
  },
  amountEven: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
});