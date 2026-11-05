import React from 'react'

/**
 * Mock leve do React Flow (`@xyflow/react`) para os testes da rede do Engramind (DND-21, copiado do Opex): o happy-dom
 * não mede o canvas (largura 0), e o React Flow com `onlyRenderVisibleElements` não renderizaria nada.
 * Os nodes viram o componente do tipo (com `data`) e as arestas o componente da aresta, sem layout.
 *
 * Uso: `vi.mock('@xyflow/react', () => xyflowMock())`
 */
type AnyProps = Record<string, unknown>
interface MockNode { id: string; type?: string; data: unknown }
interface MockEdge { id: string; type?: string; data?: unknown; source: string; target: string }

export const fitView = { calls: 0 }
/** Chamadas de `fitBounds` (enquadramento inicial da visão horizontal e o Centralizar). */
export const fitBounds = { calls: [] as unknown[] }
/** Chamadas de `setCenter` (celular: enquadramento com zoom mínimo; toque com zoom afastado). */
export const setCenter = { calls: [] as { x: number; y: number; options: unknown }[] }
/** Estado lido por `useStore`: zoom/deslocamento e o tamanho do canvas (mude no teste e re-renderize). */
export const flowState = { transform: [0, 0, 1] as [number, number, number], width: 800, height: 600 }

/** Últimos arrays de nodes e arestas recebidos pelo React Flow (regressão do piscar: identidade dos objetos). */
export const flowItems = { nodes: [] as MockNode[], edges: [] as MockEdge[] }

export function xyflowMock() {
  const ReactFlow = ({ nodes = [], edges = [], nodeTypes = {}, edgeTypes = {}, onNodeClick, onNodeContextMenu, onPaneClick, children, style }: AnyProps & { style?: React.CSSProperties; nodes?: MockNode[]; edges?: MockEdge[]; nodeTypes?: Record<string, React.FC<AnyProps>>; edgeTypes?: Record<string, React.FC<AnyProps>>; onNodeClick?: (event: unknown, node: MockNode) => void; onNodeContextMenu?: (event: unknown, node: MockNode) => void; onPaneClick?: () => void; children?: React.ReactNode }) => {
    flowItems.nodes = nodes
    flowItems.edges = edges
    return (
    <div data-testid="react-flow" data-style={JSON.stringify(style ?? {})}>
      <div data-testid="react-flow-pane" onClick={() => onPaneClick?.()} />
      <svg>
        {edges.map((edge) => {
          const Edge = edgeTypes[edge.type ?? '']
          return Edge ? <Edge key={edge.id} id={edge.id} data={edge.data} source={edge.source} target={edge.target} sourceX={0} sourceY={0} targetX={10} targetY={10} /> : null
        })}
      </svg>
      {nodes.map((node) => {
        const Node = nodeTypes[node.type ?? '']
        return (
          <div key={node.id} data-node-id={node.id} onClick={(event) => onNodeClick?.(event, node)} onContextMenu={(event) => onNodeContextMenu?.(event, node)}>
            {Node ? <Node id={node.id} data={node.data} /> : null}
          </div>
        )
      })}
      {children}
    </div>
    )
  }
  return {
    ReactFlow,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => null,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BaseEdge: ({ id, path, style, ...rest }: { id: string; path: string; style?: React.CSSProperties } & AnyProps) => <path data-testid={`edge-${id}`} d={path} data-stroke={style?.stroke as string | undefined} data-tone={rest['data-tone'] as string | undefined} data-authored={rest['data-authored'] as string | undefined} data-stroke-width={style?.strokeWidth as number | undefined} data-route={rest['data-route'] as string | undefined} />,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <foreignObject>{children}</foreignObject>,
    getBezierPath: () => ['M0,0 C5,5 5,5 10,10', 5, 5],
    getStraightPath: () => ['M0,0 L10,10', 5, 5],
    useReactFlow: () => ({ fitView: () => { fitView.calls += 1 }, fitBounds: (bounds: unknown) => { fitBounds.calls.push(bounds) }, setCenter: (x: number, y: number, options: unknown) => { setCenter.calls.push({ x, y, options }) } }),
    useStore: (selector: (state: typeof flowState) => unknown) => selector(flowState),
  }
}
