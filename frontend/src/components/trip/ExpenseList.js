import { FontAwesome6 } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney } from "../../utils/money";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Íconos por nombre de categoría (datos maestros de CategoriasGastos).
const CATEGORY_ICONS = {
  "comida y bebida": "utensils",
  transporte: "car",
  alojamiento: "bed",
  entretenimiento: "ticket",
  compras: "bag-shopping",
  servicios: "bell-concierge",
  otros: "receipt",
};

export function iconForCategory(nombre) {
  return CATEGORY_ICONS[String(nombre ?? "").trim().toLowerCase()] ?? "receipt";
}

// "2026-09-02" -> "2 sep" (o "2 sep 2025" si no es del año en curso).
// Se parsea a mano para evitar el corrimiento de zona horaria de new Date("aaaa-mm-dd").
export function formatExpenseDate(ymd, today = new Date()) {
  if (!ymd) return "";
  const [year, month, day] = String(ymd).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "";
  const base = `${day} ${MONTHS[month - 1]}`;
  return year === today.getFullYear() ? base : `${base} ${year}`;
}

// Número con 2 decimales y separadores locales, sin símbolo (el código de moneda se agrega aparte).
function formatOriginalAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TODAS = "todas";

/**
 * Listado de gastos del viaje con filtro por categoría y total del filtro.
 */
