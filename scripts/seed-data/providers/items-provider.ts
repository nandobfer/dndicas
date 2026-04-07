/**
 * @fileoverview ItemsProvider — seeds items from 5etools data.
 *
 * ─── Stage Overview ────────────────────────────────────────────────────────
 *
 * STAGE 1 (implemented): Base Items XPHB — `items-base.json` → `baseitem[]`
 *   Filter: source === "XPHB" (77 items)
 *   Includes: weapons, armor, shields, ammunition, instruments, spellcasting focuses
 *
 * STAGE 2 (TODO): Adventuring Gear XPHB — `items.json` → `item[]`
 *   Filter: source === "XPHB" && rarity === "none" (140 items)
 *   Includes: Backpack, Acid, Torch, Healer's Kit, Rope, etc.
 *   Changes needed:
 *     - Switch dataFilePath to 'src/lib/5etools-data/items.json'
 *     - Switch dataKey to 'item'
 *     - Add adventuring gear type detection (type G|XPHB → "qualquer")
 *     - Handle entries/descriptions from this file (most have descriptions)
 *
 * STAGE 3 (TODO): Magic Items — `items.json` → `item[]`
 *   Filter: source in [XDMG, DMG, TCE, XGE, ...] && rarity !== "none"
 *   Changes needed:
 *     - Rarity mapping: "uncommon" → "incomum", "rare" → "raro", etc.
 *     - isMagic: true for all
 *     - reqAttune handling (add to traits/description)
 *     - wondrous, scroll, potion detection for type mapping
 *
 * ─── Stage 1 Flow ──────────────────────────────────────────────────────────
 *
 * Flow per item:
 *  1. Filter to XPHB source only
 *  2. Map type, rarity, weapon/armor fields
 *  3. Build description (from entries if present, or stats-based in PT-BR)
 *  4. Translate via this.translateItem(name, description) if item has entries
 *  5. Check if item with that name already exists
 *  6. If not, create it
 */

import { BaseProvider, formatSource } from '../base-provider';
import { createItem } from '../../../src/features/items/api/items-service';
import { ItemModel } from '../../../src/features/items/database/item';
import dbConnect from '../../../src/core/database/db';
import type { CreateItemInput } from '../../../src/features/items/types/items.types';
import type { ItemType, ArmorType, DamageType, DiceValue } from '../../../src/features/items/types/items.types';

// ─── 5etools input types ─────────────────────────────────────────────────────

interface FiveEToolsBaseItemEntry {
    type?: string;
    name?: string;
    entries?: (string | FiveEToolsBaseItemEntry)[];
    items?: (string | FiveEToolsBaseItemEntry)[];
    entry?: string;
}

export interface FiveEToolsBaseItem {
    name: string;
    source: string;
    page?: number;
    edition?: string;
    type: string;
    rarity: string;
    weight?: number;
    value?: number;
    weapon?: boolean;
    armor?: boolean;
    arrow?: boolean;
    bolt?: boolean;
    weaponCategory?: 'simple' | 'martial';
    dmg1?: string;
    dmg2?: string;
    dmgType?: string;
    property?: string[];
    mastery?: string[];
    ac?: number;
    strength?: number;
    stealth?: boolean;
    scfType?: string;
    range?: string;
    entries?: (string | FiveEToolsBaseItemEntry)[];
    hasFluffImages?: boolean;
    reprintedAs?: string[];
    basicRules2024?: boolean;
    srd52?: boolean;
    firearm?: boolean;
}

// ─── Mapping tables ───────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, ItemType> = {
    'M|XPHB': 'arma',
    'R|XPHB': 'arma',
    'LA|XPHB': 'armadura',
    'MA|XPHB': 'armadura',
    'HA|XPHB': 'armadura',
    'S|XPHB': 'escudo',
    'A|XPHB': 'munição',
    'INS|XPHB': 'qualquer',
    'SCF|XPHB': 'qualquer',
};

