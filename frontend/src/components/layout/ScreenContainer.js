import { Platform, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import useResponsive from "../../hooks/useResponsive";
import { colors, layout, spacing } from "../../theme/tokens";

export default function ScreenContainer({ children, padded = true }) {
  const { contentWidth } = useResponsive();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          padded && { paddingHorizontal: spacing.md, paddingVertical: spacing.lg }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, { width: contentWidth, maxWidth: layout.maxContentWidth }]}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    alignItems: "center",
    paddingBottom: Platform.OS === "web" ? spacing.xxl : 110
  },
  content: {
    width: "100%"
  }
});
