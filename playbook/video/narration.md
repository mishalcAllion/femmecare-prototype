# FemmeCare walkthrough videos: narration script

Voice: Kokoro `bf_emma` (British female, Apache-2.0), speed 1, made on this laptop by `scripts/demo/tts.mjs`. Loudness about -16 LUFS, no music.

Times are when each line starts in the video. Every line ends before the next one starts (at least 0.4 s of silence between them): the recorder waits for each line to finish before it moves to the next step.

To change a line, edit `scripts/demo/narration.ts` and record again (`npx tsx scripts/demo/record.ts`). Only the changed lines are re-made.

Lines spoken with a respelling, so the voice says the names right:

| Line | Written | Spoken as |
|---|---|---|
| uc2-open | Nimali Perera, a consultant, orders on her phone and pays by card. | Nimali Perayra, a consultant, orders on her phone and pays by card. |
| uc2-10 | In Operations, Malsha Gunasekara has paid orders to pack. | In Operations, Malsha Goonasaykara has paid orders to pack. |

## Use case 1: retail outlet order

[1-outlet-order-to-delivery.mp4](1-outlet-order-to-delivery.mp4), 3:32. 45 lines, 2:08 of speech.

| Starts | Ends | On screen | Narration |
|---|---|---|---|
| 0:00.5 | 0:04.7 | Title card: A retail outlet order, from paper PO to signed delivery note | Cool Planet orders for its Kandy showroom, but one product is out of stock. |
| 0:05.7 | 0:09.1 | 1. Ruwan Jayawardena, Outlet sales: Signs in to the staff console with his work email | Ruwan, in outlet sales, signs in with his work email. |
| 0:09.7 | 0:12.3 | 1. Ruwan Jayawardena, Outlet sales: A one-time code is emailed to him, and he types it in | A one-time code, so no shared passwords. |
| 0:12.7 | 0:14.8 | 1. Ruwan Jayawardena, Outlet sales: What's waiting: his work for today, each count opens the list behind it | Today's work, all on one page. |
| 0:15.3 | 0:19.9 | 2. Ruwan Jayawardena, Outlet sales: Enters Cool Planet's paper PO as a new outlet order | Cool Planet's paper PO goes in as a new order, delivered to their Kandy showroom. |
| 0:23.5 | 0:31.5 | 2. Ruwan Jayawardena, Outlet sales: Adds the lines: 120 Regular pads, 80 Panty liners, 60 Night pads | He keys in the three products from the PO. The system checks the stock on every line as he goes, so he knows what can go today before he saves. |
| 0:34.6 | 0:38.5 | 2. Ruwan Jayawardena, Outlet sales: Stock check: Regular pads and liners can go now. Night pads are out, so 60 wait, 6th in line | Night pads are out, so those sixty packs join the queue, sixth in line. |
| 0:40.3 | 0:42.9 | 2. Ruwan Jayawardena, Outlet sales: Order SO-27-00047 is confirmed: 200 packs set aside, 60 back-ordered | Two hundred packs are set aside, just for them. |
| 0:47.2 | 0:49.8 | 3. Kasun Bandara, Stores: What's waiting: stock has arrived from production and is not yet received | Kasun, in Stores, has new stock to receive. |
| 0:50.6 | 0:52.9 | 3. Kasun Bandara, Stores: 2,400 Night pads arrived this morning, and outlets are waiting for them | The Night pads the outlets are waiting for. |
| 0:54.0 | 0:56.2 | 3. Kasun Bandara, Stores: Checks the quantity and dates against the docket. The system gives the batch number | He checks it against the delivery docket. |
| 0:57.0 | 0:58.8 | 3. Kasun Bandara, Stores: Splits the batch: 1,440 packs for retail outlets, 960 for consultants | Then splits it between channels. |
| 0:59.3 | 1:02.4 | 3. Kasun Bandara, Stores: The waiting outlets are listed, oldest order first | He can see who has waited longest, so they're served first. |
| 1:04.5 | 1:06.4 | 3. Kasun Bandara, Stores: Recorded. Outlet sales are alerted that outlets are waiting for Night pads | Outlet sales are told at once. |
| 1:10.7 | 1:12.9 | 4. Ruwan Jayawardena, Outlet sales: Six orders wait for Night pads, oldest first. Cool Planet's new PO is 6th in line | Back to Ruwan. Six orders are waiting. |
| 1:13.9 | 1:15.4 | 4. Ruwan Jayawardena, Outlet sales: He confirms with each outlet, then allocates from the top, starting with Fashion Park | Oldest order first. |
| 1:15.8 | 1:20.2 | 4. Ruwan Jayawardena, Outlet sales: Each allocation sets the packs aside for that order, oldest first | He checks each outlet still wants them, and every click sets the packs aside. |
| 1:21.8 | 1:23.5 | 4. Ruwan Jayawardena, Outlet sales: Last in line, Cool Planet's 60 Night pads on SO-27-00047 | Cool Planet's comes last. |
| 1:24.1 | 1:25.6 | 4. Ruwan Jayawardena, Outlet sales: Every waiting order now has its Night pads. Stores can pick them | Every order is covered. |
| 1:29.6 | 1:31.4 | 5. Kasun Bandara, Stores: The dispatch board: outlet orders with stock set aside, oldest first | Now Kasun picks the order. |
| 1:32.1 | 1:34.6 | 5. Kasun Bandara, Stores: Creates the pick list for SO-27-00047 | He makes the pick list for Cool Planet's order. |
| 1:37.3 | 1:40.0 | 5. Kasun Bandara, Stores: The pick list names the batch for each line, the earliest expiry first | Each line takes the batch that expires soonest. |
| 1:41.5 | 1:43.9 | 5. Kasun Bandara, Stores: Packs by scanning each pack's barcode | Every pack is scanned as it goes in the box. |
| 1:45.4 | 1:46.8 | 5. Kasun Bandara, Stores: A full carton scans as 50 at a time | Fifty per carton. |
| 1:47.2 | 1:49.5 | 5. Kasun Bandara, Stores: A pack of wipes is not on this order, so the scan is refused | The wrong product is stopped before it leaves. |
| 1:50.8 | 1:56.5 | 5. Kasun Bandara, Stores: Scans the right products until every line is packed | He scans the rest. Each line counts up as he goes, until every pack on the order is in the box. |
| 2:00.4 | 2:01.9 | 5. Kasun Bandara, Stores: Every item checked. The box is ready for its invoice and delivery note | All packed and checked. |
| 2:06.5 | 2:09.7 | 6. Ruwan Jayawardena, Outlet sales: Packed and checked, so he can issue the invoice and delivery note | Ruwan issues the invoice and the delivery note in one go. |
| 2:11.3 | 2:14.9 | 6. Ruwan Jayawardena, Outlet sales: Both are emailed to Cool Planet as PDFs and printed for the driver | Cool Planet gets them by email, and the driver gets prints. |
| 2:15.5 | 2:21.7 | 6. Ruwan Jayawardena, Outlet sales: The invoice: Cool Planet's PO number, trade prices, due date from its 45-day terms | The invoice quotes their own PO number, so their accounts team can match it. It's due in forty five days. |
| 2:23.6 | 2:27.7 | 6. Ruwan Jayawardena, Outlet sales: The delivery note: quantities and batch numbers, no prices, and a box for the outlet to sign | The delivery note shows no prices, just the goods and a place to sign. |
| 2:32.9 | 2:37.0 | 7. Kasun Bandara, Stores: Records the vehicle and driver, then dispatches | Kasun records the van and the driver, and the order goes out for delivery. |
| 2:39.9 | 2:41.6 | 7. Kasun Bandara, Stores: Out for delivery. The stock leaves the warehouse and the order waits for the signed note | Now it waits for a signature. |
| 2:46.0 | 2:48.1 | 8. Ruwan Jayawardena, Outlet sales: The driver is back with Cool Planet's signed delivery note | The driver brings the signed note back. |
| 2:48.9 | 2:50.0 | 8. Ruwan Jayawardena, Outlet sales: Uploads a photo of the signed note | Just a photo. |
| 2:50.4 | 2:51.8 | 8. Ruwan Jayawardena, Outlet sales: The system reads the quantities from the note | The system reads it. |
| 2:52.7 | 2:55.8 | 8. Ruwan Jayawardena, Outlet sales: Figures read from the note are highlighted for him to check | Every figure is highlighted, so he can check it at a glance. |
| 2:57.9 | 2:59.9 | 8. Ruwan Jayawardena, Outlet sales: Enters who signed for the goods, then confirms | He adds who signed, and confirms. |
| 3:01.0 | 3:04.0 | 8. Ruwan Jayawardena, Outlet sales: All 260 packs received. The order moves to Completed | Every pack is accounted for, and the order is complete. |
| 3:06.3 | 3:08.0 | 8. Ruwan Jayawardena, Outlet sales: SO-27-00047: every pack delivered, nothing outstanding | Nothing is left to deliver. |
| 3:12.6 | 3:15.2 | 9. Kasun Bandara, Stores: Stock: one warehouse, with an allocation for each channel | Finally, Kasun checks the stock in the warehouse. |
| 3:16.3 | 3:19.8 | 9. Kasun Bandara, Stores: Night pads for outlets: the new batch, and what is still set aside for the other orders | The new Night pads batch, and what's still promised to other outlets. |
| 3:21.4 | 3:23.2 | 9. Kasun Bandara, Stores: Batch B2702-06: when it was made, when it expires, where it is held | Each batch has its own page. |
| 3:23.6 | 3:26.4 | 9. Kasun Bandara, Stores: It traces to Cool Planet's order SO-27-00047, ready for a recall list if ever needed | Showing where every pack went, ready for a recall. |
| 3:27.3 | 3:30.4 | Title card: Cool Planet's order is complete | From paper PO to signed note, with every pack traced. |

