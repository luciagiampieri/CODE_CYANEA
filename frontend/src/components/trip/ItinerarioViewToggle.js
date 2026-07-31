import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

const OPCIONES = [
    { id: "timeline", label: "Timeline", icon: "bars-staggered" },
    { id: "calendario", label: "Calendario", icon: "calendar-days" },
];

export default function ItinerarioViewToggle({ value, onChange }) {
    return (
        <View style={styles.wrap}>
            {OPCIONES.map((opcion) => {
                const activo = opcion.id === value;
                return (
                    <Pressable
                        key={opcion.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activo }}
                        onPress={() => onChange(opcion.id)}
                        style={[styles.opcion, activo && styles.opcionActiva]}
                    >
                        <FontAwesome6
                            color={activo ? colors.textInverse : colors.primary}
                            name={opcion.icon}
                            size={12}
                        />
                        <Text style={[styles.texto, activo && styles.textoActivo]}>{opcion.label}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        alignSelf: "flex-start",
        backgroundColor: colors.surfaceAlt,
        borderRadius: radii.pill,
        padding: 4,
        gap: 4,
    },
    opcion: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xxs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radii.pill,
    },
    opcionActiva: {
        backgroundColor: colors.primary,
    },
    texto: {
        ...textStyles.nav,
        fontSize: 12,
        color: colors.primary,
    },
    textoActivo: {
        color: colors.textInverse,
    },
});