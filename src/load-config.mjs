import { readFile } from 'node:fs/promises';

const DEFAULTS = {
  include: [],
  exclude: [],
  maxUrls: 20,
  select: 'stride',
  seed: 1,
  formFactors: ['mobile', 'desktop'],
  query: { martech: 'off' },
  shards: 4,
  concurrencyPerShard: 1,
  auditor: 'stub',
  artifactRetentionDays: 14,
  keepLastRuns: 5,
  fetchTimeoutMs: 30_000,
  maxSitemapBytes: 52_428_800,
};

function assertRegexList(list, label) {
  if (!Array.isArray(list)) {
    throw new Error(`${label} must be an array of regex strings`);
  }
  for (const pattern of list) {
    if (typeof pattern !== 'string') {
      throw new Error(`${label} entries must be strings`);
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch {
      throw new Error(`Invalid regex in ${label}: ${pattern}`);
    }
  }
}

export async function loadConfig(path) {
  const raw = await readFile(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
  if (!parsed || typeof parsed.sitemapUrl !== 'string' || !parsed.sitemapUrl.trim()) {
    throw new Error(`sitemapUrl is required in ${path}`);
  }

  const cfg = {
    ...DEFAULTS,
    ...parsed,
    query: { ...DEFAULTS.query, ...(parsed.query || {}) },
  };

  if (!Number.isInteger(cfg.shards) || cfg.shards < 1) {
    throw new Error('shards must be an integer >= 1');
  }
  if (!Number.isInteger(cfg.maxUrls) || cfg.maxUrls < 1) {
    throw new Error('maxUrls must be an integer >= 1');
  }
  if (!['first', 'stride', 'random'].includes(cfg.select)) {
    throw new Error('select must be first, stride, or random');
  }
  if (!['stub', 'lighthouse'].includes(cfg.auditor)) {
    throw new Error('auditor must be stub or lighthouse');
  }
  if (!Array.isArray(cfg.formFactors) || cfg.formFactors.length === 0) {
    throw new Error('formFactors must be a non-empty array');
  }
  assertRegexList(cfg.include, 'include');
  assertRegexList(cfg.exclude, 'exclude');
  return cfg;
}
