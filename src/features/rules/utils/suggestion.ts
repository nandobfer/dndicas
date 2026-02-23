import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'

/**
 * T039: Updated to support both Regra and Habilidade entity types in mentions.
 * Fetches from both /api/rules/search and /api/traits/search endpoints.
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
                    items: [], // Clear current items to avoid confusion
                    loading: true,
                    query: query
                })
            }

            try {
                // Fetch from both Rules and Traits endpoints in parallel
                const [rulesRes, traitsRes] = await Promise.all([
                    fetch(`/api/rules/search?query=${query}&limit=10`),
                    fetch(`/api/traits/search?query=${query}&limit=10`)
                ])

                const rulesData = rulesRes.ok ? await rulesRes.json() : { items: [] }
                const traitsData = traitsRes.ok ? await traitsRes.json() : { items: [] }

                loading = false

                // Map Rules results
                const rulesItems = (rulesData.items || [])
                    .filter((item: any) => (options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true))
                    .map((item: any) => ({
                        id: item._id || item.id,
                        label: item.name,
                        entityType: "Regra",
                        description: item.description,
                        source: item.source,
                        status: item.status
                    }))

                // Map Traits results
                const traitsItems = (traitsData.items || [])
                    .filter((item: any) => (options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true))
                    .map((item: any) => ({
                        id: item._id || item.id,
                        label: item.name,
                        entityType: "Habilidade",
                        description: item.description,
                        source: item.source,
                        status: item.status
                    }))

                // Combine and return (Rules first, then Traits)
                return [...rulesItems, ...traitsItems]
            } catch (e) {
                console.error("Mention fetch failed:", e)
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
                        editor: props.editor
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
                                    options: { scroll: false }
                                }
                            ]
                        }
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
                        getReferenceClientRect: props.clientRect
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
                }
            }
        }
    }
}
