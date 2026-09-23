import { memo, useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { garb } from '../deck/palette';
import { encodeQr, qrPath } from './qr';

/**
 * A QR code, drawn: dark modules on the deck's cream with the standard's
 * four-module quiet zone, which readers need to find the code at all. Ink on
 * cream rather than pure black on white, and still well past what a phone's
 * camera needs (decoded from a screenshot of this very drawing).
 */
export const QrCode = memo(function QrCode({ text, size, label }: { text: string; size: number; label: string }) {
  const qr = useMemo(() => encodeQr(text, 'M'), [text]);
  const d = useMemo(() => (qr ? qrPath(qr) : ''), [qr]);
  if (!qr) return null;
  const n = qr.size + 8;
  // A whole number of points per module: adjacent rows are separate runs, and
  // at a fractional scale their shared edges antialias into faint seams.
  const side = Math.max(n, Math.floor(size / n) * n);
  return (
    <Svg width={side} height={side} viewBox={`0 0 ${n} ${n}`} accessibilityRole="image" accessibilityLabel={label}>
      <Rect x={0} y={0} width={n} height={n} fill={garb.cream} />
      <Path d={d} fill={garb.ink} />
    </Svg>
  );
});
