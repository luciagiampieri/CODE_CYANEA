import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Modal from "../ui/AppModal";
import { FontAwesome6 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import PrimaryButton from "../ui/PrimaryButton";
import { getCurrentUser, getMyLimits, scanReceipt, updateAiConsent } from "../../services/api";
import { comprimirImagenComprobante, validarImagenComprobante } from "../../utils/receiptImage";
import { esErrorDeLimite, irAPlanes } from "../../utils/limitesPlan";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export const RECEIPT_SCAN_TIMEOUT_MS = 15000;

export const MENSAJE_TIEMPO_AGOTADO =
  "El escaneo tardó demasiado. Podés intentar nuevamente o completar el gasto manualmente.";
export const MENSAJE_SIN_CONEXION =
  "No hay conexión para escanear el comprobante. Podés completar el gasto manualmente.";
export const MENSAJE_SIN_CONSENTIMIENTO =
  "Sin tu consentimiento no podemos escanear el comprobante. Podés completar el gasto manualmente.";
export const MENSAJE_GENERICO =
  "No se pudo escanear el comprobante. Podés intentar nuevamente o completar el gasto manualmente.";
export const MENSAJE_PERMISO_CAMARA =
  "Necesitamos permiso para usar la cámara. Podés habilitarlo en la configuración del dispositivo o elegir una imagen de la galería.";
export const MENSAJE_VIAJE_FINALIZADO =
  "El viaje ya finalizó: no se pueden escanear comprobantes. Podés cargar el gasto manualmente.";
export const MENSAJE_SIN_ESCANEOS =
  "Usaste todos los escaneos de esta semana. Se renuevan el lunes. Podés completar el gasto manualmente.";

class TiempoAgotadoError extends Error {}
class PermisoError extends Error {}

function conTiempoMaximo(promesa, ms) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TiempoAgotadoError("timeout")), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

function esErrorDeRed(error) {
  if (error?.status) return false;
  const mensaje = String(error?.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    mensaje.includes("network request failed") ||
    mensaje.includes("failed to fetch") ||
    mensaje.includes("network error")
  );
}

export function mensajeParaError(error) {
  if (error instanceof TiempoAgotadoError) return MENSAJE_TIEMPO_AGOTADO;
  if (error?.code === "TRIP_FINISHED") return MENSAJE_VIAJE_FINALIZADO;
  if (error?.status && error?.message) return error.message;
  if (esErrorDeRed(error)) return MENSAJE_SIN_CONEXION;
  return MENSAJE_GENERICO;
}

function escaneosRestantes(escaneos) {
  if (!escaneos || escaneos.ilimitado || escaneos.limite == null) return null;
  return Math.max(escaneos.limite - escaneos.usoActual, 0);
}

