# Isnād — مدقّق الإسناد

Automated chain-of-narration auditor for ḥadīth. Identifies every narrator in
a pasted isnād, surfaces the per-book gradings from 22 classical rijāl works,
verifies chronological + recorded-transmission continuity, applies the
classical conditions of *ḥadīth ṣaḥīḥ* per Ibn al-Ṣalāḥ, and matches the matn
against a corpus of 112,221 ḥadīths from 18 books.

Built with Next.js 16, Neon Postgres, and Anthropic Claude.

## Architecture

- **Segmenter** (`src/lib/match/segment.ts`) — Claude parses pasted text into
  narrator names + per-link transmission formulas (حدثنا / عن / سمعت …).
  Handles taḥwīl (ح), multi-compiler (قالا), and relative refs (عن أبيه).
- **Candidate retrieval** (`src/lib/match/candidates.ts`) — Postgres pg_trgm
  similarity over 196,488 normalized name variants. Returns top-12 candidates
  per position, with the harshest grade computed in SQL.
- **Disambiguation** (`src/lib/match/matcher.ts`) — Claude picks the right
  narrator per position using full chain context (death years, tabaqāt,
  surrounding narrators).
- **Verification** — chronology (`chronology.ts`), recorded transmission edges
  (336,175 in the `transmission` table), corpus co-occurrence, mudallisīn flag
  (Ibn Ḥajar's *Ṭabaqāt al-Mudallisīn*).
- **Cache** (`src/lib/match/cache.ts`) — every audit is sha256-keyed and
  persisted to `match_cache`. Same input → instant cache hit, zero Claude
  calls. Shared across all users via the Postgres backend.

## Local development

```bash
cp .env.example .env.local
# fill in DATABASE_URL (Neon), ANTHROPIC_API_KEY, CLAUDE_MONTHLY_CAP

npm install
npm run dev
```

App on http://localhost:3000.

### Database migrations

```bash
node --env-file=.env.local --import tsx scripts/migrate.ts
```

### Data imports (one-time, after DB provisioning)

```bash
# Itqan narrator corpus (115k narrators, 22 source books)
# (run the import scripts under scripts/ in order)

# Death-year overlay from AR-Sanad
npx tsx scripts/import-arsanad-deaths-local.ts

# Mudallisīn list (Ibn Hajar's 5 tiers)
npx tsx scripts/import-mudallisin.ts

# Cities overlay from AR-Sanad
npx tsx scripts/import-arsanad-cities.ts
```

## Deployment

Recommended: **[Render](https://render.com)** Web Service.

1. Push this repo to GitHub.
2. Render Dashboard → New → Web Service → Connect the repo.
3. Set env vars (see `.env.example` — `DATABASE_URL`, `ANTHROPIC_API_KEY`,
   `CLAUDE_MONTHLY_CAP`, optional `NEXT_PUBLIC_SITE_URL`).
4. Build command: `npm run build`. Start command: `npm start`.
5. Free tier works (spins down after 15 min idle); $7/mo for always-on.

Neon Postgres handles the DB; the same connection string used locally works
in production unchanged.

## Tests

```bash
npm test
```

52 tests covering segmenter, matcher, chronology, corpus, claude wrapper,
rate limit, narrator lookup, and API routes.

## Data sources (all open)

- [Itqan](https://github.com/R3GENESI5/Itqan) — 22 rijāl books, MIT
- [AhmedBaset/hadith-json](https://github.com/AhmedBaset/hadith-json) — 18 ḥadīth books, MIT
- [AR-Sanad 280K](https://github.com/somaia02/Narrator-Disambiguation) — birth/death years and cities, CC-BY
- Ibn Ḥajar's *Tabaqāt al-Mudallisīn* — public domain
