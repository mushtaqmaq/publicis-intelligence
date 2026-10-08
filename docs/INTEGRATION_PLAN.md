# Module Integration Plan: Creative, Multimedia, Finance and Media as one system

Status: PLAN, decisions confirmed by the owner on 2026-10-08 (section 9). Implementation starts at P0.

## 1. Updated scope (owner message, 2026-10-08)
- The system is a development/testing environment; no real users, no production data. Existing records are disposable. We still change the database only through reviewed Prisma migrations.
- Space data import is cancelled (the tool in `scripts/import-space.mjs` stays in the repo, unused).
- Rename the **Production** module to **Multimedia** everywhere (navigation, dashboards, permissions, database references, reports).
- **Multimedia**: photo and video shoots, voice-over, editing/post-production, task assignment, scheduling, approvals, resources, deadlines, deliverables, attachments, status tracking, reporting.
- **Creative**: artwork/design requests, briefs with reference attachments, designer assignments and deadlines, versions and revision history, internal review and approval, final artwork upload and delivery tracking. Separate from Multimedia, but linkable on the same campaign.
- **Finance**: a complete financial management module reusing the Creolanza finance logic: dashboards and reporting, client and supplier financial records, quotations, budgets and approvals, booking orders and purchase orders, invoices, payments, outstanding balances, AR and AP, revenue/cost/margin/profitability, forecasting and cash flow, roles, approvals and audit logs, exports.
- All modules connected, no duplicate data entry, department permissions, administrators can see everything.

