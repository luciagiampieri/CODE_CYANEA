import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";
import {
  ESTADOS_TRAMO,
  avisoDeTraslado,
  separaPorDestino,
  subtextoTarjeta,
  textoOculto,
  tituloTarjeta,
} from "../../utils/traslados";

function claveDe(tramo) {
  return `${tramo.tipo}-${tramo.idDestinoOrigen ?? ""}-${tramo.idDestinoLlegada ?? ""}`;
}

// Tarjeta de un tramo sin agendar, o su línea compacta si el grupo la ocultó.
export default function TrasladoCard({ tramo, onAgendar, onOcultar, onMostrar }) {
  const clave = claveDe(tramo);

  if (tramo.estado === ESTADOS_TRAMO.OCULTO) {
    return (
      <View style={styles.oculto} testID={`traslado-oculto-${clave}`}>
        <FontAwesome6 name="eye-slash" size={11} color={colors.textSecondary} />
        <Text style={styles.ocultoTexto}>{textoOculto(tramo)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mostrar. ${textoOculto(tramo)}`}
          onPress={() => onMostrar?.(tramo)}
          style={({ pressed }) => [styles.ocultoBoton, pressed && styles.presionado]}
          testID={`traslado-mostrar-${clave}`}
        >
          <Text style={styles.ocultoAccion}>Mostrar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Agendar. ${textoOculto(tramo)}`}
          onPress={() => onAgendar?.(tramo)}
          style={({ pressed }) => [styles.ocultoBoton, pressed && styles.presionado]}
          testID={`traslado-agendar-${clave}`}
        >
          <Text style={styles.ocultoAccion}>Agendar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.tarjeta} testID={`traslado-tarjeta-${clave}`}>
      <View style={styles.textos}>
        <Text style={styles.titulo}>{tituloTarjeta(tramo)}</Text>
        <Text style={styles.subtexto}>{subtextoTarjeta(tramo)}</Text>
        {separaPorDestino(tramo) ? (
          <Text style={styles.subtexto}>Al agendarlo, las actividades se separan por destino</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ocultar"
          hitSlop={8}
          onPress={() => onOcultar?.(tramo)}
          testID={`traslado-ocultar-${clave}`}
        >
          <Text style={styles.ocultar}>Ocultar</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agendar"
        onPress={() => onAgendar?.(tramo)}
        style={({ pressed }) => [styles.boton, pressed && styles.presionado]}
        testID={`traslado-agendar-${clave}`}
      >
        <Text style={styles.botonTexto}>Agendar</Text>
      </Pressable>
    </View>
  );
}

// Cartel de un traslado agendado que hay que actualizar, eliminar o revisar.
export function AvisoTraslado({ traslado, testID }) {
  const aviso = avisoDeTraslado(traslado);
  if (!aviso) return null;

  const esError = aviso.tono === "danger";
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={[styles.aviso, esError ? styles.avisoError : styles.avisoAdvertencia]}
      testID={testID}
    >
      <FontAwesome6
        name="triangle-exclamation"
        size={11}
        color={esError ? colors.danger : colors.warning}
      />
      <Text style={[styles.avisoTexto, { color: esError ? colors.danger : colors.warning }]}>
        {aviso.mensaje}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
  },
  textos: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titulo: {
    ...textStyles.bodyStrong,
    color: colors.primary,
    fontSize: 15,
  },
  subtexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
  ocultar: {
    ...textStyles.meta,
    color: colors.textMuted,
    textDecorationLine: "underline",
    marginTop: 2,
  },
  boton: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  botonTexto: {
    ...textStyles.meta,
    color: colors.textInverse,
    fontWeight: "700",
  },
  oculto: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ocultoTexto: {
    ...textStyles.meta,
    color: colors.textSecondary,
    flex: 1,
  },
  ocultoBoton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  ocultoAccion: {
    ...textStyles.meta,
    color: colors.primary,
    fontWeight: "700",
  },
  presionado: {
    opacity: 0.7,
  },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  avisoError: {
    backgroundColor: colors.dangerSurface,
  },
  avisoAdvertencia: {
    backgroundColor: colors.warningSurface,
  },
  avisoTexto: {
    ...textStyles.meta,
    flex: 1,
    fontWeight: "600",
  },
});
