/**
 * Diálogo estándar de Cyanea: reemplaza al Alert nativo de Android/iOS
 * (el cuadro blanco con "ACEPTAR" en verde) por uno con el estilo de la app.
 *
 * Uso:
 *   1. Montar <DialogHost root /> una sola vez (ya está en App.js) y usar
 *      `Modal` de "components/ui/AppModal" en lugar del de react-native, para
 *      que los diálogos aparezcan encima del modal abierto.
 *   2. Llamar a `appAlert(...)` con la MISMA firma que `Alert.alert`:
 *
 *        appAlert("Éxito", "Documento subido correctamente.");
 *        appAlert("¿Eliminar?", "No se puede deshacer.", [
 *          { text: "Cancelar", style: "cancel" },
 *          { text: "Eliminar", style: "destructive", onPress: borrar },
 *        ]);
 *
 *      Opcionalmente se puede forzar el tipo (ícono y color) con
 *      `appAlert(titulo, mensaje, botones, { tipo: "success" })`.
 *      Tipos: "success" | "error" | "warning" | "info" | "confirm".
 *      Si no se indica, se deduce del título ("Éxito", "Error", "¿...?").
 *
 * Si <DialogHost root /> no está montado (por ejemplo en los tests), `appAlert`
 * delega en `Alert.alert` con los mismos argumentos, así que los tests que
 * espían `Alert.alert` siguen funcionando sin cambios.
 */
import { useEffect, useRef, useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radii, shadows, spacing, textStyles } from "../../theme/tokens";

const TIPOS = {
  success: { icon: "circle-check", color: colors.success, fondo: colors.successSurface },
  error: { icon: "circle-exclamation", color: colors.danger, fondo: colors.dangerSurface },
  warning: { icon: "triangle-exclamation", color: colors.warning, fondo: colors.warningSurface },
  confirm: { icon: "circle-question", color: colors.primary, fondo: colors.surfaceAlt },
  info: { icon: "circle-info", color: colors.primary, fondo: colors.surfaceAlt },
};

// Pila de anfitriones montados. El de App.js (`root`) habilita el sistema; los
// de AppModal se apilan encima mientras su modal está visible. El diálogo se
// dibuja en el último de la pila: así queda anidado dentro del modal que está
// arriba de todo y no detrás de él (un Modal hermano abierto desde App.js
// queda tapado por el modal visible en Android nueva arquitectura y en iOS).
let hayRoot = false;
const pila = [];

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

/** Misma firma que Alert.alert(title, message, buttons, options). */
export function appAlert(...args) {
  const [titulo, mensaje, botones, opciones] = args;
  const host = hostActual();
  if (!hayRoot || !host) {
    // Sin el host de App.js (tests): se reenvían los argumentos tal cual a Alert.alert.
    return Alert.alert(...args);
  }
  host.encolar({ titulo, mensaje, botones, opciones: opciones || {} });
}

/**
 * @param {boolean} root - solo el de App.js. Los demás los monta AppModal.
 */
export function DialogHost({ root = false }) {
  const [cola, setCola] = useState([]);
  const colaRef = useRef(cola);
  colaRef.current = cola;

  useEffect(() => {
    const host = { encolar: (dialogo) => setCola((prev) => [...prev, dialogo]) };
    if (root) {
      hayRoot = true;
      pila.unshift(host); // el root siempre queda en la base
    } else {
      pila.push(host);
    }
    return () => {
      const i = pila.indexOf(host);
      if (i !== -1) pila.splice(i, 1);
      if (root) hayRoot = false;
      // Si el modal se cierra con diálogos pendientes, pasan al de abajo.
      const pendientes = colaRef.current;
      const siguiente = hostActual();
      if (siguiente && pendientes.length > 0) pendientes.forEach((d) => siguiente.encolar(d));
    };
  }, [root]);

  const actual = cola[0];

  function cerrar(callback) {
    setCola((prev) => prev.slice(1));
    // Se ejecuta después de cerrar para que, si el callback abre otro
    // diálogo o navega, no choque con el que se está cerrando.
    if (callback) setTimeout(callback, 0);
  }

  if (!actual) return null;

  const { titulo, mensaje, opciones } = actual;
  const botones =
    Array.isArray(actual.botones) && actual.botones.length > 0
      ? actual.botones
      : [{ text: "Aceptar" }];

  const tipo = TIPOS[opciones.tipo] ? opciones.tipo : inferirTipo(titulo, actual.botones);
  const estilo = TIPOS[tipo];
  const botonCancelar = botones.find((b) => b.style === "cancel");
  // Igual que Alert: en Android tocar afuera solo cierra si cancelable es true.
  const cerrablePorFuera = opciones.cancelable !== false && (botones.length === 1 || botonCancelar);

  function alTocarFuera() {
    if (!cerrablePorFuera) return;
    if (botonCancelar) return cerrar(botonCancelar.onPress);
    if (botones.length === 1) return cerrar(botones[0].onPress);
    cerrar(opciones.onDismiss);
  }

  // Ordenamos para que el botón principal quede a la derecha / abajo.
  const ordenados = [
    ...botones.filter((b) => b.style === "cancel"),
    ...botones.filter((b) => b.style !== "cancel"),
  ];
  const enColumna = ordenados.length > 2;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={alTocarFuera}>
      <Pressable style={styles.overlay} onPress={alTocarFuera}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} accessibilityRole="alert">
          <View style={[styles.iconWrap, { backgroundColor: estilo.fondo }]}>
            <FontAwesome6 name={estilo.icon} size={26} color={estilo.color} />
          </View>

          {titulo ? <Text style={styles.title}>{titulo}</Text> : null}

          {mensaje ? (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
              <Text style={styles.message}>{mensaje}</Text>
            </ScrollView>
          ) : null}

          <View style={[styles.actions, enColumna && styles.actionsColumn]}>
            {ordenados.map((boton, i) => {
              const esCancelar = boton.style === "cancel";
              const esDestructivo = boton.style === "destructive";
              // El último botón no-cancelar es el principal (relleno).
              const esPrincipal = !esCancelar && i === ordenados.length - 1;
              return (
                <Pressable
                  key={`${boton.text}-${i}`}
                  onPress={() => cerrar(boton.onPress)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    !enColumna && styles.buttonFlex,
                    esPrincipal ? styles.buttonPrimary : styles.buttonSecondary,
                    esPrincipal && esDestructivo && styles.buttonDanger,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      esPrincipal ? styles.buttonTextPrimary : styles.buttonTextSecondary,
                      !esPrincipal && esDestructivo && styles.buttonTextDanger,
                    ]}
                    numberOfLines={1}
                  >
                    {boton.text || "Aceptar"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
