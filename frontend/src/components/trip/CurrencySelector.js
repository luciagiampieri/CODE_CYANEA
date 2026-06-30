import { useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function CurrencySelector({
  currencies,
  selectedCurrency,
  onSelectCurrency,
  error,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return currencies;

    return currencies.filter(
      (c) =>
        c.Nombre.toLowerCase().includes(value) ||
        c.Codigo.toLowerCase().includes(value)
    );
  }, [currencies, search]);

  const selected = currencies.find(
    (c) => c.Codigo === selectedCurrency
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Moneda</Text>

      <View style={styles.inputShell}>
        <FontAwesome6
          color={colors.textMuted}
          name="magnifying-glass"
          size={14}
          style={styles.leadingIcon}
        />

        <TextInput
          value={open ? search : (selected ? `${selected.Nombre} (${selected.Codigo})` : "")}
          placeholder="Buscar moneda..."
          placeholderTextColor={colors.textMuted}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          onChangeText={setSearch}
          style={styles.input}
        />
      </View>

      {open && (
        <ScrollView
          style={styles.results}
          nestedScrollEnabled
        >
          {filtered.map((currency) => (
            <Pressable
              key={currency.Codigo}
              style={styles.item}
              onPress={() => {
                onSelectCurrency(currency.Codigo);
                setOpen(false);
                setSearch("");
              }}
            >
              <Text style={styles.itemTitle}>
                {currency.Nombre}
              </Text>

              <Text style={styles.itemCode}>
                {currency.Codigo}
              </Text>
            </Pressable>
          ))}

          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No se encontraron monedas.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
  },
  inputShell: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 52,
    ...textStyles.body,
    color: colors.textPrimary,
  },
  results: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  itemCode: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  empty: {
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
  }
});