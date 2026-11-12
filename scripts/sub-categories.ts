// Two-level taxonomy: L1 = the 6 category codes, L2 = sub-categories.
// Assignment for a grant (first match wins):
//   1. deterministic rule on the structured signal (focus_area + fund)
//   2. deterministic rule on the grant title + recipient
//   3. AI override keyed by content-key, then by recipient (fills what rules leave "general")
//   4. the category's "— general" bucket (always matches → 100% coverage)
// Rules are pure lookups (auditable); the AI layer only touches grants the rules can't place.

export type SubCat = { id: string; label: string; re: RegExp };

// Each category: ordered [id, label, regex]. Last entry is the "— general" catch-all.
export const TAXONOMY: Record<string, [string, string, RegExp][]> = {
  LTXR: [
    ['ltxr-bio',        'Biosecurity & Pandemics',       /biosecur|pandemic|pathogen|bioweapon|dual.?use|dna synthesis|gain.?of.?function/i],
    ['ltxr-nuclear',    'Nuclear & Great-Power',         /nuclear|great.?power|deterrence/i],
    ['ltxr-ai-tech',    'AI Safety & Alignment',         /technical ai|ai (safety|alignment)|\balignment\b|interpretab|mechanistic|red.?team|\bevals?\b|rlhf|agent foundation|scalable oversight|\bai control\b|safety research/i],
    ['ltxr-ai-gov',     'AI Governance & Policy',        /ai governance|ai policy|compute governance|ai regulation|ai standard|frontier (model )?policy|responsible scaling/i],
    ['ltxr-ai-general', 'AI (Unspecified)',              /transformative ai|navigating.*ai|\bai\b|artificial intelligence|\bllm\b/i],
    ['ltxr-gcr',        'GCR Capacity & Fieldbuilding',  /catastrophic risk|capacity building|fieldbuild|field.building|x.?risk|existential|resilience|civiliz/i],
    ['ltxr-general',    'Longtermism (Unspecified)',     /.*/],
  ],
  GH: [
    ['gh-malaria',   'Malaria',                     /malaria|bednet|insecticide|chemoprevention|\bamf\b|against malaria|seasonal malaria/i],
    ['gh-deworming', 'Deworming',                   /deworm|schisto|helminth|dispensers for safe water/i],
    ['gh-vaccines',  'Vaccines & Immunization',     /vaccin|immuniz|new incentives|strep a/i],
    ['gh-nutrition', 'Nutrition',                   /nutrition|vitamin a|micronutrient|helen keller|fortif/i],
    ['gh-lead',      'Lead Exposure',               /lead exposure|lead paint|lead poison/i],
    ['gh-air',       'Air Quality',                 /air quality|air pollution|clean air|particulate/i],
    ['gh-rnd',       'Health R&D',                  /\br&d\b|research (and|&) development|drug|therapeut|diagnos|clinical trial/i],
    ['gh-cash',      'Cash Transfers & Direct Aid', /cash transfer|direct (cash|payment|aid)|givedirectly|unconditional cash|basic income|cash benchmark/i],
    ['gh-policy',    'Aid & Growth Policy',         /aid policy|economic growth|\blmic|public health policy|health system/i],
    ['gh-general',   'Global Health (Unspecified)', /.*/],
  ],
  AW: [
    ['aw-cagefree',   'Cage-Free & Layer Hens',       /cage.?free|layer hen|\begg|hen welfare/i],
    ['aw-broiler',    'Broiler & Poultry',            /broiler|chicken|poultry/i],
    ['aw-fish',       'Fish & Aquatic',               /\bfish|aquatic|shrimp|aquaculture/i],
    ['aw-wild',       'Wild-Animal Welfare',          /wild animal|wild.?animal|invertebrate|insect welfare/i],
    ['aw-altprotein', 'Alternative Proteins',         /alternative(s)? to animal|alt.?protein|plant.?based|cultivat|cellular ag|meat alternative/i],
    ['aw-movement',   'Movement & Advocacy',          /movement grant|capacity|advocacy|coalition|corporate campaign/i],
    ['aw-general',    'Animal Welfare (Unspecified)', /.*/],
  ],
  Meta: [
    ['meta-giving',      'Effective Giving',           /effective giving|donation|fundrais|\bpledge|philanthrop/i],
    ['meta-careers',     'Careers & Talent',           /career|talent|fellowship|internship|80,?000|recruit|mentor/i],
    ['meta-forecasting', 'Forecasting & Epistemics',   /forecast|prediction market|epistem|calibrat|metaculus/i],
    ['meta-research',    'Research & Prioritization',  /prioritiz|cause (exploration|research)|global priorities|research institute/i],
    ['meta-community',   'Community & Infrastructure', /community|infrastructure|movement building|coworking|conference|\beag\b|local group|operations/i],
    ['meta-general',     'EA Meta (Unspecified)',      /.*/],
  ],
  Science: [
    ['science-basic',   'Basic Science',                     /basic science|transformative basic|fundamental/i],
    ['science-tools',   'Tools & Techniques',                /tools|techniques|instrument|\bmethod|platform/i],
    ['science-general', 'Scientific Research (Unspecified)', /.*/],
  ],
  Other: [
    ['other-infectious', 'Infectious Disease',  /infectious|noninfectious|strep|disease/i],
    ['other-climate',    'Climate & Energy',    /climate|carbon|emission|clean energy|decarbon/i],
    ['other-general',    'Other (Unspecified)', /.*/],
  ],
};

