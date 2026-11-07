import { useState } from "react";
import { FontAwesome6 } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors, radii } from "../../theme/tokens";

const COLOR_SOFT = `${colors.primarySoft}33`;

// Foto de un destino, con su número de orden opcional en la esquina. Sin foto, o si no
// carga, muestra un pin.
export default function FotoDestino({
  uri,
  tamano = 52,
  radio = radii.sm,
  numero,
  color,
  tamanoNumero = 22,
  colorBorde = colors.surface,
}) {
  const [uriFallida, setUriFallida] = useState(null);
  const forma = { width: tamano, height: tamano, borderRadius: radio };

  return (
    <View style={{ width: tamano, height: tamano }}>
      {!uri || uri === uriFallida ? (
        <View style={[styles.imagen, styles.vacia, forma]} testID="foto-destino-vacia">
          <FontAwesome6 name="location-dot" size={Math.round(tamano * 0.32)} color={colors.primary} />
        </View>
      ) : (
        <Image source={{ uri }} style={[styles.imagen, forma]} onError={() => setUriFallida(uri)} />
      )}
      {numero !== undefined ? (
        <View
          style={[
            styles.orden,
            {
              width: tamanoNumero,
              height: tamanoNumero,
              borderRadius: tamanoNumero / 2,
              backgroundColor: color,
              borderColor: colorBorde,
            },
          ]}
        >
          <Text style={styles.ordenTexto}>{numero}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imagen: {
    backgroundColor: colors.surfaceMuted,
  },
  vacia: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR_SOFT,
  },
  orden: {
    position: "absolute",
    top: -6,
    left: -6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ordenTexto: {
    color: colors.textInverse,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
  },
});
