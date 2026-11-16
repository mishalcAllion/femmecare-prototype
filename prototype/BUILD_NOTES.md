# FemmeCare prototype: build notes

Read this before writing any screen. The spec is `../prototype-prd.md` (sections 5 to 16). Screen IDs (S1, C3, W4...) come from its section 14.

## What this is

A front-end-only web app with dummy data loaded, that must **look and behave like the finished FemmeCare Sales System**. Three parts:

| Part | URL | Users |
|---|---|---|
| Public website | `/`, `/products`, `/r/:number`, `/join`, `/signin` | Visitors, applicants |
| Consultant app | `/app/*` | Consultants (phone first) |
| Staff console | `/staff/*` | Admin, Outlet sales, Stores, Operations, Finance, Management |

Dev server: already running at http://localhost:5190 (Vite, hot reload). Do not start another one.

## Hard rules

1. **Looks real.** Never show the words prototype, demo, mock, fake, dummy, placeholder, lorem or TODO on screen. Write copy as the real product would. The only place demo wording is allowed is the demo panel (`src/demo/`), which you must not edit.
2. **No em-dash characters** in any UI text or comment. Use commas, colons, full stops or a plain hyphen.
3. **All data changes go through `actions`** (`src/domain/actions.ts`) or a business function wrapped in `mutate`. Never change `useDb()` objects directly: they are frozen.
4. **Use the demo clock**, never `Date.now()` / `new Date()` for business dates: `const now = useNow()` (ISO string). Format with `src/domain/format.ts` (`lkr`, `date`, `dateTime`, `relative`, `monthLabel`, `consultantCode`...). Money is always `lkr(n)` → "LKR 1,250.00".
5. **Permissions:** wrap every staff page in `<Guard perms={[...]}>` (`src/staff/guard.tsx`). Hide or disable buttons the role can't use with `useCan("perm")`. Permission names are in `src/domain/permissions.ts`.
6. **The word "Consultant"** on screen comes from `db.settings.labels.consultant` (it can be switched to "Agent"). Use it in headings and labels.
7. **Later-phase features** (promotions, ranks, returns, integrations) only show when `db.meta.phaseLens === "everything"`, with a small "Coming later" tag.
8. **Stay in your own folders** (listed in your brief). Shared files (`src/domain/*`, `src/components/*`, `src/lib/*`, `src/staff/StaffLayout.tsx`, `nav.tsx`, `App.tsx`) are owned by the lead. If you need a new business rule or action, add it in a new file you own, e.g. `src/domain/ext/<area>.ts`, using `mutate` and the existing business functions. If you find a bug in a shared file, make the smallest fix and list it in your report.
9. Do not commit to git. Do not install packages without saying so in your report.
10. Every page: `usePageTitle("Orders")`, a `PageHeader`, loading-free (data is local), a useful empty state, works at 375 px wide (consultant and public) or 1366 px (staff) with no sideways page scroll; wide tables scroll inside their own box.

## Data

- `const db = useDb()` gives the whole state (`src/domain/types.ts`). Derive with `useMemo`.
- Business functions to read with (pure, take `db`):
  - stock: `available`, `onHand`, `reserved`, `lotsFefo`, `pickPlan`, `weeksOfCover`, `stockAlerts`, `batchTrace`, `productOf`, `productName`, `CHANNEL_LABEL`
  - outlets: `orderTotals`, `orderValue`, `lineValue`, `waitingQueue`, `queuePosition`, `stockCheck`, `freeForNewOrders`, `creditWarning`, `outletBalance`, `invoiceBalance`, `invoiceStatus`, `daysOverdue`, `ageing`, `paidOn`, `pickableQty`, `outletName`, `ORDER_STATUS_LABEL`
  - consultants: `fullName`, `consultantById`, `consultantByNumber`, `directTeam`, `isDownline`, `parseNic`, `validMobile`, `sponsorCheck`, `duplicateCheck`, `consultantPrice`, `deliveryCharge`, `inStock`, `canCancel`, `allowedStatusChanges`, `STATUS_LABEL`, `PAYMENT_STATUS_LABEL`, `DELIVERY_STATUS_LABEL`
  - commission: `computeMonth`, `lineFor`, `whyNotQualified`, `monthStatus`, `closeChecks`, `salesByConsultant`, `salesMonth`, `statement`, `bankFileCsv`, `commissionLiability`, `pendingAdjustments`, `isQualifying`
  - work queue: `workItems`, `itemsFor` (`src/domain/workqueue.ts`)
