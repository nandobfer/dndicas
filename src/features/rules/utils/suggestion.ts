import { ReactRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import tippy, { type Instance } from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'
import { searchUnifiedInWorkerProgressively } from '@/core/utils/search-worker-client'
import type { UnifiedEntity, UnifiedSearchOptions } from '@/core/utils/search-core'
import type { EntityType } from '@/lib/config/colors'

type MentionListItem = MentionListProps["items"][number]
type MentionSuggestionProps = SuggestionProps<MentionListItem, MentionListItem>
const MENTION_SEARCH_DEBOUNCE_MS = 300

/**
 * T039: Updated to support both Regra and Habilidade entity types in mentions.
 * Fetches from central search engine.
 */
export const getSuggestionConfig = (options?: {
    excludeId?: string
    blurOnMentionSelect?: boolean
    specificEntityMention?: EntityType
    specificEntityMentions?: EntityType[]
    itemTypes?: string[]
    circles?: number[]
    parentClassId?: string | null
    onStart?: (context: { editor: Editor | null }) => void
    onExit?: (context: { editor: Editor | null; wasSelection: boolean }) => void
}) => {
    let component: ReactRenderer<MentionListRef, MentionListProps> | null = null
    let loading = false
    let currentQuery = ""
    let currentEditor: Editor | null = null
    let wasSelection = false
    let debounceTimer: NodeJS.Timeout | null = null
    let latestQueryId = 0
    const cachedItemsByQuery = new Map<string, MentionListItem[]>()

    const searchOptions: UnifiedSearchOptions = {
        specificEntityType: options?.specificEntityMention,
        specificEntityTypes: options?.specificEntityMentions,
        itemTypes: options?.itemTypes,
        circles: options?.circles,
        parentClassId: options?.parentClassId,
    }

    const normalizeResults = (results: UnifiedEntity[]) =>
        results
            .filter((item) =>
                options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true
            )
            .map((item) => ({
                ...item,
                id: item.id || item._id || "",
                label: item.label || item.name,
                entityType: item.type,
            }))

    const getCachedItems = (query: string) => cachedItemsByQuery.get(query) ?? []

    const wrapCommand = (props: MentionSuggestionProps) => {
        return (item: MentionListItem) => {
            wasSelection = true
            props.command(item)
            if (!options?.blurOnMentionSelect) return
            setTimeout(() => {
                if (!props.editor.isDestroyed) {
                    props.editor.commands.blur()
                }
            }, 0)
        }
    }

    return {
        items: ({ query }: { query: string }) => {
            currentQuery = query
            loading = true
            const cachedItems = getCachedItems(query)

            if (component) {
                component.updateProps({
                    items: cachedItems,
                    loading: true,
                    query,
                })
            }

            const queryId = ++latestQueryId

            if (debounceTimer) {
                clearTimeout(debounceTimer)
                debounceTimer = null
            }

            debounceTimer = setTimeout(() => {
                debounceTimer = null

                void (async () => {
                    if (queryId !== latestQueryId) return

                    try {
                        const results = await searchUnifiedInWorkerProgressively(query, 10, 0, searchOptions, (update) => {
                            if (queryId !== latestQueryId) return

                            const filteredResults = normalizeResults(update.results)
                            if (update.done) {
                                cachedItemsByQuery.set(query, filteredResults)
                            }

                            loading = !update.done
                            if (component) {
                                component.updateProps({
                                    items: filteredResults,
                                    loading: !update.done,
                                    query,
                                })
                            }
                        })
                        if (queryId !== latestQueryId) return

                        const filteredResults = normalizeResults(results)
                        cachedItemsByQuery.set(query, filteredResults)
                        loading = false
                        if (component) {
                            component.updateProps({
                                items: filteredResults,
                                loading: false,
                                query,
                            })
                        }
                    } catch (e) {
                        console.error("Mention search system failed:", e)
                        if (queryId !== latestQueryId) return

                        loading = false
                        if (component) {
                            component.updateProps({
                                items: [],
                                loading: false,
                                query,
                            })
                        }
                    }
                })()
            }, MENTION_SEARCH_DEBOUNCE_MS)

            return cachedItems
        },

        render: () => {
            let popup: Instance | null = null

            return {
                onStart: (props: MentionSuggestionProps) => {
                    currentEditor = props.editor
                    wasSelection = false
                    options?.onStart?.({ editor: currentEditor })
                    const cachedItems = getCachedItems(currentQuery)

                    component = new ReactRenderer(MentionList, {
                        props: {
                            ...props,
                            items: cachedItems.length > 0 ? cachedItems : props.items,
                            command: wrapCommand(props),
                            loading,
                            query: currentQuery,
                        },
                        editor: props.editor,
                    })

                    if (!props.clientRect) {
                        return
                    }

                    popup = tippy(document.body, {
                        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: "manual",
                        placement: "bottom-start",
                        zIndex: 9999,
                        popperOptions: {
                            modifiers: [
                                {
                                    name: "eventListeners",
                                    options: { scroll: false },
                                },
                            ],
                        },
                    })
                },

                onUpdate: (props: MentionSuggestionProps) => {
                    currentEditor = props.editor
                    if (component) {
                        component.updateProps({ ...props, command: wrapCommand(props), loading, query: currentQuery })
                    }

                    if (!props.clientRect || !popup) {
                        return
                    }

                    popup.setProps({
                        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
                    })
                },

                onKeyDown: (props: SuggestionKeyDownProps) => {
                    if (props.event.key === "Escape") {
                        popup?.hide()
                        return true
                    }

                    if (props.event.key === "ArrowRight") {
                        const editor = currentEditor
                        if (!editor) return false

                        const { selection } = editor.state
                        if (selection.empty && selection.from >= props.range.to) {
                            // Step out of the badge by inserting a zero-width space
                            editor.commands.insertContent("\u200B")
                            return true
                        }
                    }

                    return component?.ref?.onKeyDown(props) || false
                },

                onExit: () => {
                    options?.onExit?.({ editor: currentEditor, wasSelection })
                    if (debounceTimer) {
                        clearTimeout(debounceTimer)
                        debounceTimer = null
                    }
                    if (popup) {
                        popup.destroy()
                    }
                    if (component) {
                        component.destroy()
                        component = null
                    }
                    currentEditor = null
                    wasSelection = false
                },
            }
        },
    }
}
