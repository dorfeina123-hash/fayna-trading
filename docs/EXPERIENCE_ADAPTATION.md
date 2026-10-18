# Fayna experience adaptation

Development only. The owner requested adapting the existing Universal AI Agent
opening and application structure, and then explicitly required preserving Fayna's
current colors. No production deployment, new provider, payment or data migration.

## What changed

- Public welcome page inside the existing authentication screen: hero, clearly
  labeled illustrative preview, three onboarding steps, two approved monthly
  plans and FAQ. No new route replaces the existing entry URL or PWA start URL.
- Existing login/register/Google/reset controls and their Firebase handlers stay
  in place. Welcome actions select existing forms; return action restores welcome.
  Authentication failures reveal login rather than hiding the error behind welcome.
- Prices use the shared approved catalog. Trial eligibility and settlement
  preparation are stated explicitly; registration is not a trial grant or purchase.
- Sidebar geometry, spacing and shared home panels are adapted to the structure
  of Universal AI Agent. All new colors derive from existing Fayna theme tokens;
  dark and light theme values and stored theme preference are unchanged.
- Empty/partial home setup renders real account/trade state and calls existing
  addAccount/import navigation. Once both exist, the setup panel disappears.
- Small scoped CSS and presentation-only JS modules; no Firebase/Supabase code,
  credentials, private user data or provider adapters copied from the other app.
  The source project's auth and business schema are incompatible and remain there.
- Service worker version updated; new small presentation assets precached.

## Source patterns reviewed

Universal AI Agent: `landing.html`, `assets/landing.css`, `assets/landing.js`,
`dashboard.html`, `assets/dashboard.css`, `assets/dashboard.js`,
`assets/recovery.js`, `assets/leads.js` and server provider/gateway boundaries.
The reusable patterns are page composition, responsive layout, accessible feedback
and onboarding. The chat simulator, CRM, business authentication and provider
integration are not represented as trading features.

## Verification

`tests/experience.cjs` renders actual Fayna markup with its presentation modules in
an offline browser harness. It verifies welcome/login/registration/back navigation,
authentication error visibility, unchanged catalog, exact original dark/light
color tokens, widths 1440/390/320, setup actions and real home net calculations.
Review screenshots use fictional trades, not production user data.

Subscription UI checks, 23 server/account entry tests, finance summary and data
export checks pass locally. Index/v75 equality, original declarations and inline
style count remain covered by subscription checks. This is not a live Firebase
authentication, deployed-rules or provider payment acceptance test; existing
billing rollout blockers still apply.

## Concurrent production changes

Merged origin/main through 47db61b into this development branch, preserving its
Tradovate accounting-negative/fill identity fixes and historical currency modules.
Index and v75 were aligned after resolving the head stylesheet and cache version
conflicts. The imported subscription notice was adjusted to the approved One /
Unlimited model and current eligibility gates; it does not promise card collection,
automatic renewal or a forced existing-user trial that has not been authorized.
