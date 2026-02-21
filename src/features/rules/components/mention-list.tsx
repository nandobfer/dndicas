import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '@/core/utils'
import { glassConfig } from '@/lib/config/glass-config'
import { entityColors } from '@/lib/config/colors'

export interface MentionListProps {
  items: Array<{ id: string; label: string; entityType?: string }>
  command: (item: { id: string; label: string; entityType?: string }) => void
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

const MentionList = forwardRef<MentionListRef, MentionListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]

    if (item) {
      props.command(item)
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-1 rounded-lg overflow-auto max-h-[250px] min-w-[200px] shadow-2xl z-[9999]",
        glassConfig.sidebar.background,
        glassConfig.sidebar.blur,
        "border border-white/10 pointer-events-auto"
      )}
      onMouseDown={(e) => e.preventDefault()}
      style={{ isolation: 'isolate', pointerEvents: 'all' }}
    >
      {props.items.length > 0 ? (
        props.items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => selectItem(index)}
            className={cn(
              "flex flex-col w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer relative z-10",
              selectedIndex === index ? "bg-white/20" : "hover:bg-white/10"
            )}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{item.label}</span>
                {item.entityType && (
                    <span className={cn(
                        "text-[10px] uppercase font-bold tracking-tight px-1.5 py-0.5 rounded transition-all",
                        entityColors[item.entityType as keyof typeof entityColors]?.badge || "bg-gray-400/20 text-white/40 font-bold"
                    )}>
                        {item.entityType}
                    </span>
                )}
            </div>
          </button>
        ))
      ) : (
        <div className="px-3 py-2 text-sm text-white/40 italic">Nenhum resultado encontrado</div>
      )}
    </div>
  )
})

MentionList.displayName = 'MentionList'

export default MentionList
