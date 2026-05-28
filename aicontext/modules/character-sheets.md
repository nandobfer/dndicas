# Character Sheets

## Features

### Menções compactas e autofill de combate
Os inputs compactos da ficha abrem a lista de menções ao focar quando estão vazios, sem exigir digitar `@`. Isso vale para identidade, itens, magias e ataques, mantendo editores longos com o comportamento antigo.

As menções da ficha respeitam filtros por contexto: itens aceitam apenas entidades `Item`, ataques aceitam magias e itens do tipo `arma`, e subclasses podem ser filtradas pela classe atual. Truques com dano usam o `dado base` e escalam apenas a quantidade de dados nos níveis 5, 11 e 17. Truques adicionados na lista de magias criam um ataque automático sem duplicar ataques existentes da mesma magia.

### Sincronização de PV nível 1
Quando a ficha está no nível 1 e possui uma classe mencionada, a vida máxima é sincronizada com o dado de vida máximo da classe mais o modificador de Constituição. Níveis acima de 1 permanecem manuais.
