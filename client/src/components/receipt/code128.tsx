/**
 * Code 128 (set B) for the device label: the order number, read back by a
 * barcode scanner typing into the global search. Set B covers every printable
 * ASCII character, which is all an order code ("MP-0142") uses.
 */

/** Bar and space widths of each symbol value, in modules (each adds up to 11). */
export const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const START_B = 104;
const STOP = "2331112";

/** Symbol values: start B, the text, then the checksum (start + Σ value × position, mod 103). */
export function code128Values(text: string): number[] {
  const values = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Carácter no válido en el código de barras: ${ch}`);
    return code - 32;
  });
  const check = values.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...values, check];
}

/** Widths in modules, alternating bar and space, starting with a bar. */
export function code128Widths(text: string): number[] {
  const pattern = code128Values(text).map((v) => PATTERNS[v]).join("") + STOP;
  return [...pattern].map(Number);
}

/** The barcode as an SVG drawn in modules, with the quiet zones Code 128 needs. */
export function Code128({ value, height = 40, className }: { value: string; height?: number; className?: string }) {
  const QUIET = 10;
  const widths = code128Widths(value);
  const bars: { x: number; w: number }[] = [];
  let x = QUIET;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  const total = x + QUIET;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${total} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Código de barras ${value}`}
      shapeRendering="crispEdges"
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}
