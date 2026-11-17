import { Keyboard, Platform, TouchableWithoutFeedback, View } from "react-native";

/**
 * Contenedor que cierra el teclado al tocar fuera de un campo (Android/iOS).
 *
 * En web no se envuelve: react-native-web le da a TouchableWithoutFeedback los
 * toques que empiezan sobre un <input> hijo y Keyboard.dismiss le quita el foco
 * al campo recién tocado. En el navegador, tocar afuera ya cierra el teclado.
 */
export default function CerrarTecladoAlTocar({ style, children }) {
  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }
  return (
    // View intermedia: TouchableWithoutFeedback necesita un hijo nativo para detectar el toque fuera del teclado.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={style}>{children}</View>
    </TouchableWithoutFeedback>
  );
}