## Use case 2: consultant order

[2-consultant-order-to-delivery.mp4](2-consultant-order-to-delivery.mp4), 2:02. 23 lines, 1:12 of speech.

| Starts | Ends | On screen | Narration |
|---|---|---|---|
| 0:00.5 | 0:04.7 | Title card: A consultant order, from her phone to her door | Nimali Perera, a consultant, orders on her phone and pays by card. |
| 0:05.7 | 0:09.6 | 1. Nimali Perera, Consultant FC00006: Signs in on her phone with her consultant number and password | Nimali signs in on her phone with her consultant number and password. |
| 0:11.5 | 0:14.5 | 1. Nimali Perera, Consultant FC00006: Her home page: her sales, her team's sales and her commission so far this month | Her home page shows how she and her team are doing this month. |
| 0:15.7 | 0:19.5 | 1. Nimali Perera, Consultant FC00006: Her monthly target: LKR 5,000 of team and own sales to earn 5%, already met | She's already met her target, so her team's sales earn her five percent. |
| 0:21.0 | 0:22.8 | 2. Nimali Perera, Consultant FC00006: Every pack shows the MRP, her price and her margin | Each pack shows what she makes. |
| 0:23.5 | 0:27.7 | 2. Nimali Perera, Consultant FC00006: Adds 10 Regular pads and 4 Night pads | She picks what her customers want: ten Regular pads and four Night pads. |
| 0:31.0 | 0:33.7 | 2. Nimali Perera, Consultant FC00006: Cart: LKR 10,275 at her price, plus LKR 350 delivery. Delivery is free over LKR 15,000 | Just over ten thousand rupees, plus delivery. |
| 0:34.7 | 0:37.4 | 2. Nimali Perera, Consultant FC00006: She pays by card. Her margin when she sells at MRP is shown too | She'll pay by card, and sees her margin first. |
| 0:38.9 | 0:43.8 | 3. Nimali Perera, Consultant FC00006: A secure FemmeCare card page | She enters her card on a secure FemmeCare payment page, just as she would in any online shop. |
| 0:48.5 | 0:50.3 | 3. Nimali Perera, Consultant FC00006: Paid. The order goes to the warehouse to be packed | Paid, and straight to the warehouse. |
| 0:54.8 | 0:58.3 | 4. Malsha Gunasekara, Operations: What's waiting: paid consultant orders to pick and pack | In Operations, Malsha Gunasekara has paid orders to pack. |
| 0:59.4 | 1:01.8 | 4. Malsha Gunasekara, Operations: Nimali's paid order CO-27-00273 is on the dispatch board | Nimali's order is the newest on the board. |
| 1:04.4 | 1:06.5 | 4. Malsha Gunasekara, Operations: The pick list takes the batch that expires first | The earliest expiry goes first. |
| 1:07.1 | 1:12.7 | 5. Malsha Gunasekara, Operations: Packs by scan: an inner box of 10 Regular pads, then 4 Night pads | She scans an inner box of ten, then the four Night pads, one by one. The system counts every pack. |
| 1:17.3 | 1:21.0 | 5. Malsha Gunasekara, Operations: Packed and checked. She hands it to the courier and enters the tracking number | With everything checked, she hands it to the courier and adds the tracking number. |
| 1:22.8 | 1:24.9 | 5. Malsha Gunasekara, Operations: Handed to Domex. The system texts Nimali the courier and tracking number | Nimali gets a text straight away. |
| 1:30.3 | 1:34.4 | 6. Nimali Perera, Consultant FC00006: An SMS arrives with the courier and the tracking number | Back on Nimali's phone, the text tells her who's bringing it, and how to track it. |
| 1:36.6 | 1:39.0 | 6. Nimali Perera, Consultant FC00006: Her order: paid, and dispatched with Domex | Her order shows it's paid and on its way. |
| 1:40.9 | 1:43.5 | 6. Nimali Perera, Consultant FC00006: Track parcel shows the courier's updates | She can follow the parcel without calling anyone. |
| 1:44.9 | 1:47.3 | 7. Nimali Perera, Consultant FC00006: When the parcel reaches her, she taps I received it | When it arrives, she confirms with one tap. |
| 1:48.2 | 1:51.4 | 7. Nimali Perera, Consultant FC00006: Delivered. Payment and delivery are both complete | Paid and delivered, and nothing is left open to chase. |
| 1:53.5 | 1:55.6 | 7. Nimali Perera, Consultant FC00006: Back on her home page, the order now counts in her own sales for March | It now counts towards her own sales. |
| 1:56.9 | 1:59.6 | Title card: Nimali's order is delivered | From her phone to her door, with every step on record. |

## Both use cases (femmecare-demo.mp4)

[femmecare-demo.mp4](femmecare-demo.mp4), 5:40. 69 lines, 3:25 of speech.

The opening card, then use case 1 from 0:07.1 and use case 2 from 3:39.3, with the same lines as above. The opening line:

| Starts | Ends | On screen | Narration |
|---|---|---|---|
| 0:00.7 | 0:05.5 | Title card: Two orders, start to finish | Two FemmeCare orders, start to finish. First a retail outlet, then a consultant. |
