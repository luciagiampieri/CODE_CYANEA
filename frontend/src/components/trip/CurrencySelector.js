import { useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Modal,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import ScreenContainer from "../layout/ScreenContainer";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/**
 * Selector de moneda como modal de pantalla completa (mismo patrón que
 * DestinationPickerModal en CreateTripScreen). Antes, la lista de
 * resultados vivía dentro del scroll del formulario y el teclado la
 * tapaba; ahora la lista siempre queda visible arriba del teclado.
 *
 * onOpen es opcional: permite que la pantalla contenedora saque el foco
 * de otros inputs (título/descripción) antes de abrir este modal.
 */
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
        c.Nombre.toLowerCase().includes(value) ||
        c.Codigo.toLowerCase().includes(value)
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
      >
        <View style={styles.dropdownLeftContent}>
          <FontAwesome6
            name="coins"
            size={14}
            color={selected ? colors.primary : colors.textMuted}
            style={{ marginRight: 10 }}
          />
          <Text style={selected ? styles.dropdownText : styles.dropdownPlaceholder} numberOfLines={1}>
            {selected ? `${selected.Nombre} (${selected.Codigo})` : "Seleccionar moneda..."}
          </Text>
        </View>
        <FontAwesome6 name="chevron-right" size={14} color={colors.textMuted} />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" onRequestClose={closeModal} transparent={false}>
        <ScreenContainer fullWidth padded={false}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.pickerHeader}>
              <TouchableOpacity onPress={closeModal} hitSlop={12} style={styles.pickerBackButton}>
                <FontAwesome6 name="chevron-left" size={16} color={colors.primary} />
                <Text style={styles.pickerBackText}>Volver</Text>
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>Seleccionar moneda</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.pickerSearchBox}>
              <FontAwesome6 name="magnifying-glass" size={14} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar moneda..."
                placeholderTextColor={colors.textMuted}
                style={styles.pickerSearchInput}
                autoFocus
              />
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.Codigo}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isActive = item.Codigo === selectedCurrency;
                return (
                  <TouchableOpacity
                    style={[styles.item, isActive && styles.itemActive]}
                    onPress={() => {
                      onSelectCurrency(item.Codigo);
                      closeModal();
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <FontAwesome6
                        name="coins"
                        size={15}
                        color={isActive ? colors.primary : colors.textSecondary}
                        style={{ marginRight: 12, width: 20, textAlign: "center" }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, isActive && styles.itemTitleActive]} numberOfLines={1}>
                          {item.Nombre}
                        </Text>
                        <Text style={styles.itemCode}>{item.Codigo}</Text>
                      </View>
                    </View>
                    {isActive && <FontAwesome6 name="check" size={14} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <FontAwesome6 name="magnifying-glass" size={14} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No se encontraron monedas.</Text>
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
  dropdownButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dropdownPlaceholder: {
    ...textStyles.body,
    color: colors.textMuted,
  },
  dropdownText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },

  // --- Modal ---
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 70,
  },
  pickerBackText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: "600",
  },
  pickerTitle: {
    ...textStyles.bodyStrong,
    fontSize: 17,
    color: colors.primary,
  },
  pickerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  pickerSearchInput: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
  },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  itemActive: {
    backgroundColor: colors.primarySoft ? `${colors.primarySoft}22` : "#f0f4f8",
    borderRadius: radii.sm || 8,
  },
  itemTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  itemTitleActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  itemCode: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
});
