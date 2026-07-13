import { describe, expect, it } from "vitest"
import { buildOpenCodeRunCommand, isRecoverableOpenCodeTransportError, parseOpenCodeModels, parseOpenCodeRunOutput, parseOpenCodeSessionExport, parseOpenCodeStreamLine } from "@/features/feedback/services/opencode/opencode-cli-service"

describe("parseOpenCodeModels", () => {
    it("extrai modelos no formato provider/model", () => {
        const models = parseOpenCodeModels(`
Provider      Model
anthropic     anthropic/claude-sonnet-4-5
openai        openai/gpt-5.1
google        google/gemini-3-pro
`)

        expect(models).toEqual([
            { id: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", provider: "anthropic" },
            { id: "openai/gpt-5.1", label: "openai/gpt-5.1", provider: "openai" },
            { id: "google/gemini-3-pro", label: "google/gemini-3-pro", provider: "google" },
        ])
    })

    it("remove duplicados e ignora linhas vazias", () => {
        const models = parseOpenCodeModels(`

anthropic/claude-sonnet-4-5
anthropic/claude-sonnet-4-5
openai/gpt-5.1
`)

        expect(models.map((model) => model.id)).toEqual(["anthropic/claude-sonnet-4-5", "openai/gpt-5.1"])
    })
})

describe("parseOpenCodeRunOutput", () => {
    it("extrai sessão e texto de eventos JSON", () => {
        const output = [
            JSON.stringify({ type: "step_start", sessionID: "ses_123", part: { type: "step-start", sessionID: "ses_123" } }),
            JSON.stringify({ message: "Primeira parte" }),
            JSON.stringify({ type: "text", part: { type: "text", text: "Segunda parte" } }),
        ].join("\n")

        expect(parseOpenCodeRunOutput(output)).toEqual({
            sessionId: "ses_123",
            text: "Primeira parte\nSegunda parte",
        })
    })
})

describe("parseOpenCodeStreamLine", () => {
    it("extrai sessão e texto humano de eventos text", () => {
        expect(parseOpenCodeStreamLine(JSON.stringify({
            type: "text",
            sessionID: "ses_abc",
            part: { type: "text", text: "Progresso legível" },
        }))).toEqual({
            kind: "text",
            sessionId: "ses_abc",
            text: "Progresso legível",
            summary: "Progresso legível",
        })
    })

    it("resume tool_use sem incluir output bruto", () => {
        expect(parseOpenCodeStreamLine(JSON.stringify({
            type: "tool_use",
            sessionID: "ses_abc",
            part: {
                type: "tool",
                tool: "glob",
                state: {
                    input: { pattern: "**/*", path: "/home/burgos/code/dndicas/dev" },
                    output: "conteúdo muito grande",
                },
            },
        }))).toEqual({
            kind: "tool",
            sessionId: "ses_abc",
            summary: "Executou glob (pattern: **/*, path: /home/burgos/code/dndicas/dev).",
        })
    })

    it("resume páginas de erro do Cloudflare", () => {
        expect(parseOpenCodeStreamLine('<div id="cf-error-details">erro</div>')).toEqual({
            kind: "error",
            summary: "OpenCode retornou uma página de erro do Cloudflare/proxy.",
        })
    })
})

describe("buildOpenCodeRunCommand", () => {
    it("inclui title ao criar nova sessão", () => {
        const command = buildOpenCodeRunCommand({
            prompt: "gere um plano",
            model: "openai/gpt-5.5",
            dir: "/home/burgos/code/dndicas/dev",
            title: "Feedback abc123: melhorar dashboard",
        })

        expect(command).toContain("--title 'Feedback abc123: melhorar dashboard'")
        expect(command).not.toContain("--session")
    })

    it("não inclui title quando continua sessão existente", () => {
        const command = buildOpenCodeRunCommand({
            prompt: "continue",
            model: "openai/gpt-5.5",
            sessionId: "ses_123",
            title: "Feedback abc123: melhorar dashboard",
        })

        expect(command).toContain("--session 'ses_123'")
        expect(command).not.toContain("--title")
    })
})

describe("isRecoverableOpenCodeTransportError", () => {
    it("classifica erro de Cloudflare/proxy como recuperável", () => {
        expect(isRecoverableOpenCodeTransportError(new Error("OpenCode retornou uma página de erro do Cloudflare/proxy."))).toBe(true)
    })

    it("não classifica erro funcional comum como recuperável", () => {
        expect(isRecoverableOpenCodeTransportError(new Error("OpenCode terminou sem alterações no worktree"))).toBe(false)
    })
})

describe("parseOpenCodeSessionExport", () => {
    it("prioriza a última resposta com heading de plano", () => {
        const output = JSON.stringify({
            messages: [
                { role: "assistant", parts: [{ text: "Texto intermediário com tamanho suficiente para ser candidato, mas sem plano final." }] },
                { role: "assistant", parts: [{ text: "## Plano De Implementação\n\n1. Fazer a mudança.\n2. Testar o fluxo." }] },
            ],
        })

        expect(parseOpenCodeSessionExport(output)).toEqual({
            text: "## Plano De Implementação\n\n1. Fazer a mudança.\n2. Testar o fluxo.",
        })
    })
})
