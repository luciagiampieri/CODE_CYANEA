import { useEffect, useMemo, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Modal from "../ui/AppModal";

import useResponsive from "../../hooks/useResponsive";
import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

// Monedas que más se usan en viajes desde Argentina: aparecen primero en la
// lista cuando no hay búsqueda, el resto sigue en el orden que trae el backend.
const MONEDAS_FRECUENTES = ["ARS", "USD", "EUR", "BRL", "CLP", "UYU"];

// Web en un dispositivo táctil (celu/tablet desde el navegador).
const IS_TOUCH_WEB =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

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

/**
 * Solo web: devuelve la zona realmente visible de la pantalla (sin el teclado).
 * En el navegador del celu el teclado no achica la página, así que un Modal
 * "pegado abajo" queda debajo del teclado. Con esto el popup se ubica en el
 * área visible. En nativo devuelve null y no cambia nada.
 */
function useWebVisualViewport(active) {
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !active || typeof window === "undefined" || !window.visualViewport) {
      setViewport(null);
      return undefined;
    }

    const vv = window.visualViewport;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return viewport;
}

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
  const { isTablet } = useResponsive();
  const webViewport = useWebVisualViewport(open);

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) {
      const rank = (code) => {
        const i = MONEDAS_FRECUENTES.indexOf(code);
        return i === -1 ? MONEDAS_FRECUENTES.length : i;
      };
      // sort estable: dentro del mismo rango se respeta el orden original
      return [...currencies].sort((a, b) => rank(a.Codigo) - rank(b.Codigo));
    }

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

      <Modal visible={open} animationType="fade" onRequestClose={closeModal} transparent>
        {/* En web el contenedor ocupa solo la zona visible (arriba del teclado) */}
        <View
          style={
            webViewport
              ? [styles.webViewportBox, { top: webViewport.top, height: webViewport.height }]
              : styles.flex
          }
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            enabled={Platform.OS !== "web"}
          >
            <Pressable
              style={[styles.overlay, isTablet ? styles.overlayCentered : styles.overlayBottom]}
              onPress={closeModal}
            >
              {/* stopPropagation: tocar dentro del popup no lo cierra */}
              <Pressable
                style={[styles.sheet, isTablet ? styles.sheetCentered : styles.sheetBottom]}
                onPress={(e) => e.stopPropagation()}
                accessible={false}
              >
                {!isTablet && <View style={styles.grabber} />}

                {/* Encabezado */}
                <View style={styles.pickerHeader}>
                  <View style={styles.headerTitleWrap}>
                    <Text style={styles.pickerTitle}>Moneda</Text>
                    <Text style={styles.pickerSubtitle}>
                      {currencies.length} {currencies.length === 1 ? "disponible" : "disponibles"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeModal}
                    hitSlop={10}
                    style={styles.roundButton}
                    activeOpacity={0.7}
                    accessibilityLabel="Cerrar selector de moneda"
                  >
                    <FontAwesome6 name="xmark" size={15} color={colors.primary} />
                  </TouchableOpacity>
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
                      // Solo en compu abrimos el buscador con foco: en celulares (app o navegador)
                      // el teclado taparía la lista apenas se abre el selector.
                      autoFocus={Platform.OS === "web" && !IS_TOUCH_WEB}
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
                  style={styles.list}
                  data={filtered}
                  keyExtractor={(item) => item.Codigo}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={12}
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
                          <CurrencyBadge code={item.Codigo} active={isActive} size={36} />
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

                        {isActive && (
                          <FontAwesome6 name="check" size={14} color={colors.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    currencies.length === 0 ? (
                      <View style={styles.empty}>
                        <View style={styles.emptyIconWrap}>
                          <FontAwesome6 name="wifi" size={18} color={colors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>No pudimos cargar las monedas</Text>
                        <Text style={styles.emptyText}>
                          Revisá tu conexión y volvé a abrir el selector.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.empty}>
                        <View style={styles.emptyIconWrap}>
                          <FontAwesome6 name="magnifying-glass" size={20} color={colors.textMuted} />
                        </View>
                        <Text style={styles.emptyTitle}>Sin resultados</Text>
                        <Text style={styles.emptyText}>
                          No encontramos ninguna moneda que coincida con tu búsqueda.
                        </Text>
                      </View>
                    )
                  }
                />
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  webViewportBox: {
    position: "absolute",
    left: 0,
    right: 0,
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

  // --- Popup ---
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay || "rgba(10, 22, 48, 0.42)",
  },
  overlayBottom: {
    justifyContent: "flex-end",
  },
  overlayCentered: {
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...(shadows?.floating || {}),
  },
  sheetBottom: {
    width: "100%",
    maxHeight: "80%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: spacing.md,
  },
  sheetCentered: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "75%",
    borderRadius: 24,
    paddingBottom: spacing.sm,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt || "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
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
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    borderRadius: 22,
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
  list: {
    flexGrow: 0,
    flexShrink: 1, // si el popup se achica (teclado abierto), la lista se achica y scrollea
  },
  listContent: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
  },
  itemActive: {
    backgroundColor: (colors.primary || "#1d4ed8") + "0D",
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    marginTop: 1,
    letterSpacing: 0.5,
  },

  // --- Estado vacío ---
  empty: {
    paddingVertical: spacing.xl,
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