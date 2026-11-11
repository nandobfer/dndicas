import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import type { DiceModifierPart, DiceRollResponse } from "@/features/dice-roller/types"
import type { MaddoxReactionTrigger } from "./constants"
import type { CombatCondition, CombatEconomy, CombatFlags, RollMode } from "./combat-rules"
import type { CombatEconomySlot, CombatOption, CombatOptionCategory } from "./combat-options"
import type { MaddoxMasteryKey } from "./weapon-mastery"

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
    /**
     * DND-25: foco da geração atual do turno do mestre — a narração da vez do personagem (`character`) ou o bloco de UM
     * adversário (`npc`). `waits` = esperas já abertas por este bloco. `null` = gravação antiga (todos na mesma narração).
     */
    block?: TacticalBlock | null
    /** Adversários da fila que já concluíram o próprio bloco neste turno do mestre. */
    acted?: string[]
}

export interface TacticalBlock {
    kind: "character" | "npc"
    actorKey: string | null
    waits: number
    /** Rodada (`checkRound`) em que o bloco começa: fechar um bloco é idempotente na retomada da mesma rodada. */
    startRound: number
    /** Rodadas em que este bloco abriu espera (contar `waits` uma vez por rodada, mesmo na retomada). */
    waitRounds?: number[]
}

// ── Mensagens ─────────────────────────────────────────────────────────────────

/** Um passo de uma ação (ataque, dano, cura, salvaguarda de um alvo, teste). */
export interface CombatActionStep {
    /** `sneak-choice` (DND-49): depois do acerto, o jogador decide se soma o ataque furtivo (`success` = somou). */
    kind: "attack" | "damage" | "heal" | "save" | "check" | "sneak-choice"
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
    /** DND-49: motivos da vantagem/desvantagem do ataque ("atacante invisível"); os dois juntos = rolagem normal. */
    modeReasons?: string[]
    /** DND-47: parcelas nomeadas do modificador da expressão (vão para a rolagem e aparecem no tooltip do resultado). */
    modifierParts?: DiceModifierPart[]
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
    /** DND-41: ataque furtivo somado ao dano (os dados extras já estão na expressão do passo de dano). */
    sneakAttack?: { dice: string } | null
    /** DND-49: a opção pode somar o ataque furtivo (Acuidade ou à distância): a escolha vem depois do acerto. */
    sneakRider?: { dice: string } | null
    /** DND-49: maestria da arma dominada (efeito depois do acerto ou do erro) e o modificador de atributo usado. */
    mastery?: { key: MaddoxMasteryKey; modifier: number; proficiency: number } | null
    /** DND-49: efeitos de maestria registrados nesta ação (o Maddox narra). */
    masteryNotes?: string[]
    /** Gravados no card: pode cancelar; passo reivindicado por uma rolagem em andamento (uma chamada vence). */
    cancellable?: boolean
    rollingStep?: number | null
    rollingAt?: Date | null
}

export interface IMaddoxCombatRoll {
    combatId: string
    kind: "initiative" | "enemy-initiative" | "death-save" | "concentration" | "save" | "damage"
    waitRound: number | null
    status: "pending" | "rolled" | "cancelled"
    ability: AttributeType | null
    dc: number | null
    mode: RollMode
    /** Expressão rolada ("1d20+3", "2d6"). */
    dice: string
    /** DND-47: parcelas nomeadas do modificador da expressão (tooltip do resultado). */
    modifierParts?: DiceModifierPart[]
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
    /** Iniciativa dos inimigos (DND-25): o grupo e até quando o dado ainda está rolando na tela (a ordem espera). */
    groupKey?: string | null
    groupName?: string | null
    revealUntil?: Date | null
    rolling?: boolean
    rollingAt?: Date | null
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

// ── Preparação da mesa de combate (DND-41) ────────────────────────────────────

export type CombatPrepStatus = "pending" | "running" | "ready" | "failed" | "skipped" | "discarded"

/** O que a preparação muda numa opção que o servidor já calcula (pelo id estável da opção). */
export interface CombatOptionPatch {
    label?: string
    detail?: string
    economy?: "action" | "bonus"
    attack?: { bonus: number; damage: string; damageType: string | null; ranged: boolean; light: boolean; finesse?: boolean }
    save?: { ability: AttributeType; dc: number; halfOnSave: boolean; damage: string | null; damageType: string | null }
    heal?: { dice: string }
}

/** Opção acrescentada pelo Maddox (id `prep:<slug>`), com o recurso que a libera a cada turno. */
export interface PreparedCombatOption {
    id: string
    category: CombatOptionCategory
    economy: "action" | "bonus" | "reaction"
    label: string
    detail: string
    target: CombatOption["target"]
    multiTarget: boolean
    resolution: CombatOption["resolution"]
    attack?: CombatOptionPatch["attack"]
    save?: CombatOptionPatch["save"]
    heal?: CombatOptionPatch["heal"]
    trigger?: MaddoxReactionTrigger
    requires?: { chargeId?: string | null; itemId?: string | null; spellCircle?: number | null; concentration?: boolean } | null
}

export interface CombatPrepOverlay {
    modify: { optionId: string; patch: CombatOptionPatch; reason: string }[]
    remove: { optionId: string; reason: string }[]
    add: { option: PreparedCombatOption; reason: string }[]
    /** Ids da lista base criados por uma gravação na ficha que já virou uma opção acrescentada (não duplicar). */
    suppress: string[]
}

/** Dano adicional marcável (ataque furtivo): detectado pelo servidor ou ajustado pelo Maddox. */
export interface CombatPrepRider {
    key: "sneak-attack"
    dice: string
    source: "server" | "maddox"
    reason: string | null
}

/** Uma mudança para o card "Sua mesa está pronta": o que era, o que ficou e o motivo. */
export interface CombatPrepChange {
    /** `aviso` (DND-49): linha só com o motivo (ex.: o Maddox não consultou o catálogo). */
    area: "ficha" | "opcao" | "dano-adicional" | "aviso"
    label: string
    before: string
    after: string
    reason: string
    /** `false` = não aplicada (a ficha mudou ou o valor não passou na validação). */
    applied: boolean
    /** DND-49: recusada por não estar confirmada no catálogo do DnDicas (o motivo da recusa, para o jogador). */
    refused?: string | null
}

export interface CombatPrepAdjustment {
    id: string
    economy: "action" | "bonus"
    optionId: string
    optionLabel: string
    text: string
    status: "pending" | "accepted" | "refused" | "error"
    reason: string | null
    /** Motivo técnico da falha (só para o dono da campanha). */
    error: string | null
    changes: CombatPrepChange[]
    requestedAt: Date
    decidedAt: Date | null
    /** DND-49: entidades do catálogo lidas ao examinar o pedido e alterações descartadas sem fonte. */
    catalogRefs?: string[]
    droppedWithoutSource?: number
}

export const emptyOverlay = (): CombatPrepOverlay => ({ modify: [], remove: [], add: [], suppress: [] })
