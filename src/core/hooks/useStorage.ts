"use client";

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/core/utils/storage';

/**
 * Hook para gerenciar estado sincronizado com localStorage
 * Similar ao useState, mas persiste o valor no localStorage
 *
 * @param key - Chave para armazenar no localStorage
 * @param initialValue - Valor inicial caso não exista no storage
 * @returns [value, setValue, removeValue]
 *
 * @example
 * ```tsx
 * const [theme, setTheme, removeTheme] = useStorage('theme', 'light');
 *
 * return (
 *   <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
 *     Toggle Theme
 *   </button>
 * );
 * ```
 */
export function useStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T) => void, () => void] {
  // Estado para armazenar o valor
  const [storedValue, setStoredValue] = useState<T>(() => {
    const value = storage.get<T>(key, initialValue);
    return value ?? initialValue;
  });

  // Função para atualizar o valor
  const setValue = useCallback(
    (value: T) => {
      try {
        // Salva no estado
        setStoredValue(value);
        // Salva no localStorage
        storage.set(key, value);
      } catch (error) {
        console.error(`Error setting storage value for key "${key}":`, error);
      }
    },
    [key]
  );

  // Função para remover o valor
  const removeValue = useCallback(() => {
    try {
      storage.remove(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.error(`Error removing storage value for key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Efeito para sincronizar com mudanças no storage de outras abas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `dnd_${key}` && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          setStoredValue(e.newValue as unknown as T);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook para gerenciar múltiplos valores no localStorage
 *
 * @param keys - Array de chaves para gerenciar
 * @returns Objeto com valores e funções de controle
 *
 * @example
 * ```tsx
 * const storage = useMultiStorage(['theme', 'language']);
 *
 * storage.set('theme', 'dark');
 * const theme = storage.get('theme');
 * storage.remove('language');
 * ```
 */
export function useMultiStorage(keys: string[]) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    keys.forEach((key) => {
      initial[key] = storage.get(key);
    });
    return initial;
  });

  const get = useCallback(
    <T>(key: string, defaultValue: T | null = null): T | null => {
      return values[key] !== undefined ? values[key] : defaultValue;
    },
    [values]
  );

  const set = useCallback((key: string, value: any) => {
    storage.set(key, value);
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const remove = useCallback((key: string) => {
    storage.remove(key);
    setValues((prev) => {
      const newValues = { ...prev };
      delete newValues[key];
      return newValues;
    });
  }, []);

  const clear = useCallback(() => {
    keys.forEach((key) => storage.remove(key));
    setValues({});
  }, [keys]);

  return {
    values,
    get,
    set,
    remove,
    clear,
  };
}
