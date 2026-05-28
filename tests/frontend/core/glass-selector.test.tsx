import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { GlassSelector } from "@/components/ui/glass-selector"

describe("GlassSelector", () => {
    it("keeps selected single options selected by default", () => {
        const onChange = vi.fn()

        render(
            <GlassSelector
                value="a"
                onChange={onChange}
                options={[{ value: "a", label: "A" }]}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "A" }))

        expect(onChange).toHaveBeenCalledWith("a")
    })

    it("clears selected single options when allowDeselect is enabled", () => {
        const onChange = vi.fn()

        render(
            <GlassSelector
                value="a"
                onChange={onChange}
                options={[{ value: "a", label: "A" }]}
                allowDeselect
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "A" }))

        expect(onChange).toHaveBeenCalledWith(undefined)
    })

    it("keeps multi-select items removable", () => {
        const onChange = vi.fn()

        render(
            <GlassSelector
                mode="multi"
                value={["a", "b"]}
                onChange={onChange}
                options={[
                    { value: "a", label: "A" },
                    { value: "b", label: "B" },
                ]}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "A" }))

        expect(onChange).toHaveBeenCalledWith(["b"])
    })
})