const ARMOR_TYPE_MAP: Record<string, ArmorType> = {
    LA: 'leve',
    MA: 'média',
    HA: 'pesada',
};

const DAMAGE_TYPE_MAP: Record<string, DamageType> = {
    S: 'cortante',
    P: 'perfurante',
    B: 'concussão',
};

const PROPERTY_MAP: Record<string, string> = {
    '2H|XPHB': 'Duas Mãos',
    'A|XPHB': 'Munição',
    'F|XPHB': 'Acuidade / Finesse',
    'H|XPHB': 'Pesada',
    'LD|XPHB': 'Recarga',
    'L|XPHB': 'Leve',
    'R|XPHB': 'Alcance',
    'T|XPHB': 'Arremesso',
    'V': 'Versátil',
    'V|XPHB': 'Versátil',
};

/** Maps 5etools property codes to their DB reference document IDs + PT-BR names. */
const PROPERTY_REF_MAP: Record<string, { id: string; name: string }> = {
    '2H|XPHB': { id: '699fb437d68d68ded79f4dec', name: 'Propriedade: Duas Mãos' },
    'A|XPHB':  { id: '699fb545d68d68ded79f4f1e', name: 'Propriedade: Munição' },
    'F|XPHB':  { id: '699fb73ad68d68ded79f5075', name: 'Propriedade: Acuidade / Finesse' },
    'H|XPHB':  { id: '699fb572d68d68ded79f4f91', name: 'Propriedade: Pesada' },
    'LD|XPHB': { id: '699fb68fd68d68ded79f5019', name: 'Propriedade: Recarga' },
    'L|XPHB':  { id: '699fb4ccd68d68ded79f4edb', name: 'Propriedade: Leve' },
    'R|XPHB':  { id: '699fb76cd68d68ded79f50a0', name: 'Propriedade: Alcance' },
    'T|XPHB':  { id: '699fb7cbd68d68ded79f50ae', name: 'Propriedade: Arremesso' },
    'V':       { id: '699fb6c3d68d68ded79f5023', name: 'Propriedade: Versátil' },
    'V|XPHB':  { id: '699fb6c3d68d68ded79f5023', name: 'Propriedade: Versátil' },
};

const MASTERY_MAP: Record<string, string> = {
    'Cleave|XPHB': 'Trespassar / Cleave',
    'Graze|XPHB': 'Garantido / Graze',
    'Nick|XPHB': 'Ágil / Nick',
    'Push|XPHB': 'Empurrar / Push',
    'Sap|XPHB': 'Drenar / Sap',
    'Slow|XPHB': 'Lentidão / Slow',
    'Topple|XPHB': 'Derrubar / Topple',
    'Vex|XPHB': 'Afligir / Vex',
};

/** Maps 5etools mastery codes to their DB reference document IDs + PT-BR names. */
const MASTERY_REF_MAP: Record<string, { id: string; name: string }> = {
    'Cleave|XPHB': { id: '699fb3c4d68d68ded79f4dba', name: 'Maestria: Trespassar / Cleave' },
    'Graze|XPHB':  { id: '699fb20dd68d68ded79f4cd2', name: 'Maestria: Garantido / Graze' },
    'Nick|XPHB':   { id: '699fb13dd68d68ded79f4a84', name: 'Maestria: Ágil / Nick' },
    'Push|XPHB':   { id: '699fb1d3d68d68ded79f4c2f', name: 'Maestria: Empurrar / Push' },
    'Sap|XPHB':    { id: '699fb1bfd68d68ded79f4baf', name: 'Maestria: Drenar / Sap' },
    'Slow|XPHB':   { id: '699fb36dd68d68ded79f4d71', name: 'Maestria: Lentidão / Slow' },
    'Topple|XPHB': { id: '699fb188d68d68ded79f4b21', name: 'Maestria: Derrubar / Topple' },
    'Vex|XPHB':    { id: '699fb0dbd68d68ded79f491a', name: 'Maestria: Afligir / Vex' },
};

