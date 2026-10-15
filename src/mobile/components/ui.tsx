import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../constants/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function PrimaryButton({ label, onPress, loading, disabled, icon, style, textStyle }: ButtonProps) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.btn, styles.btnPrimary, off && styles.btnOff, style]}
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
          <Text style={[styles.btnLabel, styles.btnPrimaryLabel, textStyle]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, onPress, loading, disabled, icon, style, textStyle }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.btn, styles.btnSecondary, disabled && styles.btnOff, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.ink} /> : null}
      <Text style={[styles.btnLabel, styles.btnSecondaryLabel, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DangerButton({ label, onPress, loading, disabled, icon, style }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.btn, styles.btnDanger, disabled && styles.btnOff, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.danger} /> : null}
      <Text style={[styles.btnLabel, styles.btnDangerLabel]}>{label}</Text>
    </TouchableOpacity>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function Field({ label, error, style, ...props }: FieldProps & { style?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.field, props.multiline && styles.fieldMultiline, focused && styles.fieldFocused, error ? styles.fieldError : null]}
        placeholderTextColor={colors.inkFaint}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        {...props}
      />
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

export function SelectField({
  label,
  value,
  onPress,
  icon = 'folder',
  style,
}: {
  label: string;
  value: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.selectField} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.selectIcon}>
          <Ionicons name={icon} size={14} color={colors.sage} />
        </View>
        <Text style={styles.selectText} numberOfLines={1}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkMuted} />
      </TouchableOpacity>
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  size = 20,
  color = colors.inkSoft,
  style,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity style={[styles.iconBtn, style]} onPress={onPress} activeOpacity={0.7} hitSlop={8}>
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'premium' | 'terra' | 'sage' | 'danger';
}) {
  const tones = {
    neutral: { bg: colors.creamDeep, fg: colors.inkSoft },
    premium: { bg: colors.amberTint, fg: colors.amberText },
    terra: { bg: colors.terraTint, fg: colors.terraDark },
    sage: { bg: colors.sageTint, fg: colors.sage },
    danger: { bg: colors.dangerTint, fg: colors.danger },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: tones.bg }]}>
      <Text style={[styles.pillText, { color: tones.fg }]}>{label}</Text>
    </View>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[ty.eyebrow, styles.sectionLabel, style]}>{children}</Text>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.terra} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.wordmarkText, { fontSize: size }]}>
        Book<Text style={styles.wordmarkAccent}>Marx</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.card,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  btnOff: { opacity: 0.55 },
  btnPrimary: { backgroundColor: colors.terra },
  btnPrimaryLabel: { color: '#fff', fontFamily: fonts.semibold, fontSize: 16 },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  btnSecondaryLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16 },
  btnDanger: {
    backgroundColor: colors.dangerTint,
  },
  btnDangerLabel: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 16 },
  btnLabel: {},
  fieldLabel: { ...ty.captionMedium, color: colors.inkSoft, marginBottom: spacing.xs + 2 },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  fieldMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  fieldFocused: {
    borderColor: colors.terra,
  },
  fieldError: { borderColor: colors.danger },
  fieldErrorText: { ...ty.caption, color: colors.danger, marginTop: spacing.xs },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    gap: spacing.sm,
  },
  selectIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.sageTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectText: {
    flex: 1,
    ...ty.body,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 11 },
  sectionLabel: { marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.borderLight },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl * 2 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...ty.heading, marginBottom: spacing.xs },
  emptyHint: { ...ty.small, color: colors.inkMuted, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  wordmark: { alignItems: 'center' },
  wordmarkText: { fontFamily: fonts.display, letterSpacing: -1, color: colors.ink },
  wordmarkAccent: { fontFamily: fonts.displayItalic, color: colors.terra },
});
