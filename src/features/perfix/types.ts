export interface RoleDto {
    id: string; slug: string; nome: string; descricao: string; cor: string; permissoes: string[];
    ativo: boolean; posicao: number; version: number; createdAt: string; updatedAt: string;
    createdBy?: string; updatedBy?: string;
}
export interface AccessDto {
    permissions: string[]; roles: RoleDto[]; realIsAdministrator: boolean;
    simulation: { tipo: string; alvoId: string; alvoNome: string } | null;
}
