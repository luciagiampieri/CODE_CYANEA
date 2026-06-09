import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import Avatar from "../ui/Avatar";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export default function ParticipantSearch({
  search,
  onSearchChange,
  suggestions,
  onSelectUser,
  canInviteExternal,
  onInviteExternal,
  message
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Buscar participante</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onSearchChange}
        placeholder="Nombre, usuario o email"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={search}
      />

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {search.trim() ? (
        <View style={styles.results}>
          {suggestions.length > 0 ? (
            suggestions.map((user) => (
              <Pressable key={user.id} onPress={() => onSelectUser(user)} style={styles.suggestion}>
                <Avatar imageUrl={user.fotoUrl} name={user.nombreCompleto} />
                <View style={styles.suggestionBody}>
                  <Text style={styles.suggestionTitle}>{user.nombreCompleto}</Text>
                  <Text style={styles.suggestionSubtitle}>
                    @{user.nombreUsuario} · {user.email}
                  </Text>
                </View>
                <FontAwesome6 color={colors.primary} name="plus" size={16} />
              </Pressable>
            ))
          ) : canInviteExternal ? (
            <Pressable onPress={onInviteExternal} style={styles.inviteBox}>
              <View style={styles.inviteCopy}>
                <Text style={styles.inviteTitle}>Invitar por correo</Text>
                <Text style={styles.inviteSubtitle}>
                  No existe una cuenta registrada para ese email.
                </Text>
              </View>
              <FontAwesome6 color={colors.primary} name="paper-plane" size={16} />
            </Pressable>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No hay coincidencias para esa busqueda.</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm
  },
  label: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: typography.small
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary
  },
  results: {
    gap: spacing.sm
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  suggestionBody: {
    flex: 1
  },
  suggestionTitle: {
    color: colors.textPrimary,
    fontWeight: "800"
  },
  suggestionSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: typography.micro
  },
  inviteBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    backgroundColor: "#fff8da",
    borderWidth: 1,
    borderColor: "#f6df74",
    padding: spacing.md
  },
  inviteCopy: {
    flex: 1,
    paddingRight: spacing.sm
  },
  inviteTitle: {
    color: colors.primary,
    fontWeight: "800"
  },
  inviteSubtitle: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: typography.micro
  },
  emptyBox: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  emptyText: {
    color: colors.textSecondary
  },
  error: {
    color: colors.danger,
    fontSize: typography.micro,
    fontWeight: "700"
  }
});
