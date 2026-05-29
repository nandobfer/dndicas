import { afterEach, describe, expect, it, vi } from "vitest"
import {
    isPointerWithinMentionInteractionSurface,
    isTemporaryOpenMentionText,
    shouldAutoOpenMentionsOnFocus,
    shouldClearTemporaryMentionOnExit,
    shouldPreserveMentionBlur,
} from "@/features/rules/utils/mention-interaction-surface"

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ""
})

describe("shouldPreserveMentionBlur", () => {
    it("preserves the mention flow when blur moves into the suggestion surface", () => {
        document.body.innerHTML = `<div data-mention-interaction-surface="suggestion-list"><button id="suggestion-item">item</button></div>`

        const suggestionItem = document.getElementById("suggestion-item")

        expect(
            shouldPreserveMentionBlur({
                relatedTarget: suggestionItem,
                activeElement: null,
                hasActiveMentionSession: true,
                hasOpenMentionInteractionSurface: true,
                wasPointerWithinMentionInteractionSurface: false,
            }),
        ).toBe(true)
    })

    it("preserves the mention flow while a mention surface is still active after blur settles", () => {
        document.body.innerHTML = `<div data-mention-interaction-surface="entity-preview"><button id="preview-action">preview</button></div>`

        const previewAction = document.getElementById("preview-action")

        expect(
            shouldPreserveMentionBlur({
                relatedTarget: null,
                activeElement: previewAction,
                hasActiveMentionSession: true,
                hasOpenMentionInteractionSurface: true,
                wasPointerWithinMentionInteractionSurface: false,
            }),
        ).toBe(true)
    })

    it("preserves manual mention sessions while the pointer is over the interaction surface", () => {
        expect(
            shouldPreserveMentionBlur({
                relatedTarget: null,
                activeElement: null,
                hasActiveMentionSession: true,
                hasOpenMentionInteractionSurface: false,
                wasPointerWithinMentionInteractionSurface: true,
            }),
        ).toBe(true)
    })

    it("allows cleanup when focus really leaves the mention workflow", () => {
        document.body.innerHTML = `<button id="outside">outside</button>`

        const outsideButton = document.getElementById("outside")

        expect(
            shouldPreserveMentionBlur({
                relatedTarget: outsideButton,
                activeElement: outsideButton,
                hasActiveMentionSession: true,
                hasOpenMentionInteractionSurface: false,
                wasPointerWithinMentionInteractionSurface: false,
            }),
        ).toBe(false)
    })

    it("does not preserve blur when there is no active mention session", () => {
        expect(
            shouldPreserveMentionBlur({
                relatedTarget: null,
                activeElement: null,
                hasActiveMentionSession: false,
                hasOpenMentionInteractionSurface: true,
                wasPointerWithinMentionInteractionSurface: true,
            }),
        ).toBe(false)
    })
})

describe("isPointerWithinMentionInteractionSurface", () => {
    it("detects when the hovered element is inside a mention interaction surface", () => {
        document.body.innerHTML = `
            <div data-mention-interaction-surface="suggestion-list">
                <button id="hovered">item</button>
            </div>
        `

        const hoveredButton = document.getElementById("hovered")

        vi.spyOn(document, "querySelector").mockImplementation((selector: string) => {
                if (selector === ":hover") return hoveredButton
                return Document.prototype.querySelector.call(document, selector)
        })

        expect(isPointerWithinMentionInteractionSurface()).toBe(true)
    })
})

describe("temporary open mention cleanup", () => {
    it("identifies the temporary @ trigger text", () => {
        expect(isTemporaryOpenMentionText("@")).toBe(true)
        expect(isTemporaryOpenMentionText(" @ ")).toBe(true)
        expect(isTemporaryOpenMentionText("@teste")).toBe(false)
    })

    it("clears the temporary @ when the mention list closes without selection", () => {
        expect(
            shouldClearTemporaryMentionOnExit({
                hasSyntheticTrigger: true,
                editorText: "@",
                wasSelection: false,
            }),
        ).toBe(true)
    })

    it("keeps content when the user selected an item or the text is not temporary", () => {
        expect(
            shouldClearTemporaryMentionOnExit({
                hasSyntheticTrigger: true,
                editorText: "@",
                wasSelection: true,
            }),
        ).toBe(false)

        expect(
            shouldClearTemporaryMentionOnExit({
                hasSyntheticTrigger: true,
                editorText: "@teste",
                wasSelection: false,
            }),
        ).toBe(false)

        expect(
            shouldClearTemporaryMentionOnExit({
                hasSyntheticTrigger: false,
                editorText: "@",
                wasSelection: false,
            }),
        ).toBe(false)
    })

    it("reopens mentions on focus when the editor is empty or still has the synthetic @", () => {
        expect(
            shouldAutoOpenMentionsOnFocus({
                openMentionsOnFocus: true,
                editorText: "",
                hasSyntheticTrigger: false,
            }),
        ).toBe(true)

        expect(
            shouldAutoOpenMentionsOnFocus({
                openMentionsOnFocus: true,
                editorText: "@",
                hasSyntheticTrigger: true,
            }),
        ).toBe(true)

        expect(
            shouldAutoOpenMentionsOnFocus({
                openMentionsOnFocus: true,
                editorText: "@",
                hasSyntheticTrigger: false,
            }),
        ).toBe(false)

        expect(
            shouldAutoOpenMentionsOnFocus({
                openMentionsOnFocus: false,
                editorText: "",
                hasSyntheticTrigger: false,
            }),
        ).toBe(false)
    })
})