## 2. What the platform already has (verified in this repo)
- One Neon Postgres database, Prisma 7 schema (22 migrations), one identity store (`users`/`sessions`), RBAC tables (`permissions`, `role_permissions`, `user_permission_overrides`), `audit_logs`, per-user module access (`module.<id>`), a guard-coverage test for `/media`.
- Media module: inventory, suppliers, planner `clients`, plans with versions/locking, rate engine, agency exports, settings, AI draft and inventory suggestions.
- The vanilla-JS SPA hosts the AI agents for all six pillars; new modules are built as React pages inside Next.js (as `/media` was).
- Two client concepts exist today (planner `clients` table and the SPA's workspace "Clients" documents). They must become one.
- Files are stored in Postgres (`files`, bytea) for generated media, and in Vercel Blob for rate cards and photos. Vercel caps request bodies near 4.5 MB.

## 3. Reuse findings (from a read-only review of the Creolanza projects; key files spot-checked)
All Creolanza apps are Next 15 + Prisma 6.19, each with its own staff-user table, SSO (`src/lib/sso.ts`, Control Center issuer), per-app `rbac.ts`/`audit.ts`, and a `prisma/schema/*.prisma` folder. Tests run against a real Postgres. Nothing can be dropped in as is; the approach is to **port the logic and tests and strip the Creolanza-specific auth/tenant code**, mapping onto this platform's users, permissions and audit log.

### Finance
| Requirement | Best source (under `/Users/mushtaq`) | State | Effort |
|---|---|---|---|
| Approval workflow (amount-banded, sequential, maker-checker) | `creolanza-procurement/src/services/approval-engine.ts` (142 lines) + thresholds | complete, tested | low |
| Gapless document numbering | `creolanza-accounting/src/lib/numbering.ts` (34 lines, atomic upsert) | complete, concurrency-tested | low |
| Quotations (versioned), pricing, discount approval | `creolanza-sales` (`src/lib/pricing.ts`, `quotation-actions.ts`, PDFs) | complete; floats not Decimal | low-medium |
| Booking/sales orders | `creolanza-sales` `order-actions.ts` | quote-to-order complete; no billing link | low-medium |
| Purchase orders (versioned, receipts) | `creolanza-procurement` orders | complete | low-medium |
| Invoices, payments, allocation, status, credit notes | `creolanza-equipment-rental` (`billing.prisma`, `invoice-status.ts`, `payment-actions.ts`, `invoice-pdf.tsx`) | AR complete for one entity; rental/UAE VAT coupling; single-invoice allocation; no auto-overdue | medium |
| AR ageing, reports, CSV/Excel/PDF export | `creolanza-equipment-rental/src/services/reports.ts` (316 lines) + export route; CSV-injection-safe `creolanza-sales/src/lib/csv.ts` | good | low-medium |
| General ledger: chart of accounts, journals, periods, FX, period lock | `creolanza-accounting` | foundation complete, tested, DB immutability trigger | low-medium |
| RBAC and audit pattern | `creolanza-accounting/src/lib/rbac.ts`, `audit.ts` | complete | low (map onto this platform) |
| **Accounts payable (bills, vendor payments, 3-way match)** | none | not implemented anywhere | **high, new** |
| **Margin / profitability** | partial: `creolanza-media-agency` time-entry rate snapshots, `computeBudgetVariance` | not built | **high, new** |
| **Forecast and cash flow** | none | not built | **high, new** |
| Dashboards and charts | none | not built | new |

### Creative
Best source `creolanza-media-agency`: `CreativeRequest`, `ClientBrief`, `CreativeProof` / `ProofVersion` (immutable once decided) / `ProofDecision` / `ProofComment`, with tested logic in `proof-actions.ts` and `proof-versioning.test.ts`. Gaps there: no UI, no status machine (a request never leaves "ready for review"), no brief attachments, no capacity view. Use `creolanza-support` `sla-clock.ts` for business-hours deadlines and `creolanza-quality` `approval-engine.ts` for generic approvals.

### Multimedia
Best source `creolanza-projects`: `Task` with subtasks, dependencies (`scheduling.ts`, cycle checks), `CalendarEvent`, workload summary, templates, files and comments, change-request approvals, project health, a task-tree UI. Nothing multimedia-specific exists (shoots, voice-over, editing jobs, equipment, date-ranged booking); those are new, modelled as job types over the task/calendar foundation.

### Biggest gaps across everything
Real status workflows, date-based resource booking, AP, margins, forecasting, dashboards. (File storage is no longer a gap: links only.)

## 4. Target architecture

### 4.1 Shared core (new or extended in the one database)
- **Client** (extend the planner `clients` table): billing details, tax id, `paymentTermsDays`, `creditLimit`. The SPA workspace "Clients" becomes a view over this table.
- **Supplier** (extend planner `suppliers`): payment terms, tax id, currency, bank details (for AP).
- **Campaign** (new): the shared parent. Fields: client, name, code, dates, owner, status, budget, currency. Everything links to it: media plans (nullable `campaignId` on `media_plans`), creative requests, multimedia jobs, quotations, booking orders, purchase orders, invoices, bills, cost lines.
- **Deliverable** (new): belongs to a campaign; can be linked from a creative request or multimedia job.
- **Link** (new, generic attachment: `entityType`, `entityId`, title, URL or storage path, kind, added by). **The platform stores no files for these modules**: briefs, reference material, artwork, footage and deliverables live in the company's own cloud and local storage, and the platform keeps only the links. (Decision 5.)
- **Comment**, **Approval** (port of the procurement engine, changed so each step is assigned to a **named person or role chosen per document type**, for example first approval by the manager, then finance, then director; sequential steps, nobody approves their own request, amount bands optional), **Notification** (optional), **DocumentSequence** (gapless numbering).
- **Audit**: keep `audit_logs`; every module writes through one helper.

### 4.2 Modules and routes
`/media` (exists), `/creative`, `/multimedia`, `/finance`, plus a **Campaign hub** at `/campaigns/[id]` summarising plan, creative, multimedia and finance for authorised users. Built as React pages in Next.js; the SPA keeps the AI agents and links into them.
Module ids: `strategy`, `creative`, `media`, `finance`, `multimedia` (renamed from `production`), `search`.

### 4.3 Permissions
Module access (`module.<id>`, exists) is the gate. Inside a module, fine-grained capability permissions use the existing permission tables (for example `finance.invoice.issue`, `finance.payment.record`, `finance.approve`, `creative.review`, `multimedia.schedule`). Admins hold everything and can open the consolidated Campaign hub and finance reports. Maker-checker: nobody approves their own request. Every server action, route and page carries the guard; the guard-coverage test is extended to each new module.

### 4.4 Cross-module flow (no re-entry)
1. A **campaign** is created (or created from a media plan).
2. **Media**: the plan is approved. Finance generates a **quotation** and then a **booking order** from the plan (client price from net-to-client, agency fee, IR tracked internally).
3. **Finance**: purchase orders per supplier are generated from the plan lines; the client **invoice** is generated from the booking order; payments allocate to invoices; supplier **bills** and vendor payments feed AP.
4. **Creative** requests and **Multimedia** jobs attach to the campaign (and optionally a deliverable). Their costs (time entries or cost lines) roll up to campaign cost.
5. **Margin** = invoiced revenue minus supplier and production costs (and IR as a separate line), per campaign and per plan. **Forecast and cash flow** use open quotations, booking orders, unbilled work, open invoices and open bills.

## 5. Creative module (design)
Entities: `CreativeRequest` (campaign, deliverable, requester, assignee, priority, due date, brief text), brief attachments, `CreativeProof` / `ProofVersion` / `ProofDecision` / `ProofComment`, delivery record. Status machine (enforced in code, tested): SUBMITTED -> ASSIGNED -> IN_PROGRESS -> IN_REVIEW -> (CHANGES_REQUESTED -> IN_PROGRESS) -> APPROVED -> DELIVERED, or CANCELLED. A new version is immutable once decided. Pages: request list and board, request detail (brief, attachments, versions, comments, decisions), designer workload, delivery tracking. Deadlines respect business hours.

## 6. Multimedia module (design)
Job types: PHOTO_SHOOT, VIDEO_SHOOT, VOICEOVER, EDITING (post-production). Entities: `MultimediaJob` (campaign, deliverable, type, brief, location, schedule window, status, owner), tasks with dependencies, **resources** (people, equipment, studios) with **date-ranged bookings and conflict detection**, deliverables, links to files held in company storage, approvals, comments. Status machine per job. Pages: jobs board and list, job detail, calendar (shoots and deadlines), resource schedule and workload, reports (on-time delivery, utilisation).

## 7. Finance module (design)
Phases keep each deliverable shippable:
- **F1 documents**: quotations (versioned, discount approval), booking orders, purchase orders, invoices with line items, credit notes; gapless numbering; PDF output; approval engine with amount thresholds.
- **F2 receivables and payables**: payments with multi-invoice allocation and reversal, auto-overdue, AR ageing and customer statements; supplier bills, vendor payments, PO-to-bill matching, AP ageing and supplier statements.
- **F3 profitability**: campaign and plan margins, budget vs actual, cost lines, time-based costs.
- **F4 forecast and cash flow**: pipeline and open-document based forecast, weekly/monthly cash-flow.
- **F5 general ledger**: chart of accounts, fiscal periods and locking, journals with automatic postings from invoices, payments and bills, trial balance. Included only if confirmed (decision 9.2); F1 to F4 are designed so postings can be added without reworking documents.
- **Dashboards, reports and exports** (CSV, Excel, PDF) delivered with each phase from one data source per report.
Money uses Prisma Decimal everywhere (not floats). Base currency QAR; tax rates are configured, not hard-coded (the Creolanza UAE VAT code is not reused).

## 8. Phases, order and gates
| Phase | Content | Done when |
|---|---|---|
| P0 | Rename Production to Multimedia (code, permission key and label by migration, docs); shared core: Campaign, Deliverable, Link (attachments as links), Comment, Approval engine with person-assigned steps, sequences; client unification; capability permissions; guard-coverage test generalised | tests pass; rename verified; links add/open; a multi-step approval with assigned approvers works end to end |
| P1 | Creative module | full request-to-delivery workflow tested, incl. versions and permissions |
| P2 | Multimedia module | job and resource workflows tested, incl. booking conflicts |
| P3 | Finance F1 | quote -> booking order -> PO -> invoice flows generated from a media plan |
| P4 | Finance F2 to F4 | AR/AP ageing, payments, margin and forecast tested with seeded scenarios |
| P5 | Campaign hub, consolidated admin views, cross-module reports and exports; Finance F5 if confirmed | one scenario runs end to end across all modules |
| P6 | Hardening: end-to-end scenario script, access-control matrix test, security review, documentation, owner acceptance | owner signs off before any production use |
Every phase: work on a branch, tests plus a local run on a Postgres restore, a PR, CI green. Migrations are additive and applied by the owner; production deploys happen only on the explicit phrase "Deploy to production".

## 9. Decisions (confirmed by the owner, 2026-10-08)
1. "Standalone planner" means the OLD separate OOH media planner app; this unified platform (including the Media module) is the system being built.
2. **General ledger deferred**: build documents, AR/AP, margin, forecast and cash flow first; the ledger (F5) comes later.
3. **QAR only.** Tax is a configurable rate per document or line (default 0); no multi-currency in the first release.
4. **Planner clients replace the workspace Clients list** (one client record for every module).
5. **Links only, no file storage**: the platform stores no briefs, artwork, footage or deliverables; users add links to the company's cloud and local storage.
6. **Approvals by assigned people**: each approval step is assigned to a person (or role) per document type, multi-step, for example manager first, then the next approver. Configured in settings and overridable per request.
7. **The old standalone planner app is switched off.** It was paused on 2026-10-08 (`creolanza-oryntiq.vercel.app` returns 503). Its database and file store are shared with this platform and were not touched. To undo: `vercel api -X POST /v1/projects/prj_gB7YGNnLmF3px5tm8XchCsaBI0tD/unpause --scope maq5`.
8. Department roles: Strategy, Creative, Media, Finance, Multimedia, Search, plus administrators.

## 10. Risks
Scope is large; mitigated by phase gates. Creolanza code is Next 15/Prisma 6 and tenant-coupled, so each port needs adaptation and tests. AP, margin and forecasting are new code, not reuse. Finance correctness needs a real finance review before real money flows; the Creolanza accounting module itself records that no real finance review was done.
