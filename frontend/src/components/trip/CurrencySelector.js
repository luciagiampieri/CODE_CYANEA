import { useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Modal,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import ScreenContainer from "../layout/ScreenContainer";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

// Símbolos de las monedas más comunes; el resto muestra su código
const SIMBOLOS = {
  USD: "$",
  ARS: "$",
  MXN: "$",
  CLP: "$",
  COP: "$",
  UYU: "$",
  CAD: "$",
  AUD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  BRL: "R$",
  CHF: "Fr",
  INR: "₹",
  KRW: "₩",
  PEN: "S/",
  PYG: "₲",
  BOB: "Bs",
};

function CurrencyBadge({ code, active, size = 40 }) {
  const simbolo = SIMBOLOS[code];
  const texto = simbolo || code;
  const pequeno = texto.length > 2;

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2.6 },
        active && styles.badgeActive,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { fontSize: pequeno ? size * 0.3 : size * 0.42 },
          active && styles.badgeTextActive,
        ]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </View>
  );
}

export default function CurrencySelector({
  currencies,
  selectedCurrency,
  onSelectCurrency,
  error,
  onOpen,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return currencies;

    return currencies.filter(
      (c) =>
        (c.Nombre || "").toLowerCase().includes(value) ||
        (c.Codigo || "").toLowerCase().includes(value)
    );
  }, [currencies, search]);

  const selected = currencies.find((c) => c.Codigo === selectedCurrency);

  function openModal() {
    onOpen?.();
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setSearch("");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Moneda</Text>

      <TouchableOpacity
        style={[styles.dropdownButton, error && styles.inputError]}
        onPress={openModal}
        activeOpacity={0.75}
      >
        <View style={styles.dropdownLeftContent}>
          {selected ? (
            <CurrencyBadge code={selected.Codigo} active size={36} />
          ) : (
            <View style={styles.dropdownIconWrap}>
              <FontAwesome6 name="money-bill-wave" size={13} color={colors.textMuted} />
            </View>
          )}

          {selected ? (
            <View style={styles.dropdownTextWrap}>
              <Text style={styles.dropdownText} numberOfLines={1}>
                {selected.Nombre}
              </Text>
              <Text style={styles.dropdownCode}>{selected.Codigo}</Text>
            </View>
          ) : (
            <Text style={styles.dropdownPlaceholder}>Elegí una moneda</Text>
          )}
        </View>

        <View style={styles.chevronWrap}>
          <FontAwesome6 name="chevron-down" size={11} color={colors.primary} />
        </View>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={closeModal} transparent={false}>
        <ScreenContainer fullWidth padded={false}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {/* Encabezado */}
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                onPress={closeModal}
                hitSlop={10}
                style={styles.roundButton}
                activeOpacity={0.7}
                accessibilityLabel="Cerrar selector de moneda"
              >
                <FontAwesome6 name="arrow-left" size={15} color={colors.primary} />
              </TouchableOpacity>

              <View style={styles.headerTitleWrap}>
                <Text style={styles.pickerTitle}>Moneda</Text>
                <Text style={styles.pickerSubtitle}>
                  {currencies.length} {currencies.length === 1 ? "disponible" : "disponibles"}
                </Text>
              </View>

              <View style={styles.roundButtonPlaceholder} />
            </View>

            {/* Buscador */}
            <View style={styles.searchWrapper}>
              <View style={styles.pickerSearchBox}>
                <FontAwesome6 name="magnifying-glass" size={14} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscá por nombre o código"
                  placeholderTextColor={colors.textMuted}
                  style={styles.pickerSearchInput}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                    <FontAwesome6 name="circle-xmark" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Lista */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.Codigo}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isActive = item.Codigo === selectedCurrency;
                return (
                  <TouchableOpacity
                    style={[styles.item, isActive && styles.itemActive]}
                    onPress={() => {
                      onSelectCurrency(item.Codigo);
                      closeModal();
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.itemLeft}>
                      <CurrencyBadge code={item.Codigo} active={isActive} />
                      <View style={styles.itemTextWrap}>
                        <Text
                          style={[styles.itemTitle, isActive && styles.itemTitleActive]}
                          numberOfLines={1}
                        >
                          {item.Nombre}
                        </Text>
                        <Text style={styles.itemCode}>{item.Codigo}</Text>
                      </View>
                    </View>

                    <View style={[styles.radioCheck, isActive && styles.radioCheckActive]}>
                      {isActive && (
                        <FontAwesome6 name="check" size={11} color={colors.textInverse || "#fff"} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <View style={styles.emptyIconWrap}>
                    <FontAwesome6 name="magnifying-glass" size={20} color={colors.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>Sin resultados</Text>
                  <Text style={styles.emptyText}>
                    No encontramos ninguna moneda que coincida con tu búsqueda.
                  </Text>
                </View>
              }
            />
          </KeyboardAvoidingView>
        </ScreenContainer>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background || "#f8fafc",
  },
  container: {
    gap: spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: colors.primary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  // --- Botón desplegable ---
  dropdownButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg || 16,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  dropdownIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt || "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownTextWrap: {
    flex: 1,
  },
  dropdownPlaceholder: {
    ...textStyles.body,
    color: colors.textMuted,
  },
  dropdownText: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  dropdownCode: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  chevronWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: (colors.primary || "#1d4ed8") + "14",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },

  // --- Badge de moneda ---
  badge: {
    backgroundColor: colors.surfaceAlt || "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontWeight: "800",
    color: colors.primary,
  },
  badgeTextActive: {
    color: colors.textInverse || "#fff",
  },

  // --- Modal ---
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt || "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  roundButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerTitleWrap: {
    alignItems: "center",
  },
  pickerTitle: {
    ...textStyles.bodyStrong,
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  pickerSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  searchWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt || "#f1f5f9",
    paddingHorizontal: spacing.md,
  },
  pickerSearchInput: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
    paddingVertical: 8,
  },

  // --- Lista ---
  listContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg || 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  itemActive: {
    borderColor: colors.primary,
    backgroundColor: (colors.primary || "#1d4ed8") + "0D",
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
    fontSize: 15,
  },
  itemTitleActive: {
    color: colors.primary,
  },
  itemCode: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  radioCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
  radioCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // --- Estado vacío ---
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt || "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 16,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 240,
  },
});