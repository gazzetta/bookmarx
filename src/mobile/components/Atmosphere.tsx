import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The website's ambient backdrop, ported to native: a warm cream base with a
 * soft terra glow off the top-right corner and a fainter sage wash rising
 * from the bottom-left — the same radial washes used by .hero-section on the
 * site. Rendered once, absolutely positioned, and never interactive.
 * `subtle` halves the glow for content-dense screens.
 */
export function Atmosphere({ subtle = false }: { subtle?: boolean }) {
  const terraPeak = subtle ? 0.045 : 0.075;
  const sagePeak = subtle ? 0.03 : 0.05;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="terraGlow" cx="100%" cy="0%" r="80%">
          <Stop offset="0" stopColor="#D4634A" stopOpacity={terraPeak} />
          <Stop offset="0.55" stopColor="#D4634A" stopOpacity={terraPeak * 0.4} />
          <Stop offset="1" stopColor="#D4634A" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sageGlow" cx="0%" cy="100%" r="75%">
          <Stop offset="0" stopColor="#5A7A5A" stopOpacity={sagePeak} />
          <Stop offset="0.55" stopColor="#5A7A5A" stopOpacity={sagePeak * 0.4} />
          <Stop offset="1" stopColor="#5A7A5A" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#terraGlow)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#sageGlow)" />
    </Svg>
  );
}
