import * as React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SheetInput } from "@/features/character-sheets/components/sheet-input"

describe("SheetInput", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it("debounces repeated +/- control emissions for numeric inputs", () => {
        const handleChangeValue = vi.fn()

        render(
            <SheetInput
                type="number"
                showControls
                value="10"
                onChangeValue={handleChangeValue}
            />,
        )

        const input = screen.getByRole("spinbutton")
        const buttons = screen.getAllByRole("button")
        const plusButton = buttons[1]

        fireEvent.click(plusButton)
        fireEvent.click(plusButton)
        fireEvent.click(plusButton)

        expect(input).toHaveValue(13)
        expect(handleChangeValue).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(299)
        })

        expect(handleChangeValue).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(handleChangeValue).toHaveBeenCalledTimes(1)
        expect(handleChangeValue).toHaveBeenCalledWith("13")
    })

    it("flushes a pending control emission on blur", () => {
        const handleChangeValue = vi.fn()

        render(
            <SheetInput
                type="number"
                showControls
                value="5"
                onChangeValue={handleChangeValue}
            />,
        )

        const input = screen.getByRole("spinbutton")
        const plusButton = screen.getAllByRole("button")[1]

        fireEvent.click(plusButton)
        expect(input).toHaveValue(6)
        expect(handleChangeValue).not.toHaveBeenCalled()

        fireEvent.blur(input)

        expect(handleChangeValue).toHaveBeenCalledTimes(1)
        expect(handleChangeValue).toHaveBeenCalledWith("6")

        act(() => {
            vi.advanceTimersByTime(300)
        })

        expect(handleChangeValue).toHaveBeenCalledTimes(1)
    })

    it("allows controls to emit immediately when debounce is disabled", () => {
        const handleChangeValue = vi.fn()

        render(
            <SheetInput
                type="number"
                showControls
                debounceMs={0}
                value="2"
                onChangeValue={handleChangeValue}
            />,
        )

        const plusButton = screen.getAllByRole("button")[1]

        fireEvent.click(plusButton)

        expect(handleChangeValue).toHaveBeenCalledTimes(1)
        expect(handleChangeValue).toHaveBeenCalledWith("3")
    })
})
