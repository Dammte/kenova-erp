import { randomBytes } from 'crypto';

// Test-only configuration. Every test file gets its own throwaway database
// (see harness.ts); nothing here can point at a real environment.
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.DEVICE_SECRET_KEY = randomBytes(32).toString('base64');
process.env.DEVICE_SECRET_KEY_ID = 'v1';
process.env.DEVICE_SECRET_PURGE_DISABLED = 'true';
process.env.THROTTLE_DISABLED = process.env.THROTTLE_DISABLED ?? 'true';
process.env.DB_SSL = 'false';
delete process.env.DB_HOST;
delete process.env.DB_NAME;
