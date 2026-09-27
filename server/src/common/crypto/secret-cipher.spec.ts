import { randomBytes } from 'crypto';
import { SecretCipher } from './secret-cipher';

describe('SecretCipher', () => {
  const key = randomBytes(32);
  const cipher = new SecretCipher('v1', key);

  it('round-trips a value bound to its row id', () => {
    const ct = cipher.encrypt('1234', 'device-a');
    expect(ct.startsWith('v1:')).toBe(true);
    expect(ct).not.toContain('1234');
    expect(cipher.decrypt(ct, 'device-a')).toBe('1234');
  });

  it('uses a fresh IV each time', () => {
    expect(cipher.encrypt('1-5-9', 'x')).not.toBe(cipher.encrypt('1-5-9', 'x'));
  });

  it('refuses a ciphertext moved to another row (AAD)', () => {
    const ct = cipher.encrypt('1234', 'device-a');
    expect(() => cipher.decrypt(ct, 'device-b')).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const [id, iv, tag, body] = cipher.encrypt('1234', 'd').split(':');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 1;
    expect(() =>
      cipher.decrypt(
        [id, iv, tag, flipped.toString('base64url')].join(':'),
        'd',
      ),
    ).toThrow();
  });

  it('refuses the wrong key', () => {
    const other = new SecretCipher('v1', randomBytes(32));
    expect(() => other.decrypt(cipher.encrypt('1234', 'd'), 'd')).toThrow();
  });

  it('decrypts values from an old key after rotation', () => {
    const ct = cipher.encrypt('9999', 'd');
    const rotated = new SecretCipher('v2', randomBytes(32), { v1: key });
    expect(rotated.decrypt(ct, 'd')).toBe('9999');
    expect(rotated.encrypt('9999', 'd').startsWith('v2:')).toBe(true);
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new SecretCipher('v1', randomBytes(16))).toThrow(/32 bytes/);
  });

  it('fromEnv requires DEVICE_SECRET_KEY', () => {
    expect(() => SecretCipher.fromEnv({} as NodeJS.ProcessEnv)).toThrow(
      /DEVICE_SECRET_KEY/,
    );
    const c = SecretCipher.fromEnv({
      DEVICE_SECRET_KEY: key.toString('base64'),
      DEVICE_SECRET_OLD_KEYS: `v0:${randomBytes(32).toString('base64')}`,
    } as NodeJS.ProcessEnv);
    expect(c.activeKeyId).toBe('v1');
  });
});
