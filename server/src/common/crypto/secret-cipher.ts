import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for small secrets (device unlock PIN / pattern).
 *
 * Stored format: `<keyId>:<iv b64url>:<tag b64url>:<ciphertext b64url>`.
 * The caller passes an `aad` (the device id) so a ciphertext copied onto a
 * different row fails authentication instead of revealing another device's code.
 *
 * Keys come from the environment, never from the database:
 *   DEVICE_SECRET_KEY      base64 of 32 random bytes (current key)
 *   DEVICE_SECRET_KEY_ID   label stored with each ciphertext (default "v1")
 *   DEVICE_SECRET_OLD_KEYS optional "id:base64,id:base64" for rotation (decrypt only)
 */
export class SecretCipher {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly currentKeyId: string,
    currentKey: Buffer,
    oldKeys: Record<string, Buffer> = {},
  ) {
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(currentKeyId)) {
      throw new Error('DEVICE_SECRET_KEY_ID must be 1-16 chars [A-Za-z0-9_-]');
    }
    SecretCipher.assertKey(currentKey, currentKeyId);
    for (const [id, key] of Object.entries(oldKeys)) {
      SecretCipher.assertKey(key, id);
      this.keys.set(id, key);
    }
    this.keys.set(currentKeyId, currentKey);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SecretCipher {
    const raw = env.DEVICE_SECRET_KEY;
    if (!raw) {
      throw new Error(
        'DEVICE_SECRET_KEY is not set. Generate one with: ' +
          `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    const oldKeys: Record<string, Buffer> = {};
    for (const entry of (env.DEVICE_SECRET_OLD_KEYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const idx = entry.indexOf(':');
      if (idx <= 0)
        throw new Error('DEVICE_SECRET_OLD_KEYS must be "id:base64,..."');
      oldKeys[entry.slice(0, idx)] = Buffer.from(
        entry.slice(idx + 1),
        'base64',
      );
    }
    return new SecretCipher(
      env.DEVICE_SECRET_KEY_ID || 'v1',
      Buffer.from(raw, 'base64'),
      oldKeys,
    );
  }

  private static assertKey(key: Buffer, id: string) {
    if (key.length !== 32) {
      throw new Error(
        `Device secret key "${id}" must decode to exactly 32 bytes`,
      );
    }
  }

  encrypt(plaintext: string, aad: string): string {
    const key = this.keys.get(this.currentKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      this.currentKeyId,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ct.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string, aad: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4) throw new Error('Malformed ciphertext');
    const [keyId, ivB64, tagB64, ctB64] = parts;
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown device secret key id "${keyId}"`);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  keyIdOf(payload: string): string {
    return payload.split(':')[0];
  }

  get activeKeyId(): string {
    return this.currentKeyId;
  }
}
