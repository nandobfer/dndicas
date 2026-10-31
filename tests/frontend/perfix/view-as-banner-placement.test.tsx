/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/perfix/components/view-as/ViewAsBanner", () => ({ ViewAsBanner: () => <div role="status">Visualizando como Jogador</div> }))

const { default: OwlbearLayout } = await import("@/app/owlbear/layout")

describe("faixa da simulação 'Visualizar como' fora do layout do app", () => {
    it("as extensões do Owlbear mostram a faixa antes do conteúdo", () => {
        const { container } = render(<OwlbearLayout><p>Ficha no Owlbear</p></OwlbearLayout>)
        expect(container.firstElementChild).toBe(screen.getByRole("status"))
        expect(screen.getByText("Ficha no Owlbear")).toBeInTheDocument()
    })

    it("todas as rotas fora de (dashboard) estão sob um layout que mostra a faixa", async () => {
        const { readdirSync, statSync } = await import("node:fs")
        const { join } = await import("node:path")
        const app = join(process.cwd(), "src/app")
        const routeGroups = readdirSync(app).filter((name) => statSync(join(app, name)).isDirectory() && name !== "api")
        expect(routeGroups.sort()).toEqual(["(dashboard)", "owlbear"])
    })
})
