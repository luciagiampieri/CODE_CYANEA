import { FontAwesome6 } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Modal from "../ui/AppModal";

import { getTerms } from "../../services/api";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function TermsModal({ visible, onClose }) {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      if (!visible || terms) return;
      setLoading(true);
      setError(null);

      try {
        const data = await getTerms();
        if (activo) setTerms(data);
      } catch (err) {
        if (activo) {
          setError(err.message || "No se pudieron cargar los terminos y condiciones.");
        }
      } finally {
        if (activo) setLoading(false);
      }
    }

    cargar();

    return () => {
      activo = false;
    };
  }, [terms, visible]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="terms-modal">
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{terms?.titulo || "Terminos y Condiciones"}</Text>
              {terms?.version ? (
                <Text style={styles.version}>Version {terms.version}</Text>
              ) : null}
            </View>

            <Pressable onPress={onClose} style={styles.closeButton} testID="terms-modal-close">
              <FontAwesome6 color={colors.primary} name="xmark" size={18} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {(terms?.contenido || []).map((paragraph, index) => {
                const [heading, ...bodyParts] = paragraph.split("\n");
                const hasHeading = /^\d+\.\s/.test(heading);
                return (
                  <View key={`${index}-${paragraph}`} style={styles.section}>
                    {hasHeading ? <Text style={styles.sectionTitle}>{heading}</Text> : null}
                    <Text style={styles.paragraph}>
                      {hasHeading ? bodyParts.join("\n") : paragraph}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    ...textStyles.subtitle,
    color: colors.primary,
  },
  version: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  centerState: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  paragraph: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  errorBox: {
    alignItems: "center",
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    flex: 1,
  },
});
