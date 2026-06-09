import { Image, StyleSheet, Text, View } from "react-native";

import { colors, radii, typography } from "../../theme/tokens";

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Avatar({ name, imageUrl, size = 42 }) {
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.image, { width: size, height: size }]} />;
  }

  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Text style={styles.initials}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted
  },
  fallback: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  initials: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: typography.small
  }
});
