"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Field } from "@/components/ui/opex/field"
import { FORM_GRID_WIDE } from "@/components/ui/opex/form-grid"
import { Input } from "@/components/ui/opex/input"
import { OPEX_FILE_SIZE_MB_MAX, OPEX_FILES_PER_MESSAGE_MAX } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))

/** Limites dos arquivos enviados no chat. */
export function OpexFilesCard({ form }: { form: UseFormReturn<OpexAgentSettings> }) {
    const errors = form.formState.errors.files
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Arquivos no chat</CardTitle>
                <CardDescription>
                    Imagens e PDFs vão para o modelo quando o provedor lê o tipo (Gemini também lê áudio e vídeo; DeepSeek só texto). Textos e códigos vão como texto. Os demais ficam só como referência. Só usuários logados enviam arquivos.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className={FORM_GRID_WIDE}>
                    <Field id="opex-files-max" label="Arquivos por mensagem" error={errors?.maxPerMessage?.message}>
                        <Controller
                            control={form.control}
                            name="files.maxPerMessage"
                            render={({ field }) => <Input id="opex-files-max" type="number" step={1} min={1} max={OPEX_FILES_PER_MESSAGE_MAX} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toNumber(event.target.value))} />}
                        />
                    </Field>
                    <Field id="opex-files-size" label="Tamanho máximo por arquivo (MB)" error={errors?.maxSizeMb?.message}>
                        <Controller
                            control={form.control}
                            name="files.maxSizeMb"
                            render={({ field }) => <Input id="opex-files-size" type="number" step={0.5} min={0.1} max={OPEX_FILE_SIZE_MB_MAX} value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(toNumber(event.target.value))} />}
                        />
                        <p className="text-xs text-muted-foreground">Até {OPEX_FILE_SIZE_MB_MAX} MB. O arquivo vai direto ao Storage S3.</p>
                    </Field>
                </div>
            </CardContent>
        </Card>
    )
}
