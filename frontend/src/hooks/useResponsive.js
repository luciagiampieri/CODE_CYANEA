import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

import { layout } from "../theme/tokens";

export default function useResponsive() {
  const { width } = useWindowDimensions();

  return useMemo(
    () => ({
      width,
      isTablet: width >= layout.tablet,
      isDesktop: width >= layout.desktop,
      contentWidth: Math.min(width - 24, layout.maxContentWidth)
    }),
    [width]
  );
}
