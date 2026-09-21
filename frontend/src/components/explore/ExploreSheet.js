import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { colors, layout, radii, shadows, spacing } from "../../theme/tokens";

export const SIDE_PANEL_WIDTH = 400;
export const SNAP_ORDER = ["peek", "half", "full"];

const PEEK_HEIGHT = 148;
// Espacio que el sheet deja libre arriba en "full" para que se sigan viendo buscador y chips.
export const TOP_RESERVED = 124;

export function useIsSidePanel() {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= layout.tablet;
}

// containerHeight: alto real de la pantalla (sin safe area). Si todavía no se midió, usamos la ventana.
export function useSheetHeights(containerHeight) {
  const { height: windowHeight } = useWindowDimensions();
  const height = containerHeight || windowHeight;
  return useMemo(
    () => ({
      peek: PEEK_HEIGHT,
      half: Math.round(height * 0.46),
      full: Math.max(Math.round(height * 0.5), height - TOP_RESERVED),
    }),
    [height]
  );
}

function springTo(value, toValue) {
  return Animated.spring(value, {
    toValue,
    useNativeDriver: false,
    bounciness: 0,
    speed: 16,
  });
}

/**
 * Un único contenedor para todo lo que acompaña al mapa.
 * - Mobile (y web angosta): bottom sheet con tres alturas (peek / half / full).
 * - Web ancha: panel lateral fijo a la izquierda.
 */
export default function ExploreSheet({ snap, onSnapChange, header, children, scrollKey, containerHeight }) {
  const isSidePanel = useIsSidePanel();
  const heights = useSheetHeights(containerHeight);
  const scrollRef = useRef(null);

  const animatedHeight = useRef(new Animated.Value(heights[snap])).current;
  const currentHeight = useRef(heights[snap]);
  const dragStartHeight = useRef(heights[snap]);
  const heightsRef = useRef(heights);
  const onSnapChangeRef = useRef(onSnapChange);
  heightsRef.current = heights;
  onSnapChangeRef.current = onSnapChange;

  useEffect(() => {
    const id = animatedHeight.addListener(({ value }) => {
      currentHeight.current = value;
    });
    return () => animatedHeight.removeListener(id);
  }, [animatedHeight]);

  useEffect(() => {
    if (isSidePanel) return;
    springTo(animatedHeight, heights[snap]).start();
  }, [animatedHeight, heights, isSidePanel, snap]);

  // Cuando cambia el contenido (otra lista, otro lugar) volvemos arriba.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [scrollKey]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        animatedHeight.stopAnimation();
        dragStartHeight.current = currentHeight.current;
      },
      onPanResponderMove: (_, gesture) => {
        const { peek, full } = heightsRef.current;
        const next = Math.min(full, Math.max(peek, dragStartHeight.current - gesture.dy));
        animatedHeight.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => settle(gesture),
      onPanResponderTerminate: (_, gesture) => settle(gesture),
    })
  ).current;

  function settle(gesture) {
    const snaps = heightsRef.current;
    // Proyectamos con la velocidad para que un "flick" corto igual cambie de altura.
    const projected = dragStartHeight.current - gesture.dy - gesture.vy * 140;
    const target = SNAP_ORDER.reduce((best, key) =>
      Math.abs(snaps[key] - projected) < Math.abs(snaps[best] - projected) ? key : best
    );
    springTo(animatedHeight, snaps[target]).start();
    onSnapChangeRef.current?.(target);
  }

  function handleHandlePress() {
    const next = snap === "full" ? "half" : snap === "half" ? "full" : "half";
    onSnapChange?.(next);
  }

  if (isSidePanel) {
    return (
      <View style={styles.sidePanel}>
        <View style={styles.sideHeader}>{header}</View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.sheet, { height: animatedHeight }]}>
      <View {...panResponder.panHandlers} style={styles.dragArea}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={snap === "full" ? "Achicar panel" : "Expandir panel"}
          hitSlop={10}
          onPress={handleHandlePress}
          style={styles.handleHit}
        >
          <View style={styles.handle} />
        </Pressable>
        {header}
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={snap !== "peek"}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    ...shadows.floating,
    shadowOffset: { width: 0, height: -6 },
    overflow: Platform.OS === "web" ? "hidden" : "visible",
  },
  dragArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    ...Platform.select({ web: { cursor: "grab" }, default: {} }),
  },
  handleHit: {
    alignSelf: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  sidePanel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDE_PANEL_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: TOP_RESERVED,
    ...shadows.floating,
  },
  sideHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
});
