import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { formatMoney, formatMoneyNoBreak, formatSignedMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import { formatExpenseDate } from "./ExpenseList";

const firstName = (fullName) => String(fullName ?? "").trim().split(/\s+/)[0] || "";

function toneOf(value) {
  const n = Number(value ?? 0);
  if (n > 0.004) return "credit";
  if (n < -0.004) return "debt";
  return "even";
}

const TONE_COLOR = { credit: colors.success, debt: colors.danger, even: colors.textSecondary };

function headline(saldo, currency) {
  const tone = toneOf(saldo);
  if (tone === "credit") return `Te deben ${formatMoney(saldo, currency)}`;
  if (tone === "debt") return `Debés ${formatMoney(Math.abs(saldo), currency)}`;
  return "Estás al día";
}

function SummaryLine({ label, value, currency, testID }) {
  return (
    <View style={styles.summaryLine} testID={testID}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{formatSignedMoney(value, currency)}</Text>
    </View>
  );
}

/**
 * "De dónde sale tu saldo" (punto 6): explica el saldo del usuario.
 *
 * Arriba la cuenta resumida (pagaste − tu parte ± transferencias = saldo) y
 * debajo cada gasto compartido y cada transferencia con cuánto movió el saldo.
 * Los gastos personales no aparecen: no cambian el saldo.
 */
export default function MyBalanceBreakdownModal({ visible, data, loading = false, error = "", onClose, onRetry }) {
  const currency = data?.Moneda;
  const saldo = Number(data?.Saldo ?? 0);
  const tone = toneOf(saldo);
  const enviadas = Number(data?.TransferenciasEnviadas ?? 0);
  const recibidas = Number(data?.TransferenciasRecibidas ?? 0);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} testID="my-balance-breakdown">
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>De dónde sale tu saldo</Text>
            <Pressable hitSlop={10} onPress={onClose} testID="my-balance-close">
              <FontAwesome6 color={colors.overlay} name="xmark" size={18} />
            </Pressable>
          </View>

          {loading && !data ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : error && !data ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry ? <PrimaryButton label="Reintentar" onPress={onRetry} variant="secondary" /> : null}
            </View>
          ) : data ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={[styles.headline, { color: TONE_COLOR[tone] }]} testID="my-balance-headline">
                {headline(saldo, currency)}
              </Text>

              {/* La cuenta, de arriba hacia abajo. */}
              <View style={styles.summary}>
                <SummaryLine
                  currency={currency}
                  label="Pagaste en gastos compartidos"
                  testID="my-balance-paid"
                  value={data.TotalPagado}
                />
                <SummaryLine
                  currency={currency}
                  label="Tu parte de esos gastos"
                  testID="my-balance-share"
                  value={-Number(data.TotalParte ?? 0)}
                />
                {enviadas > 0 ? (
                  <SummaryLine currency={currency} label="Transferencias que hiciste" value={enviadas} />
                ) : null}
                {recibidas > 0 ? (
                  <SummaryLine currency={currency} label="Transferencias que recibiste" value={-recibidas} />
                ) : null}
                <View style={styles.summaryTotal}>
                  <Text style={styles.summaryTotalLabel}>Tu saldo</Text>
                  <Text style={[styles.summaryTotalValue, { color: TONE_COLOR[tone] }]}>
                    {formatSignedMoney(saldo, currency)}
                  </Text>
                </View>
              </View>

              <Text style={styles.explain}>
                Si pagaste más que tu parte, te deben la diferencia; si pagaste menos, la debés. Los gastos
                personales no cambian tu saldo.
              </Text>

              {data.Gastos?.length ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Gasto por gasto</Text>
                  <View style={styles.list}>
                    {data.Gastos.map((gasto, index) => (
                      <View
                        key={gasto.IdGasto}
                        style={[styles.item, index < data.Gastos.length - 1 && styles.itemDivider]}
                        testID={`my-balance-expense-${gasto.IdGasto}`}
                      >
                        <View style={styles.itemText}>
                          <Text numberOfLines={1} style={styles.itemName}>
                            {gasto.Nombre}
                          </Text>
                          {/* Corta entre frases, nunca dentro de un monto. */}
                          <View style={styles.itemMetaRow}>
                            <Text style={styles.itemMeta}>
                              {formatExpenseDate(gasto.FechaGasto)}.{" "}
                              {gasto.PagasteVos
                                ? `Pagaste ${formatMoneyNoBreak(gasto.Pagado, currency)}, `
                                : `Pagó ${firstName(gasto.NombrePagador)}, `}
                            </Text>
                            <Text style={styles.itemMeta}>tu parte {formatMoneyNoBreak(gasto.TuParte, currency)}</Text>
                          </View>
                        </View>
                        <Text style={[styles.itemEffect, { color: TONE_COLOR[toneOf(gasto.Efecto)] }]}>
                          {formatSignedMoney(gasto.Efecto, currency)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={styles.explain}>Todavía no participás de ningún gasto compartido.</Text>
              )}

              {data.Transferencias?.length ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Transferencias</Text>
                  <View style={styles.list}>
                    {data.Transferencias.map((t, index) => (
                      <View
                        key={t.IdTransferenciaLiquidacion}
                        style={[styles.item, index < data.Transferencias.length - 1 && styles.itemDivider]}
                        testID={`my-balance-transfer-${t.IdTransferenciaLiquidacion}`}
                      >
                        <View style={styles.itemText}>
                          <Text numberOfLines={1} style={styles.itemName}>
                            {t.Enviada
                              ? `Le transferiste a ${firstName(t.NombreContraparte)}`
                              : `Te transfirió ${firstName(t.NombreContraparte)}`}
                          </Text>
                          {t.Estado === "informada" ? (
                            <Text style={[styles.itemMeta, styles.itemMetaSpaced]}>
                              {t.Enviada ? "Falta que lo confirme" : "Falta que lo confirmes"}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.itemEffect, { color: TONE_COLOR[toneOf(t.Efecto)] }]}>
                          {formatSignedMoney(t.Efecto, currency)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: "88%",
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  center: {
    paddingVertical: 48,
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: {
    ...textStyles.body,
    color: colors.danger,
    textAlign: "center",
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.md,
  },
  headline: {
    ...textStyles.kpiValue,
    fontSize: 24,
  },
  summary: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  summaryLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  summaryValue: {
    ...textStyles.meta,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  summaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: spacing.xs,
    marginTop: spacing.xxs,
  },
  summaryTotalLabel: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  summaryTotalValue: {
    ...textStyles.kpiValue,
    fontSize: 18,
  },
  explain: {
    ...textStyles.meta,
    fontSize: 13,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.xs,
  },
  blockTitle: {
    ...textStyles.meta,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  itemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...textStyles.meta,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  itemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  itemMeta: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemMetaSpaced: {
    marginTop: 2,
  },
  itemEffect: {
    ...textStyles.meta,
    fontWeight: "700",
  },
});