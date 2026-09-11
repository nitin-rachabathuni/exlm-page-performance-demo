function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—';
  return typeof value === 'number' ? value.toFixed(digits) : String(value);
}

function sanitizeMdCell(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '/');
}

export function buildSummaryMarkdown(rows, generatedAt, selectedByType = []) {
  const typeByUrl = new Map((selectedByType || []).map((t) => [t.url, t.id]));
  const showType = typeByUrl.size > 0;
  const header = showType
    ? '| Type | URL | Device | Status | Score | LCP (ms) | CLS | TBT (ms) | TTFB (ms) | Bytes |'
    : '| URL | Device | Status | Score | LCP (ms) | CLS | TBT (ms) | TTFB (ms) | Bytes |';
  const divider = showType
    ? '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
    : '| --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const lines = ['# Page performance report', '', `Generated: ${generatedAt}`, '', header, divider];
  for (const row of rows) {
    const typeCell = showType ? `${typeByUrl.get(row.url) || '—'} | ` : '';
    if (row.status !== 'ok') {
      lines.push(
        `| ${typeCell}${row.url} | ${row.formFactor} | ERROR: ${sanitizeMdCell(row.error || 'failed')} | — | — | — | — | — | — |`,
      );
      continue;
    }
    lines.push(
      `| ${typeCell}${row.url} | ${row.formFactor} | ok | ${fmt(row.score)} | ${fmt(row.lcpMs)} | ${fmt(row.cls, 3)} | ${fmt(row.tbtMs)} | ${fmt(row.ttfbMs)} | ${fmt(row.totalByteWeight)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function mergeShardSummaries(shards) {
  const ordered = [...shards].sort((a, b) => a.shard - b.shard);
  return {
    rows: ordered.flatMap((s) => s.rows || []),
  };
}
