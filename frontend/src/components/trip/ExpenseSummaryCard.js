import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import PrimaryButton from "../ui/PrimaryButton";
import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Card principal del tab Gastos: el saldo del usuario actual, los totales del
 * viaje y las acciones (agregar gasto, recalcular).
 *
 * `mySaldo` es el BalancePendiente del usuario actual (negativo = debe,
 * positivo = le deben, 0 = al día). Si es null no se muestra el bloque.
 */
export default function ExpenseSummaryCard({
  currency,
  totalSpent = 0,
  pendingTotal = 0,
  mySaldo = null,
  loading = false,
  error = "",
  canAddExpense = false,
  onAddExpense,
  onShowMyTransfers,
  canRebuild = false,
  rebuilding = false,
  onRebuild,
}) {
  const saldo = Number(mySaldo ?? 0);
  const tone = saldo < 0 ? "debt" : saldo > 0 ? "credit" : "even";
  const palette = TONES[tone];

  // La mayoría de las monedas ya se formatean identificables ("EUR 160",
  // "US$ 160"). Solo el peso argentino queda como "$ 160", sin letras: en ese
  // caso se agrega la etiqueta con el código para que no haya dudas.
  const totalSpentText = formatMoney(totalSpent, currency);
  const showCurrencyTag = Boolean(currency) && !/[A-Za-z]/.test(totalSpentText);

  return (
    <View style={styles.card}>
      {mySaldo !== null && mySaldo !== undefined ? (
        <Pressable
          accessibilityRole={saldo !== 0 && onShowMyTransfers ? "button" : undefined}
          disabled={saldo === 0 || !onShowMyTransfers}
          onPress={onShowMyTransfers}
          style={[styles.myBalance, { backgroundColor: palette.background }]}
          testID="expense-my-balance"
        >
          <View style={styles.myBalanceText}>
            <Text style={[styles.myBalanceLabel, { color: palette.color }]}>Tu saldo</Text>
            <Text style={[styles.myBalanceValue, { color: palette.color }]}>
              {saldo < 0
                ? `Debés ${formatMoney(Math.abs(saldo), currency)}`
                : saldo > 0
                ? `Te deben ${formatMoney(saldo, currency)}`
                : "Estás al día"}
            </Text>
          </View>
          {saldo !== 0 && onShowMyTransfers ? (
            <View style={styles.myBalanceLink}>
              <Text style={[styles.myBalanceLinkText, { color: palette.color }]}>
                {saldo < 0 ? "Ver a quién" : "Ver de quién"}
              </Text>
              <FontAwesome6 color={palette.color} name="arrow-right" size={11} />
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <View style={styles.totalsRow}>
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total gastado</Text>
          <Text style={styles.totalValue}>
            {totalSpentText}
            {showCurrencyTag ? <Text style={styles.currency}> {currency}</Text> : null}
          </Text>
        </View>
        <View style={styles.total}>
          <Text style={styles.totalLabel}>Por saldar</Text>
          <Text style={styles.totalValue}>{formatMoney(pendingTotal, currency)}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {canAddExpense ? (
        <PrimaryButton
          icon="plus"
          iconPosition="left"
          label="Agregar gasto"
          onPress={onAddExpense}
          style={styles.addButton}
        />
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Las cuentas se recalculan con cada gasto nuevo.</Text>
        {canRebuild ? (
          <Pressable
            accessibilityRole="button"
            disabled={rebuilding}
            hitSlop={8}
            onPress={onRebuild}
            testID="expense-rebuild"
          >
            <Text style={styles.footerLink}>
              {rebuilding ? "Recalculando..." : "Recalcular liquidación"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const TONES = {
  debt: { background: colors.dangerSurface, color: colors.danger },
  credit: { background: colors.successSurface, color: colors.success },
  even: { background: colors.surfaceAlt, color: colors.textSecondary },
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  myBalance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  myBalanceText: {
    flexShrink: 1,
    gap: 2,
  },
  myBalanceLabel: {
    ...textStyles.meta,
    fontWeight: "600",
  },
  myBalanceValue: {
    ...textStyles.kpiValue,
    fontSize: 22,
  },
  myBalanceLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  myBalanceLinkText: {
    ...textStyles.meta,
    fontWeight: "700",
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  total: {
    flex: 1,
    gap: 2,
  },
  totalLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  totalValue: {
    ...textStyles.kpiValue,
    color: colors.primary,
    fontSize: 20,
  },
  currency: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 11,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
  },
  addButton: {
    alignSelf: "stretch",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 6,
    rowGap: 2,
  },
  footerText: {
    ...textStyles.meta,
    color: colors.textMuted,
    fontSize: 12,
  },
  footerLink: {
    ...textStyles.meta,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});