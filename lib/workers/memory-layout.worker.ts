/// <reference lib="webworker" />
import { settleMemoryGraph, type LayoutEdge, type LayoutNode } from '../memory-layout'

/* The settle is ~650ms of quadtree work on a desktop CPU for a full vault —
   off the main thread it never blocks navigation or input. */
self.onmessage = (e: MessageEvent<{ seq: number; nodes: LayoutNode[]; edges: LayoutEdge[] }>) => {
  const { seq, nodes, edges } = e.data
  ;(self as unknown as Worker).postMessage({ seq, positions: settleMemoryGraph(nodes, edges) })
}
