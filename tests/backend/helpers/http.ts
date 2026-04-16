export function makeJsonRequest(url: string, init?: RequestInit): Request {
    return new Request(url, {
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
        ...init,
    });
}

export async function readJson(response: Response) {
    return response.json();
}