export default function ExpenseList({
  expenses = [],
  categories = [],
  currency,
  currentUserId,
  loading = false,
  error = "",
  onRetry,
}) {
  const [filter, setFilter] = useState(TODAS);
  const [pickerOpen, setPickerOpen] = useState(false);

  const counts = useMemo(() => {
    const result = {};
    expenses.forEach((expense) => {
      result[expense.IdCategoria] = (result[expense.IdCategoria] ?? 0) + 1;
    });
    return result;
  }, [expenses]);

  const visibleExpenses = useMemo(
    () =>
      filter === TODAS
        ? expenses
        : expenses.filter((expense) => String(expense.IdCategoria) === String(filter)),
    [expenses, filter]
  );

  const visibleTotal = useMemo(
    () => visibleExpenses.reduce((acc, expense) => acc + Number(expense.Monto ?? 0), 0),
    [visibleExpenses]
  );

  if (error && !loading) {
    return (
      <View style={styles.errorState}>
        <Text style={styles.errorText}>{error}</Text>
        {typeof onRetry === "function" ? (
          <Pressable accessibilityRole="button" onPress={onRetry} testID="expenses-retry">
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (loading && expenses.length === 0) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }

  if (expenses.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>
          Todavía no hay gastos cargados. Usá “Agregar gasto” para registrar el primero.
        </Text>
      </View>
    );
  }

  const filterOptions = [
    { id: TODAS, label: "Todas", count: expenses.length },
    ...categories.map((category) => ({
      id: category.IdCategoria,
      label: category.Nombre,
      count: counts[category.IdCategoria] ?? 0,
    })),
  ];

  const selectedLabel = filterOptions.find((option) => String(option.id) === String(filter))?.label;

  const filterActive = filter !== TODAS;

  function chooseFilter(id) {
    setFilter(id);
    setPickerOpen(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPickerOpen(true)}
          style={[styles.filterButton, filterActive && styles.filterButtonActive]}
          testID="expense-filter-open"
        >
          <FontAwesome6
            color={filterActive ? colors.textInverse : colors.primary}
            name="sliders"
            size={12}
          />
          <Text style={[styles.filterButtonText, filterActive && styles.filterButtonTextActive]}>
            Filtrar
          </Text>
        </Pressable>

        {filterActive ? (
          <Pressable
            accessibilityLabel={`Quitar filtro ${selectedLabel}`}
            accessibilityRole="button"
            onPress={() => setFilter(TODAS)}
            style={styles.activeChip}
            testID="expense-filter-clear"
          >
            <FontAwesome6 color={colors.primary} name={iconForCategory(selectedLabel)} size={11} />
            <Text numberOfLines={1} style={styles.activeChipText}>
              {selectedLabel}
            </Text>
            <FontAwesome6 color={colors.textMuted} name="xmark" size={11} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.totalRow} testID="expenses-total">
        <Text style={styles.totalLabel}>
          {filterActive ? "Total filtrado" : "Total"} · {visibleExpenses.length}{" "}
          {visibleExpenses.length === 1 ? "gasto" : "gastos"}
        </Text>
        <Text style={styles.totalValue}>{formatMoney(visibleTotal, currency)}</Text>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
        transparent
        visible={pickerOpen}
      >
        <Pressable
          accessibilityLabel="Cerrar filtros"
          onPress={() => setPickerOpen(false)}
          style={styles.overlay}
          testID="expense-filter-overlay"
        >
          <Pressable onPress={() => {}} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filtrar por categoría</Text>
              <Pressable
                accessibilityLabel="Cerrar"
                hitSlop={8}
                onPress={() => setPickerOpen(false)}
              >
                <FontAwesome6 color={colors.textMuted} name="xmark" size={16} />
              </Pressable>
            </View>

            {filterOptions.map((option, index) => {
              const selected = String(option.id) === String(filter);
              const isLast = index === filterOptions.length - 1;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.id}
                  onPress={() => chooseFilter(option.id)}
                  style={({ pressed }) => [
                    styles.option,
                    !isLast && styles.optionDivider,
                    pressed && styles.optionPressed,
                  ]}
                  testID={`expense-filter-${option.id}`}
                >
                  <View style={styles.optionIcon}>
                    <FontAwesome6
                      color={colors.primary}
                      name={option.id === TODAS ? "layer-group" : iconForCategory(option.label)}
                      size={13}
                    />
                  </View>
                  <Text
                    style={[
                      styles.optionLabel,
                      option.count === 0 && styles.optionLabelEmpty,
                      selected && styles.optionLabelSelected,
                    ]}
                  >
                    {option.id === TODAS ? "Todas las categorías" : option.label}
                  </Text>
                  <Text style={styles.optionCount}>{option.count}</Text>
                  {selected ? (
                    <FontAwesome6 color={colors.primary} name="check" size={13} />
                  ) : (
                    <View style={styles.checkPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {visibleExpenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No hay gastos en esta categoría.</Text>
        </View>
      ) : (
        <View>
          {visibleExpenses.map((expense, index) => {
            const isLast = index === visibleExpenses.length - 1;
            const paidByMe =
              currentUserId !== null &&
              currentUserId !== undefined &&
              String(expense.IdUsuarioPagador) === String(currentUserId);

            // Si el gasto se registró en una moneda distinta a la base del viaje,
            // mostramos también el monto original.
            const originalCurrency = String(expense.MonedaOriginal ?? "").trim().toUpperCase();
            const baseCurrency = String(currency ?? "").trim().toUpperCase();
            const showOriginal =
              originalCurrency !== "" &&
              baseCurrency !== "" &&
              originalCurrency !== baseCurrency &&
              expense.MontoOriginal !== null &&
              expense.MontoOriginal !== undefined;

            return (
              <View
                key={expense.IdGasto}
                style={[styles.row, !isLast && styles.rowDivider]}
                testID={`expense-${expense.IdGasto}`}
              >
                <View style={styles.icon}>
                  <FontAwesome6
                    color={colors.primary}
                    name={iconForCategory(expense.NombreCategoria)}
                    size={14}
                  />
                </View>
                <View style={styles.body}>
                  <Text numberOfLines={1} style={styles.name}>
                    {expense.Nombre}
                  </Text>
                  <Text numberOfLines={2} style={styles.meta}>
                    {paidByMe ? "Pagaste vos" : `Pagó ${expense.NombrePagador}`} ·{" "}
                    {formatExpenseDate(expense.FechaGasto)}
                  </Text>
                  {showOriginal ? (
                    <Text
                      style={styles.originalLine}
                      testID={`expense-original-${expense.IdGasto}`}
                    >
                      Registrado: {formatOriginalAmount(expense.MontoOriginal)} {originalCurrency}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.amount}>{formatMoney(expense.Monto, currency)}</Text>
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
  loader: {
    paddingVertical: spacing.md,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: colors.textInverse,
  },
  activeChip: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  activeChipText: {
    ...textStyles.meta,
    flexShrink: 1,
    color: colors.primary,
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 20,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionPressed: {
    opacity: 0.6,
  },
  optionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  optionLabel: {
    ...textStyles.body,
    flex: 1,
    color: colors.textPrimary,
  },
  optionLabelEmpty: {
    color: colors.textMuted,
  },
  optionLabelSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  optionCount: {
    ...textStyles.meta,
    color: colors.textMuted,
  },
  checkPlaceholder: {
    width: 13,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  totalLabel: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  totalValue: {
    ...textStyles.bodyStrong,
    color: colors.primary,
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
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
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
  amount: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 0,
    textAlign: "right",
  },
  originalLine: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
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
  retryText: {
    ...textStyles.meta,
    color: colors.danger,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});