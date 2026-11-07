import { FontAwesome6 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AvisoTraslado } from "./TrasladoCard";
import { colors, spacing, textStyles } from "../../theme/tokens";

function Hora({ parada, derecha }) {
  return (
    <View style={derecha && styles.derecha}>
      <Text style={[styles.hora, { color: parada.color }]}>{parada.hora}</Text>
      <Text style={styles.etiqueta}>{parada.etiqueta}</Text>
    </View>
  );
}

// Traslado entre destinos, con salida, llegada y la línea del viaje. Tocarla abre la edición.
export default function TarjetaViaje({ viaje, onPress, conMargen = false, testID = "tarjeta-viaje" }) {
  const { item, salida, llegada, duracion } = viaje;
  const degrade = [salida.color, llegada.color];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? `Editar ${item.title}` : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.tarjeta, conMargen && styles.conMargen]}
      testID={testID}
    >
      <Text style={styles.nombre}>{item.title}</Text>

      <View style={styles.fila}>
        <Hora parada={salida} />
        <Hora parada={llegada} derecha />
      </View>

      <View style={styles.linea}>
        <View style={[styles.punto, { backgroundColor: salida.color }]} />
        <LinearGradient colors={degrade} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.tramo} />
        <View style={styles.pildora}>
          <FontAwesome6 name={item.icon ?? "route"} size={11} color={colors.primary} />
          {duracion ? <Text style={styles.duracion}>{duracion}</Text> : null}
        </View>
        <LinearGradient colors={degrade} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.tramo} />
        <View style={[styles.punto, { backgroundColor: llegada.color }]} />
      </View>

      <View style={styles.fila}>
        <Text style={[styles.lugar, { color: salida.color }]}>{salida.nombre}</Text>
        <Text style={[styles.lugar, styles.lugarDerecha, { color: llegada.color }]}>
          {llegada.nombre}
        </Text>
      </View>

      {item.note ? <Text style={styles.nota}>{item.note}</Text> : null}
      <AvisoTraslado traslado={item.traslado} testID={`${testID}-aviso`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    padding: spacing.sm + 2,
    gap: spacing.xs,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  conMargen: {
    marginVertical: 10,
  },
  nombre: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    color: colors.primary,
  },
  fila: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  derecha: {
    alignItems: "flex-end",
  },
  hora: {
    ...textStyles.bodyStrong,
    fontSize: 20,
  },
  etiqueta: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.textSecondary,
  },
  linea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  punto: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tramo: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  pildora: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  duracion: {
    ...textStyles.meta,
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
  },
  lugar: {
    ...textStyles.meta,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  lugarDerecha: {
    textAlign: "right",
  },
  nota: {
    ...textStyles.meta,
    color: colors.textSecondary,
  },
});
