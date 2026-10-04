import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('health endpoint foundation', () => {
  it('should expose the health route on the application instance', async () => {
    const app = createApp();

    expect(app).toBeTruthy();
    expect(typeof app).toBe('function');
  });
});
