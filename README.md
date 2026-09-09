# EXLM page performance agent (demo)

Config-driven Lighthouse pipeline for Experience League. **URLs come from the sitemap. Parallelism is a GitHub Actions matrix. Reports are GitHub Artifacts and expire.** Changing the page set does not require a code change.

This repo is a dummy you can run end-to-end for review. It is the intended replacement for [exlm#2874](https://github.com/adobe-experience-league/exlm/pull/2874), which hardcoded a single URL in `performance/urls.json` and audited sequentially.

## Why this shape

Production `https://experienceleague.adobe.com/sitemap-index.xml` currently fans out to **20 child sitemaps**. English alone is ~35k `<loc>` entries. You cannot Lighthouse the full set weekly. The agent therefore:

1. Fetches the **sitemap index** and child urlsets in parallel.
2. Reads **only `<url><loc>`** (ignores `xhtml:link` hreflang clones).
3. Filters / samples from **`config/performance.json`** (the same `include` list also skips child sitemaps *before* download, so an English include does not pull the other 18 locale files).
4. Splits the selected URLs into shards and audits shards **in parallel jobs**.
5. Stores HTML + JSON as **workflow artifacts**, not git.
6. Deletes old artifacts automatically (`retention-days` + keep-last-N).

Default `auditor` is `stub` so CI and this demo do not need Chrome. Point `auditor` at `lighthouse` (see `config/performance.exlm.example.json`) when you port this into `exlm`.

## Change pages without changing code

Edit **one file**: [`config/performance.json`](config/performance.json).

| Field | Meaning |
| --- | --- |
| `sitemapUrl` | Sitemap or sitemap index. HTTP(S) or a path relative to repo root. |
| `include` / `exclude` | Regex lists. Empty `include` = all locs. |
| `maxUrls` | Hard cap after filters. |
| `select` | `first`, `stride` (even sample), or `random` (`seed` makes it stable). |
| `formFactors` | `mobile` and/or `desktop`. |
| `query` | Query params added if missing. Default `martech=off`. |
| `shards` | How many parallel GitHub jobs. |
| `concurrencyPerShard` | Parallel audits inside one job (keep `1` for real Chrome). |
| `auditor` | `stub` (demo/CI) or `lighthouse`. |
| `artifactRetentionDays` | GitHub auto-deletes artifacts after N days (max 90). |
| `keepLastRuns` | Cleanup job deletes older `page-performance-*` artifacts beyond N runs. |

EXLM-ready copy: [`config/performance.exlm.example.json`](config/performance.exlm.example.json) — production sitemap index, English include, stride sample of 20, 4 shards, real Lighthouse.

## How a run works

```
config/performance.json
        │
        ▼
   discover.mjs  ── sitemap index ──► child sitemaps (parallel)
        │
        ├── plan.json
        ├── selected-urls.json
        └── shards/{0,1,2}.json
        │
        ▼
   GitHub matrix (fail-fast: false)
        │
        ├── audit shard 0  ──► shards/0/*.report.html + summary.json
        ├── audit shard 1
        └── audit shard 2
        │
        ▼
   summarize.mjs  ──► summary.md + summary.json  ──► job summary
        │
        ▼
   cleanup.mjs    ──► keep last N runs, DELETE the rest via API
```

Local equivalent (stub, same scripts):

```bash
node --test test/*.test.mjs   # or: npm test
npm run performance:run       # discover + parallel shards + summarize
ls performance-reports/
npm run performance:clean     # deletes the local folder
```

GitHub: **Actions → Page performance → Run workflow**. Then open the run: matrix jobs, **Artifacts** at the bottom, markdown table on the job summary.

## How files are stored

| Place | What | Lifetime |
| --- | --- | --- |
| Git | Config, fixtures, scripts only. **Never** HTML reports. | Until you revert the commit. |
| `performance-reports/` locally | Plan, shard HTML, `summary.md`. Gitignored. | Until `npm run performance:clean`. |
| GitHub Artifacts | `page-performance-plan`, `page-performance-shard-N`, `page-performance-summary` | `retention-days` (14 in this demo, 45 in the EXLM example). |
| `$GITHUB_STEP_SUMMARY` | Markdown table for humans | Tied to that workflow run UI. |

Industry default: **ephemeral CI artifacts**, not a `gh-pages` reports branch (that is git history you cannot TTL).

## How files are deleted

1. **GitHub TTL** — `actions/upload-artifact` `retention-days`. After that, GitHub deletes the blob. No job required.
2. **Keep-last-N** — `src/cleanup.mjs` lists artifacts named `page-performance-*`, groups them by workflow run, keeps the newest `keepLastRuns` runs, `DELETE`s the rest. Uses `GITHUB_TOKEN` with `actions: write` on that job only.
3. **Local** — `npm run performance:clean` (`rm -rf performance-reports`).
4. **Manual** — Actions UI → run → Artifacts → trash icon, or `gh api -X DELETE repos/<owner>/<repo>/actions/artifacts/<id>`.

Discover / audit / summarize jobs are `contents: read` only. Cleanup is the only job that can delete artifacts.

## Porting into exlm

Do **not** keep `performance/urls.json`. Drop this `src/` + `config/` + workflow beside existing EXLM quality CI.

1. Copy `src/`, `config/performance.exlm.example.json` → `config/performance.json`.
2. Set `auditor` to `lighthouse` and `npm install lighthouse@^12 --no-save` in the audit job (same lean install as #2874).
3. Start with `maxUrls: 20`, `shards: 4`, English include. Raise only after a green weekly run.
4. Leave `query.martech: off`.
5. Wire `src/*.test.mjs` into `npm test` / quality — #2874’s tests never ran in CI.

## Security / cost notes

- Sitemap fetch has a **50 MB** cap (Google’s sitemap limit) and a timeout.
- Child sitemaps are fetched in parallel; selected pages are capped by `maxUrls`.
- Real Lighthouse on 20 URLs × 2 form factors ≈ 40 audits. 4 shards ≈ 10 audits/job. Budget ~15–25 minutes.
- No secrets. Do not commit `.env` or IMS tokens.

## License

MIT. Dummy repo for architecture review; not an Adobe product.
