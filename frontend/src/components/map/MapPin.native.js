import { FontAwesome6 } from "@expo/vector-icons";
import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";

import { colors, shadows } from "../../theme/tokens";
import { resolveMarkerAppearance } from "./markerAppearance";

const SIZE = 32;

/**
 * Pin con vista propia. `tracksViewChanges` queda activo solo un instante
 * después de cada cambio: así el ícono llega a dibujarse (en Android puede
 * quedar vacío si se apaga antes) y el mapa no redibuja todos los pines
 * en cada frame.
 */
function MapPin({ marker, highlighted, dimmed, onPress, showCallout }) {
  const look = resolveMarkerAppearance(marker);
  const [tracksChanges, setTracksChanges] = useState(true);

  useEffect(() => {
    setTracksChanges(true);
    const timeoutId = setTimeout(() => setTracksChanges(false), 500);
    return () => clearTimeout(timeoutId);
  }, [highlighted, look.fill, look.icon, look.label]);

  const scale = highlighted ? 1.25 : 1;

  return (
    <Marker
      anchor={{ x: 0.5, y: 1 }}
      coordinate={{ latitude: marker.lat, longitude: marker.lng }}
      description={showCallout ? marker.address : undefined}
      onPress={() => onPress?.(marker)}
      opacity={dimmed ? 0.8 : 1}
      title={showCallout ? marker.name : undefined}
      tracksViewChanges={tracksChanges}
      zIndex={highlighted ? 999 : marker.kind === "tripDestination" ? 50 : 10}
    >
      <View style={[styles.wrap, { transform: [{ scale }] }]}>
        <View
          style={[
            styles.head,
            { backgroundColor: look.fill, borderColor: look.border },
            highlighted && styles.headHighlighted,
          ]}
        >
          {look.label ? (
            <Text style={[styles.label, { color: look.content }]}>{look.label}</Text>
          ) : (
            <FontAwesome6 color={look.content} name={look.icon} size={13} />
          )}
        </View>
        <View style={[styles.tail, { backgroundColor: look.border }]} />
      </View>
    </Marker>
  );
}

export default memo(MapPin);

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    // Espacio extra para que la escala y la sombra no se recorten.
    padding: 6,
    paddingBottom: 2,
  },
  head: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  headHighlighted: {
    borderWidth: 3,
    borderColor: colors.accentStrong,
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
  },
  tail: {
    width: 3,
    height: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: -1,
  },
});