export default function ReceiptScanButton({
  tripId,
  onScanned,
  disabled = false,
  timeoutMs = RECEIPT_SCAN_TIMEOUT_MS,
  onVerPlanes,
}) {
  const [origenVisible, setOrigenVisible] = useState(false);
  const [origenPendiente, setOrigenPendiente] = useState(null); 
  const [guardandoConsentimiento, setGuardandoConsentimiento] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState(null);
  const [errorDeLimite, setErrorDeLimite] = useState(false);
  const [escaneos, setEscaneos] = useState(null);

  const consentimientoRef = useRef(null);
  const montadoRef = useRef(true);

  const restantes = escaneosRestantes(escaneos);
  const sinEscaneos = restantes === 0;
  const deshabilitado = disabled || escaneando || sinEscaneos;

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const cargarLimites = useCallback(async () => {
    try {
      const limites = await getMyLimits();
      if (montadoRef.current) setEscaneos(limites?.escaneosSemanales ?? null);
    } catch {
      if (montadoRef.current) setEscaneos(null);
    }
  }, []);

  useEffect(() => {
    if (!disabled) cargarLimites();
  }, [disabled, cargarLimites]);

  useEffect(() => {
    if (!escaneando) return undefined;
    setSegundos(0);
    const intervalo = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, [escaneando]);

  function mostrarError(mensaje, { porLimite = false } = {}) {
    if (!montadoRef.current) return;
    setError(mensaje);
    setErrorDeLimite(porLimite);
  }

  function verPlanes() {
    if (onVerPlanes) {
      onVerPlanes();
      return;
    }
    irAPlanes();
  }

  async function tieneConsentimiento() {
    if (consentimientoRef.current === true) return true;
    const usuario = await getCurrentUser();
    consentimientoRef.current = Boolean(usuario?.consienteProcesamientoIA);
    return consentimientoRef.current;
  }

  async function obtenerImagen(origen) {
    const opciones = {
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
      preferredAssetRepresentationMode: "compatible",
    };
    if (origen === "camara") {
      if (Platform.OS !== "web") {
        const permiso = await ImagePicker.requestCameraPermissionsAsync();
        if (!permiso?.granted) throw new PermisoError(MENSAJE_PERMISO_CAMARA);
      }
      return ImagePicker.launchCameraAsync(opciones);
    }
    return ImagePicker.launchImageLibraryAsync(opciones);
  }

  async function capturarYEscanear(origen) {
    let seleccion;
    try {
      seleccion = await obtenerImagen(origen);
    } catch (e) {
      mostrarError(e instanceof PermisoError ? e.message : MENSAJE_GENERICO);
      return;
    }
    if (!seleccion || seleccion.canceled) return;

    const asset = seleccion.assets?.[0];
    const validacion = validarImagenComprobante(asset);
    if (!validacion.ok) {
      mostrarError(validacion.message);
      return;
    }

    setEscaneando(true);
    try {
      const imagen = await comprimirImagenComprobante(asset);
      const datos = await conTiempoMaximo(scanReceipt(tripId, imagen), timeoutMs);
      if (montadoRef.current) onScanned?.(datos, imagen);
      cargarLimites();
    } catch (e) {
      if (e?.code === "AI_CONSENT_REQUIRED") {
        consentimientoRef.current = false;
        if (montadoRef.current) setOrigenPendiente(origen);
      } else if (esErrorDeLimite(e)) {
        mostrarError(e.message, { porLimite: true });
        cargarLimites();
      } else {
        mostrarError(mensajeParaError(e));
      }
    } finally {
      if (montadoRef.current) setEscaneando(false);
    }
  }

  async function elegirOrigen(origen) {
    setOrigenVisible(false);
    setError(null);
    setErrorDeLimite(false);
    try {
      if (!(await tieneConsentimiento())) {
        setOrigenPendiente(origen);
        return;
      }
    } catch (e) {
      mostrarError(mensajeParaError(e));
      return;
    }
    await capturarYEscanear(origen);
  }

  async function aceptarConsentimiento() {
    const origen = origenPendiente;
    setGuardandoConsentimiento(true);
    try {
      await updateAiConsent(true);
      consentimientoRef.current = true;
    } catch (e) {
      setOrigenPendiente(null);
      mostrarError(mensajeParaError(e));
      return;
    } finally {
      if (montadoRef.current) setGuardandoConsentimiento(false);
    }
    setOrigenPendiente(null);
    await capturarYEscanear(origen);
  }

  function rechazarConsentimiento() {
    setOrigenPendiente(null);
    setError(MENSAJE_SIN_CONSENTIMIENTO);
    setErrorDeLimite(false);
  }

  function abrirOrigen() {
    setError(null);
    setErrorDeLimite(false);
    setOrigenVisible(true);
  }

  const subtitulo =
    restantes == null
      ? "Completá el gasto con una foto del ticket"
      : sinEscaneos
        ? "No te quedan escaneos esta semana"
        : `Te ${restantes === 1 ? "queda 1 escaneo" : `quedan ${restantes} escaneos`} esta semana`;

  return (
    <View>
      <Pressable
        testID="receipt-scan-button"
        accessibilityRole="button"
        disabled={deshabilitado}
        onPress={abrirOrigen}
        style={({ pressed }) => [
          styles.scanCard,
          deshabilitado && styles.scanCardDisabled,
          pressed && styles.scanCardPressed,
        ]}
      >
        <View style={styles.scanIconWrap}>
          <FontAwesome6 name="camera" size={16} color={colors.primary} />
        </View>
        <View style={styles.scanTexts}>
          <Text style={styles.scanTitle}>Escanear comprobante</Text>
          <Text style={styles.scanSubtitle}>{subtitulo}</Text>
        </View>
        <FontAwesome6 name="wand-magic-sparkles" size={14} color={colors.primarySoft} />
      </Pressable>

      {sinEscaneos && !error && !disabled ? (
        <View style={styles.errorBanner} testID="receipt-scan-sin-escaneos">
          <View style={styles.errorRow}>
            <FontAwesome6 name="crown" size={13} color={colors.warning} />
            <Text style={styles.errorText}>{MENSAJE_SIN_ESCANEOS}</Text>
          </View>
          <View style={styles.errorActions}>
            <Pressable onPress={verPlanes} hitSlop={8} testID="receipt-scan-ver-planes">
              <Text style={styles.errorAction}>Ver planes</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner} testID="receipt-scan-error">
          <View style={styles.errorRow}>
            <FontAwesome6 name="triangle-exclamation" size={14} color={colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
          <View style={styles.errorActions}>
            {errorDeLimite ? (
              <Pressable onPress={verPlanes} hitSlop={8} testID="receipt-scan-error-ver-planes">
                <Text style={styles.errorActionSecondary}>Ver planes</Text>
              </Pressable>
            ) : (
              <Pressable onPress={abrirOrigen} hitSlop={8}>
                <Text style={styles.errorActionSecondary}>Reintentar</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setError(null);
                setErrorDeLimite(false);
              }}
              hitSlop={8}
            >
              <Text style={styles.errorAction}>Completar manualmente</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Origen de la imagen (AC2) */}
      <Modal transparent animationType="fade" visible={origenVisible} onRequestClose={() => setOrigenVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setOrigenVisible(false)}>
          <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.dialogTitle}>Escanear comprobante</Text>
            <Pressable style={styles.option} onPress={() => elegirOrigen("camara")}>
              <FontAwesome6 name="camera" size={16} color={colors.primary} style={styles.optionIcon} />
              <Text style={styles.optionText}>Tomar foto</Text>
            </Pressable>
            <Pressable style={styles.option} onPress={() => elegirOrigen("galeria")}>
              <FontAwesome6 name="images" size={16} color={colors.primary} style={styles.optionIcon} />
              <Text style={styles.optionText}>Elegir de la galería</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setOrigenVisible(false)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Consentimiento la primera vez (AC5, RNF-13, RNF-33) */}
      <Modal transparent animationType="fade" visible={Boolean(origenPendiente)} onRequestClose={rechazarConsentimiento}>
        <View style={styles.overlay}>
          <View style={styles.dialog} testID="receipt-consent-dialog">
            <View style={styles.consentIconWrap}>
              <FontAwesome6 name="shield-halved" size={18} color={colors.primary} />
            </View>
            <Text style={styles.dialogTitle}>Procesamiento con inteligencia artificial</Text>
            <Text style={styles.consentText}>
              Para leer el comprobante, la imagen se envía a un servicio externo de inteligencia
              artificial (actualmente Google Gemini).
            </Text>
            <Text style={styles.consentText}>
              Solo se envía la foto del ticket: no se comparten tus datos ni los de los demás
              participantes. Tené en cuenta que el ticket puede mostrar datos del comercio o de tu
              medio de pago.
            </Text>
            <Text style={styles.consentText}>
              El gasto no se registra hasta que revises los datos y lo confirmes.
            </Text>
            <PrimaryButton
              label="Aceptar y continuar"
              onPress={aceptarConsentimiento}
              loading={guardandoConsentimiento}
              style={styles.consentButton}
            />
            <Pressable style={styles.cancel} onPress={rechazarConsentimiento} disabled={guardandoConsentimiento}>
              <Text style={styles.cancelText}>Ahora no</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Indicador de progreso (AC15) */}
      <Modal transparent animationType="fade" visible={escaneando} onRequestClose={() => {}}>
        <View style={styles.overlay}>
          <View style={styles.progressBox} testID="receipt-scan-progress">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.progressTitle}>Leyendo el comprobante…</Text>
            <Text style={styles.progressSubtitle}>Esto puede tardar unos segundos ({segundos} s)</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primarySoft,
    borderRadius: radii.md,
    backgroundColor: "#f4f7fd",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  scanCardPressed: {
    opacity: 0.85,
  },
  scanCardDisabled: {
    opacity: 0.5,
  },
  scanIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  scanTexts: {
    flex: 1,
  },
  scanTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  scanSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  errorBanner: {
    marginTop: spacing.xs,
    backgroundColor: colors.warningSurface,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  errorRow: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  errorText: {
    ...textStyles.meta,
    color: colors.textPrimary,
    flex: 1,
  },
  errorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  errorAction: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  errorActionSecondary: {
    ...textStyles.meta,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  dialogTitle: {
    ...textStyles.tripTitle,
    color: colors.primary,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    width: 28,
  },
  optionText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  cancel: {
    alignItems: "center",
    paddingTop: spacing.md,
  },
  cancelText: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  consentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  consentText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  consentButton: {
    marginTop: spacing.sm,
  },
  progressBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  progressTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  progressSubtitle: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
});