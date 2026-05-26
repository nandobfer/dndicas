import { act, render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { InfiniteScrollSentinel } from '@/components/ui/infinite-scroll-sentinel'

const intersectionObservers: Array<{ trigger: (isIntersecting: boolean) => void }> = []

describe('InfiniteScrollSentinel', () => {
    beforeEach(() => {
        intersectionObservers.length = 0

        class MockIntersectionObserver {
            observe = vi.fn()
            disconnect = vi.fn()
            unobserve = vi.fn()
            takeRecords = vi.fn(() => [])
            root = null
            rootMargin = ''
            thresholds = []
            private callback: IntersectionObserverCallback

            constructor(callback: IntersectionObserverCallback) {
                this.callback = callback
                intersectionObservers.push(this)
            }

            trigger(isIntersecting: boolean) {
                this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
            }
        }

        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it('loads the next page when the sentinel intersects', () => {
        const onLoadMore = vi.fn()
        render(<InfiniteScrollSentinel hasNextPage onLoadMore={onLoadMore} />)

        act(() => {
            intersectionObservers[0].trigger(true)
        })

        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('does not load while fetching and renders the end label without a next page', () => {
        const onLoadMore = vi.fn()
        const { rerender } = render(<InfiniteScrollSentinel hasNextPage isFetchingNextPage onLoadMore={onLoadMore} />)

        expect(intersectionObservers).toHaveLength(0)

        rerender(<InfiniteScrollSentinel hasNextPage={false} onLoadMore={onLoadMore} endLabel="Fim dos dados" />)

        expect(screen.getByText('Fim dos dados')).toBeInTheDocument()
        act(() => {
            intersectionObservers[0].trigger(true)
        })
        expect(onLoadMore).not.toHaveBeenCalled()
    })
})
