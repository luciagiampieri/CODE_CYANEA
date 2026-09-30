import { FontAwesome6 } from "@expo/vector-icons";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, fontFamilies, radii, spacing, textStyles } from "../../theme/tokens";

import CyaneaLogo from "../../../assets/cyanea_logo_manteca.png";

export default function RecoveryLayout({ title, subtitle, onBack, backLabel, children }) {
  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.topPanel}>
            <View style={styles.brandRow}>
              <Image resizeMode="contain" source={CyaneaLogo} style={styles.logoImage} />
              <Text style={styles.brandName}>Cyanea</Text>
            </View>
            <Text style={styles.brandClaim}>MUCHAS MANOS, UN ÚNICO DESTINO</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.form}>{children}</View>

            {onBack ? (
              <Pressable onPress={onBack} style={styles.backLink}>
                <FontAwesome6 color={colors.primary} name="arrow-left" size={12} />
                <Text style={styles.backText}>{backLabel || "Volver al inicio de sesión"}</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function RecoveryField({ label, icon, rightIcon, secureTextEntry, onPressRightIcon, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <FontAwesome6 color={colors.textMuted} name={icon} size={14} style={styles.inputIcon} />
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          style={styles.input}
          {...props}
        />
        {rightIcon ? (
          <Pressable 
            onPress={onPressRightIcon} 
            style={({ pressed }) => [
              styles.trailingIcon,
              { opacity: pressed ? 0.4 : 1 }
            ]}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <FontAwesome6 color={colors.textMuted} name={rightIcon} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.backgroundCanvas },
  scrollContent: { flexGrow: 1, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  topPanel: {
    backgroundColor: colors.primarySoft,
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
    paddingBottom: 40,
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoImage: { width: 45, height: 45 },
  brandName: {
    ...textStyles.brandTitle,
    color: colors.accent,
    fontSize: 36,
    fontWeight: "bold",
  },
  brandClaim: {
    ...textStyles.sectionLabel,
    color: "#9fb0d8",
    marginTop: spacing.sm,
    marginBottom: 10,
    fontSize: 12,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: -radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 22 },
  subtitle: { ...textStyles.body, color: colors.textSecondary, marginTop: spacing.sm },
  form: { marginTop: spacing.xl },
  field: { marginBottom: spacing.lg },
  fieldLabel: { ...textStyles.label, color: colors.primary, marginBottom: spacing.xs },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    minHeight: 52,
    color: colors.textPrimary,
    fontSize: 16,
  },
  trailingIcon: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  backText: { ...textStyles.body, color: colors.primary, fontWeight: "700" },
});


export const recoveryStyles = StyleSheet.create({
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...textStyles.meta, color: colors.danger, flex: 1 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoText: { ...textStyles.meta, color: colors.primary, flex: 1 },
  primaryButton: {
    minHeight: 54,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: spacing.sm,
  },
  primaryButtonText: { ...textStyles.button, color: colors.textInverse },
  buttonPressed: { transform: [{ scale: 0.985 }] },
  buttonDisabled: { opacity: 0.7 },
  rulesBox: { marginBottom: spacing.lg, gap: spacing.xs },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ruleText: { ...textStyles.meta },
});