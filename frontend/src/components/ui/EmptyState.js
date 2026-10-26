import { StyleSheet, Text, View } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import PrimaryButton from "./PrimaryButton";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function EmptyState({ icon, title, body, actionLabel, onAction, testID, children }) {
  return (
    <View style={styles.box} testID={testID}>
      {icon ? (
        <View style={styles.icon}>
          <FontAwesome6 name={icon} size={22} color={colors.primary} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
      {actionLabel ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
    marginBottom: spacing.xxs,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    textAlign: "center",
  },
  body: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
  action: {
    marginTop: spacing.xs,
    alignSelf: "stretch",
  },
});