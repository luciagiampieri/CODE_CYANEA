import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import {
  ImageBackground,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from "react-native";

import StatusPill from "../ui/StatusPill";
import { colors, radii, spacing, typography, shadows } from "../../theme/tokens";

const STATUS_LABEL = {
  activo: "Activo",
  finalizado: "Finalizado",
};

export default function TripCard({ trip }) {
  const navigation = useNavigation();

  const statusKey = trip.status?.toLowerCase();
  const statusLabel = STATUS_LABEL[statusKey] ?? trip.status ?? "";

  const handlePress = () => {
    navigation.navigate("TripDetail", {
      IdViaje: trip.id,
    });
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={handlePress}>
      <ImageBackground
        imageStyle={styles.image}
        source={{ uri: trip.image }}
        style={styles.card}
      >
        <View style={styles.overlay}>
          <View style={styles.content}>
            {statusLabel ? (
              <View style={styles.pillWrap}>
                <StatusPill tone={statusKey}>{statusLabel}</StatusPill>
              </View>
            ) : null}

            <Text style={styles.title}>{trip.title}</Text>
            <Text style={styles.subtitle}>{trip.destination}</Text>
            <Text style={styles.date}>{trip.dateLabel}</Text>
          </View>

          <View style={styles.arrowBubble}>
            <FontAwesome6
              color={colors.primary}
              name="arrow-right"
              size={18}
            />
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 250,
    borderRadius: radii.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    ...shadows.card,
  },
  image: { borderRadius: radii.lg },
  overlay: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    padding: spacing.lg,
    backgroundColor: colors.overlay,
  },
  content: { flex: 1, gap: spacing.xs },
  pillWrap: { marginBottom: spacing.xs },
  title: {
    color: colors.surface,
    fontSize: typography.heading,
    fontWeight: "800",
  },
  subtitle: { color: "#dfe6f5", marginTop: 2 },
  date: {
    color: colors.surface,
    marginTop: spacing.sm,
    fontWeight: "700",
  },
  arrowBubble: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
});