import { SafeAreaView, StyleSheet, View } from "react-native";

import useResponsive from "../../hooks/useResponsive";
import { colors, layout, spacing } from "../../theme/tokens";

export default function ScreenContainer({
  children,
  padded = true,
  fullWidth = false,
  contentStyle,
  style,
}) {
  const { contentWidth } = useResponsive();

  return (
    <SafeAreaView style={[styles.safeArea, style]}>
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
