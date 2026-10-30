import { defineCatalog, type PermissionBranchDef } from "@nandobfer/perfix"
import { INTEGRATION_IDS, getIntegrationDef } from "@/lib/integrations/catalog"

export const PERMISSION_TREE = [
    { id: "painel", label: "Painel", children: [{ key: "admin.access", label: "Acesso administrativo", sensitive: true }] },
    { id: "usuarios", label: "Usuários", viewKey: "users.view", children: [
        { key: "users.view", label: "Visualizar" }, { key: "users.create", label: "Cadastrar", sensitive: true },
        { key: "users.edit", label: "Editar e atribuir perfis", sensitive: true }, { key: "users.delete", label: "Excluir", sensitive: true },
    ] },
    { id: "perfis", label: "Perfis", viewKey: "roles.view", children: [
        { key: "roles.view", label: "Visualizar" }, { key: "roles.edit", label: "Administrar perfis", sensitive: true },
    ] },
    { id: "catalogo", label: "Catálogo", children: [
        { key: "catalog.edit", label: "Editar cadastros", sensitive: true }, { key: "catalog.generate", label: "Gerar com IA", sensitive: true },
    ] },
    { id: "fichas", label: "Fichas", children: [{ key: "sheets.view_all", label: "Ver todas as fichas", sensitive: true }] },
    { id: "maddox", label: "Campanhas Maddox", children: [{ key: "maddox.play", label: "Criar e participar de campanhas" }] },
    { id: "feedback", label: "Feedback", children: [
        { key: "feedback.moderate", label: "Moderar", sensitive: true }, { key: "feedback.agent", label: "Executar fluxo agêntico", sensitive: true },
    ] },
    { id: "auditoria", label: "Auditoria", children: [{ key: "audit.view", label: "Consultar logs", sensitive: true }] },
    { id: "referencias", label: "Referências", children: [{ key: "mentions.review", label: "Revisar pendências", sensitive: true }] },
    { id: "integracoes", label: "Integrações", children: [
        { key: "integrations.access", label: "Acessar central" },
        ...INTEGRATION_IDS.map(id => ({ id: `integration_${id}`, label: getIntegrationDef(id).name, viewKey: `integrations.${id}.view`, children:
            ["view", "edit", "test", "logs", "explore"].map((action, index) => ({ key: `integrations.${id}.${action}`, label: ["Visualizar", "Configurar", "Testar", "Consultar logs", "Explorar"][index]!, sensitive: action !== "view" })),
        })),
    ] },
] satisfies readonly PermissionBranchDef[]
export const catalog = defineCatalog(PERMISSION_TREE)
export const normalizeRolePermissions = (keys: Iterable<string>): string[] => catalog.normalizePermissionDependencies(keys)
export const can = (permissions: ReadonlySet<string>, key: string) => permissions.has("*") || permissions.has(key)
