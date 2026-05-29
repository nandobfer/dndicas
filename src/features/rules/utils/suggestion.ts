import { ReactRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import tippy from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'
import { performUnifiedSearch, peekUnifiedSearch, type UnifiedEntity, type UnifiedSearchOptions } from '@/core/utils/search-engine'
import type { EntityType } from '@/lib/config/colors'

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
                entityType: item.type,
            }))

    const getCachedItems = (query: string) =>
        normalizeResults(peekUnifiedSearch(query, 10, 0, searchOptions) ?? [])

    const wrapCommand = (props: any) => {
        return (item: any) => {
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
        items: async ({ query }: { query: string }) => {
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

            try {
                const results = await performUnifiedSearch(query, 10, 0, searchOptions)
                const filteredResults = normalizeResults(results)

                loading = false

                return filteredResults
            } catch (e) {
                console.error("Mention search system failed:", e)
                loading = false
                return []
            }
        },

        render: () => {
            let popup: any

            return {
                onStart: (props: any) => {
                    currentEditor = props.editor
                    wasSelection = false
                    options?.onStart?.({ editor: currentEditor })
                    const cachedItems = getCachedItems(currentQuery)

                    component = new ReactRenderer(MentionList, {
                        props: {
                            ...props,
                            items: cachedItems.length > 0 ? cachedItems : props.items,
                            command: wrapCommand(props),
                            loading: cachedItems.length === 0,
                            query: currentQuery,
                        },
                        editor: props.editor,
                    })

                    if (!props.clientRect) {
                        return
                    }

                    popup = tippy("body" as any, {
                        getReferenceClientRect: props.clientRect,
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

                onUpdate: (props: any) => {
                    currentEditor = props.editor
                    if (component) {
                        component.updateProps({ ...props, command: wrapCommand(props), loading, query: currentQuery })
                    }

                    if (!props.clientRect || !popup) {
                        return
                    }

                    popup[0].setProps({
                        getReferenceClientRect: props.clientRect,
                    })
                },

                onKeyDown: (props: any) => {
                    if (props.event.key === "Escape") {
                        popup[0].hide()
                        return true
                    }

                    return component?.ref?.onKeyDown(props) || false
                },

                onExit: () => {
                    options?.onExit?.({ editor: currentEditor, wasSelection })
                    if (popup && popup[0]) {
                        popup[0].destroy()
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
