import { useContext, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import IconCircleButton from "./IconCircleButton";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

/** Bordes del área segura para el ScreenContainer de un buscador (todos menos arriba). */
export const SEARCH_PICKER_EDGES = ["left", "right", "bottom"];

export default function SearchPickerHeader({
  title,
  onBack,
  value,
  onChangeText,
  placeholder,
  loading = false,
  autoFocus = true,
  backLabel = "Volver",
  testID,
}) {
  const [focused, setFocused] = useState(false);
  const insets = useContext(SafeAreaInsetsContext) || { top: 0 };
  const topInset = Math.max(insets.top, Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0);

  return (
    <View style={[styles.header, { paddingTop: topInset + spacing.xs }]} testID={testID}>
      <View style={styles.row}>
        <IconCircleButton
          icon="arrow-left"
          onPress={onBack}
          tone="light"
          size={36}
          iconSize={14}
          accessibilityLabel={backLabel}
        />
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
      </View>

      <View style={[styles.search, focused && styles.searchFocused]}>
        <FontAwesome6 name="magnifying-glass" size={14} color={colors.primary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={Keyboard.dismiss}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : value?.length > 0 ? (
          <Pressable
            onPress={() => onChangeText("")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Borrar búsqueda"
          >
            <FontAwesome6 name="circle-xmark" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    gap: spacing.sm,
  },
  row: {
    minHeight: 36,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  titleWrap: {
    position: "absolute",
    left: 44,
    right: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...textStyles.tripTitle,
    color: colors.textInverse,
    fontSize: 18,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  searchFocused: {
    borderColor: colors.accent || colors.surface,
  },
  input: {
    flex: 1,
    ...textStyles.body,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
});
