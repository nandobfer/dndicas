/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useForm } from "react-hook-form"
import type { MaddoxGameNpcDto, MaddoxGameSceneImageDto, MaddoxSceneImageControlDto } from "@/features/maddox/game-types"
import type { CreateMaddoxCampaignInput } from "@/features/maddox/campaign-schemas"
import { GameSceneImage } from "@/features/maddox/components/game/GameSceneImage"
import { SceneImageButton } from "@/features/maddox/components/game/SceneImageButton"
import { NpcPanel } from "@/features/maddox/components/game/NpcPanel"
import { SceneImagesField } from "@/features/maddox/components/campaigns/SceneImagesField"
import { sceneImagesGeneratorNotice } from "@/features/maddox/components/settings/MaddoxSceneImagesCard"

/** Maddox 10 — imagens nas cenas na tela: imagem na bolha, botão do dono, retrato de NPC e a chave da campanha. */

const image = (over: Partial<MaddoxGameSceneImageDto> = {}): MaddoxGameSceneImageDto => ({ id: "i1", status: "done", url: "/api/upload?key=cena.png", caption: "O farol apagado", situationLabel: "Novo local ou cenário", source: "tool", error: null, ...over })
const control = (over: Partial<MaddoxSceneImageControlDto> = {}): MaddoxSceneImageControlDto => ({ owner: true, canRequest: true, reason: null, generating: false, remainingToday: 7, campaignEnabled: true, canRequestPortrait: true, ...over })