const WEAPON_CATEGORY_PT: Record<string, string> = {
    simple: 'simples',
    martial: 'marcial',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip 5etools inline tag syntax from text. */
const cleanText = (text: string): string =>
    text
        .replace(/\{@damage\s+([^}]+)\}/g, '$1')
        .replace(/\{@dice\s+([^}]+)\}/g, '$1')
        .replace(/\{@hit\s+([^}]+)\}/g, '+$1')
        .replace(/\{@dc\s+([^}]+)\}/g, 'CD $1')
        .replace(/\{@[a-z]+\s+([^}|]+)(?:\|[^}]*)?\}/gi, '$1')
        .trim();

/** Parse a 5etools dice string like "1d8" into DiceValue. */
const parseDice = (dice: string): DiceValue | undefined => {
    const match = dice.match(/^(\d+)d(\d+)$/);
    if (!match) return undefined;
    const tipo = `d${match[2]}` as DiceValue['tipo'];
    const validDice: DiceValue['tipo'][] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    if (!validDice.includes(tipo)) return undefined;
    return { quantidade: parseInt(match[1], 10), tipo };
};

/** Convert value in copper pieces to a PT-BR price string. */
const formatPriceCp = (valueInCp: number): string => {
    if (valueInCp >= 100) {
        const gp = Math.floor(valueInCp / 100);
        const remainder = valueInCp % 100;
        if (remainder === 0) return `${gp} po`;
        if (remainder >= 10) {
            const sp = Math.floor(remainder / 10);
            const cp = remainder % 10;
            return cp > 0 ? `${gp} po ${sp} pp ${cp} pc` : `${gp} po ${sp} pp`;
        }
        return `${gp} po ${remainder} pc`;
    }
    if (valueInCp >= 10 && valueInCp % 10 === 0) {
        return `${valueInCp / 10} pp`;
    }
    return `${valueInCp} pc`;
};

/** Build a stats-based description in PT-BR for items without `entries`. */
const buildStatDescription = (item: FiveEToolsBaseItem): string => {
    const prefix = item.type.split('|')[0];

    if (item.weapon) {
        const category = item.weaponCategory ? `Arma ${WEAPON_CATEGORY_PT[item.weaponCategory] ?? item.weaponCategory}` : 'Arma';
        const dmg = item.dmg1 && item.dmgType
            ? `Dano: ${item.dmg1} ${DAMAGE_TYPE_MAP[item.dmgType] ?? item.dmgType}${item.dmg2 ? ` (${item.dmg2} versátil)` : ''}.`
            : '';
        const props = (item.property ?? [])
            .map((p) => PROPERTY_MAP[p])
            .filter(Boolean)
            .join(', ');
        const mastery = (item.mastery ?? [])
            .map((m) => MASTERY_MAP[m])
            .filter(Boolean)
            .join(', ');
        return [
            `${category}.`,
            dmg,
            props ? `Propriedades: ${props}.` : '',
            mastery ? `Maestria: ${mastery}.` : '',
        ].filter(Boolean).join(' ');
    }

    if (item.armor) {
        const armorType = ARMOR_TYPE_MAP[prefix] ?? 'desconhecida';
        const parts = [`Armadura ${armorType}.`, `CA: ${item.ac}.`];
        if (item.strength) parts.push(`Requer Força ${item.strength}.`);
        if (item.stealth) parts.push('Desvantagem em Furtividade.');
        return parts.join(' ');
    }

    if (prefix === 'S') {
        return `Escudo. Bônus de CA: +${item.ac ?? 2}.`;
    }

    if (prefix === 'A') {
        const ammoType = item.arrow ? 'Flecha' : item.bolt ? 'Virote' : 'Munição';
        return `${ammoType}. Munição para ataques à distância.`;
    }

    if (prefix === 'INS') {
        return 'Instrumento musical.';
    }

    if (prefix === 'SCF') {
        return 'Foco de conjuração.';
    }

    return `Item do tipo ${item.type}.`;
};

