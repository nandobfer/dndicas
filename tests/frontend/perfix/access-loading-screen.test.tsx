/** @vitest-environment happy-dom */
import React, { type ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type MotionProps = { initial?: Record<string, unknown>; animate?: Record<string, unknown>; transition?: Record<string, unknown> }
const state = vi.hoisted(() => ({ reduced: false, motion: [] as MotionProps[] }))

vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "transition", "variants", "style"])
    const cache: Record<string, React.FC<Record<string, unknown>>> = {}
    const capture = (tag: string) => (cache[tag] ??= function Motion({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
        state.motion.push({ initial: props.initial as MotionProps["initial"], animate: props.animate as MotionProps["animate"], transition: props.transition as MotionProps["transition"] })
        const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
        return React.createElement(tag, domProps, children)
    })
    return { motion: new Proxy({}, { get: (_, tag: string) => capture(tag) }), useReducedMotion: () => state.reduced }
})
vi.mock("next/image", () => ({
    default: ({ src, alt }: { src: string; alt: string }) => React.createElement("img", { src, alt }),
}))

import { AccessLoadingScreen } from "@/features/perfix/components/AccessLoadingScreen"

const continuous = () => state.motion.filter((props) => props.transition?.repeat === Infinity)
const beams = () => state.motion.filter((props) => props.animate && "x" in props.animate)

describe("loading da validação de acesso", () => {
    beforeEach(() => {
        state.reduced = false
        state.motion = []
    })

    it("é um status acessível com o logo do DnDicas e o fundo de feixes, sem partículas", () => {
        const { container } = render(<AccessLoadingScreen />)
        const status = screen.getByRole("status", { name: "Carregando acesso" })
        expect(status.getAttribute("aria-live")).toBe("polite")
        expect(status.getAttribute("aria-busy")).toBe("true")
        expect(screen.getByAltText("Dungeons & Dicas").getAttribute("src")).toBe("/dndicas-logo.webp")
        expect(screen.queryByRole("heading")).toBeNull()
        expect(screen.getByTestId("access-loading-ring").getAttribute("aria-hidden")).toBe("true")
        expect(screen.getByTestId("access-loading-dots").getAttribute("aria-hidden")).toBe("true")
        expect(container.querySelector("canvas")).toBeNull()
        expect(beams()).toHaveLength(3)
    })

    it("anima o anel, as reticências e os feixes sem movimento reduzido", () => {
        render(<AccessLoadingScreen />)
        expect(continuous().some((props) => props.animate?.rotate === 360)).toBe(true)
        const delays = continuous()
            .filter((props) => Array.isArray(props.animate?.opacity) && (props.animate.opacity as number[]).length === 3)
            .map((props) => props.transition?.delay)
        expect(delays).toEqual([0, 0.2, 0.4])
        expect(beams().every((props) => props.transition?.repeat === Infinity)).toBe(true)
    })

    it("fica estático com movimento reduzido, só com o fade de entrada", () => {
        state.reduced = true
        render(<AccessLoadingScreen />)
        expect(continuous()).toHaveLength(0)
        expect(beams()).toHaveLength(0)
        expect(state.motion.some((props) => props.animate && "rotate" in props.animate)).toBe(false)
        const entry = state.motion.find((props) => props.initial)
        expect(entry?.initial).toEqual({ opacity: 0 })
        expect(entry?.animate).toEqual({ opacity: 1 })
    })
})
