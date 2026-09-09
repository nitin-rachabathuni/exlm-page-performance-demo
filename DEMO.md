# Lead walkthrough (10 minutes)

Demo repo for the weekly page-performance agent. Goal: **sitemap in, config only, parallel jobs, artifacts that expire.** Decision readout: [READOUT.md](READOUT.md).

## 1. What was wrong with #2874

- URL list was a committed JSON file (`performance/urls.json` = homepage only).
- Adding a page meant a code/PR change.
- Audits ran one after another on one machine.
- Reports were an artifact, but there was no keep-last-N delete story.
- Unit tests were not on `npm run quality`.

Production sitemap index: `https://experienceleague.adobe.com/sitemap-index.xml` (20 children, English ~35k URLs). A hardcoded list cannot stay honest.

## 2. Open the only file that should change

[`config/performance.json`](config/performance.json)

Point at the fixture sitemap index. `exclude: ["/search"]` drops one loc without touching scripts. `shards: 3` is the parallel knob.

The EXLM-shaped copy is [`config/performance.exlm.example.json`](config/performance.exlm.example.json).

## 3. Run it locally (stub auditor, no Chrome)

```bash
npm test
npm run performance:run
ls -R performance-reports
```

You should see:

```
performance-reports/
  plan.json              ← discovered + selected URLs, shard sizes
  selected-urls.json
  shards/
    0.json  1.json  2.json
    0/  1/  2/           ← stub HTML reports + summary.json
  summary.md
  summary.json
```

`summary.md` is the same table GitHub will pin on the job summary.

Delete local files:

```bash
npm run performance:clean
ls performance-reports   # gone
```

## 4. Run it on GitHub Actions

1. Open the repo **Actions** tab.
2. **Page performance** → **Run workflow**.
3. Watch **three audit jobs in parallel** (`Audit shard 0/1/2`), `fail-fast: false`.
4. Open **Summarize** → job summary table.
5. Scroll to **Artifacts**:
   - `page-performance-plan`
   - `page-performance-shard-0` … `2`
   - `page-performance-summary`
6. Download `page-performance-summary` and open `summary.md`.

## 5. How deletion works (show this)

Two layers, both config-driven:

| Layer | Knob | Effect |
| --- | --- | --- |
| GitHub TTL | `artifactRetentionDays` (workflow `retention-days: 14`) | Platform deletes blobs after N days. |
| Keep last N | `keepLastRuns` (default 5) | `cleanup` job DELETEs older `page-performance-*` artifacts via the API. |

On the same Actions run, the last job is **Delete old artifacts**. After 6+ runs, artifacts from run 1 disappear even before the 14-day TTL.

Permissions: cleanup is the only job with `actions: write`. Everything else is `contents: read`.

Reports are **not** committed, **not** on gh-pages.

## 6. What we would change for EXLM (still config)

Copy `config/performance.exlm.example.json` → `config/performance.json`:

- `sitemapUrl`: production sitemap index
- `include`: English host/path
- `select`: `stride` so we do not only audit whatever happens to be first in the xml
- `maxUrls`: 20 to start
- `auditor`: `lighthouse`
- `artifactRetentionDays`: 45
- Audit job: `npm install lighthouse@^12 --no-save` (lean, not a committed dep)

No block, `scripts.js`, or page markup change. Zero LCP blast radius on the site.

## 7. Ask / decide

- Weekly cap (20 vs 50) and whether locales besides `en` are in `include`.
- Stub vs real Lighthouse in this dummy (stub keeps the Actions bill at seconds).
- Whether EXLM quality CI should also run these unit tests (recommended: yes).
