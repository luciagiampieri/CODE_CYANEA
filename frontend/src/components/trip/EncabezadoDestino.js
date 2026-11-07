import { FontAwesome6 } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import FotoDestino from "../ui/FotoDestino";
import { colors, spacing, textStyles } from "../../theme/tokens";

// Encabezado de una sección de la lista, sobre el fondo de la pantalla. Sin `indice` es la
// sección de días sin destino, que no lleva foto.
export default function EncabezadoDestino({ encabezado }) {
  const { indice, nombre, detalle, color, foto } = encabezado;

  if (indice === null) {
    return (
      <View style={styles.encabezado} testID="encabezado-destino-sin-destino">
        <Text style={[styles.nombre, { color }]}>{nombre}</Text>
      </View>
    );
  }

  return (
    <View style={styles.encabezado} testID={`encabezado-destino-${indice}`}>
      <FotoDestino
        uri={foto}
        tamano={44}
        radio={13}
        numero={indice + 1}
        color={color}
        tamanoNumero={21}
        colorBorde={colors.background}
      />
      <View style={styles.textos}>
        <Text style={[styles.nombre, { color }]}>{nombre}</Text>
        <Text style={styles.detalle}>{detalle}</Text>
      </View>
    </View>
  );
}

// "Llegás a Mendoza · 08:00", al inicio del día de llegada.
export function MarcaLlegada({ texto, color, fondo }) {
  return (
    <View style={[styles.marca, { backgroundColor: fondo }]} testID="marca-llegada">
      <FontAwesome6 name="location-dot" size={12} color={color} />
      <Text style={[styles.marcaTexto, { color }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 16,
  },
  textos: {
    flex: 1,
    minWidth: 0,
  },
  nombre: {
    ...textStyles.bodyStrong,
    fontSize: 18,
  },
  detalle: {
    ...textStyles.meta,
    fontSize: 12,
    color: colors.textSecondary,
  },
  marca: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  marcaTexto: {
    ...textStyles.meta,
    flex: 1,
    fontWeight: "700",
  },
});
