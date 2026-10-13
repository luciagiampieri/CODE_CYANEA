import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import useResponsive from "../../hooks/useResponsive";
import { colors, layout, spacing } from "../../theme/tokens";

export default function ScreenContainer({
  children,
  padded = true,
  fullWidth = false,
  contentStyle,
  style,
  // Bordes donde se respeta el área segura. Los buscadores a pantalla completa
  // omiten "top" porque su encabezado azul ya cubre la barra de estado.
  edges,
}) {
  const { contentWidth } = useResponsive();

  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={edges}>
      <View style={styles.outer}>
        <View
          style={[
            styles.content,
            padded && styles.padded,
            fullWidth
              ? styles.fullWidthContent
              : { width: contentWidth, maxWidth: layout.maxContentWidth },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundCanvas,
  },
  outer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  content: {
    flex: 1,
    width: "100%",
  },
  fullWidthContent: {
    width: "100%",
    maxWidth: "100%",
  },
  padded: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
