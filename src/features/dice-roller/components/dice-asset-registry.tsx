"use client"

import type { ReactNode } from "react"
import type { DiceType } from "../types"

interface DiceAssetRenderArgs {
    color: string
    gradientId: string
}

export interface DiceAssetDefinition {
    assetPath: string
    shape: string
    viewBox: string
    render: (args: DiceAssetRenderArgs) => ReactNode
}

const d20ReferencePath = "M106.75 215.06L1.2 370.95c-3.08 5 .1 11.5 5.93 12.14l208.26 22.07-108.64-190.1zM7.41 315.43L82.7 193.08 6.06 147.1c-2.67-1.6-6.06.32-6.06 3.43v162.81c0 4.03 5.29 5.53 7.41 2.09zM18.25 423.6l194.4 87.66c5.3 2.45 11.35-1.43 11.35-7.26v-65.67l-203.55-22.3c-4.45-.5-6.23 5.59-2.2 7.57zm81.22-257.78L179.4 22.88c4.34-7.06-3.59-15.25-10.78-11.14L17.81 110.35c-2.47 1.62-2.39 5.26.13 6.78l81.53 48.69zM240 176h109.21L253.63 7.62C250.5 2.54 245.25 0 240 0s-10.5 2.54-13.63 7.62L130.79 176H240zm233.94-28.9l-76.64 45.99 75.29 122.35c2.11 3.44 7.41 1.94 7.41-2.1V150.53c0-3.11-3.39-5.03-6.06-3.43zm-93.41 18.72l81.53-48.7c2.53-1.52 2.6-5.16.13-6.78l-150.81-98.6c-7.19-4.11-15.12 4.08-10.78 11.14l79.93 142.94zm79.02 250.21L256 438.32v65.67c0 5.84 6.05 9.71 11.35 7.26l194.4-87.66c4.03-1.97 2.25-8.06-2.2-7.56zm-86.3-200.97l-108.63 190.1 208.26-22.07c5.83-.65 9.01-7.14 5.93-12.14L373.25 215.06zM240 208H139.57L240 383.75 340.43 208H240z"

function buildColorLayers(color: string) {
    return {
        base: `${color}24`,
        fill: `${color}2c`,
        fillStrong: `${color}40`,
        stroke: `${color}d8`,
        facetStroke: `${color}74`,
    }
}