/** Render a list of entry items as HTML list items. */
const renderListItems = (items: (string | FiveEToolsBaseItemEntry)[]): string =>
    items
        .map((it) => {
            if (typeof it === 'string') return `<li>${cleanText(it)}</li>`;
            if (it.entry) return `<li>${cleanText(it.entry)}</li>`;
            if (it.entries) {
                const inner = it.entries
                    .filter((e): e is string => typeof e === 'string')
                    .map(cleanText)
                    .join(' ');
                return it.name ? `<li><strong>${it.name}.</strong> ${inner}</li>` : `<li>${inner}</li>`;
            }
            return '';
        })
        .filter(Boolean)
        .join('');

/** Render a single 5etools entry to HTML. */
const renderEntry = (entry: string | FiveEToolsBaseItemEntry): string => {
    if (typeof entry === 'string') return `<p>${cleanText(entry)}</p>`;
    switch (entry.type) {
        case 'entries':
        case 'inset':
        case 'section': {
            const inner = (entry.entries ?? []).map(renderEntry).join('');
            return entry.name ? `<p><strong>${entry.name}.</strong></p>${inner}` : inner;
        }
        case 'list': {
            return `<ul>${renderListItems(entry.items ?? [])}</ul>`;
        }
        default: {
            if (entry.entries) return entry.entries.map(renderEntry).join('');
            return '';
        }
    }
};

/** Build an HTML description from item entries. */
const buildEntriesHtml = (item: FiveEToolsBaseItem): string =>
    (item.entries ?? []).map(renderEntry).join('');

/** Build image URL from 5etools if available. */
const buildImageUrl = (item: FiveEToolsBaseItem): string => {
    if (!item.hasFluffImages) return '';
    const encodedName = encodeURIComponent(item.name);
    return `https://5e.tools/img/items/${item.source}/${encodedName}.webp`;
};

/** Build an HTML mention span for a DB reference document. */
const buildMentionSpan = (id: string, name: string): string =>
    `<span data-type="mention" data-id="${id}" data-entity-type="Regra" class="mention">${name}</span>`;

// ─── ItemsProvider ────────────────────────────────────────────────────────────

export class ItemsProvider extends BaseProvider<FiveEToolsBaseItem, CreateItemInput> {
    readonly name = 'Items';
    readonly dataFilePath = 'src/lib/5etools-data/items-base.json';
    readonly dataKey = 'baseitem';

