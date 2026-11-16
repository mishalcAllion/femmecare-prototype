# FemmeCare Sales System: demo playbook

| | |
|---|---|
| For | Mishal (BA / PM, Allion), to show the prototype to Sachindra (retail outlet sales) and Dinusha (consultant channel) |
| Date | 12 Nov 2026 |
| Prototype | `femmecare\prototype`, running at http://localhost:5190. Online copy: https://mishalcallion.github.io/femmecare-prototype/ |
| Spec | Prototype PRD v0.3, `femmecare\prototype-prd.md` on the laptop (sections 5, 8, 10, 11 and 15) |
| Videos | [Both use cases, 5:40](video/femmecare-demo.mp4) · [Use case 1, 3:32](video/1-outlet-order-to-delivery.mp4) · [Use case 2, 2:02](video/2-consultant-order-to-delivery.mp4) |
| Voiceover | The videos are narrated by a British female voice (made on this laptop, no music). Silent copies, for presenting over them yourself: [both](video/femmecare-demo-silent.mp4) · [use case 1](video/1-outlet-order-to-delivery-silent.mp4) · [use case 2](video/2-consultant-order-to-delivery-silent.mp4). Script with timings: [narration.md](video/narration.md) |

Everything in the prototype is demo data. No email, SMS, payment or courier booking leaves the browser.

## 1. What the two use cases show

| | Use case 1: retail outlet order | Use case 2: consultant order |
|---|---|---|
| For | Sachindra and his outlet sales team | Dinusha and her operations team |
| Story | Cool Planet sends a paper PO for its Kandy showroom. Two products can go now; Night pads are out, so 60 packs wait in line. Stock arrives, the waiting outlets are served oldest first, and the whole order is picked, packed by scan, invoiced, dispatched and confirmed from the signed delivery note | Nimali, a consultant, orders on her phone at her consultant price and pays by card. Operations packs it by scan and hands it to Domex. Nimali gets an SMS, tracks the parcel and taps "I received it" |
| People | Ruwan (Outlet sales), Kasun (Stores) | Nimali (Consultant), Malsha (Operations) |
| Device | Laptop | Phone for Nimali, laptop for Malsha |
| Video (narrated) | [1-outlet-order-to-delivery.mp4](video/1-outlet-order-to-delivery.mp4), 3:32 ([silent copy](video/1-outlet-order-to-delivery-silent.mp4)) | [2-consultant-order-to-delivery.mp4](video/2-consultant-order-to-delivery.mp4), 2:02 ([silent copy](video/2-consultant-order-to-delivery-silent.mp4)) |

Each step below names the requirement it proves (IDs from proposal v0.7, as used in the PRD) and the open decisions it touches, so the client can answer them while looking at the screen.

## 2. How to run the demo

| What | How |
|---|---|
| Start the prototype | In `femmecare\prototype`, run `npm run dev`, then open http://localhost:5190 in Chrome or Edge |
| Staff sign-in | http://localhost:5190/staff/login: work email, then a 6-digit code "emailed" to them |
| Consultant sign-in | http://localhost:5190/signin: consultant number (FC00006) or email, and password `femmecare` |
| Demo panel | Press **Ctrl+Shift+D** (or the small round button in the bottom-right corner). Tabs: People, Scenario, Events, Snapshots, Outbox |
| Presenter mode | Switch at the bottom of the demo panel. It hides the corner button so a screen share shows only the system, and it fills in the staff sign-in code for you. Without it, the code is in the demo panel's Outbox. It also hides the decision tags (A1, B2...) and the notes about open decisions on Settings, Products and the dashboard. Turn it off when you want to point at a decision on screen |
| Reset to the start | Demo panel, Scenario tab, **Reset to the start of this scenario** (it asks first) |
| Demo date | Tuesday 2 March 2027, 09:00 (the "Month-end" scenario). The clock runs on in real time from there, so labels like "2 h ago" change a little between runs |
| Switch person | Demo panel, People tab. Or sign out and sign in again on the real screen |
| Two devices at once | Open the staff console in one window and the consultant app in a second window. Each window keeps its own sign-in and both show the same data. For a phone-sized view, press F12, then Ctrl+Shift+M, and pick a phone such as iPhone 12 Pro (390 x 844) |
| Safety net | Before the session: reset, turn on presenter mode, then Snapshots tab, save "Before the walkthrough". If a step goes wrong, restore it |
| Messages sent | Every email and SMS the system would send is in the demo panel's Outbox (for example the invoice email to Cool Planet and the dispatch SMS to Nimali) |

