// FemmeCare Sales System prototype: domain types.
// All money is LKR, stored as numbers with up to 2 decimals.
// All timestamps are ISO strings in Sri Lanka time, produced by the demo clock.

export type Channel = "outlet" | "consultant";
export type RoleId =
  | "admin"
  | "outlet_sales"
  | "stores"
  | "operations"
  | "finance"
  | "management";

export type ScenarioId = "month_end" | "launch_day" | "mid_month" | "blank";

export interface StaffUser {
  id: string; // USR-01
  name: string;
  email: string;
  roles: RoleId[];
  status: "active" | "inactive";
  title: string;
  lastSignIn?: string;
  avatarHue: number;
}

export interface Product {
  id: string; // FC001
  name: string;
  category: string;
  description: string;
  packSize: string;
  uom: string;
  barcode: string;
  mrp: number;
  tradePrice: number;
  costPrice: number;
  taxRate: number; // percent
  reorder: Record<Channel, number>;
  status: "active" | "inactive";
  color: string; // pack illustration colour
  notes?: string;
  priceHistory: { from: string; mrp: number; by: string }[];
  createdAt: string;
}

export interface Batch {
  id: string; // B2612-01
  productId: string;
  mfgDate: string;
  expiryDate: string;
  grnId: string;
}

/** Stock held for one batch in one channel allocation. */
export interface StockLot {
  id: string; // `${batchId}:${channel}`
  productId: string;
  batchId: string;
  channel: Channel;
  onHand: number;
  reserved: number;
}

export type MovementType =
  | "Opening balance"
  | "Goods received"
  | "Sales issue"
  | "Transfer in"
  | "Transfer out"
  | "Adjustment in"
  | "Adjustment out"
  | "Count difference"
  | "Customer return";

export interface StockMovement {
  id: string;
  ts: string;
  productId: string;
  batchId: string;
  channel: Channel;
  type: MovementType;
  qtyIn: number;
  qtyOut: number;
  refType?: string;
  refId?: string;
  userId?: string;
  reason?: string;
  unitCost?: number;
}

export interface Grn {
  id: string; // GRN-27-0041
  status: "expected" | "recorded";
  ts: string;
  productId: string;
  batchId: string;
  qty: number;
  split: Record<Channel, number>;
  mfgDate: string;
  expiryDate: string;
  productionRef: string;
  receivedBy?: string;
}

export interface Transfer {
  id: string; // TRF-27-0007
  ts: string;
  productId: string;
  batchId: string;
  from: Channel;
  to: Channel;
  qty: number;
  reason: string;
  status: "requested" | "approved" | "rejected";
  requestedBy: string;
  decidedBy?: string;
  decidedAt?: string;
  rejectReason?: string;
}

export interface CountLine {
  productId: string;
  batchId: string;
  channel: Channel;
  systemQty: number;
  counted?: number;
  recounted?: number;
}

