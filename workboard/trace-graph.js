// Follow only recorded relationships. Parent context never fans out into siblings.
export function traceGraph(graph, root, visible = () => true) {
  const nodes = new Map(graph.nodes.filter(visible).map(n => [n.id, n]));
  const item = nodes.get(root) || graph.edges.find(e => e.id === root && visible(e));
  const ids = new Set();
  if (!item) return ids;
  const typed = !!(item.kind || item.relation);
  const edges = graph.edges.filter(e => visible(e) && nodes.has(e.from) && nodes.has(e.to)
    && (!typed || e.relation) && (item.kind === 'file' || e.relation !== 'imports'));
  function walk(start, upstream) {
    const queue = [start], seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id); ids.add(id);
      for (const e of edges) {
        if ((upstream ? e.to : e.from) !== id) continue;
        ids.add(e.id);
        const next = upstream ? e.from : e.to;
        ids.add(next);
        // A resulting screen is a terminal, not a request to trace every button on it.
        if (e.relation !== 'navigates' && e.relation !== 'suggests') queue.push(next);
      }
    }
  }
  if (item.plane) { walk(item.id, true); walk(item.id, false); }
  else { ids.add(item.id); walk(item.from, true); walk(item.to, false); }
  return ids;
}

export function evidenceLabel(item) {
  if (item.evidence === 'code') return '코드 확인';
  if (item.evidence === 'draft') return '검토 초안';
  return '근거 확인 필요';
}

export function coverage(nodes, edges) {
  return ['ux', 'mcp', 'backend'].map(plane => {
    const items = nodes.filter(n => n.plane === plane);
    return { plane, count: items.length, verified: items.filter(n => n.evidence === 'code').length,
      missing: !items.length, draft: edges.some(e => e.evidence !== 'code' && items.some(n => n.id === e.to)) };
  });
}