- Actions (`actions.x(...)`) return `{ ok, value } | { ok: false, error }`. Call them through `act()` from `src/lib/fc.ts`, which shows a success toast or the error: `act(actions.approveApplication(id), "Approved")`.
- Session: `useStaffUser()`, `useConsultant()`, `useCan(p)`, `actorName(db, id)` (names for audit and timeline ids).
- Demo data on the default date (Tue 2 Mar 2027 09:00): 62 consultants (5 pending applications), about 285 consultant orders, 46 outlet orders, 43 invoices (4 overdue), January closed and paid with one failed payout, February ended but not closed (2 unverified February bank slips block the close), 4 bank slips to verify (one LKR 500 short, one reusing an earlier reference), FC002 Night pads out for outlets with 3 outlets waiting and a GRN expected, 1 batch expiring in 63 days, 2 bank-detail changes, 1 refund request, 1 stock move to approve.
- `npx tsx scripts/seed-check.ts month_end` prints the queues if you need to check numbers.

## Components (use these, don't rebuild them)

- `src/components/fc/ui.tsx`: `PageHeader`, `Panel`, `Kpi`, `StatusBadge`, `Status` (tone picked from the word), `toneFor`, `EmptyState`, `KeyValue`, `Timeline` (pass `nameOf={(id) => actorName(db, id)}`), `Steps` (two-track order status), `ProgressBar`, `ReasonDialog` (any action needing a reason), `SimpleTable` (search, sort, paging, Excel/CSV/print export via `exportName`, `rowHref`), `FilterTabs`.
- `src/components/fc/brand.tsx`: `Logo`, `HeartMark`, `ProductPack` (product illustration), `Avatar` (initials, `hue`).
- `src/components/fc/docs.tsx`: `Barcode` (EAN-13), `QrCode`, `SignedNoteImage` (photo of a signed delivery note; `difference` adds "2 packs damaged"), `BankSlipImage` (variants `slip-1|2|3`), `NativeSelect` (use this for dropdowns in forms).
- shadcn components in `src/components/ui/*` are the **Base UI** flavour: use the `render` prop instead of `asChild`, e.g. `<Button render={<Link to="/x" />}>Open</Button>`, `<DialogTrigger render={<Button />}>`. Available: button, input, textarea, label, card, badge, dialog, sheet, drawer, tabs, popover, dropdown-menu, select, switch, checkbox, radio-group, tooltip, separator, skeleton, table, accordion, avatar, command, toggle-group.
- Charts: `recharts` (installed). Use CSS variables for colours: `var(--chart-1)` to `var(--chart-5)`, `var(--primary)`.
- Icons: `lucide-react`.
- Toasts: `toast` from `sonner` (or `act()`).
- Print views: put `no-print` on anything that shouldn't print; wrap the document in a white A4-width card with class `print-page`; a Print button calls `window.print()`.
- Excel export: `downloadExcel(file, header, rows)`; CSV: `downloadText(file, toCsv(rows))` (`src/lib/fc.ts`).

## Look and feel

- Brand: coral red primary (`text-primary`, `bg-primary`), blush surfaces (`bg-brand-soft`, `bg-blush`), plum accent (`text-plum`), headings in the display serif (`font-display`), numbers with `tabular`. Rounded 2xl cards with `shadow-soft`; hover lift with `shadow-lift`. Light motion: `animate-rise` on page content, `animate-pop` for success ticks.
- Staff pages: dense but airy; KPI row at the top where it helps; tables in `SimpleTable`; details in side `Sheet`s or detail pages with a `Timeline`.
- Consultant app: phone first, big tap targets, cards over tables, bottom tab bar.
- Status words and colours must match across screens: use `Status`.
- Realistic copy: "Approve and issue number", "Upload the signed delivery note", "Waiting for verification", not technical terms.

## Checking your work

- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` from the prototype folder. Fix errors in your files; ignore errors in another builder's folder that is still in progress, but mention them.
- Look at your screens in the browser at http://localhost:5190. If you use the browser tools, open your **own** tab (`tabs_create`) and use only that tab; other builders are using the browser too. Switch persona with the demo panel (Ctrl+Shift+D) or directly: staff sign-in at `/staff/login` (any staff email from `src/domain/seed/data.ts`; the code appears in the demo panel's Outbox).
- Walk each demo script from PRD section 15 that your area owns, on the default scenario.
