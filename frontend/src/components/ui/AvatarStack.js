import { StyleSheet, Text, View } from "react-native";

import Avatar from "./Avatar";
import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export default function AvatarStack({ participants = [], max = 4, size = 30, overflowLabel }) {
  const visible = participants.slice(0, max);
  const overflow = participants.length - visible.length;

  return (
    <View style={styles.row}>
      {visible.map((participant, index) => (
        <View
          key={participant.key ?? participant.email ?? participant.id ?? `${participant.nombreCompleto}-${index}`}
          style={[styles.avatarWrap, { marginLeft: index === 0 ? 0 : -size * 0.28 }]}
        >
          <Avatar
            imageUrl={participant.fotoUrl}
            name={participant.nombreCompleto ?? participant.name ?? participant.email ?? "Invitado"}
            size={size}
            outlined
          />
        </View>
      ))}

      {(overflow > 0 || overflowLabel) && (
        <View
          style={[
            styles.overflow,
            {
              width: size + 4,
              height: size + 4,
              borderRadius: (size + 4) / 2,
              marginLeft: visible.length === 0 ? 0 : -size * 0.28,
            },
          ]}
        >
          <Text style={styles.overflowText}>{overflowLabel ?? `+${overflow}`}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    borderRadius: radii.pill,
  },
  overflow: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  overflowText: {
    ...textStyles.nav,
    color: colors.primary,
    fontWeight: "700",
  },
});