The data is kept in the browser, so a refresh keeps your progress. A private window starts clean.

## 3. People in the demo

| Person | Role | Signs in with | In |
|---|---|---|---|
| Ruwan Jayawardena | Outlet sales executive (Sachindra's team) | ruwan.j@femmecare.lk, one-time code | Use case 1 |
| Kasun Bandara | Stores keeper | kasun.bandara@femmecare.lk, one-time code | Use case 1 |
| Malsha Gunasekara | Operations executive (Dinusha's team) | malsha.g@femmecare.lk, one-time code | Use case 2 |
| Nimali Perera | Consultant FC00006, Maharagama. A top sponsor: 16 people in her direct team. Her sponsor is Thilini Fernando | FC00006, password `femmecare` | Use case 2 |
| Cool Planet | Retail outlet (no login). Contact Shehan Wijeratne; 45-day terms; showrooms in Colombo, Kandy and Galle | n/a | Use case 1 |

Other people in the demo panel, if the client asks: Ayesha Rodrigo (Administrator), Nuwan Perera (Stores, supervisor), Tharaka Wijesinghe (Finance), Sanjeewa Fernando (Management, read-only).

## 4. Use case 1: a retail outlet order, through stock, to dispatch and delivery

### Who's involved

- **Ruwan** (Outlet sales): enters the PO, serves the waiting outlets, issues the invoice and delivery note, confirms the signed note.
- **Kasun** (Stores): receives the stock, picks and packs by scan, dispatches the van, checks stock and the batch.
- **Cool Planet** (no login): sends the paper PO, signs the delivery note.

### Before you start

- Reset to the start, presenter mode on, one laptop window at http://localhost:5190/staff/login (1366 px wide or more).
- What you should find: **Back-orders** shows 5 orders (580 Night pads) waiting for FC002, from 3 outlets (Fashion Park, Cool Planet, House of Fashion). **Goods received** has GRN-27-0015 (2,400 Night pads) waiting to be recorded.
- The IDs below (SO-27-00047, DSP-27-00302, INV-27-00043) are what you get from a fresh reset. They move on by one if you enter anything else first.
- Dates show day first everywhere (02/03/2027 is 2 March), whatever the laptop's region setting.

### Steps

| # | Who | Where | What to do | What you'll see | Proves |
|---|---|---|---|---|---|
| 1 | Ruwan | Staff sign-in, `/staff/login`, then What's waiting, `/staff` | Type `ruwan.j@femmecare.lk`, **Send code**, then **Sign in** (the code fills itself in presenter mode) | "Good morning, Ruwan": 10 orders to pick and pack, 2 deliveries waiting for the signed note, 5 outlet orders with back-orders. "Packed, waiting for the invoice and delivery note" is under Up to date | ADM-02 |
| 2 | Ruwan | Outlet orders, **New order**, `/staff/outlet-orders/new` | Outlet **Cool Planet**, PO number **CP-5001**, delivery address **Kandy**. Lines: **FC001 × 120**, Add product, **FC003 × 80**, Add product, **FC002 × 60**. Then **Save and confirm** | Stock check per line: FC001 "All 120 now", FC003 "All 80 now", FC002 "None now, 60 back-ordered", "6th in line for FC002, 5 orders ahead". Summary: 260 ordered, 200 allocated now, 60 back-ordered, LKR 160,300.00. After saving: order **SO-27-00047**, status **Confirmed**, Night pads "6th in line", expected 16 Mar 2027 | B2C-02, B2C-03, B2C-04 |
| 3 | Kasun | What's waiting, then Goods received, `/staff/grn`, then **GRN-27-0015** | Check the quantity (2,400), dates and production ref (PRD-1122). Split: **1,440 Retail outlets, 960 Consultants** (already filled in). **Record and put into stock** | Batch number **B2702-06** given by the system. Side panel lists the 6 waiting orders, oldest first. After saving: "Stock recorded in batch B2702-06" and "3 outlets are waiting for Ultra Care Pads Night. Outlet sales staff have been alerted" | INV-04, B2C-08 |
| 4 | Ruwan | Back-orders, `/staff/backorders?product=FC002` | Click **Allocate** on the top row, six times (the list moves up after each one) | 1,440 available for outlets. In line: 1st Fashion Park FP-4584 (70), 2nd Cool Planet CP-4589 (150), 3rd House of Fashion HOF-4594 (120), 4th Fashion Park FP-4599 (80), 5th Cool Planet CP-4608 (160), 6th Cool Planet **CP-5001 (60)**. Each click shows a message such as "60 × FC002 allocated to Cool Planet. Stores can pick it now". At the end: "Nothing is waiting for Ultra Care Pads Night" | B2C-08 |
| 5 | Kasun | Dispatch, filter **Retail outlets**, `/staff/dispatch?channel=outlet` | Scroll the waiting strip to the right to the SO-27-00047 card (the newest is last), **Create pick list**. On **DSP-27-00302**: type FC001's barcode (4791001000019) and press Enter. Set **Units per scan** to **50 (carton)**. Click **FC004** (wrong item). Then click FC001, FC003 and FC002 until each line is full | Pick list: one batch per line, each marked "Earliest expiry" (FC001 B2701-01, FC003 B2612-08, FC002 B2702-06). Wrong item: red "Wrong item: Feminine Wipes is not on this order". At 260 of 260: "Every item is packed and checked", status **Ready** | INV-06, INV-09 |
| 6 | Ruwan | Same dispatch page, `/staff/dispatch/DSP-27-00302` (his What's waiting now shows 1 under "Packed, waiting for the invoice and delivery note", which opens the Ready column) | **Issue invoice and delivery note**. Open **Invoice INV-27-00043**, then **Delivery note** | Invoice: PO CP-5001, trade prices, total LKR 160,300.00, due 16 Apr 2027 (45 days), emailed to purchasing@coolplanet.example as PDF. Delivery note DN-27-00043: quantities, batch numbers and expiry, no prices, a "Received by" signature line | B2C-05, B2C-11 |
| 7 | Kasun | Dispatch page, **Delivery** panel | Vehicle and driver are offered from earlier trips (LI-0932, Ajith Perera); change them if needed. **Dispatch** | "Out for delivery with Ajith Perera", status **Dispatched**, "Waiting for signed note". Stock leaves the warehouse | B2C-05, INV-06 |
| 8 | Ruwan | Signed delivery notes, `/staff/pod`, then **Upload the note** on Cool Planet DN-27-00043 | **Upload a photo** (any image; or **Use the photo from the driver**). Check the figures. Received by: **Chathura Bandara**. **Confirm delivery**. Then **Open the order** | "Reading the delivery note", then 120, 80 and 60 highlighted for checking. After confirming: "260 of 260 units received. Order SO-27-00047 is now **Completed**". On the order: every line delivered, nothing outstanding | B2C-06, B2C-07 |
| 9 | Kasun | Stock, `/staff/stock`, then batch **B2702-06**, `/staff/batches/B2702-06` | Click the **Ultra Care Pads Night, Retail outlets** row to open its batches. Click **B2702-06** | Night pads for outlets: on hand 1,380, reserved 580 (the five older orders, not yet picked), available 800. Batch page: made 22 Feb 2027, expires 22 Feb 2029; "Where this batch went": Cool Planet, SO-27-00047, 60, Delivered; **Recall list** button | INV-03, INV-06, INV-07, INV-08 |

### Screens

**Step 1. What's waiting for Ruwan**
![Ruwan's What's waiting page](img/uc1-01-whats-waiting.png)

**Step 2. The paper PO with the stock check per line**
![New outlet order with the stock check](img/uc1-02-po-stock-check.png)

**Step 2. The confirmed order: 200 allocated, 60 back-ordered, 6th in line**
![The confirmed order's lines, with the Night pads' place in line](img/uc1-03-order-confirmed.png)

**Step 3. Recording the goods received: batch, dates and the split**
![Goods received form](img/uc1-04-grn-form.png)

**Step 3. Recorded, with the alert that outlets are waiting**
![GRN recorded](img/uc1-05-grn-recorded.png)

**Step 4. Back-orders for Night pads, oldest first**
![Back-orders queue](img/uc1-06-backorders.png)

**Step 5. Pick list with the earliest-expiry batch per line**
![Pick list](img/uc1-07-pick-list.png)

**Step 5. A wrong item is refused**
![Wrong item refused](img/uc1-08-wrong-item.png)

**Step 5. Packed and checked by scan**
![Packed](img/uc1-09-packed.png)

**Step 6. The invoice**
![Invoice](img/uc1-10-invoice.png)

**Step 6. The delivery note**
![Delivery note](img/uc1-11-delivery-note.png)

**Step 7. Dispatched with the vehicle and driver**
![Dispatched](img/uc1-12-dispatched.png)

**Step 8. The signed note, read and highlighted for checking**
![Signed note read](img/uc1-13-signed-note-read.png)

**Step 8. Delivery confirmed, order Completed**
![Delivery confirmed](img/uc1-14-delivery-confirmed.png)

**Step 8. The completed order**
![Completed order](img/uc1-15-order-completed.png)

**Step 9. Stock, with the Night pads batches for outlets**
![Stock overview](img/uc1-16-stock.png)

**Step 9. The batch traced to Cool Planet's order**
![Batch trace](img/uc1-17-batch-trace.png)

### Also show

| Variation | When | How | What you'll see |
|---|---|---|---|
| Wrong barcode refused | Step 5 | Click any product that is not on the order (FC004), or type a barcode that isn't FemmeCare's, e.g. `123456` | "Wrong item: Feminine Wipes is not on this order", or "Barcode 123456 is not a FemmeCare product". Nothing is counted |
| First in, first out when stock is short | Step 3, then 4 | At the GRN, type **400** for Retail outlets and **2000** for Consultants. Then on Back-orders try **Allocate** on Cool Planet's CP-5001 (6th) first | Only 400 available. The rows show "Can take 70 now", "150", "120", "Can take 60 now" (of 80), then "Older orders come first". Allocating CP-5001 is refused: "Older orders are ahead in line for this stock". CP-5001 keeps waiting |
| Outlet declines the balance (lost sale) | Step 4 | **Outlet declined** on a row, give a reason, e.g. "bought from another supplier while waiting" | The balance leaves the waiting list and shows on **Lost sales** with outlet, product, value and reason |
| Revise the expected date | Step 2 or 4 | **Revise** next to the expected date, pick a new date, keep "Email the outlet" ticked | New date on the order and the back-order list; the email to Cool Planet is in the Outbox |
| Partial delivery first | After step 2 | Before the GRN, Kasun creates the pick list straight away | Only 200 packs (FC001, FC003) go. Invoice for LKR 116,200.00. After the signed note the order is **Partially Dispatched** with 60 Night pads outstanding. Steps 3 to 8 then send the 60 with a second invoice (LKR 44,100.00) |
| A difference on the signed note | Step 8 | Either type **118** for Regular pads on the review screen and add the note "2 packs damaged in transit", or use demo panel, Events, **Outlet returns a signed note with a difference** (after step 7) | With the demo event, the photo shows the outlet's handwritten "2 packs damaged", and 118 and the note are read and highlighted. Typing 118 by hand ends the same way. After confirming: Delivered 118, Difference 2, and the difference shows on the dispatch register and the signed-notes list |
| Outlet on hold | Step 2 | Choose **Nelum Pharmacy** as the outlet | Warning that the outlet is on hold (two invoices over 30 days overdue). The order is saved **On Hold** and nothing is allocated until the hold is released |

### What to ask Sachindra here

| At step | Decision | Ask | Worked example |
|---|---|---|---|
| 1 | Q6 What's waiting as the staff home page | Is a "What's waiting" page the right first screen for each team? | Ruwan signs in at 9.00 and sees 10 orders to pick and pack, 2 deliveries waiting for the signed note and 5 outlet orders with back-orders on one page. Without it, he opens three menus to find the same work |
| 2 | Q10 Order status words | Which words should staff see on outlet orders? | (a) Your workbook's: CP-5001 went Confirmed, Picking, Dispatched, Completed (New if it is saved unconfirmed; Partially Dispatched if only part goes). The prototype shows these. (b) The proposal's: Open, Partly delivered, Delivered, Closed |
| 2 | Q1 Trade price | One trade price per product, or one per outlet? | (a) Everyone pays LKR 665 for FC001, so CP-5001's 120 packs are LKR 79,800. (b) Cool Planet has its own price of LKR 640: the same line is LKR 76,800, and every outlet needs a price list |
| 2 | Credit-limit warning (proposed, not in the workbook) | Should an order that takes an outlet over its credit limit be warned, blocked, or neither? | Cool Planet owes LKR 2,721,320 against a LKR 3,000,000 limit, so this LKR 160,300 order (new balance LKR 2,881,620) shows no warning. To show the warning, start an order for Nelum Pharmacy, which already owes 162% of its LKR 250,000 limit: the form warns and still lets Ruwan save |
| 3 | B5 Splitting new stock | Who decides how a new batch is split between outlets and consultants? | 2,400 Night pads arrive; 640 are owed to waiting outlets. (a) Stores splits at the GRN, as shown (1,440 outlets, 960 consultants). (b) A fixed rule, e.g. waiting back-orders first, then 60/40: 640 + 1,056 = 1,696 for outlets, 704 for consultants. Either way, moving stock later needs Admin approval |
| 4 | B3 Back-order balance | When part of a PO can't be supplied, does the balance stay open, or does the order close? | Cool Planet's 60 Night pads. (a) Stays open (shown): it waits 6th in line and is allocated when stock comes. (b) Closes at partial delivery: the order completes at 200 packs, and when stock arrives Ruwan asks Cool Planet to reconfirm before the 60 are allocated |
| 3 and 4 | B4 Telling waiting outlets | When stock arrives, who tells the waiting outlets? | 3 outlets wait for 640 Night pads. (a) Staff are alerted and call each outlet (shown). (b) The system also emails each outlet: "Night pads are back in stock. We will contact you to confirm the 60 packs still due on PO CP-5001" |
| 6 | B1 and Q8 Invoice contents and VAT | Can we have a sample of your current invoice? Is VAT charged on outlet invoices? | This invoice: 120 × 665 + 80 × 455 + 60 × 735 = LKR 160,300.00 without VAT. With VAT at 18%: LKR 189,154.00 |
| 6 | B2 Track outlet payments | Do you want payments against invoices recorded here, or kept elsewhere? | INV-27-00043 is due 16 Apr 2027. If Cool Planet pays LKR 100,000 on 20 Mar, Finance records it and the invoice shows Part Paid, balance LKR 60,300.00. If not, invoices only show Issued |
| 8 | Damaged packs on the signed note (new, not in the PRD yet) | When the outlet writes a shortage or damage on the note, what happens to the invoice? | The note says 2 Regular pads damaged. (a) The invoice stays at LKR 160,300.00 and the difference is only recorded (shown). (b) A credit note of 2 × 665 = LKR 1,330.00, so Cool Planet owes LKR 158,970.00. (c) The 2 packs are replaced on the next delivery |

## 5. Use case 2: a consultant order, through payment, to courier dispatch and delivery

### Who's involved

- **Nimali** (Consultant FC00006, on her phone): orders, pays by card, tracks the parcel, confirms she received it.
- **Malsha** (Operations, on a laptop): picks and packs by scan, hands the parcel to the courier.
- **Domex** (courier, no login): carries the parcel.

### Before you start

- Reset to the start, presenter mode on.
- Window 1, phone size: http://localhost:5190/signin. Window 2, laptop: http://localhost:5190/staff/login (sign Malsha in when you reach step 4).
- The IDs below (order CO-27-00273, pick list DSP-27-00302) are what you get from a fresh reset. They differ if you ran use case 1 first without resetting.

### Steps

| # | Who | Where | What to do | What you'll see | Proves |
|---|---|---|---|---|---|
| 1 | Nimali | Consultant sign-in, `/signin`, then Home, `/app` | Consultant number **FC00006**, password **femmecare**, **Sign in** | Home for March 2027: My sales LKR 0.00, Team sales LKR 34,790.00, Commission so far LKR 1,739.50 (Provisional), Team who ordered 4 of 16. Monthly target "Team and own sales of LKR 5,000 to earn 5%": Achieved | ADM-02, REP-01, ORD-10 |
| 2 | Nimali | Shop, `/app/shop`, then Cart, `/app/cart` | Type **10** in Ultra Care Pads Regular's quantity, **Add**. Type **4** for Ultra Care Pads Night, **Add**. Tap the cart button. Keep **Card**. **Place order and pay LKR 10,625.00** | Every pack: In stock, MRP, her price, "You earn ... a pack" (FC001: MRP 950, her price 712.50, margin 237.50). Cart: subtotal LKR 10,275.00, delivery LKR 350.00 ("Add LKR 4,725.00 more for free delivery"), total LKR 10,625.00, her margin at MRP LKR 3,425.00 | ORD-02, ORD-03 |
| 3 | Nimali | Pay by card, `/app/orders/CO-27-00273/pay` | Card number **4111 1111 1111 1111**, expiry **08/29**, security code **123** (name is filled in). **Pay LKR 10,625.00** | A FemmeCare card page with a live card preview. "Contacting your bank", then **Payment successful**: card ending 1111, a reference and the time. An SMS "Payment of LKR 10,625.00 received" is in the Outbox | ORD-04, ORD-05 |
| 4 | Malsha | What's waiting, then Dispatch, `/staff/dispatch` (Consultants is the default for Operations) | Sign in as Malsha. **Orders to pick and pack**. Scroll the waiting strip to the right to Nimali's CO-27-00273 card (the newest is last), **Create pick list** | 10 paid consultant orders waiting, oldest first (What's waiting shows 11, because it also counts 1 outlet order); Nimali's is the newest ("just now", 14 units, LKR 10,625.00). Pick list **DSP-27-00302**: FC001 from batch B2612-01, FC002 from B2612-02, both marked "Earliest expiry" | ORD-06, ORD-07, INV-06 |
| 5 | Malsha | Same page | **Units per scan: 10 (inner box)**, click **FC001**. Back to **1 pack**, click **FC002** four times. Courier **Domex** (first in the list), tracking number **DMX7043219554**, **Hand to courier** | "Every item is packed and checked". Then "Handed to Domex. The consultant has been sent the tracking number." Status **Dispatched** | INV-09, ORD-07, ORD-09 |
| 6 | Nimali | Her phone: SMS, then **View order**, `/app/orders/CO-27-00273`, then **Track parcel** | Read the SMS. Open the order. **Track parcel** | SMS: "FemmeCare: Your order CO-27-00273 is on its way with Domex. Tracking number DMX7043219554." Order: Payment **Paid**, Delivery **Dispatched**, courier Domex and the tracking number. Track parcel: the courier's updates, starting "Picked up from FemmeCare warehouse, Kurunegala" | ORD-07, ORD-09 |
| 7 | Nimali | Same order page, then Home | **I received it**. Then the **Home** tab | "Thanks. Order marked as received". Delivery **Delivered**; both tracks complete. On Home, My sales for March is now LKR 13,700.00 (1 paid order, at MRP value). Commission so far is unchanged, because her own sales do not earn the 5% | ORD-07, REP-01 |

In the demo the SMS is shown on Nimali's phone. In the prototype itself, open the demo panel's **Outbox** to show it (filter **SMS**).

### Screens

**Step 1. Nimali's home page**
![Home](img/uc2-01-home.png)

**Step 2. The shop: MRP, her price and her margin**
![Shop](img/uc2-02-shop.png)

**Step 2. Cart with the delivery charge**
![Cart](img/uc2-03-cart.png)

**Step 2. Checkout summary**
![Checkout](img/uc2-04-checkout.png)

**Step 3. Card payment**
![Card form](img/uc2-05-card-form.png)

**Step 3. Payment successful**
![Paid](img/uc2-06-paid.png)

**Step 4. Malsha's pick list for Nimali's order**
![Pick list](img/uc2-07-pick-list.png)

**Step 5. Courier handover**
![Courier handover](img/uc2-08-courier.png)

**Step 5. Handed to the courier**
![Dispatched](img/uc2-09-handed-over.png)

**Step 6. The dispatch SMS**
![SMS](img/uc2-10-sms.png)

**Step 6. Paid and dispatched, with the courier**
![Order dispatched](img/uc2-11-order-dispatched.png)

**Step 6. Track parcel**
![Track parcel](img/uc2-12-track-parcel.png)

**Step 7. Delivered**
![Delivered](img/uc2-13-delivered.png)

**Step 7. Her home page after the order**
![Home after the order](img/uc2-14-home-after.png)

### Also show

**Paying by bank transfer, and a slip that is LKR 500 short**

| # | Who | Where | What to do | What you'll see | Proves |
|---|---|---|---|---|---|
| B1 | Nimali | Cart | Choose **Bank transfer**, **Place order and pay** | FemmeCare's bank details (Commercial Bank, Kurunegala, account 1000 4527 8812) with copy buttons, and the order number as the reference | ORD-04 |
| B2 | Nimali | Pay by bank transfer | Tap one of the three receipts under "Or use a recent receipt from your banking app" (or take a photo). Amount and reference are filled in from the order. **Send slip for verification** | "Waiting for verification". If she types a lower amount, e.g. 10,125.00, the page warns "This is LKR 500.00 less than the order total" | ORD-04 |
| B3 | Malsha | Payments to verify, `/staff/payments` | Find Nimali's slip. **Verify payment** | The slip beside the order: amount and reference both match (green). After verifying: "The order is ready to pack", and Nimali gets an SMS | ORD-04, ORD-06 |
| B4 | Malsha | Payments to verify | Find order **CO-27-00253** (already in the demo data): slip LKR 4,575.00 for an order of LKR 5,075.00. **Reject**, reason "The slip shows LKR 4,575.00, LKR 500.00 less than the order total" | Shown in red: "LKR 500.00 short". After rejecting, the consultant gets the reason by SMS and in the app, sees "Your last slip was not accepted", and can upload it again | ORD-04, ORD-05 |
| B5 | Malsha | Payments to verify | Look at **CO-27-00269** | "Reference already used on order CO-27-00261": the same slip sent twice is caught | ORD-05 |

**A declined card, then a retry**

| # | Who | What to do | What you'll see |
|---|---|---|---|
| C1 | Presenter | Before Nimali taps Pay: demo panel, Events, **Next card payment fails** | "The next card payment will be declined" |
| C2 | Nimali | **Pay LKR 10,625.00** | "Payment declined. Your bank declined the payment. No money was taken." The order shows the payment as Declined; Operations sees it under failed payments |
| C3 | Nimali | **Try again**, re-enter the security code, **Pay** | Payment successful. Opening the payment page again shows "This order is already paid. No second payment was taken." |

**Other variations**

| Variation | How | What you'll see |
|---|---|---|
| Cancel before dispatch | On Nimali's order before step 5: **Cancel order**, give a reason | Paid orders become a refund request for Finance; after dispatch the button is gone |
| Operations marks it delivered | Step 7 on Malsha's dispatch page: **Mark delivered**. Or demo panel, Events, **Courier delivers an order** | The order becomes Delivered without Nimali tapping anything |
| Out of stock | Shop | When a product runs out in the consultant allocation, it shows "Out of stock" with no Add button, so it can't go in the cart |

### What to ask Dinusha here

| At step | Decision | Ask | Worked example |
|---|---|---|---|
| 1 | Q2 Consultant numbers | FC00006, or a plain number? | (a) FC00006, as on deck slide 23. A stores clerk searching "FC00" gets consultants FC00001 to FC00099 mixed in with products FC001 to FC006. (b) "No. 6", as on slides 5 and 7 and the call |
| 1 | A12 Name | "Consultant" or "Agent" on screen? | The proposal says agent, the deck says consultant. The prototype holds it in one setting: "Consultant FC00006" becomes "Agent FC00006" everywhere |
| 2 | A1 Consultant price | Is the consultant price MRP less 25% for every product? | FC001: 950 × 0.75 = 712.50, margin 237.50. Nimali's order: MRP value 13,700, she pays 10,275, her margin 3,425 |
| 2 | Delivery charge rule (set in Settings, no decision number yet) | What does a consultant pay for delivery? | Shown: LKR 350 per order, free on orders of LKR 15,000 or more. Nimali's 10,275 order pays 350. Adding 7 more Regular pads (4,987.50) takes it to 15,262.50 and delivery is free |
| 3 | A6 Payment methods | Card and bank transfer at launch? Cash on delivery? Which card service does Selyn already use? | Shown: card and bank transfer on, cash on delivery off. With cash on delivery, Nimali pays LKR 10,625 to the Domex rider and the order counts as paid only when delivered. A gateway fee of 3% (illustrative) would cost LKR 318.75 on this order |
| 4 | When stock is set aside (proposal ORD-06) | Is stock reserved when the order is paid, or when it is placed? | Shown: when paid. If Nimali places her order at 09:10 but pays by bank transfer at 15:00, a consultant who pays at 11:00 can take the last Night pads first |
| 5 | A10 Couriers | Which couriers, and what do their tracking numbers and links look like? | Shown: Domex, Pronto Lanka, Koombiyo as a sample list. Malsha types DMX7043219554 by hand; automatic courier updates are later |
| 7 | Who confirms delivery | Should the consultant confirm receipt, Operations, or both? | Shown: both. If Nimali never taps "I received it", Malsha marks it delivered when Domex confirms. Should it also close by itself after, say, 7 days? |
| 7 | A9 Consultant returns | Can a consultant return goods after delivery? | Shown: no returns, cancel before dispatch only. If 1 Night pad pack arrives damaged, today Nimali must call. With returns, she would get LKR 787.50 back, and her sponsor Thilini's commission would drop by 5% of 1,050 = LKR 52.50 |
| 7 | A3 and A4 Commission on her own order | Do a sponsor's own orders count toward the threshold, and do they earn the 5%? | Nimali's order is worth LKR 13,700 at MRP. Shown: it counts toward her LKR 5,000 threshold (team plus own), but earns her nothing. If own sales earned 5%, she would get LKR 685 on it. It also counts as team sales for her sponsor Thilini, who earns 5% of it (LKR 685) if she meets her own threshold |

## 6. Re-recording the videos

From `femmecare\prototype`, with the dev server running:

| Command | Does |
|---|---|
| `npx tsx scripts/demo/record.ts` | Makes any missing voice clips, records both use cases with the voiceover, joins them, saves the screenshots and `video/narration.md`, then checks each video (streams, lengths, that no line overlaps the next) and pulls 8 frames from each |
| `npx tsx scripts/demo/record.ts uc1` (or `uc2`) | Records one use case only |
| `npx tsx scripts/demo/record.ts join` | Rebuilds `femmecare-demo.mp4` from the two videos |
| `npx tsx scripts/demo/record.ts voice` | Only makes the voice clips for new or changed lines |
| `npx tsx scripts/demo/record.ts check` | Only the checks |

It uses Google Chrome on this laptop and a fresh browser each time, so every recording starts from the default scenario. The steps and captions are in `scripts/demo/scenes.ts`. The recorder switches people through a small hook in the prototype (`src/demo/automation.ts`); the demo panel is never shown.

**The voiceover.** The lines are in `scripts/demo/narration.ts`, one per caption plus an opening and a closing line. The voice is Kokoro `bf_emma` (British female, Apache-2.0 licence), made on this laptop by `scripts/demo/tts.mjs` inside Chrome; the clips are kept in `scripts/demo/voice/` and only a changed line is made again. The first run downloads the kokoro-js script from jsdelivr and the voice model (about 90 MB) from Hugging Face; nothing else goes online, and the text never leaves the laptop. While recording, each line starts as its caption appears and the next step waits until it has finished, plus 0.4 s, so lines never overlap or get cut off. The clips are then laid on one track at those times, set to about -16 LUFS and added to the video. A longer line makes the video longer, so trim words rather than slow the steps. `NO_VOICE=1` records without a voice (silent copies only).

## 7. If something goes wrong

| Problem | Fix |
|---|---|
| A step's IDs don't match this playbook | Something was entered before the walkthrough. Reset, or restore your snapshot |
| No sign-in code appears | Presenter mode is off. Open the demo panel's Outbox and read the newest email, or turn presenter mode on |
| A consultant window shows the staff console (or the other way round) | Each window keeps its own sign-in. Sign in again in that window, or use the demo panel's People tab |
| The corner button shows on a screen share | Turn presenter mode on |
