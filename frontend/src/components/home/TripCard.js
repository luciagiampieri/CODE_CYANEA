import { FontAwesome6 } from "@expo/vector-icons";
import { ImageBackground, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography, shadows } from "../../theme/tokens";

export default function TripCard({ trip }) {
  return (
    <ImageBackground imageStyle={styles.image} source={{ uri: trip.image }} style={styles.card}>
      <View style={styles.overlay}>
        <View>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.subtitle}>{trip.destination}</Text>
          <Text style={styles.date}>{trip.dateLabel}</Text>
        </View>
        <View style={styles.arrowBubble}>
          <FontAwesome6 color={colors.primary} name="arrow-right" size={18} />
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 250,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    ...shadows.card
  },
  image: {
    borderRadius: radii.lg
  },
  overlay: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: spacing.lg,
    backgroundColor: colors.overlay
  },
  title: {
    color: colors.surface,
    fontSize: typography.heading,
    fontWeight: "800"
  },
  subtitle: {
    color: "#dfe6f5",
    marginTop: 4
  },
  date: {
    color: colors.surface,
    marginTop: spacing.sm,
    fontWeight: "700"
  },
  arrowBubble: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  }
});
