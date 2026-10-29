/**
 * Nomes de eventos do consumo de IA (módulo PURO, sem dependências de servidor) — usado tanto pelo
 * publicador (servidor) quanto pelos hooks de cliente, que não podem alcançar Mongoose/Pusher.
 */

/** Evento em `private-app` quando uma linha de consumo do OpenCode é registrada. */
export const AI_CONSUMPTION_UPDATED_EVENT = "ai-consumption-updated"
