"use client"

import { RefreshCcw } from "lucide-react"
import { Button } from "@/core/ui/button"
import { OptionAutocomplete, type OptionAutocompleteOption } from "@/components/ui/option-autocomplete"
import { useOpenCodeModels } from "../hooks/useFeedback"

export function FeedbackOpenCodeModelSelect({ value, changeAction, disabled }: { value: string; changeAction: (value: string) => void; disabled?: boolean }) {
    const modelsQuery = useOpenCodeModels({ enabled: !disabled })
    const models = modelsQuery.data ?? []
    const options: OptionAutocompleteOption<string>[] = models.map((model) => ({
        value: model.id,
        label: model.label,
        description: model.provider ? `Provider: ${model.provider}` : undefined,
        badge: model.provider,
        searchText: [model.id, model.label, model.provider].filter(Boolean).join(" "),
    }))

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Modelo OpenCode</label>
                <Button type="button" variant="ghost" size="sm" onClick={() => modelsQuery.refetch()} disabled={modelsQuery.isFetching || disabled} className="h-7 px-2 text-white/50 hover:text-white">
                    <RefreshCcw className="mr-1 h-3 w-3" />
                    Atualizar
                </Button>
            </div>
            <OptionAutocomplete
                value={value || undefined}
                onChange={(nextValue) => changeAction(typeof nextValue === "string" ? nextValue : "")}
                options={options}
                placeholder={modelsQuery.isLoading ? "Carregando modelos..." : "Selecione um modelo"}
                title="Modelos disponíveis"
                mode="single"
                accentClass="blue"
                searchPlaceholder="Buscar modelo ou provider..."
                emptyMessage="Nenhum modelo encontrado"
                className={disabled || modelsQuery.isLoading || models.length === 0 ? "pointer-events-none opacity-60" : undefined}
            />
            {modelsQuery.error && <p className="text-xs text-red-300">Não foi possível carregar os modelos disponíveis.</p>}
        </div>
    )
}
