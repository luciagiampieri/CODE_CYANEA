import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import PrimaryButton from "../ui/PrimaryButton";
import { appAlert } from "../ui/AppDialog";
import { colors, spacing, textStyles } from "../../theme/tokens";
import { getTripInvitationLink, createTripInvitationLink, revokeTripInvitationLink } from "../../services/api";

export default function TripInvitationLink({ tripId }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    let vigente = true;
    setBusy(true);
    getTripInvitationLink(tripId).then((value) => { if (vigente) setLink(value); })
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
    appAlert(renew ? "¿Renovar el enlace?" : "¿Revocar el enlace?",
      "El enlace anterior dejará de funcionar. Las personas que ya se unieron seguirán en el grupo.", [
        { text: "Cancelar", style: "cancel" },
        { text: renew ? "Renovar" : "Revocar", style: renew ? "default" : "destructive",
          onPress: () => change(() => renew ? createTripInvitationLink(tripId, true) : revokeTripInvitationLink(tripId)) },
      ]);
  }

  async function copy() {
    try {
      await Clipboard.setStringAsync(link.url);
      appAlert("Enlace copiado", "Compartilo con quienes quieras invitar.", undefined, { tipo: "success" });
    } catch { setError("No se pudo copiar. Podés seleccionar el enlace y copiarlo manualmente."); }
  }

  return <View style={styles.box}>
    <PrimaryButton label={open ? "Cerrar enlace de invitación" : "Invitar con enlace"}
      variant="secondary" icon="link" onPress={() => setOpen(!open)} testID="invitation-link-toggle" />
    {open ? <View style={styles.content}>
      <Text style={styles.text}>Cualquier persona con este enlace y una cuenta con correo confirmado podrá unirse al viaje. El enlace vence a los 7 días.</Text>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {link?.activo ? <>
        <Text selectable style={styles.text}>{link.url}</Text>
        <Text style={styles.text}>Válido hasta {new Date(link.fechaVencimiento).toLocaleString("es-AR")}</Text>
        <PrimaryButton label="Copiar enlace" disabled={busy} onPress={copy} />
        <PrimaryButton label="Renovar enlace" variant="secondary" disabled={busy} onPress={() => confirmChange(true)} />
        <PrimaryButton label="Revocar enlace" variant="secondary" disabled={busy} onPress={() => confirmChange(false)} />
      </> : <PrimaryButton label="Generar enlace" disabled={busy} onPress={() => change(() => createTripInvitationLink(tripId))} />}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  box: { marginVertical: spacing.md }, content: { gap: spacing.sm, marginTop: spacing.sm },
  text: { ...textStyles.meta, color: colors.textSecondary }, error: { ...textStyles.meta, color: colors.danger },
});
