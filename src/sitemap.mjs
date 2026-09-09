import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MAX_BYTES = 52_428_800;

function decodeXml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

export function sitemapKind(xml) {
  if (/<sitemapindex[\s>]/i.test(xml)) return 'index';
  if (/<urlset[\s>]/i.test(xml)) return 'urlset';
  throw new Error('Document is not a sitemap urlset or sitemap index');
}

export function extractLocs(xml, kind) {
  const tag = kind === 'index' ? 'sitemap' : 'url';
  const blockRe = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const locs = [];
  let block;
  while ((block = blockRe.exec(xml))) {
    const loc = block[1].match(/<loc>\s*([^<]+)\s*<\/loc>/i);
    if (loc) locs.push(decodeXml(loc[1].trim()));
  }
  return locs;
}

export function resolveChild(parent, loc) {
  if (/^https?:\/\//i.test(loc) || loc.startsWith('file:')) return loc;
  if (/^https?:\/\//i.test(parent) || parent.startsWith('file:')) {
    return new URL(loc, parent).toString();
  }
  return resolve(dirname(parent), loc);
}

async function loadXml(source, { timeoutMs, maxBytes }) {
  if (!/^https?:\/\//i.test(source) && !source.startsWith('file:')) {
    const xml = await readFile(source, 'utf8');
    if (Buffer.byteLength(xml, 'utf8') > maxBytes) {
      throw new Error(`Sitemap exceeds ${maxBytes} bytes: ${source}`);
    }
    return xml;
  }

  const href = source.startsWith('file:') ? source : source;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(href, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch ${href}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Sitemap exceeds ${maxBytes} bytes: ${href}`);
    }
    return buf.toString('utf8');
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timed out fetching sitemap ${href} after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function collectFrom(source, options, seen) {
  const xml = await loadXml(source, options);
  const kind = sitemapKind(xml);
  if (kind === 'index') {
    const children = extractLocs(xml, 'index').map((loc) => resolveChild(source, loc));
    const nested = await Promise.all(children.map((child) => collectFrom(child, options, seen)));
    return nested.flat();
  }

  const urls = [];
  for (const loc of extractLocs(xml, 'urlset')) {
    if (!seen.has(loc)) {
      seen.add(loc);
      urls.push(loc);
    }
  }
  return urls;
}

export async function collectSitemapUrls(source, options = {}) {
  const timeoutMs = options.fetchTimeoutMs ?? 30_000;
  const maxBytes = options.maxSitemapBytes ?? DEFAULT_MAX_BYTES;
  const seen = new Set();
  const resolved =
    /^https?:\/\//i.test(source) || source.startsWith('file:') ? source : resolve(source);
  return collectFrom(resolved, { timeoutMs, maxBytes }, seen);
}

export function toFileUrl(path) {
  return pathToFileURL(path).toString();
}
