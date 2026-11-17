import { Text } from "react-native";

import { partesResaltadas } from "../../utils/textoBusqueda";

/**
 * Texto con la parte que coincide con `query` resaltada (`matchStyle`), sin distinguir
 * mayúsculas ni tildes. Lo usan el buscador de destinos y las sugerencias de guardados.
 */
export default function ResaltarCoincidencia({ text, query, style, matchStyle, numberOfLines = 1 }) {
  const partes = partesResaltadas(text, query);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {partes.map((parte, indice) =>
        parte.resaltado ? (
          <Text key={indice} style={matchStyle}>
            {parte.texto}
          </Text>
        ) : (
          parte.texto
        )
      )}
    </Text>
  );
}
