import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route out of authentication. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
