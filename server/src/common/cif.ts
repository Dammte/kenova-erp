const CIF = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/;

/**
 * Spanish company tax id: organisation letter, 7 digits and a control digit
 * or letter (which one depends on the organisation type; both are accepted).
 */
export function isValidCif(value: string): boolean {
  const m = CIF.exec(value.trim().toUpperCase());
  if (!m) return false;
  const digits = m[2].split('').map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    if (i % 2 === 1) sum += d;
    else sum += Math.floor((d * 2) / 10) + ((d * 2) % 10);
  });
  const control = (10 - (sum % 10)) % 10;
  return m[3] === String(control) || m[3] === 'JABCDEFGHI'[control];
}
