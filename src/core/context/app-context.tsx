"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AppState>({
        themeMode: "light",
        isSidebarOpen: true,
    });

    const setThemeMode = (themeMode: "light" | "dark") => {
        setState((prev) => ({ ...prev, themeMode }));
    };

    const toggleSidebar = () => {
        setState((prev) => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }));
    };

    return (
        <AppContext.Provider value={{ state, setThemeMode, toggleSidebar }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error("useAppContext must be used within an AppProvider");
    }
    return context;
}
