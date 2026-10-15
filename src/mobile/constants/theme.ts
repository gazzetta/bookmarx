export const colors = {
  cream: '#FBF8F3',
  creamDeep: '#F5F0E8',
  surface: '#FFFFFF',

  ink: '#1A1A1A',
  inkSoft: '#4A4A4A',
  inkMuted: '#8B8B8B',
  inkFaint: '#B0B0B0',

  terra: '#D4634A',
  terraDark: '#B84A33',
  terraLight: '#E8795C',
  terraTint: '#FCE4DD',
  terraWash: '#FEF3F0',

  sage: '#5A7A5A',
  sageTint: '#E4EBE4',

  amber: '#D4A036',
  amberTint: '#FEF3C7',
  amberText: '#B45309',

  danger: '#C4453A',
  dangerTint: '#FBEAE7',

  border: '#E8E4DE',
  borderLight: '#F0ECE5',
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_500Medium_Italic',
  body: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const shadow = {
  card: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  lifted: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
  fab: {
    shadowColor: '#B84A33',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 7,
  },
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.8, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, color: colors.ink },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.inkMuted,
  },
  accent: { fontFamily: fonts.displayItalic, fontSize: 15, color: colors.terra },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  bodySemibold: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  captionMedium: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
} as const;
