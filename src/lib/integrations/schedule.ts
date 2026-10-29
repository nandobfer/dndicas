/**
 * Agendamento amigável dos crons.
 *
 * Em vez de expressões cron (`30 20 * * *`), o administrador escolhe um tipo e preenche
 * campos legíveis. Todos os horários são interpretados no fuso de Brasília, mesmo com o
 * processo rodando em `TZ=UTC` (ver `ecosystem.config.js`). Módulo puro: usado pelo
 * scheduler no servidor e pelo editor na tela.
 */

export const SCHEDULE_TIMEZONE = "America/Sao_Paulo"

export type Schedule =
    | { type: "interval"; minutes: number }
    | { type: "daily"; time: string }
    | { type: "weekly"; days: number[]; time: string }
    | { type: "monthly"; day: number; time: string }

export type ScheduleType = Schedule["type"]

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
    interval: "A cada intervalo",
    daily: "Diariamente",
    weekly: "Semanalmente",
    monthly: "Mensalmente",
}

/** Índice = `Date#getDay()` (0 = domingo). */
export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const
export const WEEKDAY_SHORT_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

export function isValidTime(time: string): boolean {
    return TIME_RE.test(time)
}

/** Mensagem de erro em pt-BR, ou `null` quando o agendamento é válido. */
export function validateSchedule(schedule: Schedule): string | null {
    switch (schedule.type) {
        case "interval":
            if (!Number.isInteger(schedule.minutes) || schedule.minutes < 1 || schedule.minutes > 7 * 24 * 60) {
                return "O intervalo deve ser um número inteiro de minutos entre 1 e 10080"
            }
            return null
        case "daily":
            return isValidTime(schedule.time) ? null : "Informe um horário válido (HH:mm)"
        case "weekly":
            if (!isValidTime(schedule.time)) return "Informe um horário válido (HH:mm)"
            if (schedule.days.length === 0) return "Selecione ao menos um dia da semana"
            if (schedule.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Dia da semana inválido"
            return null
        case "monthly":
            if (!isValidTime(schedule.time)) return "Informe um horário válido (HH:mm)"
            if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 31) {
                return "O dia do mês deve estar entre 1 e 31"
            }
            return null
    }
}

// ---------------------------------------------------------------------------
// Fuso horário
// ---------------------------------------------------------------------------

interface ZonedParts {
    year: number
    month: number // 1-12
    day: number
    hour: number
    minute: number
    weekday: number // 0 = domingo
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
})

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function zonedParts(date: Date): ZonedParts {
    const map: Record<string, string> = {}
    for (const part of partsFormatter.formatToParts(date)) map[part.type] = part.value
    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour) % 24,
        minute: Number(map.minute),
        weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
    }
}

/** Offset (ms) do fuso em relação ao UTC no instante dado. Brasília: -3h. */
function zoneOffsetMs(date: Date): number {
    const p = zonedParts(date)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    const truncated = Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS
    return asUtc - truncated
}

/** Instante UTC que corresponde à data/hora de parede informada no fuso de Brasília. */
export function zonedWallTimeToDate(year: number, month: number, day: number, hour: number, minute: number): Date {
    const guess = Date.UTC(year, month - 1, day, hour, minute)
    const first = guess - zoneOffsetMs(new Date(guess))
    // Segunda passada corrige eventuais transições de horário de verão.
    return new Date(guess - zoneOffsetMs(new Date(first)))
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parseTime(time: string): { hour: number; minute: number } {
    const [h, m] = time.split(":").map(Number)
    return { hour: h, minute: m }
}

// ---------------------------------------------------------------------------
// Próxima execução
// ---------------------------------------------------------------------------

/**
 * Primeiro instante ESTRITAMENTE posterior a `from` em que o agendamento dispara.
 *
 * Intervalos são alinhados a uma grade fixa desde a época Unix, e não ao horário da última
 * execução: com várias instâncias calculando independentemente, todas chegam ao mesmo
 * `nextRunAt`, e um atraso de execução não acumula deriva.
 */
export function nextRunAt(schedule: Schedule, from: Date): Date {
    const fromMs = from.getTime()

    if (schedule.type === "interval") {
        const step = Math.max(1, Math.floor(schedule.minutes)) * MINUTE_MS
        return new Date((Math.floor(fromMs / step) + 1) * step)
    }

    const { hour, minute } = parseTime(schedule.time)
    const today = zonedParts(from)

    if (schedule.type === "monthly") {
        for (let offset = 0; offset < 14; offset++) {
            const monthIndex = today.month - 1 + offset
            const year = today.year + Math.floor(monthIndex / 12)
            const month = (monthIndex % 12) + 1
            // Dia 31 em fevereiro vira o último dia do mês, em vez de pular o mês.
            const day = Math.min(schedule.day, daysInMonth(year, month))
            const candidate = zonedWallTimeToDate(year, month, day, hour, minute)
            if (candidate.getTime() > fromMs) return candidate
        }
        throw new Error("Não foi possível calcular a próxima execução mensal")
    }

    const allowedDays = schedule.type === "weekly" ? new Set(schedule.days) : null
    const baseNoonUtc = Date.UTC(today.year, today.month - 1, today.day, 12)

    for (let offset = 0; offset < 8; offset++) {
        const dayParts = new Date(baseNoonUtc + offset * DAY_MS)
        const y = dayParts.getUTCFullYear()
        const m = dayParts.getUTCMonth() + 1
        const d = dayParts.getUTCDate()
        const weekday = dayParts.getUTCDay()
        if (allowedDays && !allowedDays.has(weekday)) continue
        const candidate = zonedWallTimeToDate(y, m, d, hour, minute)
        if (candidate.getTime() > fromMs) return candidate
    }
    throw new Error("Não foi possível calcular a próxima execução")
}

// ---------------------------------------------------------------------------
// Descrição legível
// ---------------------------------------------------------------------------

function describeInterval(minutes: number): string {
    if (minutes % (24 * 60) === 0) {
        const days = minutes / (24 * 60)
        return days === 1 ? "A cada dia" : `A cada ${days} dias`
    }
    if (minutes % 60 === 0) {
        const hours = minutes / 60
        return hours === 1 ? "A cada hora" : `A cada ${hours} horas`
    }
    return minutes === 1 ? "A cada minuto" : `A cada ${minutes} minutos`
}

function joinPt(items: string[]): string {
    if (items.length <= 1) return items.join("")
    return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`
}

export function describeSchedule(schedule: Schedule): string {
    switch (schedule.type) {
        case "interval":
            return describeInterval(schedule.minutes)
        case "daily":
            return `Todos os dias às ${schedule.time}`
        case "weekly": {
            const days = [...new Set(schedule.days)].sort((a, b) => a - b)
            if (days.length === 7) return `Todos os dias às ${schedule.time}`
            if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return `De segunda a sexta às ${schedule.time}`
            return `${joinPt(days.map((d) => WEEKDAY_LABELS[d] ?? "?"))} às ${schedule.time}`
        }
        case "monthly":
            return `Todo dia ${schedule.day} do mês às ${schedule.time}`
    }
}

/** Chave estável do agendamento: quando muda, o scheduler recalcula o `nextRunAt`. */
export function scheduleSignature(schedule: Schedule): string {
    switch (schedule.type) {
        case "interval":
            return `interval:${schedule.minutes}`
        case "daily":
            return `daily:${schedule.time}`
        case "weekly":
            return `weekly:${[...new Set(schedule.days)].sort((a, b) => a - b).join(",")}@${schedule.time}`
        case "monthly":
            return `monthly:${schedule.day}@${schedule.time}`
    }
}
