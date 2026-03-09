export type ItemType = "ferramenta" | "arma" | "armadura" | "escudo" | "consumível" | "munição" | "qualquer";
export type ItemRarity = "comum" | "incomum" | "raro" | "muito raro" | "lendário" | "artefato";
export type ArmorType = "leve" | "média" | "pesada" | "nenhuma";
export type DamageType = 
    | "cortante" | "perfurante" | "concussão" | "ácido" | "fogo" | "frio" 
    | "relâmpago" | "trovão" | "veneno" | "psíquico" | "radiante" | "necrótico" | "força";

export interface DiceValue {
    quantidade: number;
    tipo: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
}

export interface ItemTrait {
    _id?: string;
    name?: string;
    level?: number;
    description: string;
}

export interface Item {
    _id: string
    id: string // Used in frontend, mapped from _id
    name: string
    description: string
    source: string
    status: "active" | "inactive"
    image?: string
    price?: string
    isMagic: boolean
    type: ItemType
    rarity: ItemRarity
    traits: ItemTrait[]

    // Weapon specifics
    properties?: ItemTrait[]
    damageDice?: DiceValue
    damageType?: DamageType
    mastery?: string // Talent-like rule field

    // Tool specifics
    attributeUsed?: string

    // Armor specifics
    ac?: number
    acType?: "base" | "bonus"
    armorType?: ArmorType

    // Shield specifics
    acBonus?: number

    // Consumable specifics
    effectDice?: DiceValue

    createdAt: string
    updatedAt: string
}

export type CreateItemInput = Omit<Item, "_id" | "id" | "createdAt" | "updatedAt">;
export type UpdateItemInput = Partial<CreateItemInput>;

export interface ItemFilterParams {
    search?: string;
    type?: ItemType | "all";
    rarity?: ItemRarity | "all";
    status?: "active" | "inactive" | "all";
    page?: number;
    limit?: number;
}

export interface ItemsResponse {
    items: Item[];
    total: number;
    page: number;
    limit: number;
}
