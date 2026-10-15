/**
 * BookMarx mobile palette — a straight port of the website design system.
 * Dark is the default, matching the site's dark theme in globals.css:
 * ink #1A1A1A pages, #242424 surfaces, cream text, terra/sage accents.
 * The light palette is retained for a future theme toggle.
 */
export const lightColors = {
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

  scrim: 'rgba(26,26,26,0.45)',
  brandTile: '#1A1A1A',
  brandGlyph: '#FBF8F3',
} as const;

export const darkColors = {
  cream: '#1A1A1A',
  creamDeep: '#1E1E1E',
  surface: '#242424',

  ink: '#FBF8F3',
  inkSoft: 'rgba(255,255,255,0.72)',
  inkMuted: 'rgba(255,255,255,0.55)',
  inkFaint: 'rgba(255,255,255,0.4)',

  terra: '#D4634A',
  terraDark: '#E8795C',
  terraLight: '#E8795C',
  terraTint: 'rgba(212,99,74,0.25)',
  terraWash: 'rgba(212,99,74,0.12)',

  sage: '#8BA88B',
  sageTint: 'rgba(90,122,90,0.22)',

  amber: '#D4A036',
  amberTint: 'rgba(212,160,54,0.16)',
  amberText: '#E8B558',

  danger: '#E0655A',
  dangerTint: 'rgba(224,101,90,0.16)',

  border: 'rgba(255,255,255,0.12)',
  borderLight: 'rgba(255,255,255,0.07)',

  scrim: 'rgba(0,0,0,0.65)',
  brandTile: '#FBF8F3',
  brandGlyph: '#1A1A1A',
} as const;

export type Palette = typeof darkColors;

/** Active palette. Dark is the app default; swap to lightColors when a toggle lands. */
export const colors: Palette = darkColors;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayBlack: 'Fraunces_900Black',
  displayItalic: 'Fraunces_500Medium_Italic',
  body: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  black: 'Outfit_900Black',
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 3,
  },
  lifted: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 6,
  },
  fab: {
    shadowColor: '#B84A33',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 7,
  },
  /** The website's primary-button glow: 0 8px 30px -5px rgba(212,99,74,.35). */
  glow: {
    shadowColor: '#D4634A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const type = {
  hero: { fontFamily: fonts.displayBlack, fontSize: 34, letterSpacing: -0.8, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, color: colors.ink },
  /** Matches the site's `font-black uppercase tracking-[0.2em]` labels. */
  eyebrow: {
    fontFamily: fonts.black,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.inkMuted,
  },
  /** Site stat numbers use Outfit 900 (`font-black` on divs). */
  stat: { fontFamily: fonts.black, fontSize: 26, color: colors.ink },
  /** Site `text-[10px] font-black uppercase` badges. */
  badge: {
    fontFamily: fonts.black,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
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
