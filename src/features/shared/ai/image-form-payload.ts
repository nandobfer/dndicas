export type FormPayload = Record<string, unknown>

export const isImageFormPayload = (value: unknown): value is FormPayload => {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const omitNestedArrayFromImagePayload = <
    TPayload extends FormPayload,
    TKey extends keyof TPayload,
>(
    payload: TPayload,
    nestedArrayKey: TKey,
): Omit<TPayload, TKey> => {
    return Object.fromEntries(
        Object.entries(payload).filter(([key]) => key !== nestedArrayKey),
    ) as Omit<TPayload, TKey>
}

export const extractIndexedBranchFromImagePayload = <
    TPayload extends FormPayload,
    TKey extends keyof TPayload,
>(
    payload: TPayload,
    nestedArrayKey: TKey,
    index: number,
): FormPayload => {
    const nestedValue = payload[nestedArrayKey]

    if (!Array.isArray(nestedValue)) {
        return {}
    }

    const branch = nestedValue[index]

    return isImageFormPayload(branch) ? branch : {}
}
