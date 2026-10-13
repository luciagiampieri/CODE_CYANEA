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
 *
 * `totalSpent` es el total del grupo (solo gastos compartidos). `myExpense`
 * es "Tu gasto": tu parte de los compartidos + tus gastos personales
 * (`myPersonalExpense`). Si `myExpense` es null se muestra "Por saldar" en
 * su lugar, como antes.
 *
 * Jerarquía: el saldo es lo protagonista; los dos totales quedan como datos
 * tranquilos, uno al lado del otro; "Agregar gasto" es la acción principal y
 * "Recalcular liquidación" una acción secundaria discreta. Lo pendiente del
 * grupo no se repite acá: está en la pestaña Transferencias.
 */
export default function ExpenseSummaryCard({
  currency,
  totalSpent = 0,
  pendingTotal = 0,
  myExpense = null,
  myPersonalExpense = 0,
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

  // Todos los montos están en la moneda del viaje (el Resumen la indica en
  // "Total del grupo (ARS)"). Acá no se repite el código: al lado del número
  // achicaba el monto y en la etiqueta la partía en dos renglones.
  const totalSpentText = formatMoney(totalSpent, currency);
  const showMyExpense = myExpense !== null && myExpense !== undefined;
  const personal = Number(myPersonalExpense ?? 0);

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

      <View style={styles.stats}>
        <View style={styles.stat} testID="expense-group-total">
          <Text numberOfLines={1} style={styles.statLabel}>
            Gastos del grupo
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={1}
            style={styles.statValue}
          >
            {totalSpentText}
          </Text>
        </View>

        <View style={styles.statDivider} />

        {showMyExpense ? (
          <View style={styles.stat} testID="expense-my-total">
            <Text numberOfLines={1} style={styles.statLabel}>
              Tu gasto
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
              style={styles.statValue}
            >
              {formatMoney(myExpense, currency)}
            </Text>
            {personal > 0 ? (
              <Text numberOfLines={2} style={styles.statNote} testID="expense-my-personal">
                Incluye {formatMoney(personal, currency)} personales
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.stat}>
            <Text numberOfLines={1} style={styles.statLabel}>
              Por saldar
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
              style={styles.statValue}
            >
              {formatMoney(pendingTotal, currency)}
            </Text>
          </View>
        )}

        {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
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

      {canRebuild ? (
        <Pressable
          accessibilityHint="Vuelve a calcular quién le transfiere a quién"
          accessibilityRole="button"
          disabled={rebuilding}
          hitSlop={8}
          onPress={onRebuild}
          style={styles.rebuild}
          testID="expense-rebuild"
        >
          <FontAwesome6 color={colors.textSecondary} name="rotate" size={11} />
          <Text style={styles.rebuildText}>
            {rebuilding ? "Recalculando..." : "Recalcular liquidación"}
          </Text>
        </Pressable>
      ) : null}
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
    gap: spacing.lg,
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
  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: spacing.xs,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    marginHorizontal: spacing.xs,
  },
  statLabel: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
  },
  statValue: {
    ...textStyles.kpiValue,
    color: colors.primary,
    fontSize: 22,
  },
  statNote: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textMuted,
  },
  loading: {
    alignSelf: "center",
    marginLeft: spacing.xs,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
  },
  addButton: {
    alignSelf: "stretch",
  },
  rebuild: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: spacing.xxs,
  },
  rebuildText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
});