describe("GameSceneImage", () => {
    it("pintando: placeholder com aviso, sem imagem", () => {
        render(<GameSceneImage image={image({ status: "generating", url: null })} color="#3b82f6" />)
        const box = screen.getByTestId("scene-image")
        expect(box.dataset.status).toBe("generating")
        expect(screen.getByRole("status").textContent).toContain("O Maddox está pintando a cena…")
        expect(screen.queryByRole("img")).toBeNull()
    })

    it("pronta: imagem com a legenda e a situação; clique amplia", async () => {
        render(<GameSceneImage image={image()} color="#3b82f6" />)
        const img = screen.getByRole("img", { name: "O farol apagado" }) as HTMLImageElement
        expect(img.getAttribute("src")).toBe("/api/upload?key=cena.png")
        expect(screen.getByText("O farol apagado")).toBeTruthy()
        expect(screen.getByText(/Novo local ou cenário/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Ampliar: O farol apagado" }))
        expect(await screen.findByTestId("scene-image-full")).toBeTruthy()
    })

    it("falha: linha discreta com o aviso", () => {
        render(<GameSceneImage image={image({ status: "failed", url: null, error: "Não foi possível gerar a imagem desta cena." })} color="#3b82f6" />)
        expect(screen.getByTestId("scene-image").dataset.status).toBe("failed")
        expect(screen.getByText("Não foi possível gerar a imagem desta cena.")).toBeTruthy()
    })
})

describe("SceneImageButton", () => {
    it("só o dono vê; pede ao clicar", () => {
        const onRequest = vi.fn()
        const { rerender } = render(<SceneImageButton control={control({ owner: false })} busy={false} onRequest={onRequest} />)
        expect(screen.queryByTestId("scene-image-button")).toBeNull()
        rerender(<SceneImageButton control={control()} busy={false} onRequest={onRequest} />)
        const button = screen.getByTestId("scene-image-button") as HTMLButtonElement
        expect(button.textContent).toContain("Gerar imagem da cena")
        expect(button.title).toContain("7 restante(s) hoje")
        fireEvent.click(button)
        expect(onRequest).toHaveBeenCalledTimes(1)
    })

    it("bloqueado mostra o motivo; pintando mostra o andamento", () => {
        const { rerender } = render(<SceneImageButton control={control({ canRequest: false, reason: "Limite de 10 imagens por dia desta campanha atingido." })} busy={false} onRequest={vi.fn()} />)
        const button = screen.getByTestId("scene-image-button") as HTMLButtonElement
        expect(button.disabled).toBe(true)
        expect(button.title).toBe("Limite de 10 imagens por dia desta campanha atingido.")
        rerender(<SceneImageButton control={control({ canRequest: false, generating: true, reason: "O Maddox já está pintando uma cena." })} busy={false} onRequest={vi.fn()} />)
        expect(screen.getByTestId("scene-image-button").textContent).toContain("Pintando a cena…")
    })
})

describe("NpcPanel — retrato", () => {
    const npcs: MaddoxGameNpcDto[] = [
        { id: "n1", name: "Varn", portraitUrl: null, status: "active" },
        { id: "n2", name: "Mira", portraitUrl: "/api/upload?key=mira.png", status: "active", portraitGenerating: true },
    ]

    it("dono pede o retrato; o NPC que está sendo pintado mostra o andamento e não aceita outro pedido", () => {
        const onRequest = vi.fn()
        render(<NpcPanel npcs={npcs} color="#3b82f6" portraits={{ canRequest: true, requesting: null, onRequest }} />)
        fireEvent.click(screen.getByRole("button", { name: "Gerar retrato de Varn" }))
        expect(onRequest).toHaveBeenCalledWith("n1")
        expect((screen.getByRole("button", { name: "Gerar novo retrato de Mira" }) as HTMLButtonElement).disabled).toBe(true)
        expect(screen.getByRole("status", { name: "Pintando o retrato de Mira" })).toBeTruthy()
    })

    it("jogador não vê o botão", () => {
        render(<NpcPanel npcs={npcs} color="#3b82f6" />)
        expect(screen.queryByRole("button", { name: /Gerar retrato/ })).toBeNull()
    })
})

describe("SceneImagesField (chave da campanha)", () => {
    function Harness({ onValue }: { onValue: (value: boolean | undefined) => void }) {
        const form = useForm<CreateMaddoxCampaignInput>({ defaultValues: { name: "x", rigor: "narrativo", sceneImages: true } })
        onValue(form.watch("sceneImages"))
        return <SceneImagesField form={form} />
    }

    it("desliga e liga de novo sem desmontar o campo, com o texto de cada estado", async () => {
        let value: boolean | undefined
        render(<Harness onValue={(next) => (value = next)} />)
        const field = screen.getByTestId("scene-images-field")
        expect(field.textContent).toContain("O Maddox ilustra os momentos marcantes")
        fireEvent.click(screen.getByRole("button", { name: "Desligadas" }))
        await waitFor(() => expect(value).toBe(false))
        expect(screen.getByTestId("scene-images-field")).toBe(field)
        expect(field.textContent).toContain('Sem imagens automáticas: só quando você pedir "Gerar imagem da cena" na mesa.')
        fireEvent.click(screen.getByRole("button", { name: "Ligadas" }))
        await waitFor(() => expect(value).toBe(true))
        expect(field.textContent).toContain("O Maddox ilustra os momentos marcantes")
    })
})

describe("aviso do Gerador de imagens na aba", () => {
    const dto = (provider: "gemini" | "openai" | null, model: string | null, available = true) => ({
        settings: { enabled: true, provider, model, instructions: "x", defaultAspectRatio: "1:1" as const },
        isDefault: false,
        availability: { available, reason: available ? null : 'O "Gerador de imagens" está desativado.' },
        updatedAt: null,
    })

    it("indisponível, modelo sem imagens de entrada ou tudo certo", () => {
        expect(sceneImagesGeneratorNotice(dto(null, null, false))).toContain("está desativado")
        expect(sceneImagesGeneratorNotice(dto("gemini", "imagen-4.0-generate-001"))).toContain("não aceita imagens de referência")
        expect(sceneImagesGeneratorNotice(dto("gemini", "gemini-2.5-flash-image"))).toBeNull()
        expect(sceneImagesGeneratorNotice(undefined)).toBeNull()
    })
})
