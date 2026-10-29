/**
 * Grades de formulário (regra de layout: campos ocupam TODA a largura disponível).
 * Dois campos dividem a linha; o último de uma quantidade ímpar — inclusive quando outro campo
 * some por condição — ocupa a linha inteira, em vez de deixar meia linha vazia. Abaixo de `sm`,
 * um campo por linha.
 */
const LAST_ODD_FULL_ROW = "sm:[&>*:last-child:nth-child(odd)]:col-span-2"

/** Espaçamento padrão dos formulários (cards e diálogos). */
export const FORM_GRID = `grid gap-4 sm:grid-cols-2 ${LAST_ODD_FULL_ROW}`

/** Espaçamento compacto (listas dinâmicas de campos, ex.: variáveis, parâmetros). */
export const FORM_GRID_COMPACT = `grid gap-3 sm:grid-cols-2 ${LAST_ODD_FULL_ROW}`

/** Espaçamento amplo (páginas de configuração, ex.: integrações). */
export const FORM_GRID_WIDE = `grid gap-5 sm:grid-cols-2 ${LAST_ODD_FULL_ROW}`

/**
 * Três campos curtos dividindo a mesma linha (ex.: SKU | Unidade | Preço). Use só quando a linha
 * tem exatamente 3 campos — com outra quantidade, prefira `FORM_GRID`.
 */
export const FORM_GRID_3 = "grid gap-4 sm:grid-cols-3"
