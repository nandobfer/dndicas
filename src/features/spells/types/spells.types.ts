// Base entity (matches Mongoose document)
export interface Spell {
  _id: string;
  name: string;
  description: string; // HTML string from TipTap
  circle: number; // 0-9
  school: SpellSchool;
  saveAttribute?: AttributeType;
  baseDice?: DiceValue;
  extraDicePerLevel?: DiceValue;
  source: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  circleLabel?: string; // Virtual from Mongoose
}

// Dice value structure
export interface DiceValue {
  quantidade: number;
  tipo: DiceType;
}

export type DiceType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

// Spell schools (8 D&D 5e schools)
export type SpellSchool =
  | 'Abjuração'
  | 'Adivinhação'
  | 'Conjuração'
  | 'Encantamento'
  | 'Evocação'
  | 'Ilusão'
  | 'Necromancia'
  | 'Transmutação';

// D&D attributes (for save throws)
export type AttributeType =
  | 'Força'
  | 'Destreza'
  | 'Constituição'
  | 'Inteligência'
  | 'Sabedoria'
  | 'Carisma';

// API input types
export interface CreateSpellInput {
  name: string;
  description: string;
  circle: number;
  school: SpellSchool;
  saveAttribute?: AttributeType;
  baseDice?: DiceValue;
  extraDicePerLevel?: DiceValue;
  source?: string;
  status: 'active' | 'inactive';
}

export interface UpdateSpellInput {
  name?: string;
  description?: string;
  circle?: number;
  school?: SpellSchool;
  saveAttribute?: AttributeType | null; // null to clear
  baseDice?: DiceValue | null;
  extraDicePerLevel?: DiceValue | null;
  source?: string;
  status?: 'active' | 'inactive';
}

// Filter types
export interface SpellsFilters {
  search?: string;
  circles?: number[]; // Multi-select: [0, 1, 3] for Truque, 1º, 3º
  schools?: SpellSchool[]; // Multi-select: ["Evocação", "Abjuração"]
  saveAttributes?: AttributeType[]; // Multi-select
  diceTypes?: DiceType[]; // Multi-select: ["d6", "d8"]
  status?: 'all' | 'active' | 'inactive'; // Admin-only filter
}

// API response types
export interface SpellsListResponse {
  spells: Spell[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SpellResponse {
  spell: Spell;
}
