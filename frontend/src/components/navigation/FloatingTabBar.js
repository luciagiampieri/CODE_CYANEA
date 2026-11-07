import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing, textStyles } from "../../theme/tokens";

export const ALTO_BARRA_TABS = 68;
const MARGEN_INFERIOR = spacing.sm;
const ANCHO_MAXIMO = 480;

export function espacioBarraTabs(insetInferior = 0) {
  return ALTO_BARRA_TABS + Math.max(insetInferior, MARGEN_INFERIOR) + MARGEN_INFERIOR;
}

export function useEspacioBarraTabs() {
  const insets = useSafeAreaInsets();
  return espacioBarraTabs(insets.bottom);
}

export default function FloatingTabBar({ state, descriptors, navigation, iconos = {} }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.contenedor, { bottom: Math.max(insets.bottom, MARGEN_INFERIOR) }]}
    >
      <View style={styles.barra} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const enfocada = state.index === index;
          const { options } = descriptors[route.key];
          const etiqueta =
            typeof options.tabBarLabel === "string" ? options.tabBarLabel : route.name;
          const color = enfocada ? colors.primary : colors.textMuted;

          const alPresionar = () => {
            const evento = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!enfocada && !evento.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const alMantener = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: enfocada }}
              accessibilityLabel={etiqueta}
              onPress={alPresionar}
              onLongPress={alMantener}
              style={styles.item}
              testID={`tab-${route.name}`}
            >
              <View style={[styles.burbuja, enfocada && styles.burbujaActiva]}>
                <Feather color={color} name={iconos[route.name] ?? "circle"} size={enfocada ? 23 : 22} />
              </View>
              <Text numberOfLines={1} style={[styles.etiqueta, { color }]}>
                {etiqueta}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
  },
  barra: {
    width: "100%",
    maxWidth: ANCHO_MAXIMO,
    height: ALTO_BARRA_TABS,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  burbuja: {
    width: 44,
    height: 30,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  burbujaActiva: {
    backgroundColor: "rgba(30, 62, 123, 0.12)",
  },
  etiqueta: {
    ...textStyles.nav,
    marginTop: 2,
  },
});