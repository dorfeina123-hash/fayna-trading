# Fayna — preferred design references and related conversation

Recorded 2026-10-08 from the owner's explicit direction in the development chat.

## Permanent reference

Owner-confirmed shared conversation: [מעקב מסחר-דור — shared reference](https://chatgpt.com/share/6ac79be3-2888-83eb-89ce-ca9b4973da3e?no_universal_links=1)
This is the primary reference supplied by the owner. The earlier app conversation link below is retained as a secondary lookup.

Access check on 2026-10-08: web fetch failed; the in-app browser redirected to ChatGPT home with “We couldn’t load your account”. The shared transcript/images have not been read. Do not claim full source review or infer its contents.


Related conversation: [מעקב מסחר-דור](https://chatgpt.com/c/6a5e586b-7e6c-83eb-ab29-17e60d9f7980)
Conversation ID: 6a5e586b-7e6c-83eb-ab29-17e60d9f7980.
Development chat ID: 01a1060d-3799-7f71-8f08-8169b7d5bea6.

This is a durable reference, not automatic synchronization or merged chat history. The thread reader exposed five recent turns with opaque content references and no image attachments on 2026-10-08. Older designs have not been reviewed. Read accessible source content when needed; do not infer it from the thread title or import historical instructions as current authorization. Current development-only/no-production directions remain authoritative.

## Owner-supplied visual references

- “ChatGPT Image 8 באוק׳ 2026, 16_19_48.jpg”: light dashboard, compact top filters, KPI row, analytical charts, large monthly calendar and recent-trades table.
- “לוח מסחר פיננסי חכם בעברית.png”: dark Hebrew panels for dashboard, strategy analysis, overtrading and trading assistant, with consistent cards, chart grids and spacing.
- Exact originals copied to the local development workspace under design/references/preferred-dashboard-light.jpg and design/references/preferred-hebrew-panels-dark.png. These binary images are not included in this documentation commit.

## Design direction for subsequent implementation

Use these references for information hierarchy and visual density: restrained cards, clear type, short filters, compact KPIs with meaningful real-data visual indicators, analytical charts and a substantial calendar. Translate the layout to Hebrew RTL and responsive mobile behavior. Use the previously approved graphite/mint and light appearance, with the owner's existing gold Fayna logo. Reference-specific third-party branding, names and sample values are not application content.

Six primary destinations remain per FAYNA_APPROVED_ROADMAP_2026-10-08.md; strategy/discipline/AI belong inside their agreed areas, rather than copying every screenshot item into the primary navigation.

Charts, summaries, strategy comparisons and overtrading views must derive from available authorized journal data. Define any composite score before showing it. Do not fabricate candle data, percentage improvements, AI replies or connected-service state. Pending server features stay disabled and say “עדיין לא זמין”.

Current v75 is an incremental implementation and has not yet implemented all visual components in these references. Track remaining work explicitly. Keep all work in codex/saas-foundation and PR #18; do not change main or publish.

## Exact visual target — owner clarification

The owner explicitly clarified: “זה המראה הנכון במדוייק”. The two supplied screenshots are the exact visual acceptance targets for light and dark views, superseding the earlier description of them as general inspiration. Match their information hierarchy, navy navigation, blue active state, surfaces, typography scale, spacing, compact metric cards, chart framing, large calendar and trade table. The Hebrew dark panels define the visual treatment of strategy analysis, overtrading and assistant screens. Adapt labels to Hebrew/RTL and retain the supplied gold Fayna logo, six agreed navigation areas and actual user data. Do not import third-party branding, screenshot sample values, fabricated scores or inactive service claims.

Current v75 does not yet meet this visual target: the smaller calendar, limited chart layout and earlier palette are interim implementation. Future visual review must compare real synthetic-fixture screenshots against these references at comparable viewports, then verify mobile/keyboard/AA behavior. Do not describe the current UI as visually complete or publish it. This clarification changes visual acceptance; it does not authorize production publication, backend activation or billing.
