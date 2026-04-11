export interface ChargesFixed {
    mode: "fixed"
    value: string
}

export interface ChargesProficiency {
    mode: "proficiency"
}

export interface ChargesByLevelRow {
    level: number
    value: string
}

export interface ChargesByLevel {
    mode: "byLevel"
    values: ChargesByLevelRow[]
}

export type Charges = ChargesFixed | ChargesProficiency | ChargesByLevel
