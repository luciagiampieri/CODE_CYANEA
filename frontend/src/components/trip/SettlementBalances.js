import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney, formatMoneyNoBreak } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const firstName = (fullName) => String(fullName ?? "").trim().split(/\s+/)[0] || "";

function toneOf(value) {
  const n = Number(value ?? 0);
  if (n > 0.004) return "credit";
  if (n < -0.004) return "debt";
  return "even";
}

const TONE = {
  credit: { color: colors.success, label: "le deben", mine: "Te deben" },
  debt: { color: colors.danger, label: "debe", mine: "Debés" },
  even: { color: colors.textSecondary, label: "al día", mine: "Estás al día" },
};

// Orden del grupo: a quién le deben, quién debe y al final quién está al día.
const TONE_ORDER = { credit: 0, debt: 1, even: 2 };

/**
 * Vista "Saldos", pensada para mobile (punto 6).
 *
 * - Arriba, el saldo del usuario con una explicación de una línea y
 *   "Ver de dónde sale" (abre el desglose gasto por gasto).
 * - "¿Cómo se calcula?" plegado.
 * - El resto del grupo en una lista compacta: saldo con color y una palabra
 *   ("le deben", "debe", "al día") y, en chico, cuánto pagó y su parte.
 */
export default function SettlementBalances({
  balances = [],
  currency,
  currentUserId,
  loading,
  onShowBreakdown,
}) {

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

  const me = balances.find(isMe);
  const others = balances
    .filter((item) => !isMe(item))
    .sort((a, b) => {
      const ta = toneOf(a.BalancePendiente);
      const tb = toneOf(b.BalancePendiente);
      if (ta !== tb) return TONE_ORDER[ta] - TONE_ORDER[tb];
      return Math.abs(Number(b.BalancePendiente ?? 0)) - Math.abs(Number(a.BalancePendiente ?? 0));
    });

  return (
    <View style={styles.container}>
      {me ? <MyBalance item={me} currency={currency} onShowBreakdown={onShowBreakdown} /> : null}

      {others.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>El grupo</Text>
          <View style={styles.list}>
            {others.map((item, index) => (
              <GroupRow
                key={item.IdParticipanteViaje}
                currency={currency}
                isLast={index === others.length - 1}
                item={item}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MyBalance({ item, currency, onShowBreakdown }) {
  const pendiente = Number(item.BalancePendiente ?? 0);
  const tone = toneOf(pendiente);
  const pagado = Number(item.TotalPagado ?? 0);
  const parte = Number(item.GastoIndividual ?? 0);
  // Si el saldo no es solo "pagó − parte", es porque ya hubo transferencias.
  const conTransferencias = Math.abs(pendiente - (pagado - parte)) > 0.004;

  return (
    <View style={styles.mine} testID={`balance-${item.IdParticipanteViaje}`}>
      <Text style={styles.mineLabel}>Tu saldo</Text>
      <Text style={[styles.mineValue, { color: TONE[tone].color }]} testID="balance-mine-value">
        {tone === "even"
          ? TONE.even.mine
          : `${TONE[tone].mine} ${formatMoney(Math.abs(pendiente), currency)}`}
      </Text>
      <Text style={styles.mineExplain} testID="balance-mine-explain">
        Pagaste {formatMoney(pagado, currency)} y tu parte es {formatMoney(parte, currency)}.
        {conTransferencias ? " Ya contamos las transferencias que hiciste o recibiste." : ""}
      </Text>
      {onShowBreakdown ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onShowBreakdown}
          style={styles.mineLink}
          testID="balance-breakdown-open"
        >
          <Text style={styles.mineLinkText}>Ver de dónde sale</Text>
          <FontAwesome6 color={colors.primary} name="chevron-right" size={11} />
        </Pressable>
      ) : null}
    </View>
  );
}

function GroupRow({ item, currency, isLast }) {
  const pendiente = Number(item.BalancePendiente ?? 0);
  const tone = toneOf(pendiente);

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]} testID={`balance-${item.IdParticipanteViaje}`}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{firstName(item.NombreCompleto).charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {item.NombreCompleto}
        </Text>
        {/* Si no entra en un renglón, corta entre las dos frases, no dentro de un monto. */}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Pagó {formatMoneyNoBreak(item.TotalPagado, currency)}, </Text>
          <Text style={styles.meta}>su parte {formatMoneyNoBreak(item.GastoIndividual, currency)}</Text>
        </View>
      </View>
      <View style={styles.amountBox}>
        {tone !== "even" ? (
          <Text style={[styles.amount, { color: TONE[tone].color }]}>
            {formatMoney(Math.abs(pendiente), currency)}
          </Text>
        ) : null}
        <Text style={[styles.amountLabel, { color: TONE[tone].color }]}>{TONE[tone].label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
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
  mine: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  mineLabel: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  mineValue: {
    ...textStyles.kpiValue,
    fontSize: 22,
  },
  mineExplain: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mineLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: spacing.xs,
  },
  mineLinkText: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    paddingHorizontal: spacing.xxs,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  avatarText: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  meta: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  amountBox: {
    alignItems: "flex-end",
  },
  amount: {
    ...textStyles.kpiValue,
    fontSize: 16,
  },
  amountLabel: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "600",
  },
});