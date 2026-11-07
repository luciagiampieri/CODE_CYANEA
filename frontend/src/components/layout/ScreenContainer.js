import { useContext } from "react";
import { StyleSheet, View } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";

import useResponsive from "../../hooks/useResponsive";
import { colors, layout, spacing } from "../../theme/tokens";

const BORDES_EN_TABS = ["top", "left", "right"];

export default function ScreenContainer({
  children,
  padded = true,
  fullWidth = false,
  contentStyle,
  style,
  edges,
}) {
  const { contentWidth } = useResponsive();
  const enTabs = useContext(BottomTabBarHeightContext) !== undefined;

  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={edges ?? (enTabs ? BORDES_EN_TABS : undefined)}>
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