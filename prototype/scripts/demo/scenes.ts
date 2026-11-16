// The two walkthroughs, step by step, as the people in them would click.
// Step numbers in the captions match the step tables in playbook.md.

import type { Locator } from "playwright";
import type { Stage } from "./stage";

const RUWAN = "Ruwan Jayawardena, Outlet sales";
const KASUN = "Kasun Bandara, Stores";
const NIMALI = "Nimali Perera, Consultant FC00006";
const MALSHA = "Malsha Gunasekara, Operations";

export interface RunInfo {
  ids: Record<string, string>;
}

const last = (p: string) => p.split("/").filter(Boolean).pop() ?? "";

/** A control by its visible name, whether it is a button or a link styled as one. */
function act(s: Stage, name: string | RegExp, exact = false): Locator {
  return s.f.getByRole("button", { name, exact }).or(s.f.getByRole("link", { name, exact })).first();
}

async function waitForText(loc: Locator, timeout = 15_000) {
  await loc.first().waitFor({ state: "visible", timeout });
}

// ------------------------------------------------------------------
// Use case 1: a retail outlet order, through stock, to dispatch and delivery
// ------------------------------------------------------------------

export async function useCase1(s: Stage): Promise<RunInfo> {
  const ids: Record<string, string> = {};
  const f = () => s.f;

  await s.title(
    {
      eyebrow: "Use case 1 · Retail outlets",
      title: "A retail outlet order, from paper PO to signed delivery note",
      sub: "Cool Planet orders three products for its Kandy showroom. Night pads are out of stock, so part of the order waits for the next batch.",
      foot: "Tuesday 2 March 2027, 09:00",
    },
    async () => {
      await s.load("laptop", "/staff/login");
      await s.hook("laptop", "setPresenterMode", true);
    },
    5200,
    { startRecording: true, line: "uc1-open" },
  );

  // 1. Ruwan signs in
  await s.caption(1, RUWAN, "Signs in to the staff console with his work email", 0, "uc1-01");
  await s.type(f().locator("#email"), "ruwan.j@femmecare.lk");
  await s.click(f().getByRole("button", { name: "Send code" }), 200);
  await s.caption(1, RUWAN, "A one-time code is emailed to him, and he types it in", 0, "uc1-02");
  await f().waitForFunction(() => ((document.getElementById("code") as HTMLInputElement | null)?.value ?? "").length >= 6, null, { timeout: 10_000 });
  await s.wait(700);
  await s.click(f().getByRole("button", { name: "Sign in" }), 1300);
  await s.caption(1, RUWAN, "What's waiting: his work for today, each count opens the list behind it", 1700, "uc1-03");
  await s.snap("whats-waiting", "Ruwan's What's waiting page after signing in");

  // 2. Ruwan enters the paper PO
  await s.caption(2, RUWAN, "Enters Cool Planet's paper PO as a new outlet order", 0, "uc1-04");
  await s.click(f().getByRole("link", { name: "Outlet orders" }).first(), 900);
  await s.click(act(s, "New order", true), 900);
  await s.select(f().locator("select").nth(0), "CUS-0001");
  await s.type(f().getByPlaceholder("As printed, e.g. CP-4471"), "CP-5001");
  await s.select(f().locator("select").nth(1), { label: "Kandy" });
  await s.caption(2, RUWAN, "Adds the lines: 120 Regular pads, 80 Panty liners, 60 Night pads", 0, "uc1-05");
  const rows = f().locator("table tbody tr");
  const add = f().getByRole("button", { name: "Add product" });
  await s.select(rows.nth(0).locator("select"), "FC001", 250);
  await s.type(rows.nth(0).getByLabel("Quantity", { exact: true }), "120", { after: 500 });
  await s.click(add, 300);
  await s.select(rows.nth(1).locator("select"), "FC003", 250);
  await s.type(rows.nth(1).getByLabel("Quantity", { exact: true }), "80", { after: 500 });
  await s.click(add, 300);
  await s.select(rows.nth(2).locator("select"), "FC002", 250);
  await s.type(rows.nth(2).getByLabel("Quantity", { exact: true }), "60", { after: 600 });
  await s.point(rows.nth(2).locator("td").nth(5));
  await s.caption(2, RUWAN, "Stock check: Regular pads and liners can go now. Night pads are out, so 60 wait, 6th in line", 2600, "uc1-06");
  await s.snap("po-stock-check", "New outlet order with the stock check per line");
  await s.click(f().getByRole("button", { name: "Save and confirm" }), 1400);
  ids.order = last(s.path());
  await s.caption(2, RUWAN, `Order ${ids.order} is confirmed: 200 packs set aside, 60 back-ordered`, 1200, "uc1-07");
  await s.reveal(f().getByText("Stock and delivery", { exact: true }));
  await s.wait(1300);
  await s.snap("order-confirmed", "The confirmed order, with allocated and back-ordered quantities per line");

  // 3. Kasun records the goods received
  await s.title({ eyebrow: "Use case 1 · Step 3", title: "Kasun, Stores", sub: "receives the Night pads from production" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-03");
    await s.go("/staff");
  });
  await s.caption(3, KASUN, "What's waiting: stock has arrived from production and is not yet received", 1300, "uc1-08");
  await s.click(f().getByRole("link", { name: /Stock arrived, not yet received/ }), 1000);
  await s.caption(3, KASUN, "2,400 Night pads arrived this morning, and outlets are waiting for them", 1300, "uc1-09");
  await s.click(f().locator('a[href^="/staff/grn/GRN"]').first(), 1100);
  ids.grn = last(s.path());
  await s.caption(3, KASUN, "Checks the quantity and dates against the docket. The system gives the batch number", 0, "uc1-10");
  await s.point(f().locator("#grn-qty"));
  await s.wait(500);
  await s.point(f().locator("#grn-batch"));
  await s.wait(900);
  await s.point(f().locator("#grn-o"));
  await s.caption(3, KASUN, "Splits the batch: 1,440 packs for retail outlets, 960 for consultants", 1200, "uc1-11");
  await s.point(f().getByText("Outlets waiting for this product"));
  await s.caption(3, KASUN, "The waiting outlets are listed, oldest order first", 1300, "uc1-12");
  await s.snap("grn-form", "Recording the goods received note: batch, dates and the split between channels");
  await s.click(f().getByRole("button", { name: "Record and put into stock" }), 1300);
  await s.caption(3, KASUN, "Recorded. Outlet sales are alerted that outlets are waiting for Night pads", 1800, "uc1-13");
  await s.snap("grn-recorded", "GRN recorded, with the alert that outlets are waiting");

  // 4. Ruwan serves the back-orders, oldest first
  await s.title({ eyebrow: "Use case 1 · Step 4", title: "Ruwan, Outlet sales", sub: "serves the waiting outlets, oldest order first" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-02");
    await s.go("/staff/backorders?product=FC002");
  });
  await s.caption(4, RUWAN, "Six orders wait for Night pads, oldest first. Cool Planet's new PO is 6th in line", 2400, "uc1-14");
  await s.snap("backorders", "Back-orders for Night pads after the GRN, oldest first");
  for (let i = 0; i < 6; i++) {
    const row = f().locator("tbody tr").first();
    const outlet = (await row.locator("td").nth(1).innerText()).trim();
    if (i === 0) await s.caption(4, RUWAN, `He confirms with each outlet, then allocates from the top, starting with ${outlet}`, 0, "uc1-15");
    if (i === 1) await s.caption(4, RUWAN, "Each allocation sets the packs aside for that order, oldest first", 0, "uc1-16");
    if (i === 5) await s.caption(4, RUWAN, `Last in line, ${outlet}'s 60 Night pads on ${ids.order}`, 0, "uc1-17");
    await s.click(row.getByRole("button", { name: "Allocate" }), i < 5 ? 650 : 1300);
  }
  await s.caption(4, RUWAN, "Every waiting order now has its Night pads. Stores can pick them", 1600, "uc1-18");

  // 5. Kasun picks and packs by scan
  await s.title({ eyebrow: "Use case 1 · Step 5", title: "Kasun, Stores", sub: "picks and packs Cool Planet's order" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-03");
    await s.go("/staff/dispatch?channel=outlet");
  });
  await s.caption(5, KASUN, "The dispatch board: outlet orders with stock set aside, oldest first", 1000, "uc1-19");
  const card = f().locator("div.w-64").filter({ hasText: ids.order });
  await s.reveal(card);
  await s.point(card);
  await s.caption(5, KASUN, `Creates the pick list for ${ids.order}`, 300, "uc1-20");
  await s.click(card.getByRole("button", { name: "Create pick list" }), 1300);
  ids.dispatch = last(s.path());
  let st = await s.state();
  const disp = st.dispatches.find((d) => d.id === ids.dispatch)!;
  ids.fc002Batch = disp.lines.find((l) => l.productId === "FC002")?.batchId ?? "";
  const need: Record<string, number> = {};
  for (const l of disp.lines) need[l.productId] = (need[l.productId] ?? 0) + l.qty;
  await s.reveal(f().locator("table").first());
  await s.caption(5, KASUN, "The pick list names the batch for each line, the earliest expiry first", 2200, "uc1-21");
  await s.snap("pick-list", "Pick list with the earliest-expiry batch for each line");
  await s.scroll("top");
  await s.caption(5, KASUN, "Packs by scanning each pack's barcode", 0, "uc1-22");
  const barcode = st.products.find((p) => p.id === "FC001")!.barcode;
  await s.type(f().locator("#scan"), barcode, { delay: 40, after: 200 });
  await f().locator("#scan").press("Enter");
  await s.wait(1100);
  await s.caption(5, KASUN, "A full carton scans as 50 at a time", 0, "uc1-23");
  await s.select(f().locator("select").first(), "50");
  await s.caption(5, KASUN, "A pack of wipes is not on this order, so the scan is refused", 200, "uc1-24");
  await s.click(f().locator("button").filter({ hasText: "FC004" }), 1900);
  await s.snap("wrong-item", "A wrong item is refused while packing");
  await s.caption(5, KASUN, "Scans the right products until every line is packed", 0, "uc1-25");
  let left001 = need.FC001 - 1;
  for (const [pid, qty] of [["FC001", left001], ["FC003", need.FC003], ["FC002", need.FC002]] as [string, number][]) {
    const btn = f().locator("button").filter({ hasText: pid });
    for (let n = qty; n > 0; n -= 50) await s.click(btn, 420);
  }
  left001 = 0;
  await s.wait(900);
  await s.caption(5, KASUN, "Every item checked. The box is ready for its invoice and delivery note", 1700, "uc1-26");
  await s.snap("packed", "Packed and checked by scan; the dispatch is Ready");

  // 6. Ruwan issues the invoice and delivery note
  await s.title({ eyebrow: "Use case 1 · Step 6", title: "Ruwan, Outlet sales", sub: "issues the invoice and delivery note" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-02");
    await s.go(`/staff/dispatch/${ids.dispatch}`);
  });
  const issue = f().getByRole("button", { name: "Issue invoice and delivery note" });
  await s.caption(6, RUWAN, "Packed and checked, so he can issue the invoice and delivery note", 0, "uc1-27");
  await s.click(issue, 1400);
  st = await s.state();
  const d2 = st.dispatches.find((d) => d.id === ids.dispatch)!;
  ids.invoice = d2.invoiceId ?? "";
  ids.deliveryNote = d2.deliveryNoteId ?? "";
  await s.caption(6, RUWAN, "Both are emailed to Cool Planet as PDFs and printed for the driver", 1300, "uc1-28");
  await s.click(act(s, `Invoice ${ids.invoice}`), 900);
  await s.scroll("top");
  await s.caption(6, RUWAN, "The invoice: Cool Planet's PO number, trade prices, due date from its 45-day terms", 1700, "uc1-29");
  await s.snap("invoice", "Invoice print view");
  await s.scroll(420);
  await s.wait(1300);
  await s.click(act(s, "Delivery note", true), 1300);
  await s.caption(6, RUWAN, "The delivery note: quantities and batch numbers, no prices, and a box for the outlet to sign", 1900, "uc1-30");
  await s.snap("delivery-note", "Delivery note print view");
  await s.scroll(420);
  await s.wait(1200);

  // 7. Kasun dispatches
  await s.title({ eyebrow: "Use case 1 · Step 7", title: "Kasun, Stores", sub: "loads the van and sends it" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-03");
    await s.go(`/staff/dispatch/${ids.dispatch}`);
  });
  await s.reveal(f().locator("#vehicle"));
  await s.caption(7, KASUN, "Records the vehicle and driver, then dispatches", 0, "uc1-31");
  await s.point(f().locator("#vehicle"));
  await s.wait(500);
  await s.point(f().locator("#driver"));
  await s.wait(500);
  await s.click(f().getByRole("button", { name: "Dispatch", exact: true }), 1300);
  await s.caption(7, KASUN, "Out for delivery. The stock leaves the warehouse and the order waits for the signed note", 1700, "uc1-32");
  await s.snap("dispatched", "Dispatched with the vehicle and driver, waiting for the signed note");

  // 8. Ruwan confirms the delivery from the signed note
  await s.title({ eyebrow: "Use case 1 · Step 8", title: "Ruwan, Outlet sales", sub: "confirms the delivery from the signed note" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-02");
    await s.go("/staff/pod");
  });
  await s.caption(8, RUWAN, "The driver is back with Cool Planet's signed delivery note", 600, "uc1-33");
  const podRow = f().locator("li").filter({ hasText: ids.deliveryNote });
  await s.click(podRow.getByRole("button", { name: /Upload the note|Check and confirm/ }).or(podRow.getByRole("link", { name: /Upload the note|Check and confirm/ })).first(), 1000);
  await s.caption(8, RUWAN, "Uploads a photo of the signed note", 0, "uc1-34");
  const chooser = s.page.waitForEvent("filechooser");
  await s.click(f().getByRole("button", { name: /^Upload a photo/ }), 100);
  const jpg = await s.page.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: 400, height: 560 } });
  await (await chooser).setFiles({ name: `${ids.deliveryNote}-signed.jpg`, mimeType: "image/jpeg", buffer: jpg });
  await s.caption(8, RUWAN, "The system reads the quantities from the note", 1800, "uc1-35");
  await waitForText(f().getByText("Check what was read"));
  await s.caption(8, RUWAN, "Figures read from the note are highlighted for him to check", 1700, "uc1-36");
  await s.snap("signed-note-read", "The signed note read by the system, with the figures highlighted to check");
  await s.type(f().locator("#received-by"), "Chathura Bandara");
  await s.caption(8, RUWAN, "Enters who signed for the goods, then confirms", 0, "uc1-37");
  await s.click(f().getByRole("button", { name: "Confirm delivery" }), 1300);
  await s.caption(8, RUWAN, "All 260 packs received. The order moves to Completed", 1800, "uc1-38");
  await s.snap("delivery-confirmed", "Delivery confirmed; the order is now Completed");
  await s.click(act(s, "Open the order", true), 1200);
  await s.reveal(f().getByText("Stock and delivery", { exact: true }));
  await s.caption(8, RUWAN, `${ids.order}: every pack delivered, nothing outstanding`, 1900, "uc1-39");
  await s.snap("order-completed", "The completed order: every line delivered");

  // 9. Kasun checks the stock and traces the batch
  await s.title({ eyebrow: "Use case 1 · Step 9", title: "Kasun, Stores", sub: "checks the stock and traces the batch" }, async () => {
    await s.hook("laptop", "signInStaff", "USR-03");
    await s.go("/staff/stock");
  });
  await s.caption(9, KASUN, "Stock: one warehouse, with an allocation for each channel", 700, "uc1-40");
  const nightRow = f().locator("tbody tr").filter({ hasText: "Ultra Care Pads Night" }).filter({ hasText: "Retail outlets" });
  await s.click(nightRow.locator("td").first(), 700);
  await s.scroll("top");
  await s.caption(9, KASUN, "Night pads for outlets: the new batch, and what is still set aside for the other orders", 2200, "uc1-41");
  await s.snap("stock", "Stock overview with the Night pads batches for retail outlets");
  await s.click(f().getByRole("link", { name: ids.fc002Batch, exact: true }).first(), 1300);
  await s.caption(9, KASUN, `Batch ${ids.fc002Batch}: when it was made, when it expires, where it is held`, 1300, "uc1-42");
  await s.reveal(f().getByText("Where this batch went"));
  await s.wait(400);
  await s.caption(9, KASUN, `It traces to Cool Planet's order ${ids.order}, ready for a recall list if ever needed`, 2200, "uc1-43");
  await s.snap("batch-trace", "Batch page: every delivery that took stock from this batch");

  await s.title(
    {
      eyebrow: "Use case 1 · Done",
      title: "Cool Planet's order is complete",
      sub: "Paper PO entered, Night pads received and served oldest first, picked by earliest expiry, packed by scan, invoiced, dispatched and confirmed from the signed note.",
    },
    undefined,
    4200,
    { line: "uc1-close" },
  );
  return { ids };
}