export const diceAssetRegistry: Record<DiceType, DiceAssetDefinition> = {
    d4: {
        assetPath: "/dice/d4.svg",
        shape: "tetrahedron",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M49 8L9 84h81L49 8Z" fill={layers.fill} stroke={layers.stroke} strokeWidth="2.4" />
                    <path d="M49 8L9 84h40V8Z" fill={layers.fillStrong} opacity="0.7" />
                    <path d="M49 8l41 76H49V8Z" fill={`url(#${gradientId})`} opacity="0.58" />
                    <path d="M9 84 49 43 90 84" fill="none" stroke={layers.facetStroke} strokeWidth="1.25" strokeLinejoin="round" />
                    <path d="M49 8v76" fill="none" stroke={layers.facetStroke} strokeWidth="1.25" strokeLinecap="round" />
                </>
            )
        },
    },
    d6: {
        assetPath: "/dice/d6.svg",
        shape: "cube",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M49 8 13 28v42l36 22 38-22V28L49 8Z" fill={layers.base} stroke={layers.stroke} strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M49 8 13 28l36 22 38-22L49 8Z" fill={`url(#${gradientId})`} opacity="0.74" />
                    <path d="M13 28v42l36 22V50L13 28Z" fill={layers.fillStrong} opacity="0.7" />
                    <path d="M87 28v42L49 92V50l38-22Z" fill={layers.fill} opacity="0.92" />
                    <path d="M13 28 49 50 87 28M49 50v42" fill="none" stroke={layers.facetStroke} strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round" />
                </>
            )
        },
    },
    d8: {
        assetPath: "/dice/d8.svg",
        shape: "octahedron",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M61 7 92 39 70 61 43 94 12 63 35 40 61 7Z" fill={layers.base} stroke={layers.stroke} strokeWidth="2.3" strokeLinejoin="round" />
                    <path d="M61 7 35 40l17 9 18 12 22-22L61 7Z" fill={`url(#${gradientId})`} opacity="0.76" />
                    <path d="M35 40 12 63l31 31 9-45-17-9Z" fill={layers.fillStrong} opacity="0.68" />
                    <path d="M70 61 43 94 52 49l18 12Z" fill={layers.fill} opacity="0.95" />
                    <path d="M61 7 52 49 43 94M35 40 52 49 92 39M12 63 52 49 70 61" fill="none" stroke={layers.facetStroke} strokeWidth="1.15" strokeLinejoin="round" strokeLinecap="round" />
                </>
            )
        },
    },
    d10: {
        assetPath: "/dice/d10.svg",
        shape: "trapezohedron",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M49 10 75 18 91 35 84 51 67 60 49 91 32 60 15 51 8 35 24 18 49 10Z" fill={layers.base} stroke={layers.stroke} strokeWidth="2.25" strokeLinejoin="round" />
                    <path d="M49 10 24 18 38 33 49 39 61 33 75 18 49 10Z" fill={`url(#${gradientId})`} opacity="0.78" />
                    <path d="M24 18 8 35l7 16 17 9 17-21-11-6-14-15Z" fill={layers.fillStrong} opacity="0.64" />
                    <path d="M75 18 91 35l-7 16-17 9-18-21 12-6 14-15Z" fill={layers.fill} opacity="0.96" />
                    <path d="M32 60 49 91V39L32 60Zm35 0L49 91V39l18 21Z" fill={layers.fill} opacity="0.9" />
                    <path d="M24 18 38 33 49 39 61 33 75 18M8 35 49 39 91 35M15 51 49 39 84 51M32 60 49 39 67 60M49 10v81" fill="none" stroke={layers.facetStroke} strokeWidth="1.08" strokeLinejoin="round" strokeLinecap="round" />
                </>
            )
        },
    },
    d12: {
        assetPath: "/dice/d12.svg",
        shape: "dodecahedron",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M49 6 79 15 95 39 87 72 60 93 28 86 7 58 14 26 49 6Z" fill={layers.base} stroke={layers.stroke} strokeWidth="2.25" strokeLinejoin="round" />
                    <path d="M49 18 73 29 77 50 58 74 35 71 23 49 27 28 49 18Z" fill={layers.fill} stroke={layers.facetStroke} strokeWidth="1.05" opacity="0.96" />
                    <path d="M49 6 79 15 73 29 49 18 27 28 14 26 49 6Z" fill={`url(#${gradientId})`} opacity="0.72" />
                    <path d="M14 26 7 58l16-9 4-21-13-2Z" fill={layers.fillStrong} opacity="0.58" />
                    <path d="M79 15 95 39l-18 11-4-21 22-14Z" fill={layers.fill} opacity="0.92" />
                    <path d="M7 58 28 86l7-15-12-22L7 58Z" fill={layers.fillStrong} opacity="0.58" />
                    <path d="M95 39 87 72 58 74l19-24 18-11Z" fill={layers.fill} opacity="0.94" />
                    <path d="M28 86 60 93 58 74 35 71 28 86Z" fill={layers.fill} opacity="0.9" />
                    <path d="M14 26 27 28 49 18 73 29 79 15M7 58 23 49 35 71 58 74 77 50 95 39M28 86 35 71 58 74 60 93" fill="none" stroke={layers.facetStroke} strokeWidth="1.02" strokeLinejoin="round" strokeLinecap="round" />
                </>
            )
        },
    },
    d20: {
        assetPath: "/dice/d20.svg",
        shape: "icosahedron",
        viewBox: "-16 0 512 512",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d={d20ReferencePath} fill={layers.fill} stroke={layers.stroke} strokeWidth="10" strokeLinejoin="round" />
                    <path d={d20ReferencePath} fill={`url(#${gradientId})`} opacity="0.36" />
                </>
            )
        },
    },
    d100: {
        assetPath: "/dice/d100.svg",
        shape: "percentile-trapezohedron",
        viewBox: "0 0 100 100",
        render: ({ color, gradientId }) => {
            const layers = buildColorLayers(color)

            return (
                <>
                    <path d="M49 12 81 20 95 42 87 68 66 87 33 87 12 68 4 42 18 20 49 12Z" fill={layers.base} stroke={layers.stroke} strokeWidth="2.25" strokeLinejoin="round" />
                    <path d="M49 12 18 20 34 38 49 31 65 38 81 20 49 12Z" fill={`url(#${gradientId})`} opacity="0.74" />
                    <path d="M18 20 4 42l30-4 15-7-15 7L18 20Z" fill={layers.fillStrong} opacity="0.54" />
                    <path d="M81 20 95 42l-30-4-16-7 16 7L81 20Z" fill={layers.fill} opacity="0.92" />
                    <path d="M4 42 12 68 34 63V38L4 42Zm91 0-29-4v25l21 5 8-26Z" fill={layers.fill} opacity="0.9" />
                    <path d="M12 68 33 87V63l-21 5Zm75 0-21 19V63l21 5Z" fill={layers.fillStrong} opacity="0.72" />
                    <path d="M34 38h31v25H34V38Z" fill={layers.fill} opacity="0.9" stroke={layers.facetStroke} strokeWidth="1.02" />
                    <path d="M18 20 34 38 49 31 65 38 81 20M4 42l30-4m61 4-30-4M12 68l21-5m54 5-21-5M49 12v19" fill="none" stroke={layers.facetStroke} strokeWidth="1.02" strokeLinejoin="round" strokeLinecap="round" />
                </>
            )
        },
    },
}
