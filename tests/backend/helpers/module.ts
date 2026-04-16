import { vi } from 'vitest';

export async function importFresh<T>(path: string): Promise<T> {
    vi.resetModules();
    return import(path) as Promise<T>;
}