    async processItem(item: FiveEToolsBaseItem): Promise<CreateItemInput | null> {
        // Stage 1: only XPHB base items (PHB 2024)
        if (item.source !== 'XPHB') {
            return null;
        }

        const appType = TYPE_MAP[item.type];
        if (!appType) {
            this.log(`Skipping unmapped type "${item.type}" for item "${item.name}"`, 'dim');
            return null;
        }

        const prefix = item.type.split('|')[0];
        const hasEntries = (item.entries ?? []).length > 0;

        // Build name and description
        let name: string;
        let description: string;

        if (hasEntries) {
            const entriesHtml = buildEntriesHtml(item);
            const translated = await this.translateItem(item.name, entriesHtml);
            name = translated.name;
            description = translated.description;
        } else {
            // Stats-based description in PT-BR — only translate the name
            const statDesc = buildStatDescription(item);
            const translated = await this.translateItem(item.name, statDesc);
            name = translated.name;
            description = translated.description;
        }

        const source = formatSource(item.source, item.page);
        const price = item.value ? formatPriceCp(item.value) : '';
        const image = buildImageUrl(item);

        // ── Weapon fields ───────────────────────────────────────────────────────
        const isWeapon = item.weapon === true;
        const damageDice = isWeapon && item.dmg1 ? parseDice(item.dmg1) : undefined;
        const damageType: DamageType | undefined = isWeapon && item.dmgType
            ? (DAMAGE_TYPE_MAP[item.dmgType] ?? 'cortante')
            : undefined;
        const properties = isWeapon
            ? (item.property ?? [])
                .map((p) => {
                    const ref = PROPERTY_REF_MAP[p];
                    if (!ref) return null;
                    // Versátil includes secondary damage dice in the display name
                    const displayName = (p === 'V' || p === 'V|XPHB') && item.dmg2
                        ? `${ref.name} (${item.dmg2})`
                        : ref.name;
                    return { description: buildMentionSpan(ref.id, displayName), level: 1 };
                })
                .filter((p): p is { description: string; level: number } => p !== null)
            : [];
        const mastery = isWeapon && item.mastery?.[0]
            ? (() => {
                const ref = MASTERY_REF_MAP[item.mastery[0]];
                return ref
                    ? buildMentionSpan(ref.id, ref.name)
                    : item.mastery[0].split('|')[0];
            })()
            : undefined;

        // ── Armor fields ─────────────────────────────────────────────────────────
        const isArmor = item.armor === true;
        const armorType: ArmorType | undefined = isArmor ? (ARMOR_TYPE_MAP[prefix] ?? 'nenhuma') : undefined;
        const ac = isArmor ? item.ac : undefined;
        const strReq = isArmor ? (item.strength ?? 0) : 0;
        const stealthDis = isArmor ? (item.stealth ?? false) : false;

        // ── Shield fields ─────────────────────────────────────────────────────────
        const isShield = prefix === 'S';
        const acBonus = isShield ? (item.ac ?? 2) : undefined;

        return {
            name,
            description,
            source,
            status: 'active',
            image,
            price,
            isMagic: false,
            type: appType,
            rarity: 'comum',
            traits: [],
            // Weapon
            ...(isWeapon && {
                damageDice: damageDice ?? { quantidade: 1, tipo: 'd6' },
                damageType: damageType ?? 'cortante',
                properties,
                mastery,
            }),
            // Armor
            ...(isArmor && {
                ac,
                acType: 'base' as const,
                armorType,
                strReq,
                stealthDis,
            }),
            // Shield
            ...(isShield && { acBonus }),
        };
    }

    async findExisting(item: CreateItemInput): Promise<CreateItemInput | null> {
        await dbConnect();
        const nameRegex = new RegExp(
            `^${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
        );
        const doc = await ItemModel.findOne({ name: nameRegex }).lean();
        if (!doc) return null;

        return {
            name: doc.name,
            description: doc.description,
            source: doc.source,
            status: doc.status,
            image: doc.image,
            price: doc.price,
            isMagic: doc.isMagic,
            type: doc.type,
            rarity: doc.rarity,
            traits: doc.traits ?? [],
            properties: doc.properties ?? [],
            damageDice: doc.damageDice,
            damageType: doc.damageType,
            mastery: doc.mastery as string | undefined,
            ac: doc.ac,
            acType: doc.acType,
            armorType: doc.armorType,
            // Only include armor-specific defaults when the item is actually armor,
            // otherwise Mongoose's schema defaults (0 / false) cause false diffs.
            strReq: doc.type === 'armadura' ? doc.strReq : undefined,
            stealthDis: doc.type === 'armadura' ? doc.stealthDis : undefined,
            acBonus: doc.acBonus,
            effectDice: doc.effectDice,
        };
    }

    async update(item: CreateItemInput): Promise<void> {
        await dbConnect();
        const nameRegex = new RegExp(
            `^${item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
        );
        await ItemModel.findOneAndUpdate(
            { name: nameRegex },
            { $set: item },
            { runValidators: true },
        );
    }

    async create(item: CreateItemInput): Promise<void> {
        await createItem(item, 'seed-script');
    }

    override getItemLabel(item: CreateItemInput): string {
        return item.name;
    }
}
