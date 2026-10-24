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
import { useAuth } from "../../context/AuthContext";
import { getTerms } from "../../services/api";
import { acceptTerms, getTermsAcceptance } from "../../services/termsAcceptanceApi";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";


export default function TermsAcceptanceGate({ children }) {
  const { token, logout } = useAuth();
  const [chequeo, setChequeo] = useState({ token: null, estado: "verificando" });
  const [terms, setTerms] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorAceptar, setErrorAceptar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!token) {
      setChequeo({ token: null, estado: "verificando" });
      return undefined;
    }

    let vigente = true;
    setTerms(null);
    setErrorCarga(null);
    setErrorAceptar(null);

    (async () => {
      let requiere = false;
      try {
        const estado = await getTermsAcceptance();
        requiere = Boolean(estado?.requiereAceptacion);
      } catch {
        requiere = false;
      }
      if (!vigente) return;

      if (!requiere) {
        setChequeo({ token, estado: "ok" });
        return;
      }

      setChequeo({ token, estado: "pendiente" });
      try {
        const data = await getTerms();
        if (vigente) setTerms(data);
      } catch (err) {
        if (vigente) {
          setErrorCarga(err?.message || "No se pudieron cargar los términos y condiciones.");
        }
      }
    })();

    return () => {
      vigente = false;
    };
  }, [token, intento]);

  async function aceptar() {
    setEnviando(true);
    setErrorAceptar(null);
    try {
      await acceptTerms();
      setChequeo({ token, estado: "ok" });
    } catch (err) {
      setErrorAceptar(err?.message || "No se pudo registrar tu aceptación.");
    } finally {
      setEnviando(false);
    }
  }

  async function rechazar() {
    await logout();
  }

  if (!token) return children;

  const estado = chequeo.token === token ? chequeo.estado : "verificando";

  if (estado === "ok") return children;

  if (estado === "verificando") {
    return (
      <View style={styles.fondo} testID="terms-gate-verificando">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.fondo}>
      <Modal animationType="fade" onRequestClose={() => {}} transparent visible>
        <View style={styles.backdrop}>
          <View style={styles.card} testID="terms-gate-modal">
            <View style={styles.header}>
              <View style={styles.icono}>
                <FontAwesome6 color={colors.primary} name="file-contract" size={18} />
              </View>
              <View style={styles.titulos}>
                <Text style={styles.aviso}>Actualizamos los Términos y Condiciones</Text>
                <Text style={styles.title}>{terms?.titulo || "Términos y Condiciones"}</Text>
                {terms?.version ? <Text style={styles.version}>Versión {terms.version}</Text> : null}
              </View>
            </View>

            <Text style={styles.bajada}>
              Para seguir usando Cyanea tenés que aceptar la versión vigente. Si no la aceptás, se
              cerrará tu sesión.
            </Text>

            {errorCarga ? (
              <View style={styles.errorBox}>
                <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
                <Text style={styles.errorText}>{errorCarga}</Text>
                <Pressable
                  onPress={() => setIntento((n) => n + 1)}
                  style={styles.botonReintentar}
                  testID="terms-gate-retry"
                >
                  <Text style={styles.textoReintentar}>Reintentar</Text>
                </Pressable>
              </View>
            ) : !terms ? (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
                {(terms.contenido || []).map((paragraph, index) => {
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

            {errorAceptar ? (
              <View style={styles.errorBox}>
                <FontAwesome6 color={colors.danger} name="circle-exclamation" size={14} />
                <Text style={styles.errorText}>{errorAceptar}</Text>
              </View>
            ) : null}

            <View style={styles.acciones}>
              <Pressable
                disabled={enviando}
                onPress={rechazar}
                style={({ pressed }) => [
                  styles.boton,
                  styles.botonSecundario,
                  pressed && styles.pressed,
                  enviando && styles.deshabilitado,
                ]}
                testID="terms-gate-reject"
              >
                <Text style={styles.textoSecundario}>Rechazar</Text>
              </Pressable>
              <Pressable
                disabled={enviando || !terms}
                onPress={aceptar}
                style={({ pressed }) => [
                  styles.boton,
                  styles.botonPrimario,
                  pressed && styles.pressed,
                  (enviando || !terms) && styles.deshabilitado,
                ]}
                testID="terms-gate-accept"
              >
                {enviando ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.textoPrimario}>Aceptar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  icono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titulos: {
    flex: 1,
  },
  aviso: {
    ...textStyles.meta,
    color: colors.textSecondary,
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
  bajada: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginVertical: spacing.md,
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: spacing.md,
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
  centro: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSurface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: {
    ...textStyles.meta,
    color: colors.danger,
    flex: 1,
  },
  botonReintentar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  textoReintentar: {
    ...textStyles.meta,
    color: colors.danger,
  },
  acciones: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  boton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  botonPrimario: {
    backgroundColor: colors.primary,
  },
  botonSecundario: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textoPrimario: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  textoSecundario: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  deshabilitado: {
    opacity: 0.6,
  },
});