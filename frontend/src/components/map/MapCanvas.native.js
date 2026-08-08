import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { FontAwesome6 } from "@expo/vector-icons";

import { colors, radii, spacing, surfaces, textStyles } from "../../theme/tokens";

function buildMapsUrl(marker) {
  const query = encodeURIComponent(marker.address || marker.name);
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(
    marker.placeId?.replace(/^google:/, "") ?? ""
  )}`;
}

export default function MapCanvas({ initialCenter, markers = [], onMarkerPress, onViewportChange }) {
  useEffect(() => {
    if (initialCenter?.lat && initialCenter?.lng) {
      onViewportChange?.(initialCenter);
    }
  }, [initialCenter, onViewportChange]);

  return (
    <View style={styles.wrap}>
      <View style={styles.placeholder}>
        <FontAwesome6 color={colors.primary} name="map-location-dot" size={18} />
        <Text style={styles.title}>Mapa interactivo</Text>
        <Text style={styles.copy}>
          En móvil nativo se listan los puntos disponibles y puedes abrirlos en Google Maps.
        </Text>
      </View>

      <View style={styles.list}>
        {markers.map((marker) => (
          <Pressable
            key={`${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`}
            onPress={() => onMarkerPress?.(marker)}
            style={styles.row}
          >
            <View style={styles.rowIcon}>
              <FontAwesome6 color={colors.primary} name="location-dot" size={14} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{marker.name}</Text>
              <Text style={styles.rowMeta}>{marker.address}</Text>
            </View>
            <Pressable onPress={() => Linking.openURL(buildMapsUrl(marker))} style={styles.openButton}>
              <FontAwesome6 color={colors.primary} name="arrow-up-right-from-square" size={12} />
            </Pressable>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  placeholder: {
    ...surfaces.card,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  copy: {
    ...textStyles.meta,
    color: colors.textSecondary,
    textAlign: "center",
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    ...surfaces.card,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    ...textStyles.bodyStrong,
    color: colors.primary,
  },
  rowMeta: {
    ...textStyles.meta,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  openButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
