import { StyleSheet, Text, View } from "react-native";

import FotoDestino from "../ui/FotoDestino";
import { colors, spacing, textStyles } from "../../theme/tokens";

// Actividades de un destino en un día de traslado agendado. Se muestra aunque no tenga
// actividades, para que se entienda dónde están hasta o desde el traslado.
export default function ZonaDestino({ destino, etiqueta, testID, children }) {
  return (
    <View style={[styles.zona, { backgroundColor: destino.suave }]} testID={testID}>
      <View style={styles.encabezado}>
        <FotoDestino uri={destino.foto} tamano={26} radio={8} />
        <Text style={[styles.nombre, { color: destino.color }]}>{destino.nombre}</Text>
        <Text style={styles.etiqueta}>{etiqueta}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  zona: {
    padding: 10,
    borderRadius: 18,
    gap: spacing.xs,
  },
  encabezado: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  nombre: {
    ...textStyles.bodyStrong,
    fontSize: 15,
    flex: 1,
    minWidth: 0,
  },
  etiqueta: {
    ...textStyles.meta,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
