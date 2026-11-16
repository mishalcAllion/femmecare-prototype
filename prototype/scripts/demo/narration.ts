// The voiceover for the walkthrough videos: one line per caption, plus an opening
// and a closing line for each video. The ids match the captions in scenes.ts.
//
// `text` is the line as written (it goes into narration.md). `say`, when present, is
// what the voice is given instead: the same line respelled so a name comes out
// right. Write for speech: words not codes ("rupees" not "LKR", "Night pads" not
// "FC002"), round long amounts, keep sentences short.
//
// The recorder holds each step until its line has finished, so a longer line makes
// the video longer. Most steps last 2 to 5 seconds, which is room for about 6 to 14
// words. After changing a line, record again; only changed lines are re-made.

export interface Line {
  id: string;
  text: string;
  say?: string;
}

/** Kokoro voice (British English, female) and speaking speed. */
export const VOICE = "bf_emma";
export const SPEED = 1;

export const LINES: Line[] = [
  // the joined video's opening card
  { id: "all-open", text: "Two FemmeCare orders, start to finish. First a retail outlet, then a consultant." },

  // ---------- Use case 1: a retail outlet order ----------
  { id: "uc1-open", text: "Cool Planet orders for its Kandy showroom, but one product is out of stock." },
  // 1. Ruwan signs in
  { id: "uc1-01", text: "Ruwan, in outlet sales, signs in with his work email." },
  { id: "uc1-02", text: "A one-time code, so no shared passwords." },
  { id: "uc1-03", text: "Today's work, all on one page." },
  // 2. The paper PO
  { id: "uc1-04", text: "Cool Planet's paper PO goes in as a new order, delivered to their Kandy showroom." },
  { id: "uc1-05", text: "He keys in the three products from the PO. The system checks the stock on every line as he goes, so he knows what can go today before he saves." },
  { id: "uc1-06", text: "Night pads are out, so those sixty packs join the queue, sixth in line." },
  { id: "uc1-07", text: "Two hundred packs are set aside, just for them." },
  // 3. Kasun receives the stock
  { id: "uc1-08", text: "Kasun, in Stores, has new stock to receive." },
  { id: "uc1-09", text: "The Night pads the outlets are waiting for." },
  { id: "uc1-10", text: "He checks it against the delivery docket." },
  { id: "uc1-11", text: "Then splits it between channels." },
  { id: "uc1-12", text: "He can see who has waited longest, so they're served first." },
  { id: "uc1-13", text: "Outlet sales are told at once." },
  // 4. Ruwan serves the back-orders
  { id: "uc1-14", text: "Back to Ruwan. Six orders are waiting." },
  { id: "uc1-15", text: "Oldest order first." },
  { id: "uc1-16", text: "He checks each outlet still wants them, and every click sets the packs aside." },
  { id: "uc1-17", text: "Cool Planet's comes last." },
  { id: "uc1-18", text: "Every order is covered." },
  // 5. Kasun picks and packs
  { id: "uc1-19", text: "Now Kasun picks the order." },
  { id: "uc1-20", text: "He makes the pick list for Cool Planet's order." },
  { id: "uc1-21", text: "Each line takes the batch that expires soonest." },
  { id: "uc1-22", text: "Every pack is scanned as it goes in the box." },
  { id: "uc1-23", text: "Fifty per carton." },
  { id: "uc1-24", text: "The wrong product is stopped before it leaves." },
  { id: "uc1-25", text: "He scans the rest. Each line counts up as he goes, until every pack on the order is in the box." },
  { id: "uc1-26", text: "All packed and checked." },
  // 6. Ruwan issues the invoice and delivery note
  { id: "uc1-27", text: "Ruwan issues the invoice and the delivery note in one go." },
  { id: "uc1-28", text: "Cool Planet gets them by email, and the driver gets prints." },
  { id: "uc1-29", text: "The invoice quotes their own PO number, so their accounts team can match it. It's due in forty five days." },
  { id: "uc1-30", text: "The delivery note shows no prices, just the goods and a place to sign." },
  // 7. Kasun dispatches
  { id: "uc1-31", text: "Kasun records the van and the driver, and the order goes out for delivery." },
  { id: "uc1-32", text: "Now it waits for a signature." },
  // 8. Ruwan confirms the delivery
  { id: "uc1-33", text: "The driver brings the signed note back." },
  { id: "uc1-34", text: "Just a photo." },
  { id: "uc1-35", text: "The system reads it." },
  { id: "uc1-36", text: "Every figure is highlighted, so he can check it at a glance." },
  { id: "uc1-37", text: "He adds who signed, and confirms." },
  { id: "uc1-38", text: "Every pack is accounted for, and the order is complete." },
  { id: "uc1-39", text: "Nothing is left to deliver." },
  // 9. Kasun checks the stock and the batch
  { id: "uc1-40", text: "Finally, Kasun checks the stock in the warehouse." },
  { id: "uc1-41", text: "The new Night pads batch, and what's still promised to other outlets." },
  { id: "uc1-42", text: "Each batch has its own page." },
  { id: "uc1-43", text: "Showing where every pack went, ready for a recall." },
  { id: "uc1-close", text: "From paper PO to signed note, with every pack traced." },

  // ---------- Use case 2: a consultant order ----------
  { id: "uc2-open", text: "Nimali Perera, a consultant, orders on her phone and pays by card.", say: "Nimali Perayra, a consultant, orders on her phone and pays by card." },
  // 1. Nimali signs in
  { id: "uc2-01", text: "Nimali signs in on her phone with her consultant number and password." },
  { id: "uc2-02", text: "Her home page shows how she and her team are doing this month." },
  { id: "uc2-03", text: "She's already met her target, so her team's sales earn her five percent." },
  // 2. Nimali shops
  { id: "uc2-04", text: "Each pack shows what she makes." },
  { id: "uc2-05", text: "She picks what her customers want: ten Regular pads and four Night pads." },
  { id: "uc2-06", text: "Just over ten thousand rupees, plus delivery." },
  { id: "uc2-07", text: "She'll pay by card, and sees her margin first." },
  // 3. Nimali pays by card
  { id: "uc2-08", text: "She enters her card on a secure FemmeCare payment page, just as she would in any online shop." },
  { id: "uc2-09", text: "Paid, and straight to the warehouse." },
  // 4 and 5. Malsha packs and hands it to the courier
  { id: "uc2-10", text: "In Operations, Malsha Gunasekara has paid orders to pack.", say: "In Operations, Malsha Goonasaykara has paid orders to pack." },
  { id: "uc2-11", text: "Nimali's order is the newest on the board." },
  { id: "uc2-12", text: "The earliest expiry goes first." },
  { id: "uc2-13", text: "She scans an inner box of ten, then the four Night pads, one by one. The system counts every pack." },
  { id: "uc2-14", text: "With everything checked, she hands it to the courier and adds the tracking number." },
  { id: "uc2-15", text: "Nimali gets a text straight away." },
  // 6 and 7. Nimali tracks it and confirms it arrived
  { id: "uc2-16", text: "Back on Nimali's phone, the text tells her who's bringing it, and how to track it." },
  { id: "uc2-17", text: "Her order shows it's paid and on its way." },
  { id: "uc2-18", text: "She can follow the parcel without calling anyone." },
  { id: "uc2-19", text: "When it arrives, she confirms with one tap." },
  { id: "uc2-20", text: "Paid and delivered, and nothing is left open to chase." },
  { id: "uc2-21", text: "It now counts towards her own sales." },
  { id: "uc2-close", text: "From her phone to her door, with every step on record." },
];
