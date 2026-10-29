"use client"

import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { Switch } from "@/components/ui/opex/switch"
import { Textarea } from "@/components/ui/opex/textarea"
import type { PublicFieldDef, PublicFieldValue } from "@/lib/integrations/catalog"
import { SegmentedField } from "./SegmentedField"

interface PublicFieldProps {
    field: PublicFieldDef
    value: PublicFieldValue | ""
    onChange: (value: PublicFieldValue | "") => void
    disabled?: boolean
}

function FieldLabel({ field, htmlFor }: { field: PublicFieldDef; htmlFor: string }) {
    return (
        <Label htmlFor={htmlFor}>
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
            {field.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">({field.unit})</span>}
        </Label>
    )
}

/** Campo público do formulário de integração, desenhado conforme o `kind` do catálogo. */
export function PublicField({ field, value, onChange, disabled }: PublicFieldProps) {
    const inputId = `field-${field.key}`
    const text = typeof value === "string" || typeof value === "number" ? String(value) : ""
    const description = field.description && <p className="text-xs text-muted-foreground">{field.description}</p>

    if (field.kind === "boolean") {
        return (
            <div className="space-y-1.5">
                <Label htmlFor={inputId}>{field.label}</Label>
                <div className="flex h-10 items-center gap-3">
                    <Switch id={inputId} checked={value === true} onCheckedChange={onChange} disabled={disabled} />
                    {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
                </div>
            </div>
        )
    }
    if (field.kind === "segmented") {
        return <SegmentedField field={field} value={text} onChange={onChange} disabled={disabled} />
    }
    if (field.kind === "select") {
        return (
            <div className="space-y-1.5">
                <FieldLabel field={field} htmlFor={inputId} />
                <Select value={text || String(field.defaultValue ?? "")} onValueChange={onChange} disabled={disabled}>
                    <SelectTrigger id={inputId} aria-label={field.label}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(field.options ?? []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {description}
            </div>
        )
    }
    if (field.kind === "textarea") {
        return (
            <div className="space-y-1.5">
                <FieldLabel field={field} htmlFor={inputId} />
                <Textarea
                    id={inputId}
                    rows={4}
                    maxLength={2000}
                    placeholder={field.placeholder ?? (field.defaultValue !== undefined ? String(field.defaultValue) : undefined)}
                    value={text}
                    onChange={(event) => onChange(event.target.value)}
                    disabled={disabled}
                />
                {description}
            </div>
        )
    }
    return (
        <div className="space-y-1.5">
            <FieldLabel field={field} htmlFor={inputId} />
            <Input
                id={inputId}
                type={field.kind === "number" ? "number" : "text"}
                inputMode={field.kind === "number" ? "numeric" : undefined}
                min={field.min}
                max={field.max}
                placeholder={field.placeholder ?? (field.defaultValue !== undefined ? String(field.defaultValue) : undefined)}
                value={text}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className={field.kind === "url" ? "font-mono text-xs" : undefined}
            />
            {description}
        </div>
    )
}
