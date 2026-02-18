"use client";

import { useState, useCallback } from 'react';
import api from '@/core/utils/api';
import { ApiResponse, LoadingState } from '@/core/types';
import { AxiosError } from 'axios';

/**
 * Resultado de chamada de API
 */
interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  state: LoadingState;
  execute: (...args: any[]) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook para realizar chamadas de API com gerenciamento de estado
 *
 * @param apiFunction - Função que retorna uma Promise com a chamada de API
 * @returns Objeto com dados, erro, loading e função execute
 *
 * @example
 * ```tsx
 * const { data, error, loading, execute } = useApi(
 *   (id: string) => api.get(`/api/companies/${id}`)
 * );
 *
 * useEffect(() => {
 *   execute('123');
 * }, []);
 *
 * if (loading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error}</div>;
 * return <div>{data?.name}</div>;
 * ```
 */
export function useApi<T = any>(
  apiFunction: (...args: any[]) => Promise<any>
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadingState>('idle');

  const execute = useCallback(
    async (...args: any[]): Promise<T | null> => {
      try {
        setState('loading');
        setError(null);

        const response = await apiFunction(...args);

        // Se a resposta já é do tipo ApiResponse
        if (response.data?.success !== undefined) {
          const apiResponse = response.data as ApiResponse<T>;

          if (apiResponse.success) {
            setData(apiResponse.data || null);
            setState('success');
            return apiResponse.data || null;
          } else {
            setError(apiResponse.error || 'Unknown error');
            setState('error');
            return null;
          }
        }

        // Caso contrário, assume que response.data é o dado direto
        setData(response.data);
        setState('success');
        return response.data;
      } catch (err) {
        const axiosError = err as AxiosError<ApiResponse>;

        let errorMessage = 'An error occurred';

        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        } else if (axiosError.message) {
          errorMessage = axiosError.message;
        }

        setError(errorMessage);
        setState('error');
        return null;
      }
    },
    [apiFunction]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setState('idle');
  }, []);

  return {
    data,
    error,
    loading: state === 'loading',
    state,
    execute,
    reset,
  };
}

/**
 * Hook para realizar uma chamada de API GET automaticamente
 *
 * @param url - URL do endpoint
 * @param dependencies - Array de dependências para refetch
 *
 * @example
 * ```tsx
 * const { data, error, loading, refetch } = useFetch<Company[]>(
 *   '/api/companies',
 *   [page]
 * );
 * ```
 */
export function useFetch<T = any>(
  url: string,
  dependencies: any[] = []
): UseApiResult<T> & { refetch: () => void } {
  const apiCall = useCallback(() => api.get(url), [url]);
  const result = useApi<T>(apiCall);

  const refetch = useCallback(() => {
    result.execute();
  }, [result]);

  // Auto-execute on mount and when dependencies change
  React.useEffect(() => {
    result.execute();
  }, [url, ...dependencies]);

  return {
    ...result,
    refetch,
  };
}

// Import React for useEffect in useFetch
import React from 'react';

/**
 * Hook para realizar mutações (POST, PUT, DELETE)
 *
 * @param method - Método HTTP
 * @param url - URL do endpoint
 *
 * @example
 * ```tsx
 * const { mutate, loading, error } = useMutation('POST', '/api/companies');
 *
 * const handleSubmit = async (data) => {
 *   await mutate(data);
 * };
 * ```
 */
export function useMutation<TData = any, TResult = any>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string
): UseApiResult<TResult> & { mutate: (data?: TData) => Promise<TResult | null> } {
  const apiCall = useCallback(
    (data?: TData) => {
      switch (method) {
        case 'POST':
          return api.post(url, data);
        case 'PUT':
          return api.put(url, data);
        case 'PATCH':
          return api.patch(url, data);
        case 'DELETE':
          return api.delete(url, { data });
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    },
    [method, url]
  );

  const result = useApi<TResult>(apiCall);

  return {
    ...result,
    mutate: result.execute,
  };
}
