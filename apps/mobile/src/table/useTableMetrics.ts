import { useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeTableMetrics, type TableMetrics } from './metrics';

export type { TableMetrics } from './metrics';

/**
 * How wide the app is allowed to be.
 *
 * Native gets the whole screen. The web build lives in a centred column, so
 * every dimension below must be taken from THAT box — measure the browser
 * window instead and the fan sizes itself for 1440px and spills straight out of
 * a 960px column. `WebShell` draws the box from this same function, so the two
 * cannot disagree.
 */
export function shellWidth(width: number, height: number): number {
  if (Platform.OS !== 'web') return width;
  const box = width > height ? Math.min(960, Math.round(height * 1.9)) : 480;
  return Math.min(width, box);
}

/**
 * The window half of the table's dimensions: the usable box, insets already
 * subtracted, fed to `computeTableMetrics`. See that file for what comes out.
 */
export function useTableMetrics(): TableMetrics {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const usableW = Math.max(240, shellWidth(width, height) - insets.left - insets.right);
  const usableH = Math.max(240, height - insets.top - insets.bottom);

  return useMemo(() => computeTableMetrics(usableW, usableH), [usableW, usableH]);
}
