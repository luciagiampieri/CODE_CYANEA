import { Platform } from "react-native";

export const colors = {
  primary: "#1e3e7b",
  primaryStrong: "#183464",
  primarySoft: "#31579f",
  accent: "#ffec80",
  accentStrong: "#f4d957",
  accentMuted: "#f7f0c4",
  backgroundCanvas: "#264888",
  background: "#f7f2e8",
  surface: "#ffffff",
  surfaceMuted: "#fbf7ef",
  surfaceAlt: "#f2ede2",
  textPrimary: "#19396f",
  textSecondary: "#5c6582",
  textMuted: "#97a0b6",
  textInverse: "#ffffff",
  border: "#dbe2ef",
  borderStrong: "#c8d4ea",
  success: "#2f8f63",
  successSurface: "#dcf7df",
  warning: "#b97b12",
  warningSurface: "#fff4c6",
  danger: "#c84949",
  dangerSurface: "#fff0ef",
  overlay: "rgba(10, 22, 48, 0.42)",
  overlayStrong: "rgba(10, 22, 48, 0.7)",
  shadow: "#102955",
  iconSurface: "rgba(255,255,255,0.16)",
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
  xxxl: 48,
};

export const radii = {
  xs: 10,
  sm: 14,
  md: 20,
  lg: 28,
  xl: 36,
  pill: 999,
};

export const fontFamilies = {
  sans: Platform.select({
    ios: "System",
    android: "sans-serif",
    web: '"Montserrat", "Segoe UI", sans-serif',
    default: "sans-serif",
  }),
  serif: Platform.select({
    ios: "Georgia",
    android: "serif",
    web: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    default: "serif",
  }),
};

export const typography = {
  hero: 38,
  title: 32,
  heading: 24,
  subheading: 20,
  body: 16,
  small: 14,
  micro: 12,
  tiny: 11,
};

export const textStyles = {
  brandTitle: {
    fontFamily: fontFamilies.serif,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontFamily: fontFamilies.serif,
    fontSize: typography.hero,
    fontWeight: "700",
    lineHeight: 44,
  },
  screenTitle: {
    fontFamily: fontFamilies.serif,
    fontSize: typography.title,
    fontWeight: "700",
    lineHeight: 38,
  },
  tripTitle: {
    fontFamily: fontFamilies.serif,
    fontSize: typography.heading,
    fontWeight: "700",
    lineHeight: 30,
  },
  kpiValue: {
    fontFamily: fontFamilies.serif,
    fontSize: 22,
    fontWeight: "700",
  },
  sectionLabel: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.small,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.body,
    fontWeight: "500",
  },
  bodyStrong: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.body,
    fontWeight: "700",
  },
  meta: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.small,
    fontWeight: "500",
  },
  label: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.micro,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  button: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.body,
    fontWeight: "700",
  },
  nav: {
    fontFamily: fontFamilies.sans,
    fontSize: typography.micro,
    fontWeight: "600",
  },
};

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  floating: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};

export const layout = {
  maxContentWidth: 1200,
  mobile: 480,
  tablet: 768,
  desktop: 1100,
};

export const surfaces = {
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    ...shadows.card,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
};
