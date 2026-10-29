export type ViewAsRoleOption = { id: string; nome: string; cor: string; permissoes: string[]; coringa: boolean }
export type ViewAsUserOption = { id: string; nome: string; email: string; cargos: ViewAsRoleOption[] }
