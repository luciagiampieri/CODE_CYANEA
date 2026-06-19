import { Image, StyleSheet, Text, View } from "react-native";

import { colors, radii, textStyles } from "../../theme/tokens";

function getInitials(name) {
  return String(name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Avatar({ name, imageUrl, size = 42, outlined = false, ringColor = colors.surface }) {
  const shared = [
    { width: size, height: size, borderRadius: size / 2 },
    outlined && { borderWidth: 2, borderColor: ringColor },
  ];

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[styles.image, ...shared]} />;
  }

  return (
    <View style={[styles.fallback, ...shared]}>
      <Text style={styles.initials}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceAlt,
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  initials: {
    ...textStyles.nav,
    color: colors.primary,
    fontWeight: "700",
  },
});