// ------------------------------------------------------------------
// Use case 2: a consultant order, through payment, to courier and delivery
// ------------------------------------------------------------------

export async function useCase2(s: Stage): Promise<RunInfo> {
  const ids: Record<string, string> = {};
  const f = () => s.f;
  const nimali = { name: "Nimali Perera", role: "Consultant FC00006, Maharagama" };

  await s.title(
    {
      eyebrow: "Use case 2 · Consultants",
      title: "A consultant order, from her phone to her door",
      sub: "Nimali orders at her consultant price, pays by card, Operations packs it and hands it to the courier, and she confirms it arrived.",
      foot: "Tuesday 2 March 2027, 09:00",
    },
    async () => {
      await s.show("phone", nimali);
      await s.load("phone", "/signin");
      await s.hook("phone", "setPresenterMode", true);
      await s.load("laptop", "/staff/login");
    },
    5200,
    { startRecording: true, line: "uc2-open" },
  );

  // 1. Nimali signs in
  await s.caption(1, NIMALI, "Signs in on her phone with her consultant number and password", 0, "uc2-01");
  await s.type(f().locator("#login"), "FC00006");
  await s.type(f().locator("#password"), "femmecare");
  await s.click(f().locator("form button[type=submit]"), 1400);
  await s.caption(1, NIMALI, "Her home page: her sales, her team's sales and her commission so far this month", 2000, "uc2-02");
  await s.snap("home", "Nimali's home page");
  await s.scroll(380);
  await s.caption(1, NIMALI, "Her monthly target: LKR 5,000 of team and own sales to earn 5%, already met", 1500, "uc2-03");
  await s.scroll("top");

  // 2. Nimali shops
  await s.click(f().getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Shop" }), 900);
  await s.caption(2, NIMALI, "Every pack shows the MRP, her price and her margin", 1600, "uc2-04");
  await s.snap("shop", "The shop: MRP, her price and her margin per pack");
  await s.caption(2, NIMALI, "Adds 10 Regular pads and 4 Night pads", 0, "uc2-05");
  for (const [name, qty] of [["Ultra Care Pads Regular", "10"], ["Ultra Care Pads Night", "4"]] as const) {
    const qtyBox = f().getByLabel(`Quantity of ${name}`);
    await s.type(qtyBox, qty, { after: 300 });
    const rowCard = f().locator("div.rounded-2xl").filter({ has: qtyBox });
    await s.click(rowCard.getByRole("button", { name: /^Add/ }), 700);
  }
  await s.click(f().getByRole("link", { name: /^Cart, / }).filter({ visible: true }).first(), 1000);
  await s.caption(2, NIMALI, "Cart: LKR 10,275 at her price, plus LKR 350 delivery. Delivery is free over LKR 15,000", 2000, "uc2-06");
  await s.snap("cart", "Cart with the delivery charge rule");
  await s.reveal(f().getByText("Total to pay"));
  await s.caption(2, NIMALI, "She pays by card. Her margin when she sells at MRP is shown too", 1400, "uc2-07");
  await s.snap("checkout", "Checkout summary: total to pay and her margin");
  await s.click(f().getByRole("button", { name: /^Place order/ }), 1400);
  ids.order = s.path().split("/")[3] ?? "";

  // 3. Nimali pays by card
  await s.caption(3, NIMALI, "A secure FemmeCare card page", 0, "uc2-08");
  await s.type(f().locator("#cc-num"), "4111111111111111", { delay: 45 });
  await s.type(f().locator("#cc-exp"), "0829");
  await s.type(f().locator("#cc-cvv"), "123");
  await s.snap("card-form", "The card payment form");
  await s.click(f().getByRole("button", { name: /^Pay LKR/ }), 300);
  await waitForText(f().getByText("Payment successful"), 15_000);
  await s.wait(300);
  await s.caption(3, NIMALI, "Paid. The order goes to the warehouse to be packed", 2000, "uc2-09");
  await s.snap("paid", "Payment successful");

  // 4 and 5. Malsha picks, packs and hands it to the courier
  await s.title({ eyebrow: "Use case 2 · Step 4", title: "Malsha, Operations", sub: "packs Nimali's order and hands it to the courier" }, async () => {
    await s.show("laptop");
    await s.hook("laptop", "signInStaff", "USR-05");
    await s.wait(600);
    if (s.path("laptop") !== "/staff") await s.go("/staff", "laptop");
  });
  await s.caption(4, MALSHA, "What's waiting: paid consultant orders to pick and pack", 1300, "uc2-10");
  await s.click(f().getByRole("link", { name: /Orders to pick and pack/ }), 1000);
  const card = f().locator("div.w-64").filter({ hasText: ids.order });
  await s.reveal(card);
  await s.point(card);
  await s.caption(4, MALSHA, `Nimali's paid order ${ids.order} is on the dispatch board`, 1000, "uc2-11");
  await s.click(card.getByRole("button", { name: "Create pick list" }), 1300);
  ids.dispatch = last(s.path());
  await s.point(f().locator("table tbody tr").first());
  await s.caption(4, MALSHA, "The pick list takes the batch that expires first", 1800, "uc2-12");
  await s.snap("pick-list", "Pick list for Nimali's order");
  await s.caption(5, MALSHA, "Packs by scan: an inner box of 10 Regular pads, then 4 Night pads", 0, "uc2-13");
  await s.select(f().locator("select").first(), "10");
  await s.click(f().locator("button").filter({ hasText: "FC001" }), 900);
  await s.select(f().locator("select").first(), "1");
  for (let i = 0; i < 4; i++) await s.click(f().locator("button").filter({ hasText: "FC002" }), 380);
  await s.wait(900);
  await s.caption(5, MALSHA, "Packed and checked. She hands it to the courier and enters the tracking number", 0, "uc2-14");
  await s.reveal(f().locator("#tracking"));
  await s.point(f().locator("select").first());
  await s.wait(500);
  ids.tracking = "DMX7043219554";
  await s.type(f().locator("#tracking"), ids.tracking, { delay: 45 });
  await s.snap("courier", "Courier handover: courier and tracking number");
  await s.click(f().getByRole("button", { name: "Hand to courier" }), 1300);
  await s.caption(5, MALSHA, "Handed to Domex. The system texts Nimali the courier and tracking number", 1900, "uc2-15");
  await s.snap("handed-over", "Dispatched with the courier");

  // 6 and 7. Nimali tracks it and confirms it arrived
  const st = await s.state();
  const me = st.consultants.find((c) => c.givenName === "Nimali" && c.surname === "Perera")!;
  const sms = st.outbox.find((m) => m.channel === "sms" && m.to === me.mobile && m.body.includes(ids.order) && /on its way/i.test(m.body));
  await s.title({ eyebrow: "Use case 2 · Step 6", title: "Nimali's phone", sub: "the parcel is on its way" }, async () => {
    await s.show("phone", nimali);
  }, 2000);
  await s.caption(6, NIMALI, "An SMS arrives with the courier and the tracking number", 200, "uc2-16");
  await s.sms(sms?.body ?? `FemmeCare: Your order ${ids.order} is on its way with Domex. Tracking number ${ids.tracking}.`);
  await s.wait(2600);
  await s.snap("sms", "The dispatch SMS on Nimali's phone", { keepSms: true });
  await s.hideSms();
  await s.click(act(s, "View order", true), 1100);
  await s.caption(6, NIMALI, "Her order: paid, and dispatched with Domex", 1800, "uc2-17");
  await s.snap("order-dispatched", "Nimali's order page: paid and dispatched, with the courier");
  await s.click(f().getByRole("button", { name: "Track parcel" }), 1000);
  await s.caption(6, NIMALI, "Track parcel shows the courier's updates", 1800, "uc2-18");
  await s.snap("track-parcel", "Track parcel");
  await s.click(f().getByRole("button", { name: "Close" }), 700);
  await s.caption(7, NIMALI, "When the parcel reaches her, she taps I received it", 0, "uc2-19");
  await s.click(f().getByRole("button", { name: "I received it" }), 1300);
  await s.scroll("top");
  await s.caption(7, NIMALI, "Delivered. Payment and delivery are both complete", 2000, "uc2-20");
  await s.snap("delivered", "The order delivered");
  await s.click(f().getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }), 1000);
  await s.caption(7, NIMALI, "Back on her home page, the order now counts in her own sales for March", 2000, "uc2-21");
  await s.snap("home-after", "Nimali's home page after the order: her own sales for March");

  await s.title(
    {
      eyebrow: "Use case 2 · Done",
      title: "Nimali's order is delivered",
      sub: "Ordered at her price on her phone, paid by card, packed by scan, handed to Domex with an SMS to her, and confirmed by Nimali in the app.",
    },
    async () => {
      await s.show("laptop");
    },
    4200,
    { line: "uc2-close" },
  );
  return { ids };
}
