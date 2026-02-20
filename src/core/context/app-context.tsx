"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

interface AppState {
    themeMode: "light" | "dark";
    isSidebarOpen: boolean;
}

interface AppContextType {
    state: AppState;
    setThemeMode: (mode: "light" | "dark") => void;
    toggleSidebar: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Create a client outside the component to persist across renders
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
        },
    },
});

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AppState>({
        themeMode: "dark", // Changed to dark as default
        isSidebarOpen: true,
    })

    const setThemeMode = (themeMode: "light" | "dark") => {
        setState((prev) => ({ ...prev, themeMode }));
    };

    const toggleSidebar = () => {
        setState((prev) => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }));
    };

    return (
        <QueryClientProvider client={queryClient}>
            <AppContext.Provider value={{ state, setThemeMode, toggleSidebar }}>{children}</AppContext.Provider>
        </QueryClientProvider>
    )
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error("useAppContext must be used within an AppProvider");
    }
    return context;
}
