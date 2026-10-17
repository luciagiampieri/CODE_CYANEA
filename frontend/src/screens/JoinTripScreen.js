import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import RecoveryLayout from "../components/ui/RecoveryLayout";
import PrimaryButton from "../components/ui/PrimaryButton";
import { appAlert } from "../components/ui/AppDialog";
import { previewSharedInvitation, joinTripByLink, getTripDetail } from "../services/api";
import { colors, spacing, textStyles } from "../theme/tokens";

export default function JoinTripScreen({ route, navigation }) {
  const { token, user, pendingInvitation, rememberInvitation } = useAuth();
  const invitationToken = route?.params?.invitationToken || pendingInvitation;
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(null);
  const [success, setSuccess] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const joining = useRef(false);
  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError("");
    setPreview(null);
    if (!invitationToken) {
      setError("No encontramos un enlace de invitación. Pedí uno al organizador.");
      setLoading(false);
      return undefined;
    }
    if (!token) {
      rememberInvitation(invitationToken)
        .then(() => { if (vigente) navigation.replace("Login"); })
        .catch(() => {
          if (vigente) {
            setError("No se pudo conservar la invitación. Volvé a abrir el enlace después de iniciar sesión.");
            setLoading(false);
          }
        });
      return () => { vigente = false; };
    }
    rememberInvitation(invitationToken).catch(() => {
      if (vigente) setError("No se pudo conservar la invitación. Volvé a abrir el enlace después de iniciar sesión.");
    });
    previewSharedInvitation(invitationToken)
      .then((value) => { if (vigente) setPreview(value); })
      .catch((err) => { if (vigente) setError(err.message); })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [invitationToken, token, rememberInvitation]);

  async function openTrip(idViaje) {
    try {
      const trip = await getTripDetail(idViaje);
      navigation.replace("TripDetail", { trip, initialTab: "grupo" });
    } catch { setError("Ya formás parte del viaje, pero no pudimos abrirlo. Volvé a intentar."); }
  }

  function confirmJoin() {
    if (joining.current) return;
    joining.current = true;
    appAlert("¿Unirte al viaje?", `Vas a incorporarte a ${preview.titulo} como participante.`, [
      { text: "Cancelar", style: "cancel", onPress: () => { joining.current = false; } },
      { text: "Unirme al viaje", onPress: join },
    ], { cancelable: true, onDismiss: () => { joining.current = false; } });
  }

  async function join() {
    setBusy(true);
    setError("");
    try {
      const result = await joinTripByLink(invitationToken);
      setJoined(result.idViaje);
      setSuccess(result.message);
      await rememberInvitation(null).catch(() => {});
      appAlert("¡Te uniste al viaje!", result.message,
        [{ text: "Abrir viaje", onPress: () => openTrip(result.idViaje) }],
        { tipo: "success", cancelable: false });
    } catch (err) {
      setError(err.message);
      setNeedsConfirmation(err.code === "EMAIL_CONFIRMATION_REQUIRED");
      setBlocked(["ALREADY_TRIP_PARTICIPANT", "INVITATION_MEMBERSHIP_BLOCKED"].includes(err.code));
    } finally { joining.current = false; setBusy(false); }
  }

  async function authenticate(screen) {
    try { await rememberInvitation(invitationToken); navigation.navigate(screen); }
    catch { setError("No se pudo conservar la invitación. Intentá nuevamente."); }
  }

  async function cancel() {
    try { await rememberInvitation(null); navigation.navigate(token ? "Tabs" : "Login"); }
    catch { setError("No se pudo cerrar la invitación. Intentá nuevamente."); }
  }

  return <RecoveryLayout title="Te invitaron a un viaje" onBack={busy ? undefined : cancel} backLabel="Ahora no">
    <View style={styles.content}>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {preview ? <>
        <Text style={styles.title}>{preview.titulo}</Text>
        <Text style={styles.text}>Administrador: @{preview.administrador}</Text>
        <Text style={styles.text}>{preview.destinos.join(" · ")}</Text>
        <Text style={styles.text}>{preview.fechaInicio} al {preview.fechaFin}</Text>
      </> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {success ? <Text accessibilityLiveRegion="polite" style={styles.success}>{success}</Text> : null}
      {!loading && preview && !joined ? token ? <>
        <Text style={styles.text}>Te unirás con tu cuenta{user?.email ? ` ${user.email}` : ""}.</Text>
        <PrimaryButton label="Unirme al viaje" loading={busy} disabled={blocked} onPress={confirmJoin} />
        {needsConfirmation ? <PrimaryButton variant="secondary" label="Reenviar confirmación de correo"
          onPress={() => navigation.navigate("ResendConfirmation", { email: user?.email || "" })} /> : null}
      </> : <>
        <Text style={styles.text}>Iniciá sesión o creá una cuenta para unirte. Vamos a conservar esta invitación.</Text>
        <PrimaryButton label="Iniciar sesión" onPress={() => authenticate("Login")} />
        <PrimaryButton label="Crear cuenta" variant="secondary" onPress={() => authenticate("Register")} />
      </> : null}
      {joined ? <PrimaryButton label="Abrir viaje" loading={busy} onPress={() => openTrip(joined)} /> : null}
    </View>
  </RecoveryLayout>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md }, title: { ...textStyles.bodyStrong, fontSize: 22, color: colors.primary },
  text: { ...textStyles.body, color: colors.textSecondary }, error: { ...textStyles.body, color: colors.danger },
  success: { ...textStyles.bodyStrong, color: colors.success },
});
