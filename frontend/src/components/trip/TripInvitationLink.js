import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import PrimaryButton from "../ui/PrimaryButton";
import { appAlert } from "../ui/AppDialog";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import {
  getTripInvitationLink,
  createTripInvitationLink,
  revokeTripInvitationLink,
} from "../../services/api";

// En web solo se puede compartir si el navegador soporta navigator.share.
const puedeCompartir =
  Platform.OS !== "web" || (typeof navigator !== "undefined" && !!navigator.share);

function formatVencimiento(fecha) {
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function TripInvitationLink({ tripId }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let vigente = true;
    setBusy(true);
    setError("");
    getTripInvitationLink(tripId)
      .then((value) => { if (vigente) setLink(value); })
      .catch((err) => { if (vigente) setError(err.message); })
      .finally(() => { if (vigente) setBusy(false); });
    return () => { vigente = false; };
  }, [tripId, open]);

  async function change(action) {
    setBusy(true);
    setError("");
    try { setLink(await action()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function confirmChange(renew) {
    appAlert(
      renew ? "¿Renovar el enlace?" : "¿Revocar el enlace?",
      "El enlace anterior dejará de funcionar. Las personas que ya se unieron seguirán en el grupo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: renew ? "Renovar" : "Revocar",
          style: renew ? "default" : "destructive",
          onPress: () =>
            change(() =>
              renew ? createTripInvitationLink(tripId, true) : revokeTripInvitationLink(tripId)
            ),
        },
      ]
    );
  }

  async function copy() {
    try {
      await Clipboard.setStringAsync(link.url);
      appAlert("Enlace copiado", "Compartilo con quienes quieras invitar.", undefined, { tipo: "success" });
    } catch {
      setError("No se pudo copiar. Podés seleccionar el enlace y copiarlo manualmente.");
    }
  }

  async function share() {
    if (!puedeCompartir) return copy();
    try {
      await Share.share({ message: `¡Sumate a nuestro viaje! ${link.url}` });
    } catch {
      copy();
    }
  }

  return (
    <View style={styles.box}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        testID="invitation-link-toggle"
      >
        <View style={styles.icon}>
          <FontAwesome6 name="link" size={13} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Invitar con enlace</Text>
          <Text style={styles.subtitle}>Cualquiera con el enlace puede unirse</Text>
        </View>
        <FontAwesome6
          name={open ? "chevron-up" : "chevron-down"}
          size={12}
          color={colors.textSecondary}
        />
      </Pressable>

      {open ? (
        <View style={styles.content}>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
          ) : null}

          {busy ? <ActivityIndicator color={colors.primary} /> : null}

          {link?.activo ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copiar enlace"
                onPress={copy}
                style={({ pressed }) => [styles.urlBox, pressed && { opacity: 0.7 }]}
              >
                <Text selectable numberOfLines={1} style={styles.url}>{link.url}</Text>
                <FontAwesome6 name="copy" size={13} color={colors.primary} />
              </Pressable>

              <Text style={styles.meta}>
                Vence el {formatVencimiento(link.fechaVencimiento)}. Para unirse se necesita una
                cuenta con correo confirmado.
              </Text>

              <PrimaryButton
                label={puedeCompartir ? "Compartir enlace" : "Copiar enlace"}
                icon={puedeCompartir ? "share-nodes" : "copy"}
                iconPosition="left"
                disabled={busy}
                onPress={share}
              />

              <View style={styles.secondaryRow}>
                <Pressable disabled={busy} hitSlop={8} onPress={() => confirmChange(true)}>
                  <Text style={styles.secondaryAction}>Renovar</Text>
                </Pressable>
                <Text style={styles.dot}>·</Text>
                <Pressable disabled={busy} hitSlop={8} onPress={() => confirmChange(false)}>
                  <Text style={[styles.secondaryAction, styles.dangerAction]}>Revocar</Text>
                </Pressable>
              </View>
            </>
          ) : !busy ? (
            <>
              <Text style={styles.meta}>
                Generá un enlace para compartir por WhatsApp o donde quieras. Vence a los 7 días.
              </Text>
              <PrimaryButton
                label="Generar enlace"
                icon="link"
                iconPosition="left"
                onPress={() => change(() => createTripInvitationLink(tripId))}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg || 16,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  headerText: { flex: 1 },
  title: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 14 },
  subtitle: { ...textStyles.meta, color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  content: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  urlBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  url: { ...textStyles.meta, color: colors.textPrimary, flex: 1 },
  meta: { ...textStyles.meta, color: colors.textSecondary, fontSize: 12 },
  error: { ...textStyles.meta, color: colors.danger },
  secondaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  secondaryAction: { ...textStyles.bodyStrong, color: colors.primary, fontSize: 13 },
  dangerAction: { color: colors.danger },
  dot: { color: colors.textMuted },
});