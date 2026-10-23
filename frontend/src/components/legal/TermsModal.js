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
import { backofficeColors as b } from "../../theme/backofficeTokens";


export default function TermsModal({ visible, onClose, previewTerms = null, backoffice = false }) {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const shownTerms = previewTerms || terms;

  useEffect(() => {
    let activo = true;

    async function cargar() {
      if (!visible || terms || previewTerms) return;
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
  }, [terms, visible, previewTerms]);


  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={[styles.backdrop, backoffice && stylesBO.backdrop]}>
        <View style={[styles.sheet, backoffice && stylesBO.sheet]} testID="terms-modal">
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, backoffice && stylesBO.title]}>
                {shownTerms?.titulo || "Terminos y Condiciones"}
              </Text>
              {shownTerms?.version ? (
                <Text style={[styles.version, backoffice && stylesBO.version]}>
                  Version {shownTerms.version}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={onClose}
              style={[styles.closeButton, backoffice && stylesBO.closeButton]}
              testID="terms-modal-close"
            >
              <FontAwesome6 color={backoffice ? b.acento : colors.primary} name="xmark" size={18} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={backoffice ? b.acento : colors.primary} />
            </View>
          ) : error ? (
            <View style={[styles.errorBox, backoffice && stylesBO.errorBox]}>
              <FontAwesome6 color={backoffice ? b.peligro : colors.danger} name="circle-exclamation" size={14} />
              <Text style={[styles.errorText, backoffice && stylesBO.errorText]}>{error}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {(shownTerms?.contenido || []).map((paragraph, index) => {
                const [heading, ...bodyParts] = paragraph.split("\n");
                const hasHeading = /^\d+\.\s/.test(heading);
                return (
                  <View key={`${index}-${paragraph}`} style={styles.section}>
                    {hasHeading ? (
                      <Text style={[styles.sectionTitle, backoffice && stylesBO.sectionTitle]}>{heading}</Text>
                    ) : null}
                    <Text style={[styles.paragraph, backoffice && stylesBO.paragraph]}>
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


const stylesBO = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  sheet: {
    backgroundColor: b.panel,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: b.bordeFuerte,
  },
  title: {
    color: b.texto,
  },
  version: {
    color: b.textoSecundario,
  },
  closeButton: {
    backgroundColor: b.superficieElevada,
    borderColor: b.bordeFuerte,
  },
  sectionTitle: {
    color: b.acento,
  },
  paragraph: {
    color: b.textoSecundario,
  },
  errorBox: {
    backgroundColor: b.peligroSuave,
    borderWidth: 1,
    borderColor: b.peligro,
  },
  errorText: {
    color: b.peligro,
  },
});