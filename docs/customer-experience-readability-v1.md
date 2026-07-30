# Customer Experience Readability v1

## Purpose

Onread is designed for business owners who need a clear decision, not a wall of
analysis. Customer pages should explain the conclusion first, identify one
recommended next step, and keep supporting evidence available on demand.

This pass does not change scoring, findings, recommendation ranking, audit
evidence, entitlements, prices, model routing, or customer data.

## Baseline Hierarchy

The product already has a consistent visual system and strong evidence
disclosures, but the customer journey has several hierarchy problems:

- Overview shows setup guidance, score evidence, category scores, coverage,
  three recommendations, findings, progress, comparison, category summaries,
  and Consultant prompts with similar visual weight.
- Analysis coverage appears before the recommended work.
- Category scores appear in the health summary and again in large category
  sections.
- Each Overview recommendation exposes View Task, Generate Fix, a primary
  status action, a status selector, and Learn Why at once.
- Overview shows internal confidence and evidence-completeness percentages
  before explaining the main business decision.
- The complete visible finding sample is too long for a command-center page.
- Empty competitor content uses metrics that are less useful than a compact
  explanation and Add competitor action.
- Action Plan repeats five headline metrics and exposes implementation and
  status controls before the user chooses a task.
- History starts with help content instead of explaining what changed.
- Consultant starter prompts exceed the number needed to begin.
- Billing exposes every purchase choice before establishing the current access
  state and the most relevant billing action.
- Settings has one account card and does not explain which settings live at the
  account level versus inside a business workspace.

The category pages for Website, SEO, Social, and Reviews already use progressive
disclosure for technical detail. Those patterns should be preserved and reused.

## Page-Purpose Model

| Page | Primary question | Dominant action |
| --- | --- | --- |
| Overview | What should I do next? | Start the first recommended action |
| Guided Setup | What information must I complete now? | Save and continue |
| Audit | What is the most important finding? | Start the related action |
| Growth | What changed and where is the opportunity? | Review the best supported opportunity |
| Action Plan | What should I work on next? | Start or continue the next action |
| Consultant | What can I ask about these results? | Send a question |
| Billing | What access do I have and what can I change? | Manage billing or compare plans |
| Settings | What account information can I manage here? | Use the relevant account or business settings route |

## One-Primary-Action Rule

- A page header may contain one filled action.
- Supporting actions use secondary buttons or text links.
- A recommendation shows one next-state action by default.
- Implementation generation, evidence, status selection, completion, and
  dismissal live in a compact details or overflow area until needed.
- Action labels use a concrete verb and destination: Run audit, Start action,
  Continue action, View findings, Ask Consultant, or Add competitor.

## Overview Hierarchy

1. Business report header and audit date
2. Decision summary: health, score, strongest area, main opportunity, goal,
   and a plain-language coverage label
3. One dominant recommended first action
4. Two compact follow-up actions
5. Top three findings and a link to the full Audit workspace
6. Meaningful progress and comparable historical change
7. One compact category overview
8. Collapsed analysis coverage and methodology details
9. Compact Consultant continuation

Category scores must appear only once on Overview. Full category evidence
belongs on the category pages and in Audit.

## Progressive Disclosure

Primary views show:

- the conclusion
- the customer impact
- the next action
- a short evidence summary

The following remain collapsed by default:

- full and raw URLs
- confidence reasoning
- evidence-completeness percentages
- analyzer source and version
- crawl diagnostics
- scoring mechanics
- long limitations
- internal status values

Standard labels are See evidence, Why this matters, Coverage details, How this
was scored, Technical details, and View all findings. Controls use native
buttons or accessible disclosures with `aria-expanded`.

## Typography

- Standard body copy is at least 14px with a 1.5-style line height.
- Important recommendation titles are at least 16px.
- Small text is reserved for short metadata, never the main explanation.
- Uppercase labels are short and sparing.
- Muted copy must retain sufficient contrast in both color schemes.
- Long evidence is presented in readable single-column lines before denser
  technical layouts.

## Button Hierarchy

- Primary: filled teal/dark action, one per page or meaningful section.
- Secondary: bordered button for a supporting workflow.
- Tertiary: text or disclosure control for evidence and education.
- Administrative status changes appear only after the task is opened.

## Card Usage

