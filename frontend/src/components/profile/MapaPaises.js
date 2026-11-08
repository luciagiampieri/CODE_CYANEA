import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import mundo from "world-atlas/countries-110m.json";
import paisesIso from "i18n-iso-countries";
import es from "i18n-iso-countries/langs/es.json";
import en from "i18n-iso-countries/langs/en.json";

import { colors } from "../../theme/tokens";

paisesIso.registerLocale(es);
paisesIso.registerLocale(en);

const ANCHO = 960;
const ALTO = 470;
const ID_ANTARTIDA = 10;

function normalizarId(id) {
  return id == null ? null : String(Number(id));
}

const FORMAS = (() => {
  const geo = feature(mundo, mundo.objects.countries);
  const paises = {
    ...geo,
    features: geo.features.filter((pais) => Number(pais.id) !== ID_ANTARTIDA),
  };
  const proyeccion = geoNaturalEarth1().fitSize([ANCHO, ALTO], paises);
  const camino = geoPath(proyeccion);
  return paises.features
    .map((pais) => ({ id: normalizarId(pais.id), d: camino(pais) }))
    .filter((forma) => forma.d);
})();

function alpha2De(nombre) {
  if (!nombre) return null;
  return (
    paisesIso.getSimpleAlpha2Code(nombre, "es") ??
    paisesIso.getSimpleAlpha2Code(nombre, "en") ??
    null
  );
}

export function banderaDe(nombre) {
  const alpha2 = alpha2De(nombre);
  return alpha2 ? `https://flagcdn.com/h80/${alpha2.toLowerCase()}.png` : null;
}

export default function MapaPaises({ paises = [] }) {
  const visitados = useMemo(() => {
    const ids = new Set();
    for (const nombre of paises) {
      const alpha2 = alpha2De(nombre);
      if (alpha2) ids.add(normalizarId(paisesIso.alpha2ToNumeric(alpha2)));
    }
    return ids;
  }, [paises]);

  return (
    <View
      style={{ width: "100%", maxWidth: 720, alignSelf: "center", aspectRatio: ANCHO / ALTO }}
      accessible
      accessibilityLabel={`Mapa con ${paises.length} países visitados`}
      testID="profile-mapa"
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${ANCHO} ${ALTO}`}>
        {FORMAS.map((forma, indice) => (
          <Path
            key={`${forma.id}-${indice}`}
            d={forma.d}
            fill={visitados.has(forma.id) ? colors.primary : colors.surfaceAlt}
            stroke={colors.surface}
            strokeWidth={0.6}
          />
        ))}
      </Svg>
    </View>
  );
}