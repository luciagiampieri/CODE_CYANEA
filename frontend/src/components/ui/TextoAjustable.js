import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

// Ancho aproximado de un carácter en relación con el tamaño de letra. Es un poco
// generoso a propósito: mejor achicar de más que cortar el monto.
const ANCHO_POR_CARACTER = 0.62;
const ESCALA_MINIMA_WEB = 0.7;

/**
 * Tamaño de letra para que `texto` entre en una línea de `ancho` px, entre `minimo` y
 * `base`. Devuelve también si entra con ese tamaño.
 */
export function tamanoParaAncho(texto, ancho, base, minimo) {
  const caracteres = String(texto ?? "").length;
  if (!ancho || !caracteres) return { tamano: base, entra: true };
  const necesario = ancho / (caracteres * ANCHO_POR_CARACTER);
  const tamano = Math.max(minimo, Math.min(base, Math.floor(necesario)));
  return { tamano, entra: necesario >= minimo };
}

/**
 * Texto de una línea (p. ej. un monto) que achica la letra para verse entero.
 *
 * En Android/iOS es el Text de siempre con `adjustsFontSizeToFit`. En la web ese
 * prop no existe (react-native-web lo ignora y el texto se corta), así que se mide el
 * ancho disponible y se calcula el tamaño. Si ni con el mínimo entra y hay
 * `textoCompacto` (p. ej. "$ 12,3 M"), se muestra ese, con el texto completo como
 * etiqueta de accesibilidad.
 */
export default function TextoAjustable({
  children,
  textoCompacto,
  minimumFontScale,
  style,
  estiloContenedor,
  testID,
  ...props
}) {
  const [ancho, setAncho] = useState(0);

  if (Platform.OS !== "web") {
    return (
      <Text
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
        numberOfLines={1}
        style={style}
        testID={testID}
        {...props}
      >
        {children}
      </Text>
    );
  }

  const base = StyleSheet.flatten(style)?.fontSize ?? 16;
  // En la web, sin escala mínima indicada, la letra baja hasta el 70 %.
  const minimo = Math.round(base * (minimumFontScale ?? ESCALA_MINIMA_WEB));
  const completo = String(children ?? "");

  let texto = completo;
  let { tamano, entra } = tamanoParaAncho(completo, ancho, base, minimo);
  if (!entra && textoCompacto) {
    texto = textoCompacto;
    ({ tamano } = tamanoParaAncho(textoCompacto, ancho, base, minimo));
  }

  return (
    <View
      style={[styles.contenedor, estiloContenedor]}
      onLayout={(e) => setAncho(e.nativeEvent.layout.width)}
    >
      <Text
        numberOfLines={1}
        style={[style, { fontSize: tamano }]}
        testID={testID}
        accessibilityLabel={texto !== completo ? completo : undefined}
        {...props}
      >
        {texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    alignSelf: "stretch",
  },
});