export interface StockCount {
  id: string; // CNT-27-0003
  ts: string;
  status: "counting" | "submitted" | "recount" | "approved" | "rejected";
  countedBy: string;
  lines: CountLine[];
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface Adjustment {
  id: string; // ADJ-27-0004
  ts: string;
  productId: string;
  batchId: string;
  channel: Channel;
  qty: number; // positive in, negative out
  reason: string;
  userId: string;
  countId?: string;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  address: string;
  city: string;
}

export interface Outlet {
  id: string; // CUS-0001
  name: string;
  type: "Retail" | "Wholesale" | "Distributor" | "Corporate" | "Online" | "Other";
  contactPerson: string;
  mobile: string;
  email: string;
  billingAddress: string;
  deliveryAddresses: DeliveryAddress[];
  city: string;
  district: string;
  taxId: string;
  paymentTerms: string; // "30 Days", "Cash", "Prepaid"
  creditLimit: number;
  openingBalance: number;
  since: string;
  status: "active" | "inactive" | "on_hold";
  notes: string;
}

export interface OutletOrderLine {
  productId: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  allocated: number; // allocated but not yet dispatched
  dispatched: number; // on the road, not yet confirmed by POD
  delivered: number;
  backordered: number;
  lost: number;
  cancelled: number;
  difference: number; // dispatched but not acknowledged on the signed note
  expectedDate?: string;
  lostReason?: string;
  notes?: string;
}

export type OutletOrderStatus =
  | "open"
  | "partly_delivered"
  | "delivered"
  | "closed"
  | "cancelled";

export interface TimelineEvent {
  ts: string;
  by?: string; // user id, consultant id or "system"
  text: string;
}

export interface OutletOrder {
  id: string; // SO-27-00418
  outletId: string;
  poNumber: string;
  poDate: string;
  requiredDate: string;
  deliveryAddressId: string;
  salespersonId: string;
  createdAt: string;
  status: OutletOrderStatus;
  lines: OutletOrderLine[];
  notes: string;
  source: "manual" | "upload";
  hasPoPhoto: boolean;
  deliveryMethod?: "Own vehicle" | "Courier" | "Customer collects";
  draft?: boolean; // "New": entered but not yet confirmed, no stock allocated
  onHold?: { reason: string; by: string; ts: string };
  events: TimelineEvent[];
}

export interface DispatchLine {
  productId: string;
  batchId: string;
  qty: number;
  scanned: number;
}

export type DispatchStatus = "to_pick" | "packing" | "ready" | "dispatched" | "delivered" | "failed" | "returned";

export interface PodReading {
  docImage: string; // sample document key
  readQty: Record<string, number>; // productId -> qty read
  confirmedQty?: Record<string, number>;
  differenceNote?: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface Dispatch {
  id: string; // DSP-27-00311
  channel: Channel;
  orderId: string;
  status: DispatchStatus;
  createdAt: string;
  lines: DispatchLine[];
  // outlet deliveries
  vehicle?: string;
  driver?: string;
  invoiceId?: string;
  deliveryNoteId?: string;
  pod?: PodReading;
  // consultant deliveries
  courier?: string;
  trackingNo?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  receivedBy?: string; // name of the person at the outlet who signed
  failReason?: string;
  notes?: string;
  events: TimelineEvent[];
}

export interface InvoiceLine {
  productId: string;
  qty: number;
  unitPrice: number;
  discount: number; // amount
  tax: number; // amount
  total: number;
}

export interface Invoice {
  id: string; // INV-27-00233
  deliveryNoteId: string; // DN-27-00233
  outletId: string;
  orderId: string;
  dispatchId: string;
  date: string;
  dueDate: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: "draft" | "issued" | "cancelled";
  emailedAt?: string;
  cancelReason?: string;
  notes?: string;
}

export interface OutletPayment {
  id: string; // RCPT-27-00102
  invoiceId: string;
  outletId: string;
  date: string;
  amount: number;
  method: "Cash" | "Bank Transfer" | "Card" | "Cheque" | "Online Payment" | "Other";
  reference: string;
  receivedBy: string;
  notes?: string;
}

export type ConsultantStatus = "pending" | "active" | "suspended" | "terminated" | "rejected";

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  bank: string;
  branch: string;
}

export interface Consultant {
  id: string; // internal id, e.g. "c-0042"
  number?: number; // consultant number, issued at approval; FemmeCare is 1
  appRef: string; // APP-27-0012
  title: string;
  givenName: string;
  surname: string;
  nic: string;
  dob: string;
  address: string;
  city: string;
  postalCode: string;
  mobile: string;
  email: string;
  officePhone?: string;
  homePhone?: string;
  bank: BankDetails;
  bankVerified: boolean;
  pendingBank?: BankDetails & { requestedAt: string };
  sponsorId?: string; // consultant id; undefined only for No. 1
  status: ConsultantStatus;
  appliedAt: string;
  joinedAt?: string;
  joinedVia: "link" | "number" | "none";
  consentShareWithSponsor: boolean;
  statusHistory: { ts: string; from?: ConsultantStatus; to: ConsultantStatus; by: string; reason?: string }[];
  rejectReason?: string;
  avatarHue: number;
  password: string; // demo only
}

export type PaymentMethod = "card" | "bank_transfer" | "cod";
export type ConsultantPaymentStatus =
  | "awaiting"
  | "proof_uploaded"
  | "paid"
  | "failed"
  | "rejected"
  | "cod_pending"
  | "refunded";
export type ConsultantDeliveryStatus = "placed" | "packed" | "dispatched" | "delivered" | "cancelled";

export interface PaymentAttempt {
  id: string; // PAY-27-00981
  ts: string;
  method: PaymentMethod;
  amount: number;
  reference: string;
  status: "success" | "failed" | "pending" | "verified" | "rejected";
  duplicateOf?: string; // another order whose payment used the same reference
  proofImage?: string; // sample slip key
  decidedBy?: string;
  decidedAt?: string;
  rejectReason?: string;
}

export interface ConsultantOrderLine {
  productId: string;
  qty: number;
  mrp: number;
  price: number;
}

export interface ConsultantOrder {
  id: string; // CO-27-01962
  consultantId: string;
  createdAt: string;
  lines: ConsultantOrderLine[];
  subtotal: number; // at consultant price
  mrpValue: number;
  deliveryCharge: number;
  total: number;
  address: string;
  city: string;
  paymentMethod: PaymentMethod;
  paymentStatus: ConsultantPaymentStatus;
  paidAt?: string;
  payments: PaymentAttempt[];
  deliveryStatus: ConsultantDeliveryStatus;
  dispatchId?: string;
  stockReserved: boolean;
  events: TimelineEvent[];
  cancelReason?: string;
  refund?: {
    status: "requested" | "approved" | "rejected";
    reason: string;
    restock: boolean;
    requestedBy: string;
    requestedAt: string;
    decidedBy?: string;
    decidedAt?: string;
    afterClose?: boolean;
  };
}

export interface CommissionLine {
  sponsorId: string;
  teamSales: number;
  ownSales: number;
  thresholdBasis: number;
  activeReferrals: number;
  qualifies: boolean;
  commissionable: number;
  amount: number;
  adjustments: number;
  payable: number;
  hold?: string; // reason payment is held
}

export interface CommissionMonth {
  id: string; // "2027-01"
  status: "locked" | "payout_approved" | "paid";
  closedAt: string;
  closedBy: string;
  settingsUsed: CommissionSettings;
  lines: CommissionLine[];
}

export interface CommissionAdjustment {
  id: string; // ADJ-C-27-0003
  ts: string;
  sponsorId: string;
  amount: number; // negative for a refund
  reason: string;
  orderId?: string;
  fromMonth: string; // month the sale was in
  appliedInMonth?: string; // month where it was netted off, once closed
  by: string;
}

export interface PayoutLine {
  consultantId: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "held";
  bankRef?: string;
  failReason?: string;
  carriedFrom?: string;
}

export interface PayoutBatch {
  id: string; // PB-2027-01
  month: string;
  createdAt: string;
  status: "draft" | "approved" | "file_generated" | "results_recorded";
  lines: PayoutLine[];
  approvedBy?: string;
  approvedAt?: string;
  fileGeneratedAt?: string;
  resultsAt?: string;
}

export interface OutboxMessage {
  id: string;
  ts: string;
  channel: "email" | "sms";
  to: string;
  toName: string;
  subject?: string;
  body: string;
  attachment?: string;
  relatedType?: string;
  relatedId?: string;
}

export interface InboxItem {
  id: string;
  ts: string;
  audience: { role?: RoleId; consultantId?: string; userId?: string };
  title: string;
  body?: string;
  link?: string;
  read: boolean;
}

export interface AuditEntry {
  id: string;
  ts: string;
  by: string; // user id, consultant id or "system"
  area: string;
  action: string;
  entityId?: string;
  before?: string;
  after?: string;
  reason?: string;
}

export interface CommissionSettings {
  rate: number;
  base: "mrp" | "net";
  ownSalesEarn: boolean;
  threshold: number;
  thresholdCounts: "team" | "team_plus_own";
  no1Earns: boolean;
  cutoff: string; // "23:59"
  referralTest: { enabled: boolean; min: number };
}

export interface Settings {
  company: {
    name: string;
    brand: string;
    address: string;
    phone: string;
    email: string;
    regNo: string;
    vatNo: string;
    invoiceTerms: string;
  };
  numbering: { invoicePrefix: string; orderPrefix: string };
  outlets: {
    trackPayments: boolean;
    backorderMode: "keep_open" | "close_and_reconfirm";
    notifyWaiting: "staff" | "staff_and_email";
    creditWarning: boolean;
  };
  stock: { transferApproval: boolean; expiryWarnDays: number; recountLimit: number };
  pricing: { method: "discount" | "markup"; rate: number };
  delivery: { flatCharge: number; freeOver: number; couriers: string[] };
  payments: {
    card: boolean;
    bankTransfer: boolean;
    cod: boolean;
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    bankBranch: string;
  };
  commission: CommissionSettings;
  labels: { consultant: "Consultant" | "Agent" };
}

export interface DemoMeta {
  scenario: ScenarioId;
  now: string;
  changed: boolean;
  presenterMode: boolean;
  phaseLens: "first_release" | "everything";
  forceNextCardFailure: boolean;
  session: { kind: "staff"; userId: string } | { kind: "consultant"; consultantId: string } | { kind: "visitor" };
  counters: Record<string, number>;
}

export interface Db {
  version: number;
  meta: DemoMeta;
  settings: Settings;
  users: StaffUser[];
  products: Product[];
  batches: Batch[];
  stockLots: StockLot[];
  movements: StockMovement[];
  grns: Grn[];
  transfers: Transfer[];
  counts: StockCount[];
  adjustments: Adjustment[];
  outlets: Outlet[];
  outletOrders: OutletOrder[];
  dispatches: Dispatch[];
  invoices: Invoice[];
  outletPayments: OutletPayment[];
  consultants: Consultant[];
  consultantOrders: ConsultantOrder[];
  commissionMonths: CommissionMonth[];
  commissionAdjustments: CommissionAdjustment[];
  payoutBatches: PayoutBatch[];
  outbox: OutboxMessage[];
  inbox: InboxItem[];
  audit: AuditEntry[];
}
