import { describe, expect, it } from "vitest"
import { PORTRAIT_HOVER_IDLE, portraitHoverElapsed, portraitHoverPointer, type PortraitHoverState } from "@/features/maddox/portrait-hover"

const opened: PortraitHoverState = { trigger: true, panel: false, open: true }

describe("popover do retrato no hover (DND-55)", () => {
    it("entrar no avatar agenda a abertura, que só vale com o ponteiro ainda presente", () => {
        const entered = portraitHoverPointer(PORTRAIT_HOVER_IDLE, "trigger", true)
        expect(entered.timer).toBe("open")
        expect(portraitHoverElapsed(entered.state, "open").open).toBe(true)

        const left = portraitHoverPointer(entered.state, "trigger", false)
        expect(left.timer).toBe("cancel")
        expect(portraitHoverElapsed(left.state, "open").open).toBe(false)
    })

    it("entrar no popover antes de sair do avatar não deixa fechamento pendente", () => {
        const inPanel = portraitHoverPointer(opened, "panel", true)
        expect(inPanel.timer).toBe("cancel")
        const leftTrigger = portraitHoverPointer(inPanel.state, "trigger", false)
        expect(leftTrigger.timer).toBeNull()
        expect(portraitHoverElapsed(leftTrigger.state, "close").open).toBe(true)
    })

    it("sair do avatar e entrar no popover dentro da tolerância cancela o fechamento", () => {
        const left = portraitHoverPointer(opened, "trigger", false)
        expect(left.timer).toBe("close")
        const inPanel = portraitHoverPointer(left.state, "panel", true)
        expect(inPanel.timer).toBe("cancel")
        expect(portraitHoverElapsed(inPanel.state, "close").open).toBe(true)
    })

    it("sair do popover (sem voltar ao avatar) agenda o fechamento e fecha", () => {
        const inPanel = portraitHoverPointer(portraitHoverPointer(opened, "panel", true).state, "trigger", false).state
        const left = portraitHoverPointer(inPanel, "panel", false)
        expect(left.timer).toBe("close")
        expect(portraitHoverElapsed(left.state, "close").open).toBe(false)
    })
})
