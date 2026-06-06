import * as React from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnWindowFocus: false,
            },
            mutations: {
                retry: false,
            },
        },
    })
}

export function renderWithQueryClient(ui: React.ReactElement, options?: RenderOptions) {
    const queryClient = createTestQueryClient()

    return render(ui, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        ),
        ...options,
    })
}
