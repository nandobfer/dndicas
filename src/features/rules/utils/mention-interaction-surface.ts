export const MENTION_INTERACTION_SURFACE_SELECTOR = "[data-mention-interaction-surface]"
export const TEMPORARY_OPEN_MENTION_TEXT = "@"

const isMentionTerminator = (char: string | undefined) =>
    char === undefined || char === "@" || char === "\u200B" || char === "\uFFFC"

const isMentionWhitespace = (char: string | undefined) =>
    char !== undefined && /\s/.test(char)

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

interface FindMentionSuggestionMatchParams {
    text: string
    parentOffset: number
    position: number
}

const findMentionSegmentEnd = (text: string, start: number) => {
    let index = start + 1

    while (index < text.length && !isMentionTerminator(text[index])) {
        index += 1
    }

    return index
}

const findMentionWordEnd = (text: string, start: number) => {
    let index = start

    while (index < text.length && !isMentionTerminator(text[index]) && !isMentionWhitespace(text[index])) {
        index += 1
    }

    return index
}

export const findMentionSuggestionMatch = ({
    text,
    parentOffset,
    position,
}: FindMentionSuggestionMatchParams) => {
    let triggerIndex = text.indexOf(TEMPORARY_OPEN_MENTION_TEXT)

    while (triggerIndex !== -1) {
        const segmentEnd = findMentionSegmentEnd(text, triggerIndex)

        if (parentOffset >= triggerIndex && parentOffset <= segmentEnd) {
            const typedText = text.slice(triggerIndex, parentOffset)
            if (typedText.endsWith("  ")) {
                return null
            }

            const cursorChar = text[parentOffset]
            const shouldIncludeExistingWord =
                parentOffset === triggerIndex + TEMPORARY_OPEN_MENTION_TEXT.length &&
                !isMentionTerminator(cursorChar) &&
                !isMentionWhitespace(cursorChar)
            const isCursorInsideWord =
                parentOffset > triggerIndex + TEMPORARY_OPEN_MENTION_TEXT.length &&
                !isMentionTerminator(cursorChar) &&
                !isMentionWhitespace(cursorChar)
            const end = shouldIncludeExistingWord || isCursorInsideWord
                ? findMentionWordEnd(text, parentOffset)
                : parentOffset
            const mentionText = text.slice(triggerIndex, end)

            return {
                range: {
                    from: position - (parentOffset - triggerIndex),
                    to: position + (end - parentOffset),
                },
                query: mentionText.slice(1),
                text: mentionText,
            }
        }

        triggerIndex = text.indexOf(TEMPORARY_OPEN_MENTION_TEXT, triggerIndex + 1)
    }

    return null
}
