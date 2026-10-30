const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuunc';

/** Lowercases and drops accents, so "José" and "jose" match. Mirrors `foldSql`. */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** SQL counterpart of `fold` for a column expression. */
export function foldSql(expr: string): string {
  return `translate(lower(coalesce(${expr}, '')), '${ACCENTED}', '${PLAIN}')`;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** SQL that keeps only the digits of a column, for phones and IMEIs. */
export function digitsSql(expr: string): string {
  return `regexp_replace(coalesce(${expr}, ''), '\\D', '', 'g')`;
}

export interface LikeTerms {
  /** `%folded text%`, for LIKE against `foldSql` columns. */
  term: string;
  /**
   * `%digits%` when the text is a phone or IMEI (digits and separators only),
   * so "iPhone 13" does not match every phone with a 13 in it.
   */
  numeric: string | null;
}

/** LIKE patterns for what a person typed; null when it is too short to search. */
export function likeTerms(raw: string, minLength = 2): LikeTerms | null {
  const text = raw.trim().slice(0, 100);
  if (text.length < minLength) return null;
  const digits = text.replace(/\D/g, '');
  return {
    term: `%${escapeLike(fold(text))}%`,
    numeric:
      /^[+\d\s().-]+$/.test(text) && digits.length >= 3 ? `%${digits}%` : null,
  };
}
