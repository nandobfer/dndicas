import { ReactRenderer } from '@tiptap/react'
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from 'tippy.js'
import MentionList, { MentionListProps, MentionListRef } from '../components/mention-list'

export const getSuggestionConfig = (options?: { excludeId?: string }) => ({
  items: async ({ query }: { query: string }) => {
    // Current focus is on Rules, but we can extend this easily later
    try {
        const res = await fetch(`/api/rules?search=${query}&limit=10&searchField=name`)
        if (!res.ok) return []
        const data = await res.json()
        
        // Map Rule objects into a standard suggestion format, filtering current if provided
        return data.items
            .filter((item: any) => (options?.excludeId ? item._id !== options.excludeId && item.id !== options.excludeId : true))
            .map((item: any) => ({
                id: item._id,
                label: item.name,
                entityType: "Regra",
                description: item.description,
                source: item.source,
                status: item.status,
            }))
    } catch (e) {
        console.error('Mention fetch failed:', e)
        return []
    }
  },

  render: () => {
    let component: ReactRenderer<MentionListRef, MentionListProps>
    let popup: any

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) {
          return
        }

        popup = tippy('body' as any, {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          zIndex: 9999,
          // Important for mouse events:
          popperOptions: {
            modifiers: [
              {
                name: 'eventListeners',
                options: { scroll: false },
              },
            ],
          },
        })
      },

      onUpdate: (props: any) => {
        component.updateProps(props)

        if (!props.clientRect) {
          return
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          popup[0].hide()
          return true
        }

        return component.ref?.onKeyDown(props) || false
      },

      onExit: () => {
        if (popup && popup[0]) {
            popup[0].destroy()
        }
        if (component) {
            component.destroy()
        }
      },
    }
  },
})
