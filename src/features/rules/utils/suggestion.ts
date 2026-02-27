import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'
import { performUnifiedSearch } from '@/core/utils/search-engine'

/**
 * T039: Updated to support both Regra and Habilidade entity types in mentions.
 * Fetches from central search engine.
 */
export const getSuggestionConfig = (options?: { excludeId?: string }) => {
    let component: ReactRenderer<MentionListRef, MentionListProps> | null = null
    let loading = false
    let currentQuery = ""

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
                const results = await performUnifiedSearch(query, 10)

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
                        props: { ...props, loading, query: currentQuery },
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
                        component.updateProps({ ...props, loading, query: currentQuery })
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
