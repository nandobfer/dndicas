import { NextRequest } from 'next/server';

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

export function makeRequest(url: string, init?: NextRequestInit): NextRequest {
    return new NextRequest(url, init);
}

export function makeJsonRequest(url: string, init?: NextRequestInit): NextRequest {
    return makeRequest(url, {
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
        ...init,
    });
}

export async function readJson<T>(response: Response): Promise<T> {
    return response.json() as Promise<T>;
}
