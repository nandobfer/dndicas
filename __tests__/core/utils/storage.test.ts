/**
 * Teste exemplo para o storage utility
 */

import { storage } from '@/core/utils/storage';

describe('Storage Utility', () => {
  beforeEach(() => {
    // Limpa o storage antes de cada teste
    localStorage.clear();
  });

  describe('set and get', () => {
    it('should store and retrieve a string value', () => {
      storage.set('testKey', 'testValue');
      const value = storage.get<string>('testKey');
      expect(value).toBe('testValue');
    });

    it('should store and retrieve an object', () => {
      const testObject = { name: 'Test', age: 25 };
      storage.set('testObject', testObject);
      const value = storage.get<typeof testObject>('testObject');
      expect(value).toEqual(testObject);
    });

    it('should return default value when key does not exist', () => {
      const value = storage.get('nonexistent', 'default');
      expect(value).toBe('default');
    });
  });

  describe('remove', () => {
    it('should remove a stored value', () => {
      storage.set('testKey', 'testValue');
      storage.remove('testKey');
      const value = storage.get('testKey');
      expect(value).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      storage.set('testKey', 'value');
      expect(storage.has('testKey')).toBe(true);
    });

    it('should return false for non-existing key', () => {
      expect(storage.has('nonexistent')).toBe(false);
    });
  });

  describe('keys', () => {
    it('should return all storage keys', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('clear', () => {
    it('should clear all app storage', () => {
      storage.set('key1', 'value1');
      storage.set('key2', 'value2');
      storage.clear();
      expect(storage.keys()).toHaveLength(0);
    });
  });
});
