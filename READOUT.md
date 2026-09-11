# Readout — weekly page performance agent

For the EXLM lead review. Hands-on click-through is [DEMO.md](DEMO.md). This note answers **where reports live, how long they last, how they are deleted, and how work runs in parallel**, plus the decision vs [#2874](https://github.com/adobe-experience-league/exlm/pull/2874).

| | Dummy (this repo) | EXLM PR [`EXLM-5762`](https://github.com/adobe-experience-league/exlm/pull/2874) |
| --- | --- | --- |
| Config | [`config/performance.json`](config/performance.json) | `performance/config.json` |
| Live proof | [Actions run](https://github.com/nitin-rachabathuni/exlm-page-performance-demo/actions/runs/34325407631) | Weekly / **Run workflow** after merge |
| Auditor | `stub` (no Chrome) | `lighthouse` |
| Shards | **3** parallel jobs | **4** parallel jobs |
| Report TTL | **14 days** | **45 days** |
| Keep last N runs | **5** | **8** |

---

## Ask

Approve this shape:

1. URLs from the **production sitemap index**, not a committed URL list.
2. Page set lives in **one config file**. **`pageTypes`** lists unique templates (docs, playlists, perspectives, …); the job picks **one hub URL per type**. Adding a type is a config edit. The cap is the number of types that matched (optional `maxUrls` ceiling).
3. Audits run as a **GitHub Actions matrix** (parallel shards).
4. Reports are **GitHub Artifacts** and **expire**. Nothing in git, nothing on `gh-pages`.

---

## Where are reports stored?

**On GitHub: Actions artifacts for that workflow run.** Open the run → **Artifacts** at the bottom. They are **not** committed, **not** on `gh-pages`, **not** on AEM.

| Artifact name | Contents |
| --- | --- |
| `page-performance-plan` | `plan.json`, `selected-urls.json`, `shards/{0,1,…}.json` (which URLs each job owns) |
| `page-performance-shard-N` | That shard’s HTML reports + `summary.json` |
| `page-performance-summary` | Merged `summary.md` + `summary.json` (the table humans read) |

The same markdown table is also pasted into the run’s **job summary** (Summarize step). That UI lives with the run; the downloadable files are the artifacts.

**Locally (laptop only):** gitignored folder `performance-reports/`. Same files, never pushed. Delete with `npm run performance:clean`.

**What is in git:** config, scripts, and (in this dummy / EXLM tests) tiny sitemap **fixtures**. Those fixtures are not reports.

---

## How many days do they stay?

Two numbers, both in config (`artifactRetentionDays`, `keepLastRuns`):

| | Dummy | EXLM |
| --- | --- | --- |
| GitHub TTL | **14 days** then the platform deletes the blob | **45 days** |
| Keep last N **runs** | **5** newest weekly (or manual) runs | **8** |

GitHub’s cap is **90 days**. We stay under that.

Example: the dummy proof run from **9 Sep 2026** had artifacts set to expire **23 Sep 2026** (14-day TTL).

After TTL, GitHub deletes them even if nobody clicks cleanup. Keep-last-N can delete **sooner** (see next).

---

## How are they auto-cleaned?

**Two automatic layers, plus local/manual.**

### 1. GitHub TTL (no job required)

`actions/upload-artifact` sets `retention-days` from `artifactRetentionDays` in config. When the clock runs out, GitHub deletes the artifact. The workflow does not need to be running.

### 2. Keep-last-N after every successful summarize

The last job, **Delete old artifacts**, runs `cleanup.mjs`:

1. List repo artifacts named `page-performance-*`.
2. Group them by GitHub Actions **run id**.
3. Keep the newest `keepLastRuns` runs.
4. `DELETE` the rest via the API.
5. Skip already-expired artifacts; 401/403/404 do not fail the week.

Dummy: after **6** successful runs, run 1’s artifacts are deleted even if 14 days have not passed. EXLM: after **9** runs, only the last **8** remain.

Permissions: discover / audit / summarize are `contents: read`. **Only cleanup** has `actions: write`.

### 3. Local

```bash
npm run performance:clean    # dummy
# EXLM: npm run performance:clean
```

Removes `performance-reports/` on disk.

### 4. Manual

Actions UI → run → artifact → trash, or:

```bash
gh api -X DELETE repos/<owner>/<repo>/actions/artifacts/<id>
```

---

## How are they processed in parallel?

Three layers. The important one for time is **separate GitHub runners per shard**.

```
config
  → discover (one job)
       fetch sitemap index
       fetch matching child sitemaps in parallel (sitemapConcurrency, default 4)
       filter (include, exclude) then **one hub URL per `pageTypes` entry**
       split URLs round-robin into `shards` buckets
  → audit (N jobs at once, GitHub matrix, fail-fast: false)
       shard 0 on runner A
       shard 1 on runner B
       … up to `shards` (dummy 3, EXLM 4)
  → summarize (one job, waits for all shards)
  → cleanup (one job)
```

**URL split:** URL index `i` goes to shard `i % shards`. Example EXLM, 8 type hubs, 4 shards → 2 URLs each.

**Each URL × each form factor** (mobile and desktop) is one audit. EXLM: ~8 type hubs × 2 devices ≈ **16 Lighthouse runs**.

**Inside one shard:** `concurrencyPerShard`. Dummy stub uses `2`. EXLM Lighthouse uses **`1`** (one Chrome on one VM is stable). Do not raise that on Lighthouse without measuring; the **matrix** is the parallelism knob.

**If one shard fails:** `fail-fast: false` so the others finish. Summarize **fails closed** if `plan.json` lists a shard with no `summary.json` (we do not publish a silent half-report).

**Local dummy:** `npm run performance:run` audits all shards with `Promise.all` on your machine (stub, seconds). EXLM local Lighthouse is still sequential per Chrome unless you run shards yourself.

---

## Other questions

**When does the weekly job run?** Monday **08:00 UTC** (`cron: '0 8 * * 1'`), and **Run workflow** any time.

**Which URLs?** Dummy: fixture sitemap, **`select: onePerType`** → one hub each for home, browse, events, playlists, perspectives, courses, certification, docs (search excluded; deep URLs in the fixture are not chosen). EXLM: production sitemap index, English include (skips the other 18 locale files **before download**), same `pageTypes`, **`withinType: hub`**. `?martech=off` is added if missing.

**How is “1 per type” chosen?** `pageTypes` is an ordered list of `{ id, match }` regexes. First matching type claims the URL. Inside a type, **`hub`** picks the shortest pathname (`/en/docs` not `/en/docs/experience-manager/…`). A type with zero sitemap hits is skipped — it does not fail the week. Omit `maxUrls` and the cap **is** `pageTypes.length`.

**Why not all 35k English URLs?** English sitemap is ~35k `<url><loc>` entries; `/en/sitemap-1.xml` is ~40 MB because of hreflang clones (ignored). Full-set Lighthouse is not a weekly job. Add another object to `pageTypes` when a new template needs coverage.

**How do I add a page type?** Add `{ "id": "…", "match": "…" }` to `pageTypes`. No script change.

**Do low scores fail CI?** No. Report-only, same as the first #2874. A missing shard or a crash fails the workflow; a score of 40 does not.

**What are the XML files in the EXLM PR?** Test fixtures (`performance/fixtures/…`, `demo.example` URLs). Used only by `npm run test:performance`. The weekly job does **not** read them.

**Secrets?** None. `GITHUB_TOKEN` for artifact delete only.

**Site blast radius?** None. No blocks, no `scripts.js`, no `LCP_BLOCKS`, no `head.html`.

---

## Why not #2874 as originally written

| #2874 | This design |
| --- | --- |
| `performance/urls.json` = homepage | Config → sitemap |
| New page = code PR | Config edit |
| One job, sequential Lighthouse | Matrix of shard jobs |
| Artifact upload, no keep-last-N | TTL **and** keep-last-N delete |
| Tests not on quality CI | Dummy 27 tests on push; EXLM `npm run quality` includes them |

---

## What we already proved (dummy)

- **27/27** unit tests (hreflang ignored, include-before-fetch, index cycles, shard balance, keep-last-N, missing-shard fail-closed).
- [Green Actions run](https://github.com/nitin-rachabathuni/exlm-page-performance-demo/actions/runs/34325407631): discover → shards 0/1/2 in parallel → summarize → cleanup.
- Artifacts on that run: `page-performance-plan`, `shard-0/1/2`, `summary`; TTL **14 days**.

---

## Out of scope (first port)

- Fail the week if LCP > X.
- Audit all 35k English URLs.
- Commit `lighthouse` as an npm dependency (audit job still `npm install lighthouse@^12 --no-save`).
- Change Experience League page markup.
