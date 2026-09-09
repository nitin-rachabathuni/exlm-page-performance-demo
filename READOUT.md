# Readout — weekly page performance agent

For the EXLM lead review. Hands-on walkthrough is [DEMO.md](DEMO.md). This note is the decision record: what we changed from [#2874](https://github.com/adobe-experience-league/exlm/pull/2874), why, and what to approve.

**Dummy repo:** https://github.com/nitin-rachabathuni/exlm-page-performance-demo  
**Green Actions run:** https://github.com/nitin-rachabathuni/exlm-page-performance-demo/actions/runs/34325407631  
**Local path:** `exlm-page-performance-demo/` (sibling of `exlm/`)

---

## Ask

Approve this shape for EXLM (port onto PR 2874 / `EXLM-5762`):

1. URLs from the **production sitemap index**, not a committed URL list.
2. Page set and sample size live in **one config file**. Adding a template is a config edit, not a code change.
3. Audits run as a **GitHub Actions matrix** (parallel shards, `fail-fast: false`).
4. Reports live in **GitHub Artifacts** and **expire** (TTL + keep-last-N). Nothing in git, nothing on `gh-pages`.

Open knobs (config, not code): English-only vs more locales; `maxUrls` 20 vs 50; artifact TTL 45 days.

---

## Why #2874 is not enough

| #2874 | This design |
| --- | --- |
| `performance/urls.json` = homepage only | `config/performance.json` → sitemap |
| New page = PR to the JSON list | New page = `include` / `maxUrls` / `select` |
| One job, sequential Lighthouse | Discover, then N shard jobs in parallel |
| Artifact upload, no keep-last-N | `retention-days` **and** API delete of older `page-performance-*` runs |
| Tests not on CI | Dummy: 27 unit tests on every push; EXLM: same tests, lighthouse lean-install in the audit job |

Production sitemap: `https://experienceleague.adobe.com/sitemap-index.xml` (robots.txt). **20 child urlsets**. English ~**35k** `<url><loc>` entries. `/en/sitemap-1.xml` is ~**40 MB** because of `xhtml:link` hreflang clones — the parser **ignores those hrefs** and only keeps `<url><loc>`. You cannot Lighthouse the full set weekly.

---

## What to show in 10 minutes

Use [DEMO.md](DEMO.md). Short version:

1. Open [`config/performance.json`](config/performance.json) — this is the only file authors of the URL set should touch.
2. Local: `npm test` then `npm run performance:run` then `npm run performance:clean`.
3. GitHub: [the green run](https://github.com/nitin-rachabathuni/exlm-page-performance-demo/actions/runs/34325407631) — three **Audit shard** jobs in parallel, **Summarize** job summary table, **Artifacts** at the bottom, last job **Delete old artifacts**.

---

## How files are stored

| Place | What | Lifetime |
| --- | --- | --- |
| Git | Config, fixtures, scripts. **Never** HTML reports. | Until reverted |
| Local `performance-reports/` | Plan, shard HTML, `summary.md` | `npm run performance:clean` |
| GitHub Artifacts | `page-performance-plan`, `page-performance-shard-N`, `page-performance-summary` | `artifactRetentionDays` (14 in this dummy; 45 in the EXLM example) |
| Job summary | Markdown table | That workflow run’s UI |

Industry default: **ephemeral CI artifacts**. A reports branch / `gh-pages` cannot TTL.

---

## How files are deleted

1. **GitHub TTL** — `actions/upload-artifact` `retention-days` from config (1–90). Platform deletes the blob. No job required.
2. **Keep last N** — `keepLastRuns` (dummy 5). Cleanup lists `page-performance-*` artifacts, groups by workflow run, `DELETE`s older runs. `GITHUB_TOKEN` with `actions: write` **on that job only**.
3. **Local** — `npm run performance:clean`.
4. **Manual** — Actions UI trash icon, or `gh api -X DELETE repos/<owner>/<repo>/actions/artifacts/<id>`.

Discover / audit / summarize are `contents: read`. Cleanup is the only writer.

On the first dummy run, cleanup succeeded and kept the current artifacts (nothing older to delete). After 6+ runs, run 1’s artifacts go even before the 14-day TTL.

---

## Config that ports to EXLM

[`config/performance.exlm.example.json`](config/performance.exlm.example.json)

- Sitemap: production index
- `include`: English host/path — also **skips the other 18 locale child sitemaps before download**
- `select`: `stride` (even sample, not “whatever is first in the XML”)
- `maxUrls`: 20 to start (~40 Lighthouse audits with mobile+desktop, 4 shards)
- `query.martech`: `off`
- `auditor`: `lighthouse` (dummy CI stays `stub` so Actions stays seconds, not minutes)
- `allowedHosts`: `experienceleague.adobe.com`
- `artifactRetentionDays`: 45, `keepLastRuns`: 8

Zero blast radius on the site: no blocks, no `scripts.js`, no `LCP_BLOCKS`, no `head.html`.

---

## What we already proved

- Dummy tests: **27/27** (sitemap hreflang ignored, child include-before-fetch, index cycles, shard balance, keep-last-N, missing-shard fail-closed).
- Dummy Actions: discover → shards 0/1/2 in parallel → summarize → cleanup, all green.
- Artifacts on that run expire **23 Sep 2026** (14-day TTL from 9 Sep).

---

## Out of scope for this dummy / first EXLM port

- Scoring gate (fail the week if LCP > X). Report-only, same as #2874.
- Auditing all 35k English URLs.
- Committing Lighthouse as an npm dependency (still `npm install lighthouse@^12 --no-save` in the audit job).
- Changing Experience League page markup.
