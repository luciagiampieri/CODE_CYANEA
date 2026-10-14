import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";

import Modal from "../ui/AppModal";
import PrimaryButton from "../ui/PrimaryButton";
import { colors, layout, radii, shadows, spacing, textStyles } from "../../theme/tokens";
import {
  accionPrincipal,
  citaVisible,
  enlaceSitioOficial,
  iconoRecomendacion,
  tituloRecomendacion,
  urlSegura,
} from "../../utils/recomendacionEntradas";

/**
 * Recomendación de entradas o reservas que se muestra después de registrar o
 * modificar una actividad. La actividad ya quedó guardada: la hoja solo informa.
 *
 * Jerarquía pensada para el viajero:
 * 1. qué conviene hacer (título) y para qué lugar;
 * 2. por qué, con lo que dice el sitio oficial;
 * 3. una sola acción principal (reservar o comprar), si existe en línea;
 * 4. salidas discretas: ver el sitio oficial y "Entendido".
 *
 * En teléfonos se presenta como hoja inferior (al alcance del pulgar); en pantallas
 * anchas, como tarjeta centrada.
 */
export default function TicketRecommendationModal({ visible, recomendacion, mensajeGuardado, onClose }) {
  const { width } = useWindowDimensions();
  const [errorEnlace, setErrorEnlace] = useState("");

  useEffect(() => {
    if (visible) setErrorEnlace("");
  }, [visible, recomendacion]);

  if (!recomendacion) return null;

  const comoHoja = width < layout.tablet;
  const accion = accionPrincipal(recomendacion);
  const sitio = enlaceSitioOficial(recomendacion);
  const cita = citaVisible(recomendacion);

  async function abrir(url) {
    const segura = urlSegura(url);
    if (!segura) return;
    setErrorEnlace("");
    try {
      await Linking.openURL(segura);
    } catch {
      setErrorEnlace("No se pudo abrir el enlace. Probá de nuevo más tarde desde el sitio oficial del lugar.");
    }
  }

  return (
    <Modal
      animationType={comoHoja ? "slide" : "fade"}
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, comoHoja ? styles.overlayHoja : styles.overlayCentrado]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar recomendación" />
        <View
          style={[styles.tarjeta, comoHoja ? styles.hoja : styles.centrada]}
          testID="recomendacion-entradas"
          accessibilityViewIsModal
        >
          {comoHoja ? <View style={styles.manija} /> : null}

          {mensajeGuardado ? (
            <View style={styles.guardado} accessibilityRole="text">
              <FontAwesome6 name="circle-check" size={13} color={colors.success} solid />
              <Text style={styles.guardadoTexto}>{mensajeGuardado}</Text>
            </View>
          ) : null}

          <View style={styles.encabezado}>
            <View style={styles.icono}>
              <FontAwesome6 name={iconoRecomendacion(recomendacion.tipo)} size={20} color={colors.primary} />
            </View>
            <View style={styles.encabezadoTextos}>
              <Text style={styles.titulo} accessibilityRole="header">
                {tituloRecomendacion(recomendacion.tipo)}
              </Text>
              {recomendacion.nombreLugar ? (
                <Text style={styles.lugar} numberOfLines={2}>
                  {recomendacion.nombreLugar}
                </Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.mensaje}>{recomendacion.mensaje}</Text>

          {cita ? (
            <View style={styles.cita} testID="recomendacion-entradas-cita">
              <Text style={styles.citaTexto} numberOfLines={4}>
                “{cita}”
              </Text>
              {recomendacion.dominioFuente ? (
                <Text style={styles.citaFuente}>Sitio oficial · {recomendacion.dominioFuente}</Text>
              ) : null}
            </View>
          ) : recomendacion.dominioFuente ? (
            <Text style={styles.fuente}>Según el sitio oficial ({recomendacion.dominioFuente}).</Text>
          ) : null}

          {recomendacion.avisoEnlace ? <Text style={styles.aviso}>{recomendacion.avisoEnlace}</Text> : null}
          {errorEnlace ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {errorEnlace}
            </Text>
          ) : null}

          <View style={styles.acciones}>
            {accion ? (
              <View>
                <PrimaryButton
                  label={accion.texto}
                  icon="arrow-up-right-from-square"
                  onPress={() => abrir(accion.url)}
                  testID="recomendacion-entradas-accion"
                />
                {accion.aclaracion ? (
                  <Text style={styles.aclaracion} testID="recomendacion-entradas-plataforma">
                    {accion.aclaracion}
                  </Text>
                ) : null}
              </View>
            ) : (
              <PrimaryButton label="Entendido" onPress={onClose} testID="recomendacion-entradas-cerrar" />
            )}

            {sitio || accion ? (
              <View style={styles.secundarias}>
                {sitio ? (
                  <Pressable
                    onPress={() => abrir(sitio.url)}
                    accessibilityRole="link"
                    accessibilityLabel={`${sitio.texto}, se abre en el navegador`}
                    style={({ pressed }) => [styles.enlaceTexto, pressed && styles.presionado]}
                    testID="recomendacion-entradas-sitio"
                    hitSlop={8}
                  >
                    <Text style={styles.enlaceSitio}>{sitio.texto}</Text>
                    <FontAwesome6 name="arrow-up-right-from-square" size={11} color={colors.primary} />
                  </Pressable>
                ) : (
                  <View />
                )}
                {accion ? (
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.enlaceTexto, pressed && styles.presionado]}
                    testID="recomendacion-entradas-cerrar"
                    hitSlop={8}
                  >
                    <Text style={styles.entendido}>Entendido</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  overlayHoja: {
    justifyContent: "flex-end",
  },
  overlayCentrado: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  tarjeta: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadows.floating,
  },
  hoja: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  centrada: {
    width: "100%",
    maxWidth: 440,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
  },
  manija: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xs,
  },
  guardado: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  guardadoTexto: {
    ...textStyles.meta,
    color: colors.success,
  },
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  icono: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  encabezadoTextos: {
    flex: 1,
    gap: 2,
  },
  titulo: {
    ...textStyles.tripTitle,
    color: colors.textPrimary,
  },
  lugar: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  mensaje: {
    ...textStyles.body,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  cita: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accentStrong,
    backgroundColor: colors.surface,
    borderTopRightRadius: radii.xs,
    borderBottomRightRadius: radii.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.xxs,
  },
  citaTexto: {
    ...textStyles.meta,
    color: colors.textPrimary,
    fontStyle: "italic",
    lineHeight: 20,
  },
  citaFuente: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fuente: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  aviso: {
    ...textStyles.meta,
    color: colors.warning,
    backgroundColor: colors.warningSurface,
    borderRadius: radii.xs,
    padding: spacing.sm,
  },
  error: {
    ...textStyles.meta,
    color: colors.danger,
  },
  acciones: {
    gap: spacing.md,
    marginTop: spacing.xxs,
  },
  aclaracion: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  secundarias: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  enlaceTexto: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  presionado: {
    opacity: 0.6,
  },
  enlaceSitio: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  entendido: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    color: colors.textSecondary,
  },
});
