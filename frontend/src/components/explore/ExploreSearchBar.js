import { FontAwesome6 } from "@expo/vector-icons";
import { forwardRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";
import PlaceListItem from "./PlaceListItem";

const ExploreSearchBar = forwardRef(function ExploreSearchBar(
  { value, onChangeText, onFocus, onBack, onClear, loading = false, focused = false, placeholder },
  ref
) {
  return (
    <View style={[styles.bar, focused && styles.barFocused]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={focused ? "Cerrar búsqueda" : "Volver"}
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <FontAwesome6 color={colors.primary} name="arrow-left" size={16} />
      </Pressable>

      <TextInput
        ref={ref}
        accessibilityLabel="Buscar lugares"
        autoCorrect={false}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        style={styles.input}
        value={value}
      />

      <View style={styles.trailing}>
        {loading ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
            hitSlop={8}
            onPress={onClear}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <FontAwesome6 color={colors.textSecondary} name="xmark" size={12} />
          </Pressable>
        ) : (
          <FontAwesome6 color={colors.textMuted} name="magnifying-glass" size={15} />
        )}
      </View>
    </View>
  );
});

export default ExploreSearchBar;

export function SearchResultsPanel({ query, results, error, onSelect, style }) {
  const trimmed = query.trim();

  return (
    <View style={[styles.panel, style]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
        {trimmed.length < 2 ? (
          <View style={styles.hint}>
            <FontAwesome6 color={colors.primarySoft} name="map-location-dot" size={22} />
            <Text style={styles.hintTitle}>¿Qué querés conocer?</Text>
            <Text style={styles.hintCopy}>
              Escribí el nombre de un lugar, un tipo de sitio (museo, playa, mirador) o una dirección.
            </Text>
          </View>
        ) : null}

        {trimmed.length >= 2 && error ? <Text style={styles.error}>{error}</Text> : null}

        {trimmed.length >= 2 && results.length > 0
          ? results.map((item) => (
              <PlaceListItem
                key={`${item.placeId}-${item.name}`}
                icon="magnifying-glass-location"
                onPress={onSelect}
                place={item}
                detail={item.address}
                badge={item.alreadySaved ? { label: "Guardado" } : null}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 52,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.floating,
  },
  barFocused: {
    borderColor: colors.primarySoft,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    ...textStyles.body,
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
    ...Platform.select({ web: { outlineStyle: "none" }, default: {} }),
  },
  trailing: {
    width: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.6,
  },
  panel: {
    backgroundColor: colors.surface,
  },
  panelContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  hint: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.xs,
  },
  hintTitle: {
    ...textStyles.tripTitle,
    fontSize: 20,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  hintCopy: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  error: {
    ...textStyles.meta,
    color: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
});
