import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSummaryMarkdown, mergeShardSummaries } from '../src/summary.mjs';

describe('buildSummaryMarkdown', () => {
  it('renders an ok row and sanitizes error pipes', () => {
    const md = buildSummaryMarkdown(
      [
        {
          url: 'https://demo.example/en/home',
          formFactor: 'mobile',
          status: 'ok',
          score: 91,
          lcpMs: 1800,
          cls: 0.01,
          tbtMs: 40,
          ttfbMs: 90,
          totalByteWeight: 400000,
        },
        {
          url: 'https://demo.example/en/docs',
          formFactor: 'desktop',
          status: 'error',
          error: 'timeout |\nline two',
        },
      ],
      '2026-09-09T00:00:00.000Z',
    );
    assert.match(md, /Page performance report/);
    assert.match(md, /91/);
    assert.match(md, /ERROR: timeout \/ line two/);
    assert.doesNotMatch(md, /timeout \|/);
  });
});

describe('mergeShardSummaries', () => {
  it('concatenates rows from every shard in shard order', () => {
    const merged = mergeShardSummaries([
      { shard: 1, rows: [{ url: 'b' }] },
      { shard: 0, rows: [{ url: 'a' }] },
    ]);
    assert.deepEqual(
      merged.rows.map((r) => r.url),
      ['a', 'b'],
    );
  });
});
