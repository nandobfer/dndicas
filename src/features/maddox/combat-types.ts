import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxReactionTrigger } from "./constants"
import type { CombatCondition, CombatEconomy, CombatFlags, RollMode } from "./combat-rules"
import type { CombatEconomySlot, CombatOption, CombatOptionCategory } from "./combat-options"

/**
 * Tipos do combate tático (Maddox 7), sem Mongoose: o estado gravado em `maddox_combats` (ordem, estatísticas dos
 * adversários, estado dos personagens) e os subdocumentos das mensagens `combat-action`, `combat-roll` e
 * `combat-reaction`. PV, PV temporários, testes contra a morte, espaços e cargas dos personagens ficam na FICHA.
 */

/** Ação de um adversário (do bloco do catálogo de Monstros ou do bloco próprio do Rigoroso). */
export interface MonsterActionStat {
    name: string
    kind: "attack" | "save" | "other"
    /** Bônus de ataque (`attack`). */
    bonus: number | null
    /** CD e atributo da salvaguarda (`save`). */
    dc: number | null
    ability: AttributeType | null
    /** Dano em dados ("1d6+2"); `null` = sem dano. */
    damage: string | null
    damageType: string | null
    halfOnSave: boolean
    ranged: boolean
    /** Recarga ("5-6"): o servidor rola o d6 no início do turno do adversário. */
    recharge: string | null
    available: boolean
    /** Ação de reação ou ação bônus do bloco. */
    economy: "action" | "bonus" | "reaction"
    description: string
}

export interface MonsterStats {
    source: "catalog" | "custom"
    monsterId: string | null
    ac: number
    hpMax: number
    hp: number
    tempHp: number
    initiativeBonus: number
    dexterity: number
    saves: Record<AttributeType, number>
    resistances: string[]
    immunities: string[]
    vulnerabilities: string[]
    conditionImmunities: string[]
    actions: MonsterActionStat[]
    /** Ataques por ação Atacar (Ataques Múltiplos). */
    multiattack: number
}

/** Estado de luta de um adversário (soma ao `IMaddoxCombatant` do Maddox 6). */
export interface TacticalCombatantState {
    actorKey: string
    groupKey: string
    stats: MonsterStats
    conditions: CombatCondition[]
    flags: CombatFlags
    economy: CombatEconomy
    concentration: { spell: string; sinceRound: number } | null
    defeated: boolean
}

/** Estado de luta de um personagem jogador (PV na ficha). */
export interface TacticalCharacterState {
    actorKey: string
    characterId: string
    memberId: string
    userId: string
    name: string
    sheetId: string | null
    conditions: CombatCondition[]
    flags: CombatFlags
    economy: CombatEconomy
    concentration: { spell: string; sinceRound: number } | null
    stable: boolean
    dead: boolean
    /** Espelho de "0 PV" (a ficha é a fonte; atualizado a cada dano ou cura do combate). */
    hpZero: boolean
    /** Saiu da campanha durante o combate (fica fora da ordem). */
    left: boolean
    /** Ação preparada (Preparar): vira a reação de gatilho "preparada". */
    ready: { optionId: string; label: string; trigger: string } | null
}

/** Posição na ordem de iniciativa. */
export interface InitiativeSlot {
    actorKey: string
    kind: "character" | "combatant"
    name: string
    /** `null` = ainda não rolou (fase de iniciativa). */
    total: number | null
    d20: number | null
    modifier: number
    dexterity: number
    joinIndex: number
    /** Adversários iguais compartilham a iniciativa. */
    groupKey: string
}

export interface TacticalCombatState {
    mode: "tactical"
    phase: "initiative" | "running"
    round: number
    /** Índice em `order` de quem age agora (−1 antes do primeiro). */
    activeIndex: number
    order: InitiativeSlot[]
    characters: TacticalCharacterState[]
    /** Quem foi surpreendido (desvantagem na iniciativa). */
    surprise: "personagens" | "adversarios" | null
    /** Narrações com todos os inimigos (ou todos os personagens) fora de combate sem `end_combat`. */
    staleEndNarrations: number
    /** Adversários que agem na geração do mestre em curso, em ordem, e o personagem da vez seguinte. */
    queue: string[]
    nextKey: string | null
    /** Turno do mestre para o qual a fila foi preparada (preparar de novo na retomada não repete nada). */
    queueTurn: number | null
}

