# Sub-category tagging — agent instructions

Dispatch a tagging subagent with the prompt below whenever `npm run tag:subcats`
surfaces new residual recipients. Keep the few-shot examples and the "lessons"
section in sync with `scripts/mappings/sub-categories-curated.json`.

---

You are tagging recipients in an Effective Altruism grants database with a level-2
`sub_category`. Deterministic rules already handle the clear cases; your job is the
residual — recipients the rules could only place at the broad category level.

## Inputs (repo root)
- `data/raw/subcat-worklist.json` — recipients to classify: `{ recipient, category, count, amountM, signals, sample_titles }`. `category` is the recipient's fixed L1 code.
- `data/raw/subcat-taxonomy.json` — `category → [{id, label}]`; the ONLY valid ids, grouped by category.

## Rules
1. The chosen `id` MUST belong to the recipient's `category` (a GH recipient → a `gh-*` id). Never cross categories; never invent an id.
2. Decide from the organization's identity + `sample_titles` + `signals`, using world knowledge.
3. **Prefer the category's `*-general` id over forcing a poor specific fit.** `*-general` is a legitimate, honest answer, not a failure.

## Few-shot examples (the calibration set)
These are hand-verified. Match this judgment:

| Recipient | Category | id | Why |
|---|---|---|---|
| Redwood Research, Apollo Research, METR | LTXR | `ltxr-ai-tech` | technical alignment / evals labs |
| RAND Corporation | LTXR | `ltxr-ai-gov` | AI policy / governance think tank |
| Johns Hopkins Center for Health Security | LTXR | `ltxr-bio` | biosecurity |
| Against Malaria Foundation, Malaria Consortium | GH | `gh-malaria` | bednets / chemoprevention |
| New Incentives | GH | `gh-vaccines` | conditional cash for immunization |
| Helen Keller International | GH | `gh-nutrition` | vitamin A |
| **GiveDirectly** | GH | `gh-cash` | cash transfers — NOT health R&D |
| **GiveWell** | GH | `gh-general` | charity evaluator, no single disease — NOT R&D |
| The Humane League, Faunalytics | AW | `aw-movement` | advocacy / research-for-advocacy |
| Wild Animal Initiative | AW | `aw-wild` | wild-animal welfare |
| Fish Welfare Initiative, Shrimp Welfare Project | AW | `aw-fish` | aquatic animals |

## Lessons (avoid the mistakes a prior run made)
- **Don't over-specify from a generic title.** GiveDirectly's grants read "Pilots of Program Variations…" — that's not "Health R&D", it's a cash-transfer org → `gh-cash`.
- **Large multi-theme universities/foundations** (Stanford, Harvard, NYU, Center for Global Development) usually can't be pinned by recipient — use `*-general` unless the titles are unmistakably one theme.
- **Match the theme, not the funding vehicle.** "…- Long-Term Future Fund" in a title is the fund, not the theme.

## Output
Write `scripts/mappings/sub-categories-ai.json` as `{ "byRecipient": { "<recipient lowercased & trimmed>": "<id>" } }`. Key = `recipient.toLowerCase().trim()`. Cover every worklist recipient. Do not edit `sub-categories-curated.json` (curated wins automatically).

## Verify (required)
Run `npm run tag:subcats validate` — must print `Invalid ids: 0` and `Named grants still unlabeled` ≈ 0. Fix and re-run until it passes. Then report a short summary + any recipients you left as `*-general`.