- Use one card per decision or meaningful concept.
- Use separators for related recommendations and findings.
- Avoid metric cards inside larger cards when plain structured text is enough.
- Empty states use compact height and one action.
- Technical groups may use a bordered disclosure because the border communicates
  an optional detail boundary.

## Customer-Language Translation

| Technical wording | Primary-view wording |
| --- | --- |
| Deterministic checks | Technical website checks |
| AI content coverage | Pages reviewed by AI |
| Partial comparison | Limited comparison |
| Content-analyzed profiles | Social profiles reviewed |
| Evidence completeness percentage | Full, good, or limited coverage |
| Crawl eligible pages | Website pages available to check |

Exact technical wording remains inside coverage and methodology details.

## Mobile Priority

1. Current status
2. Recommended first action
3. Progress, once meaningful
4. Essential business navigation
5. Follow-up actions and findings
6. Categories
7. Coverage and technical detail

Controls stack in this order and must not create horizontal overflow. Tables
become labeled summaries or horizontally scroll only when the table itself is
the evidence.

## Empty And Loading States

- Empty states explain what is missing, what becomes available, and one next
  action without occupying an oversized viewport.
- Mutation controls disable immediately and use specific pending copy such as
  Saving goals, Starting audit, Starting action, or Updating status.
- Errors explain whether saved data was preserved and provide a safe retry or
  return route. Raw provider and database messages remain internal.

## Navigation

Customer business navigation uses six purposes:

- Overview: status and next actions
- Setup: business information and sources
- Audit: findings and evidence
- Growth: channels, comparisons, and opportunities
- Plan: tasks, progress, and history
- Consultant: questions about saved results

The active group and page remain visible. Detail pages include a route back to
their parent workflow. Existing URLs remain stable; the Audit findings workspace
uses the existing business `/audit` segment without changing audit-run,
presentation, or PDF URLs.

## Accessibility

- Preserve semantic heading order and visible keyboard focus.
- Do not communicate status by color alone.
- Disclosures expose `aria-expanded` and `aria-controls`.
- Dialogs trap focus and return focus to their trigger.
- Loading and mutation errors use live regions where appropriate.
- Icon-only controls have accessible labels.
- Primary workflows are keyboard reachable in logical visual order.

## Customer-Experience Events

Only coarse, non-sensitive events are emitted through Onread's server
observability pipeline:

- `overview_primary_action_clicked`
- `overview_evidence_expanded`
- `overview_coverage_expanded`
- `overview_view_all_findings_clicked`
- `task_started`
- `task_continued`
- `finding_opened`
- `consultant_prompt_selected`
- `setup_step_completed`
- `category_opened`
- `empty_state_action_clicked`

Events contain a coarse surface label only. They do not include business names,
customer-entered text, prompts, complete URLs, email addresses, or database IDs.

## Route Review

Materially reviewed routes:

- `/dashboard`
- `/dashboard/businesses`
- `/dashboard/businesses/new`
- `/dashboard/businesses/[businessId]/setup`
- `/dashboard/businesses/[businessId]/confirm`
- `/dashboard/businesses/[businessId]/context`
- `/dashboard/businesses/[businessId]/goals`
- `/dashboard/businesses/[businessId]/overview`
- `/dashboard/businesses/[businessId]/audit`
- `/dashboard/businesses/[businessId]/audit/run`
- `/dashboard/businesses/[businessId]/website`
- `/dashboard/businesses/[businessId]/seo`
- `/dashboard/businesses/[businessId]/reviews`
- `/dashboard/businesses/[businessId]/social`
- `/dashboard/businesses/[businessId]/competitors`
- `/dashboard/businesses/[businessId]/action-plan`
- `/dashboard/businesses/[businessId]/history`
- `/dashboard/businesses/[businessId]/chat`
- `/dashboard/billing`
- `/dashboard/settings`
- `/dashboard/help`
- Presentation Mode

Partner and administrator routes are intentionally outside this visual pass.

## Known Limitations

- Onread does not currently have individual recommendation or finding detail
  URLs. Filtered Action Plan and Audit anchors provide stable returnable detail
  views without introducing a second task-management model.
- Product events use the existing server log pipeline rather than a new customer
  analytics vendor or database table.
- Billing remains constrained by the currently configured Stripe products.
- Customer appearance and notification preferences are not yet editable, so
  Settings must not imply that those controls already exist.