// ── Mensagens ─────────────────────────────────────────────────────────────────

/** Um passo de uma ação (ataque, dano, cura, salvaguarda de um alvo, teste). */
export interface CombatActionStep {
    kind: "attack" | "damage" | "heal" | "save" | "check"
    targetKey: string | null
    targetName: string | null
    status: "pending" | "done" | "skipped"
    /** Quem rola: o jogador (`player`) ou o servidor (`server`, dados dos adversários). */
    roller: "player" | "server"
    /** Expressão do d20 ou dos dados ("1d20+5", "2d6+3"). */
    dice: string
    mode: RollMode
    roll: DiceRollResponse | null
    total: number | null
    /** Ataque: acertou, crítico. Salvaguarda: sucesso. */
    hit: boolean | null
    critical: boolean
    success: boolean | null
    /** Dano ou cura aplicados (depois de resistências). */
    amount: number | null
    damageType: string | null
    /** Texto curto do efeito ("Goblin 1 caiu", "resistente: metade"). */
    note: string | null
    /** Perícia do teste (`check`). */
    skill: string | null
}

export interface IMaddoxCombatAction {
    combatId: string
    round: number
    actorKey: string
    actorName: string
    actorKind: "character" | "combatant"
    economy: CombatEconomySlot
    category: CombatOptionCategory | "monster"
    optionId: string
    label: string
    targets: { actorKey: string; name: string }[]
    spellLevel: number | null
    freeText: string | null
    status: "pending" | "resolved" | "cancelled"
    steps: CombatActionStep[]
    /** Linha para o Maddox e a transcrição ("Lyra atacou Goblin 1 com Espada Longa: acertou (17), 9 cortante"). */
    summary: string
    /** Em uma espera do turno do mestre (reação, ataque de oportunidade): a rodada de espera. */
    waitRound: number | null
    /** Magia de salvaguarda: atributo, CD e "metade no sucesso" (fixados ao lançar). */
    save?: { ability: AttributeType; dc: number; halfOnSave: boolean } | null
    /** Ataque à distância (desvantagem contra alvo caído, sem crítico automático). */
    ranged?: boolean
}

export interface IMaddoxCombatRoll {
    combatId: string
    kind: "initiative" | "death-save" | "concentration" | "save" | "damage"
    waitRound: number | null
    status: "pending" | "rolled" | "cancelled"
    ability: AttributeType | null
    dc: number | null
    mode: RollMode
    /** Expressão rolada ("1d20+3", "2d6"). */
    dice: string
    roll: DiceRollResponse | null
    total: number | null
    success: boolean | null
    reason: string
    /** Efeito que a salvaguarda decide (dano pré-rolado de um adversário, condição). */
    effect: { sourceName: string; damage: number | null; damageType: string | null; halfOnSave: boolean; condition: string | null } | null
    /** Dano pedido pelo Maddox: em quem (adversário). */
    targetKey: string | null
    outcome: string | null
    rolledBy: string | null
}

export interface IMaddoxCombatReaction {
    combatId: string
    waitRound: number
    trigger: MaddoxReactionTrigger
    description: string
    status: "pending" | "used" | "declined" | "expired"
    options: CombatOption[]
    choice: string | null
    deadline: Date
    /** Ataque do adversário que espera a reação (gatilho "atingido"): resolvido depois da escolha. */
    pendingAttack: { attackerKey: string; attackerName: string; actionName: string; total: number; d20: number; damage: number; damageType: string | null; critical: boolean } | null
    sourceKey: string | null
    outcome: string | null
    decidedBy: string | null
}
