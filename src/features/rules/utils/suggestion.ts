import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'

/**
 * Entity configuration for the mention system.
 * Easy to extend with more entities in the future.
 */
const ENTITY_PROVIDERS = [
    {
        name: "Regra",
        endpoint: (query: string) => `/api/rules?search=${query}&limit=10&searchField=name`,
        map: (item: any) => ({
            id: item._id || item.id,
            label: item.name,
            entityType: "Regra",
            description: item.description,
            source: item.source,
            status: item.status,
        }),
    },
    {
        name: "Habilidade",
        endpoint: (query: string) => `/api/traits/search?q=${query}&limit=10`,
        map: (item: any) => ({
            id: item._id || item.id,
            label: item.name,
            entityType: "Habilidade",
            description: item.description,
            source: item.source,
            status: item.status,
        }),
    },
    {
        name: "Talento",
        endpoint: (query: string) => `/api/feats/search?query=${query}&limit=10`,
        map: (item: any) => ({
            id: item.id,
            label: item.label,
            entityType: "Talento",
            metadata: item.metadata,
        }),
    },
]

/**
 * T039: Updated to support both Regra and Habilidade entity types in mentions.
 * Fetches from registered entity providers in parallel.
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
                // Fetch from all providers in parallel
                const fetchPromises = ENTITY_PROVIDERS.map(async (provider) => {
                    try {
                        const res = await fetch(provider.endpoint(query))
                        if (!res.ok) return []
                        const data = await res.json()
                        // Ensure we always have an array of items, regardless of response structure
                        const items = Array.isArray(data) ? data : data.items || []

                        return items.filter((item: any) => (options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true)).map(provider.map)
                    } catch (e) {
                        console.error(`Mention fetch failed for ${provider.name}:`, e)
                        return []
                    }
                })

                const results = await Promise.all(fetchPromises)

                loading = false

                // Flatten and return all results combined
                const allItems = results.flat()

                // Final check to ensure we are returning something
                return allItems
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
