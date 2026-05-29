export const MENTION_INTERACTION_SURFACE_SELECTOR = "[data-mention-interaction-surface]"
export const TEMPORARY_OPEN_MENTION_TEXT = "@"

const isElementWithinMentionInteractionSurface = (element: Element | null) =>
    Boolean(element?.closest(MENTION_INTERACTION_SURFACE_SELECTOR))

interface ShouldPreserveMentionBlurParams {
    relatedTarget: EventTarget | null
    activeElement: Element | null
    hasActiveMentionSession: boolean
    hasOpenMentionInteractionSurface: boolean
    wasPointerWithinMentionInteractionSurface: boolean
}

export const shouldPreserveMentionBlur = ({
    relatedTarget,
    activeElement,
    hasActiveMentionSession,
    hasOpenMentionInteractionSurface,
    wasPointerWithinMentionInteractionSurface,
}: ShouldPreserveMentionBlurParams) => {
    if (!hasActiveMentionSession) {
        return false
    }

    if (relatedTarget instanceof Element && isElementWithinMentionInteractionSurface(relatedTarget)) {
        return true
    }

    if (isElementWithinMentionInteractionSurface(activeElement)) {
        return true
    }

    return hasOpenMentionInteractionSurface || wasPointerWithinMentionInteractionSurface
}

export const isTemporaryOpenMentionText = (text: string) =>
    text.trim() === TEMPORARY_OPEN_MENTION_TEXT

interface ShouldClearTemporaryMentionOnExitParams {
    hasSyntheticTrigger: boolean
    editorText: string
    wasSelection: boolean
}

export const shouldClearTemporaryMentionOnExit = ({
    hasSyntheticTrigger,
    editorText,
    wasSelection,
}: ShouldClearTemporaryMentionOnExitParams) =>
    hasSyntheticTrigger && !wasSelection && isTemporaryOpenMentionText(editorText)

interface ShouldAutoOpenMentionsOnFocusParams {
    openMentionsOnFocus: boolean
    editorText: string
    hasSyntheticTrigger: boolean
}

export const shouldAutoOpenMentionsOnFocus = ({
    openMentionsOnFocus,
    editorText,
    hasSyntheticTrigger,
}: ShouldAutoOpenMentionsOnFocusParams) =>
    openMentionsOnFocus &&
    (editorText.trim() === "" || (hasSyntheticTrigger && isTemporaryOpenMentionText(editorText)))

export const isPointerWithinMentionInteractionSurface = () =>
    Array.from(document.querySelectorAll(MENTION_INTERACTION_SURFACE_SELECTOR)).some((element) => {
        const hoveredElement = document.querySelector(":hover")

        return Boolean(hoveredElement && (element === hoveredElement || element.contains(hoveredElement)))
    })
