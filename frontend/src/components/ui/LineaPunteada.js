import { StyleSheet, View } from "react-native";

import { colors } from "../../theme/tokens";

const PUNTOS_LINEA = Array.from({ length: 16 }, (_, punto) => punto);

// Tramo vertical de línea de puntos que une dos tarjetas. Toma el alto de su fila; `style`
// define su posición.
export default function LineaPunteada({ style, color = colors.borderStrong }) {
  return (
    <View style={[styles.linea, style]} testID="linea-punteada">
      <View style={styles.puntos}>
        {PUNTOS_LINEA.map((punto) => (
          <View key={punto} style={[styles.punto, { backgroundColor: color }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linea: {
    alignSelf: "stretch",
    width: 2,
    overflow: "hidden",
  },
  puntos: {
    position: "absolute",
    top: 2,
    gap: 3,
  },
  punto: {
    width: 2,
    height: 2,
    borderRadius: 1,
  },
});
