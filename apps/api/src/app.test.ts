import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('API', () => {
  it('registers the health endpoint', () => {
    const app = createApp();
    expect(app.router.stack.some((layer) => layer.route?.path === '/health')).toBe(true);
  });
});