export type Grant = {
  category?: string; focus_area?: string; fund?: string; grantmaker?: string;
  title?: string; recipient?: string; amount?: number; date?: string; is_residual?: boolean;
};

/** Grantmakers whose `fund` names are portfolio labels rather than topics (see below). */
const PORTFOLIO_FUND_GRANTMAKERS = new Set(['Founders Pledge']);

export type AiOverrides = {
  curated?: Record<string, string>;   // hand-verified recipient → id (highest priority)
  byRecipient?: Record<string, string>;
  byKey?: Record<string, string>;
};

/** Stable content key so an AI label survives re-scrapes (position-independent). */
export function contentKey(g: Grant): string {
  const ym = (g.date || '').slice(0, 7);
  return `${(g.recipient || '').toLowerCase().trim()}|${g.amount || 0}|${ym}`;
}

const norm = (s?: string) => (s || '').toLowerCase().trim();

/** Returns { id, label, path } for a grant. `path` explains how it was assigned. */
export function assignSubCategory(g: Grant, ai: AiOverrides = {}) {
  const cat = g.category && TAXONOMY[g.category] ? g.category : 'Other';
  const rules = TAXONOMY[cat];
  const general = rules[rules.length - 1];
  const label = (id: string) => (rules.find(r => r[0] === id) || general)[1];

  // An override id only applies if it belongs to THIS grant's category — prevents a
  // recipient-keyed label from leaking onto that recipient's grants in another category.
  const inCat = (id?: string) => !!id && rules.some(x => x[0] === id);
  const r = norm(g.recipient);

  // 0: curated (hand-verified) overrides win over everything, incl. residual rows.
  if (ai.curated && inCat(ai.curated[r])) return { id: ai.curated[r], label: label(ai.curated[r]), path: 'curated' as const };

  // Residual/aggregate rows aren't itemized — never invent a theme.
  if (g.is_residual || /unitemized|residual/i.test(g.fund || ''))
    return { id: general[0], label: general[1], path: 'residual' as const };

  // 1-2: deterministic rules (structured signal first, then free text)
  const structured = `${g.focus_area || ''} | ${g.fund || ''}`;
  const freetext = `${g.title || ''} ${g.recipient || ''}`;
  // For portfolio funders the fund/focus is a broad portfolio label, not a topic
  // ("Global Catastrophic Risks Fund" spans nuclear, bio and AI), so the grant's own
  // purpose text is tried first and the portfolio label is only the fallback.
  const order: [string, 'structured' | 'title'][] = PORTFOLIO_FUND_GRANTMAKERS.has(g.grantmaker || '')
    ? [[freetext, 'title'], [structured, 'structured']]
    : [[structured, 'structured'], [freetext, 'title']];
  for (const [text, how] of order)
    for (let i = 0; i < rules.length - 1; i++) if (rules[i][2].test(text)) return { id: rules[i][0], label: rules[i][1], path: how };

  // 3: AI overrides fill what rules left "general" (content-key beats recipient), guarded by category.
  const k = contentKey(g);
  if (ai.byKey && inCat(ai.byKey[k])) return { id: ai.byKey[k], label: label(ai.byKey[k]), path: 'ai-key' as const };
  if (ai.byRecipient && inCat(ai.byRecipient[r])) return { id: ai.byRecipient[r], label: label(ai.byRecipient[r]), path: 'ai-recipient' as const };

  // 4: general
  return { id: general[0], label: general[1], path: 'fallback' as const };
}

/** Flat list of every sub-category id + label + parent category (for metadata / UI). */
export function subCategoryList() {
  const out: { id: string; label: string; category: string }[] = [];
  for (const [cat, rules] of Object.entries(TAXONOMY)) for (const [id, label] of rules) out.push({ id, label, category: cat });
  return out;
}
