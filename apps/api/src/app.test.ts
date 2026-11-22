import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { buildEmployeeLoginUrl } from './domain/auth/employee-invitation.js';
import { buildPasswordRecoveryLink } from './domain/auth/organization-access.js';

describe('API', () => {
  const originalWebOrigin = process.env.WEB_ORIGIN;
  const originalPasswordResetRedirectUrl = process.env.PASSWORD_RESET_REDIRECT_URL;

  afterEach(() => {
    if (originalWebOrigin === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = originalWebOrigin;
    }
    if (originalPasswordResetRedirectUrl === undefined) {
      delete process.env.PASSWORD_RESET_REDIRECT_URL;
    } else {
      process.env.PASSWORD_RESET_REDIRECT_URL = originalPasswordResetRedirectUrl;
    }
  });

  it('registers the health endpoint', () => {
    const app = createApp();
    expect(app.router.stack.some((layer) => layer.route?.path === '/health')).toBe(true);
  });

  it('does not expose account existence in password recovery responses', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const response = await fetch(`${baseUrl}/auth/organizations/password-recovery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'denied', emailSent: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns the browser origin in CORS headers when WEB_ORIGIN includes a path', async () => {
    process.env.WEB_ORIGIN = 'https://JoaquinCarollo.github.io/WorkflowPlus/';
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    const browserOrigin = 'https://joaquincarollo.github.io';

    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { origin: browserOrigin },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(browserOrigin);

      const preflight = await fetch(`${baseUrl}/health`, {
        method: 'OPTIONS',
        headers: {
          origin: browserOrigin,
          'access-control-request-method': 'GET',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(browserOrigin);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('keeps the deployed app path in email links', () => {
    process.env.WEB_ORIGIN = 'https://JoaquinCarollo.github.io/WorkflowPlus/';
    delete process.env.PASSWORD_RESET_REDIRECT_URL;

    expect(buildEmployeeLoginUrl()).toBe(
      'https://JoaquinCarollo.github.io/WorkflowPlus/?page=login&role=employee',
    );
    expect(buildPasswordRecoveryLink('token')).toBe(
      'https://JoaquinCarollo.github.io/WorkflowPlus/?token=token',
    );
  });

  it('rejects a WEB_ORIGIN without a protocol', () => {
    process.env.WEB_ORIGIN = 'joaquincarollo.github.io/WorkflowPlus/';
    expect(() => createApp()).toThrow('WEB_ORIGIN must be an absolute URL');
  });
});
