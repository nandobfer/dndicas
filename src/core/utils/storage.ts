/**
 * LocalStorage wrapper com type safety e prefixação automática
 */

const APP_PREFIX = 'dnd_';

/**
 * Verifica se está no ambiente de navegador
 */
const isBrowser = typeof window !== 'undefined';

/**
 * Adiciona prefixo à chave
 */
const getPrefixedKey = (key: string): string => `${APP_PREFIX}${key}`;

/**
 * Storage wrapper para localStorage
 */
export const storage = {
  /**
   * Obtém um item do localStorage
   * @param key - Chave do item (será prefixada automaticamente)
   * @param defaultValue - Valor padrão caso o item não exista
   * @returns O valor armazenado ou defaultValue
   */
  get: <T>(key: string, defaultValue: T | null = null): T | null => {
    if (!isBrowser) return defaultValue;

    try {
      const item = window.localStorage.getItem(getPrefixedKey(key));
      if (!item) return defaultValue;

      // Tenta fazer parse do JSON
      return JSON.parse(item) as T;
    } catch {
      // Se não for JSON válido, retorna como string
      const item = window.localStorage.getItem(getPrefixedKey(key));
      return (item as unknown as T) || defaultValue;
    }
  },

  /**
   * Define um item no localStorage
   * @param key - Chave do item (será prefixada automaticamente)
   * @param value - Valor a ser armazenado (será serializado automaticamente)
   */
  set: (key: string, value: any): void => {
    if (!isBrowser) return;

    try {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      window.localStorage.setItem(getPrefixedKey(key), stringValue);
    } catch (error) {
      console.error(`Error setting localStorage item "${key}":`, error);
    }
  },

  /**
   * Remove um item do localStorage
   * @param key - Chave do item (será prefixada automaticamente)
   */
  remove: (key: string): void => {
    if (!isBrowser) return;
    window.localStorage.removeItem(getPrefixedKey(key));
  },

  /**
   * Remove todos os itens do localStorage (apenas itens com prefixo da app)
   */
  clear: (): void => {
    if (!isBrowser) return;

    const keys = Object.keys(window.localStorage);
    keys.forEach((key) => {
      if (key.startsWith(APP_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    });
  },

  /**
   * Verifica se uma chave existe
   * @param key - Chave a verificar (será prefixada automaticamente)
   */
  has: (key: string): boolean => {
    if (!isBrowser) return false;
    return window.localStorage.getItem(getPrefixedKey(key)) !== null;
  },

  /**
   * Obtém todas as chaves da aplicação (apenas com prefixo)
   */
  keys: (): string[] => {
    if (!isBrowser) return [];

    const keys = Object.keys(window.localStorage);
    return keys
      .filter((key) => key.startsWith(APP_PREFIX))
      .map((key) => key.replace(APP_PREFIX, ''));
  },

  /**
   * Obtém o tamanho usado no localStorage (em bytes aproximados)
   */
  size: (): number => {
    if (!isBrowser) return 0;

    let size = 0;
    const keys = Object.keys(window.localStorage);

    keys.forEach((key) => {
      if (key.startsWith(APP_PREFIX)) {
        const item = window.localStorage.getItem(key);
        if (item) {
          size += key.length + item.length;
        }
      }
    });

    return size;
  },
};

/**
 * SessionStorage wrapper (mesmo comportamento do localStorage, mas sessão)
 */
export const sessionStorage = {
  get: <T>(key: string, defaultValue: T | null = null): T | null => {
    if (!isBrowser) return defaultValue;

    try {
      const item = window.sessionStorage.getItem(getPrefixedKey(key));
      if (!item) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      const item = window.sessionStorage.getItem(getPrefixedKey(key));
      return (item as unknown as T) || defaultValue;
    }
  },

  set: (key: string, value: any): void => {
    if (!isBrowser) return;

    try {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      window.sessionStorage.setItem(getPrefixedKey(key), stringValue);
    } catch (error) {
      console.error(`Error setting sessionStorage item "${key}":`, error);
    }
  },

  remove: (key: string): void => {
    if (!isBrowser) return;
    window.sessionStorage.removeItem(getPrefixedKey(key));
  },

  clear: (): void => {
    if (!isBrowser) return;

    const keys = Object.keys(window.sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith(APP_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    });
  },

  has: (key: string): boolean => {
    if (!isBrowser) return false;
    return window.sessionStorage.getItem(getPrefixedKey(key)) !== null;
  },

  keys: (): string[] => {
    if (!isBrowser) return [];

    const keys = Object.keys(window.sessionStorage);
    return keys
      .filter((key) => key.startsWith(APP_PREFIX))
      .map((key) => key.replace(APP_PREFIX, ''));
  },
};
