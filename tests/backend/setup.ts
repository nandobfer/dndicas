import { afterEach, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});
