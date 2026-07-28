export function jsonContent(data: Record<string, unknown>) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data,
    }
}

export function errorContent(error: string, code = "MCP_ERROR") {
    return jsonContent({ error, code })
}
