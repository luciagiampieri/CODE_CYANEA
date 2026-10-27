import { useEffect, useRef, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";
import { backofficeColors as b } from "../../theme/backofficeTokens";

const TIPOS = {
  success: { icon: "circle-check", color: colors.success, fondo: colors.successSurface },
  error: { icon: "circle-exclamation", color: colors.danger, fondo: colors.dangerSurface },
  warning: { icon: "triangle-exclamation", color: colors.warning, fondo: colors.warningSurface },
  confirm: { icon: "circle-question", color: colors.primary, fondo: colors.surfaceAlt },
  info: { icon: "circle-info", color: colors.primary, fondo: colors.surfaceAlt },
};

const TIPOS_BACKOFFICE = {
  success: { icon: "circle-check", color: b.salvia, fondo: "rgba(159, 220, 184, 0.12)" },
  error: { icon: "circle-exclamation", color: b.peligro, fondo: b.peligroSuave },
  warning: { icon: "triangle-exclamation", color: b.manteca, fondo: b.acentoSuave },
  confirm: { icon: "circle-question", color: b.acento, fondo: b.acentoSuave },
  info: { icon: "circle-info", color: b.cielo, fondo: "rgba(142, 201, 255, 0.10)" },
};

const LARGO_MAXIMO_EN_FILA = 14;

let hayRoot = false;
const pila = [];

let modalesCerrando = 0;
const suscriptoresCierre = new Set();

function avisarCierre() {
  suscriptoresCierre.forEach((fn) => fn(modalesCerrando));
}


export function registrarCierreModal() {
  modalesCerrando += 1;
  avisarCierre();
  let terminado = false;
  return function terminar() {
    if (terminado) return;
    terminado = true;
    modalesCerrando = Math.max(0, modalesCerrando - 1);
    avisarCierre();
  };
}

// En iOS no se puede presentar un Modal mientras otro (un diálogo o una hoja) se
// está cerrando. Para abrir uno desde el botón de un diálogo o al cerrar otra
// hoja, `despuesDeCerrarModales(() => setVisible(true))` espera a que terminen.
const ESPERA_CIERRE_DIALOGO_MS = Platform.OS === "ios" ? 450 : 0;

export function despuesDeCerrarModales(fn, espera = ESPERA_CIERRE_DIALOGO_MS) {
  setTimeout(() => {
    if (modalesCerrando === 0) {
      fn();
      return;
    }
    const alTerminar = (cantidad) => {
      if (cantidad > 0) return;
      suscriptoresCierre.delete(alTerminar);
      fn();
    };
    suscriptoresCierre.add(alTerminar);
  }, espera);
}

let mostrarToast = null;

export function appToast(texto, { icono = "circle-check", duracion = 2600, backoffice = false } = {}) {
  if (mostrarToast) mostrarToast({ texto, icono, duracion, backoffice, id: Date.now() });
}

function hostActual() {
  return pila[pila.length - 1] || null;
}

export function inferirTipo(titulo = "", botones) {
  const t = String(titulo || "").toLowerCase();
  if (/éxito|exito|listo|guardad|enviad|cread|eliminad|subid|actualizad/.test(t)) return "success";
  if (/error|no se pudo|falló|fallo/.test(t)) return "error";
  if (/atención|atencion|cuidado|advertencia|aviso/.test(t)) return "warning";
  if (t.trim().startsWith("¿") || (Array.isArray(botones) && botones.length > 1)) return "confirm";
  return "info";
}


export function appAlert(...args) {
  const [titulo, mensaje, botones, opciones] = args;
  const host = hostActual();
  if (!hayRoot || !host) {
    return Alert.alert(...args);
  }
  host.encolar({ titulo, mensaje, botones, opciones: opciones || {} });
}

/**
 * @param {boolean} root - solo el de App.js. Los demás los monta AppModal.
 */
export function DialogHost({ root = false }) {
  const [cola, setCola] = useState([]);
  const colaRef = useRef([]);

  function actualizarCola(cambio) {
    colaRef.current = cambio(colaRef.current);
    setCola(colaRef.current);
  }

  useEffect(() => {
    const host = { encolar: (dialogo) => actualizarCola((prev) => [...prev, dialogo]) };
    if (root) {
      hayRoot = true;
      pila.unshift(host);
    } else {
      pila.push(host);
    }
    return () => {
      const i = pila.indexOf(host);
      if (i !== -1) pila.splice(i, 1);
      if (root) hayRoot = false;
      const pendientes = colaRef.current;
      colaRef.current = [];
      const siguiente = hostActual();
      if (siguiente && pendientes.length > 0) pendientes.forEach((d) => siguiente.encolar(d));
    };
  }, [root]);

  const actual = cola[0];

  const [cerrando, setCerrando] = useState(modalesCerrando);
  useEffect(() => {
    if (!root) return undefined;
    const fn = (cantidad) => setCerrando(cantidad);
    suscriptoresCierre.add(fn);
    setCerrando(modalesCerrando);
    return () => {
      suscriptoresCierre.delete(fn);
    };
  }, [root]);
  const esperando = root && Platform.OS !== "web" && (cerrando > 0 || modalesCerrando > 0);

  // Toast (solo en el host root).
  const [toast, setToast] = useState(null);
  const opacidadToast = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!root) return undefined;
    mostrarToast = (nuevo) => setToast(nuevo);
    return () => {
      mostrarToast = null;
    };
  }, [root]);
  useEffect(() => {
    if (!toast || esperando) return undefined;
    opacidadToast.setValue(0);
    Animated.timing(opacidadToast, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    const ocultar = setTimeout(() => {
      Animated.timing(opacidadToast, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== "web" }).start(
        () => setToast((actualToast) => (actualToast?.id === toast.id ? null : actualToast))
      );
    }, toast.duracion);
    return () => clearTimeout(ocultar);
  }, [toast, esperando, opacidadToast]);

  const vistaToast = toast ? (
    <Animated.View
      pointerEvents="none"
      style={[styles.toastWrap, { opacity: opacidadToast }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.toast, toast.backoffice && stylesBO.toast]} accessibilityRole="alert">
        <FontAwesome6
          name={toast.icono}
          size={15}
          color={toast.backoffice ? b.acento : colors.textInverse}
          solid
        />
        <Text style={[styles.toastTexto, toast.backoffice && stylesBO.toastTexto]}>{toast.texto}</Text>
      </View>
    </Animated.View>
  ) : null;

  function cerrar(callback) {
    actualizarCola((prev) => prev.slice(1));
    if (callback) setTimeout(callback, 0);
  }

  if (!actual || esperando) return vistaToast;

  const { titulo, mensaje, opciones } = actual;
  const botones =
    Array.isArray(actual.botones) && actual.botones.length > 0
      ? actual.botones
      : [{ text: "Aceptar" }];

  const tipo = TIPOS[opciones.tipo] ? opciones.tipo : inferirTipo(titulo, actual.botones);
  const bo = Boolean(opciones.backoffice);
  const estilo = (bo ? TIPOS_BACKOFFICE : TIPOS)[tipo];
  const icono = opciones.icono || estilo.icon;
  const botonCancelar = botones.find((b) => b.style === "cancel");
  const cancelarComoCruz = Boolean(opciones.botonCerrar && botonCancelar);
  const cerrablePorFuera = opciones.cancelable !== false && (botones.length === 1 || botonCancelar);

  function alTocarFuera() {
    if (!cerrablePorFuera) return;
    if (botonCancelar) return cerrar(botonCancelar.onPress);
    if (botones.length === 1) return cerrar(botones[0].onPress);
    cerrar(opciones.onDismiss);
  }

  const ordenados = [
    ...(cancelarComoCruz ? [] : botones.filter((b) => b.style === "cancel")),
    ...botones.filter((b) => b.style !== "cancel"),
  ];
  const enColumna = ordenados.length > 2 || ordenados.some((b) => String(b.text || "").length > LARGO_MAXIMO_EN_FILA);

  return (
    <>
    {vistaToast}
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={alTocarFuera}>
      <Pressable style={[styles.overlay, bo && stylesBO.overlay]} onPress={alTocarFuera}>
        <Pressable
          style={[styles.card, bo && stylesBO.card]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="alert"
        >
          {cancelarComoCruz ? (
            <Pressable
              onPress={() => cerrar(botonCancelar.onPress)}
              accessibilityRole="button"
              accessibilityLabel={botonCancelar.text || "Cerrar"}
              hitSlop={12}
              style={({ pressed }) => [
                styles.cruz,
                opciones.confirmacion && styles.cruzConConfirmacion,
                bo && stylesBO.cruz,
                pressed && styles.buttonPressed,
              ]}
            >
              <FontAwesome6 name="xmark" size={16} color={bo ? b.textoSecundario : colors.textMuted} />
            </Pressable>
          ) : null}
          {opciones.confirmacion ? (
            <View
              style={[
                styles.confirmacion,
                cancelarComoCruz && styles.confirmacionConCruz,
                bo && stylesBO.confirmacion,
              ]}
              accessibilityRole="text"
            >
              <FontAwesome6 name="circle-check" size={14} color={bo ? b.salvia : colors.success} solid />
              <Text style={[styles.confirmacionTexto, bo && stylesBO.confirmacionTexto]}>
                {opciones.confirmacion}
              </Text>
            </View>
          ) : null}

          <View style={[styles.iconWrap, { backgroundColor: estilo.fondo }]}>
            <FontAwesome6 name={icono} size={26} color={estilo.color} />
          </View>

          {titulo ? (
            <Text
              style={[
                styles.title,
                cancelarComoCruz && styles.titleConCruz,
                bo && stylesBO.title,
              ]}
            >
              {titulo}
            </Text>
          ) : null}

          {opciones.etiqueta?.texto ? (
            <View style={[styles.etiqueta, bo && stylesBO.etiqueta]}>
              {opciones.etiqueta.icono ? (
                <FontAwesome6 name={opciones.etiqueta.icono} size={12} color={bo ? b.acento : colors.primary} />
              ) : null}
              <Text style={[styles.etiquetaTexto, bo && stylesBO.etiquetaTexto]} numberOfLines={1}>
                {opciones.etiqueta.texto}
              </Text>
            </View>
          ) : null}

          {mensaje ? (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
              <Text style={[styles.message, bo && stylesBO.message]}>{mensaje}</Text>
            </ScrollView>
          ) : null}

          <View style={[styles.actions, enColumna && styles.actionsColumn]}>
            {ordenados.map((boton, i) => {
              const esCancelar = boton.style === "cancel";
              const esDestructivo = boton.style === "destructive";
              const esPrincipal = !esCancelar && i === ordenados.length - 1;
              const esContorno = !esPrincipal && boton.variante === "contorno";
              const colorTexto = bo
                ? esPrincipal
                  ? b.sobreAcento
                  : esDestructivo
                  ? b.peligro
                  : b.texto
                : esPrincipal
                ? colors.textInverse
                : esDestructivo
                ? colors.danger
                : colors.primary;
              return (
                <Pressable
                  key={`${boton.text}-${i}`}
                  onPress={() => cerrar(boton.onPress)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    !enColumna && styles.buttonFlex,
                    esPrincipal ? styles.buttonPrimary : esContorno ? styles.buttonOutline : styles.buttonSecondary,
                    esPrincipal && esDestructivo && styles.buttonDanger,
                    bo && esPrincipal && stylesBO.buttonPrimary,
                    bo && esPrincipal && esDestructivo && stylesBO.buttonDanger,
                    bo && !esPrincipal && !esContorno && stylesBO.buttonSecondary,
                    bo && esContorno && stylesBO.buttonOutline,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <View style={styles.buttonContenido}>
                    {boton.icono ? <FontAwesome6 name={boton.icono} size={14} color={colorTexto} /> : null}
                    <Text
                      style={[
                        styles.buttonText,
                        esPrincipal ? styles.buttonTextPrimary : styles.buttonTextSecondary,
                        !esPrincipal && esDestructivo && styles.buttonTextDanger,
                        bo && esPrincipal && stylesBO.buttonTextPrimary,
                        bo && !esPrincipal && stylesBO.buttonTextSecondary,
                        bo && !esPrincipal && esDestructivo && stylesBO.buttonTextDanger,
                      ]}
                      numberOfLines={1}
                    >
                      {boton.text || "Aceptar"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "80%",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: "center",
    ...shadows.floating,
  },
  confirmacion: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: colors.successSurface,
    borderRadius: radii.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  confirmacionConCruz: {
    marginRight: 34 + spacing.xs,
  },
  confirmacionTexto: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.success,
    flexShrink: 1,
    textAlign: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    ...textStyles.bodyStrong,
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
    textAlign: "center",
  },
  titleConCruz: {
    paddingHorizontal: spacing.md,
  },
  cruz: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    zIndex: 1,
  },
  cruzConConfirmacion: {
    top: spacing.lg,
    right: spacing.md,
  },
  etiqueta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    marginTop: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  etiquetaTexto: {
    ...textStyles.bodyStrong,
    fontSize: 13,
    color: colors.primary,
    flexShrink: 1,
  },
  messageScroll: {
    alignSelf: "stretch",
    flexGrow: 0,
    marginTop: spacing.xs,
  },
  messageContent: {
    alignItems: "center",
  },
  message: {
    ...textStyles.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  actionsColumn: {
    flexDirection: "column-reverse",
  },
  button: {
    minHeight: 46,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonFlex: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceAlt,
  },
  buttonOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  buttonContenido: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  toastWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 48,
    alignItems: "center",
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 420,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    ...shadows.floating,
  },
  toastTexto: {
    ...textStyles.bodyStrong,
    fontSize: 14,
    color: colors.textInverse,
    flexShrink: 1,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  buttonTextPrimary: {
    color: colors.textInverse,
  },
  buttonTextSecondary: {
    color: colors.primary,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
});


const stylesBO = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  card: {
    backgroundColor: b.panel,
    borderWidth: 1,
    borderColor: b.bordeFuerte,
  },
  confirmacion: {
    backgroundColor: "rgba(159, 220, 184, 0.12)",
  },
  confirmacionTexto: {
    color: b.salvia,
  },
  title: {
    color: b.texto,
  },
  message: {
    color: b.textoSecundario,
  },
  cruz: {
    backgroundColor: b.superficieElevada,
  },
  etiqueta: {
    backgroundColor: b.acentoSuave,
    borderWidth: 1,
    borderColor: b.acentoBorde,
  },
  etiquetaTexto: {
    color: b.acento,
  },
  buttonPrimary: {
    backgroundColor: b.manteca,
  },
  buttonDanger: {
    backgroundColor: b.peligro,
  },
  buttonSecondary: {
    backgroundColor: b.superficieElevada,
    borderWidth: 1,
    borderColor: b.bordeFuerte,
  },
  buttonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: b.acento,
  },
  buttonTextPrimary: {
    color: b.sobreAcento,
  },
  buttonTextSecondary: {
    color: b.texto,
  },
  buttonTextDanger: {
    color: b.peligro,
  },
  toast: {
    backgroundColor: b.superficieElevada,
    borderWidth: 1,
    borderColor: b.acentoBorde,
  },
  toastTexto: {
    color: b.texto,
  },
});