import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'
import { performUnifiedSearch } from '@/core/utils/search-engine'
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

            // Update component to show loading state if it exists
            if (component) {
                component.updateProps({
                    items: [],
                    loading: true,
                    query: query,
                })
            }

            try {
                const results = await performUnifiedSearch(query, 10, 0, {
                    specificEntityType: options?.specificEntityMention,
                })

                // Filter out excluded ID if provided
                const filteredResults = results.filter((item) => 
                    options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true
                ).map(item => ({
                    ...item,
                    entityType: item.type, // Map 'type' to 'entityType' for MentionList compatibility
                }))

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
                    component = new ReactRenderer(MentionList, {
                        props: { ...props, command: wrapCommand(props), loading, query: currentQuery },
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
