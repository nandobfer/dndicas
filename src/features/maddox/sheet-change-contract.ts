/**
 * Contrato das correções da ficha pelo Maddox (lista fechada `combatSheetChangeSchema`) em texto para o modelo — módulo
 * PURO. Usado pela preparação do combate, pelos pedidos de ajuste e pelo "Pergunte ao mestre" (DND-51).
 */

/** DND-51: escolha do jogador (trecho literal da mensagem dele). */
export const SHEET_CHANGE_CHOICE_RULE =
    'Escolha do jogador: o atributo de conjuração de uma regra com lista ("Inteligência, Sabedoria ou Carisma") e a magia escolhida de uma lista ("dois truques à sua escolha") NUNCA são decididos por você. Grave-os só com "choice":{"quote":"trecho literal da mensagem do jogador que diz a escolha"}; sem a escolha dele, o servidor recusa.'

export const SHEET_CHANGE_SOURCE_FIELD = '"source":{"ref":"Tipo:id da entidade lida","quote":"trecho exato do texto dela"}'

export const SHEET_CHANGE_CONTRACT = [
    '"sheetChanges": correções na ficha, cada uma com "type", os campos dela e "reason" (motivo curto, falando com o jogador, citando a regra e a fonte). Tipos permitidos:',
    `  - {"type":"ability","attribute":"strength|dexterity|constitution|intelligence|wisdom|charisma","value":1-30,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"save-proficiency","attribute":"…","proficient":true|false,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"skill-proficiency","skill":"nome da perícia como na ficha","proficient":true|false,"expertise":true|false,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"spellcasting-attribute","attribute":"…"|null,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"spell-slots","circle":1-9,"total":0-9,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"charge-upsert","chargeId":"id existente (opcional)","name":"…","total":n,"used":n,${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"attack-upsert","attackId":"id existente (opcional)","name":"…","attackBonus":n,"damage":{"quantity":n,"faces":4|6|8|10|12|20,"bonus":n,"type":"perfurante"},${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"weapon-mastery","catalogItemId":"catalogItemId do item da ficha","mastery":"nick|vex|sap|topple|graze|push|slow|cleave",${SHEET_CHANGE_SOURCE_FIELD}} (fonte = a característica de classe que dá a maestria, com o trecho do número de armas)`,
    '  - {"type":"attack-remove","attackId":"id"}',
    `  - {"type":"trait-upsert"|"feat-upsert","id":"id existente (opcional)","name":"…","description":"…","ref":"c1 (opcional, para ligar a uma opção acrescentada)",${SHEET_CHANGE_SOURCE_FIELD}}`,
    `  - {"type":"spell-update","spellId":"id","prepared":true|false,"circle":0-9,${SHEET_CHANGE_SOURCE_FIELD} (obrigatório ao mudar "circle"; dispensado só para "prepared")}`,
    '  - {"type":"item-equip","itemId":"id","equipped":true|false}',
    '  - {"type":"text-append","field":"classFeatures|speciesTraits|featuresNotes|weaponProficiencies|notes","text":"…"}',
    `  - {"type":"spell-add","catalogSpellId":"id da magia no catálogo","prepared":true|false,${SHEET_CHANGE_SOURCE_FIELD} (a classe, a espécie ou o talento que concede a magia)} — o truque com dano ganha o ataque na ficha`,
    '  - {"type":"spell-remove","spellId":"id"}',
    '  - {"type":"trait-remove"|"feat-remove","id":"id"}',
    '  - {"type":"item-add","catalogItemId":"id do item no catálogo (ou \\"name\\" para item fora do catálogo)","quantity":n,"equipped":true|false}',
    '  - {"type":"item-remove","itemId":"id"}',
    '  - {"type":"item-quantity","itemId":"id","quantity":n}',
    `${SHEET_CHANGE_CHOICE_RULE}`,
]
