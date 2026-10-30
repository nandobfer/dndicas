import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export function formatBrl(value: number): string { return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
export function formatHours(value: number): string {
    const minutes = Math.round(value * 60)
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}
export function formatCount(value: number): string { return Math.round(value).toLocaleString("pt-BR") }
export function formatBucketLabel(bucket: string): string {
    return /^\d{4}-\d{2}$/.test(bucket) ? format(parseISO(`${bucket}-01`), "MMM/yy", { locale: ptBR }) : format(parseISO(bucket), "dd/MM", { locale: ptBR })
}
