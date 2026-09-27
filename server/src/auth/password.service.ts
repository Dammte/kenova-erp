import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id with OWASP's recommended minimum (m=19 MiB, t=2, p=1).
 * The PHC string stores the parameters, so they can be raised later and old
 * hashes are upgraded on the next successful login (needsRehash).
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /** Used to spend the same time when the account does not exist. */
  private dummyHash: Promise<string> = argon2.hash(
    'dummy-password-for-timing',
    OPTIONS,
  );

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(
    hash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
