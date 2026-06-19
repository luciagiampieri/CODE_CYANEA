import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function ParticipantSearch({
  search,
  onSearchChange,
  suggestions,
  onSelectUser,
  canInviteExternal,
  onInviteExternal,
  message,
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Participantes</Text>
      <View style={styles.inputShell}>
        <FontAwesome6 color={colors.textMuted} name="magnifying-glass" size={14} style={styles.leadingIcon} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onSearchChange}
          placeholder="Busca por nombre o correo"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={search}
        />
      </View>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {search.trim() ? (
        <View style={styles.results}>
          {suggestions.length > 0 ? (
            suggestions.map((user) => (
              <Pressable key={user.id} onPress={() => onSelectUser(user)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                <Avatar imageUrl={user.fotoUrl} name={user.nombreCompleto} size={42} />
                <View style={styles.suggestionBody}>
                  <Text style={styles.suggestionTitle}>{user.nombreCompleto}</Text>
                  <Text numberOfLines={1} style={styles.suggestionSubtitle}>
                    @{user.nombreUsuario} · {user.email}
                  </Text>
                </View>
                <View style={styles.addBadge}>
                  <FontAwesome6 color={colors.primary} name="plus" size={12} />
                </View>
              </Pressable>
            ))
          ) : canInviteExternal ? (
            <Pressable onPress={onInviteExternal} style={({ pressed }) => [styles.inviteBox, pressed && styles.pressed]}>
              <View style={styles.inviteCopy}>
                <Text style={styles.inviteTitle}>Invitar por correo</Text>
                <Text style={styles.inviteSubtitle}>Se sumará como invitación pendiente.</Text>
              </View>
              <View style={styles.addBadgeAccent}>
                <FontAwesome6 color={colors.primary} name="paper-plane" size={12} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No hay coincidencias para esa búsqueda.</Text>
            </View>
          )}
        </View>
      ) : null}
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
    color: colors.textPrimary,
    minHeight: 52,
    ...textStyles.body,
  },
  results: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  suggestionBody: {
    flex: 1,
  },
  suggestionTitle: {
    ...textStyles.bodyStrong,
    color: colors.textPrimary,
  },
  suggestionSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  addBadgeAccent: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  inviteBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: "#f0dd9c",
    padding: spacing.md,
  },
  inviteCopy: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  inviteTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  inviteSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  emptyBox: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  emptyText: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
