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

// Tudo abaixo vale só para os ambientes de DOM (`@vitest-environment happy-dom`/`jsdom`): os
// testes de node não pagam o grafo do Testing Library nem do Framer Motion.
if (typeof window !== 'undefined') {
    await import('@testing-library/jest-dom/vitest');
    const { cleanup } = await import('@testing-library/react');

    // O Framer Motion usa as animações nativas do happy-dom: quando um componente desmonta no
    // meio da animação, o cancelamento rejeita uma promise fora do teste ("AbortError: The
    // animation was canceled.") e o Vitest derruba o run inteiro. `skipAnimations` faz o motion
    // ir direto ao estado final, sem criar `Animation` do DOM — e deixa os testes de UI mais rápidos.
    // Só o `skipAnimations` não basta no framer-motion 12.40: valores sem estado inicial ainda viram
    // uma animação instantânea por WAAPI. Sem `Element.prototype.animate` o motion usa a animação
    // em JS, que não cria `Animation` do DOM nem rejeita promise no desmonte.
    const { MotionGlobalConfig } = await import('framer-motion');
    if (MotionGlobalConfig) MotionGlobalConfig.skipAnimations = true;
    if (Object.hasOwnProperty.call(window.Element.prototype, 'animate')) {
        delete (window.Element.prototype as Partial<Element>).animate;
    }

    installStoragePolyfill();
    installResizeObserverStub();

    afterEach(() => {
        cleanup();
    });
}

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

// Polyfill de localStorage/sessionStorage: o jsdom exige a flag --localstorage-file do Node para
// ter um storage funcional. Só substitui quando ausente ou incompleto.
function installStoragePolyfill() {
    const usable = (value: unknown): value is Storage =>
        typeof value === 'object' && value !== null && typeof (value as Storage).clear === 'function';
    let current: unknown;
    try {
        current = window.localStorage;
    } catch {
        current = undefined;
    }
    if (usable(current)) return;

    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    for (const target of [window, globalThis]) {
        Object.defineProperty(target, 'localStorage', { configurable: true, value: localStorage });
        Object.defineProperty(target, 'sessionStorage', { configurable: true, value: sessionStorage });
    }
}

// O DOM de teste pode não ter ResizeObserver; componentes Radix o usam para medir elementos.
function installResizeObserverStub() {
    if ('ResizeObserver' in window) return;
    class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: ResizeObserverStub });
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: ResizeObserverStub });
}
