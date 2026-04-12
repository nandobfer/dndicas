import { ReactRenderer } from '@tiptap/react'
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
}) => {
    let component: ReactRenderer<MentionListRef, MentionListProps> | null = null
    let loading = false
    let currentQuery = ""

    const searchOptions: UnifiedSearchOptions = {
        specificEntityType: options?.specificEntityMention,
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
        if (!options?.blurOnMentionSelect) return props.command
        return (item: any) => {
            props.command(item)
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
                    if (popup && popup[0]) {
                        popup[0].destroy()
                    }
                    if (component) {
                        component.destroy()
                        component = null
                    }
                },
            }
        },
    }
}
