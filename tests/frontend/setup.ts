import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

function createMemoryStorage(): Storage {
    const store = new Map<string, string>();
    const storage = {
        get length() {
            return store.size;
        },
        clear() {
            Array.from(store.keys()).forEach((key) => {
                delete (storage as Record<string, unknown>)[key];
            });
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
            delete (storage as Record<string, unknown>)[key];
        },
        setItem(key: string, value: string) {
            store.set(key, value);
            Object.defineProperty(storage, key, {
                configurable: true,
                enumerable: true,
                value,
                writable: true,
            });
        },
    };

    return storage as Storage;
}

if (typeof window !== 'undefined' && typeof window.localStorage.clear !== 'function') {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();

    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: localStorage,
    });
    Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: sessionStorage,
    });
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: localStorage,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
        configurable: true,
        value: sessionStorage,
    });
}

afterEach(() => {
    if (typeof document !== 'undefined') {
        cleanup();
    }
});
