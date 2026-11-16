// Static demo data. All people, numbers and addresses are fictional,
// except the outlet names the client used on the call.

import type { Product, Settings, StaffUser } from "../types";

export function ean13(base12: string): string {
  const digits = base12.split("").map(Number);
  const sum = digits.reduce((s, dgt, i) => s + dgt * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + String((10 - (sum % 10)) % 10);
}

export const PRODUCTS: Omit<Product, "priceHistory" | "createdAt">[] = [
  {
    id: "FC001", name: "Ultra Care Pads Regular", category: "Sanitary pads", packSize: "8 pads",
    description: "Ultra-thin day pads with a soft cotton top layer and wings. 240 mm.",
    uom: "Pack", barcode: ean13("479100100001"), mrp: 950, tradePrice: 665, costPrice: 380, taxRate: 0,
    reorder: { outlet: 400, consultant: 250 }, status: "active", color: "#e8475a",
  },
  {
    id: "FC002", name: "Ultra Care Pads Night", category: "Sanitary pads", packSize: "8 pads",
    description: "Extra-long night pads with a wide back for overnight protection. 320 mm.",
    uom: "Pack", barcode: ean13("479100100002"), mrp: 1050, tradePrice: 735, costPrice: 420, taxRate: 0,
    reorder: { outlet: 300, consultant: 200 }, status: "active", color: "#7b3fa0",
  },
  {
    id: "FC003", name: "Panty Liners", category: "Panty liners", packSize: "20 liners",
    description: "Breathable everyday liners, individually wrapped.",
    uom: "Pack", barcode: ean13("479100100003"), mrp: 650, tradePrice: 455, costPrice: 240, taxRate: 0,
    reorder: { outlet: 300, consultant: 150 }, status: "active", color: "#3a8fd6",
  },
  {
    id: "FC004", name: "Feminine Wipes", category: "Intimate care", packSize: "20 wipes",
    description: "pH-balanced, alcohol-free wipes for freshness on the go.",
    uom: "Pack", barcode: ean13("479100100004"), mrp: 590, tradePrice: 413, costPrice: 210, taxRate: 0,
    reorder: { outlet: 200, consultant: 120 }, status: "active", color: "#2fae8f",
  },
  {
    id: "FC005", name: "Intimate Wash", category: "Intimate care", packSize: "150 ml",
    description: "Gentle daily wash with aloe vera and lactic acid.",
    uom: "Each", barcode: ean13("479100100005"), mrp: 890, tradePrice: 623, costPrice: 330, taxRate: 0,
    reorder: { outlet: 150, consultant: 100 }, status: "active", color: "#f39c4a",
  },
  {
    id: "FC006", name: "Soothing Cream", category: "Skin care", packSize: "50 g",
    description: "Calming cream for chafing and sensitive skin, with chamomile.",
    uom: "Each", barcode: ean13("479100100006"), mrp: 1290, tradePrice: 903, costPrice: 470, taxRate: 0,
    reorder: { outlet: 200, consultant: 90 }, status: "active", color: "#d4609c",
  },
];

export const STAFF: StaffUser[] = [
  { id: "USR-01", name: "Ayesha Rodrigo", email: "ayesha.rodrigo@femmecare.lk", roles: ["admin"], status: "active", title: "System administrator", avatarHue: 350 },
  { id: "USR-02", name: "Ruwan Jayawardena", email: "ruwan.j@femmecare.lk", roles: ["outlet_sales"], status: "active", title: "Retail outlet sales executive", avatarHue: 210 },
  { id: "USR-03", name: "Kasun Bandara", email: "kasun.bandara@femmecare.lk", roles: ["stores"], status: "active", title: "Stores keeper", avatarHue: 30 },
  { id: "USR-04", name: "Nuwan Perera", email: "nuwan.perera@femmecare.lk", roles: ["stores"], status: "active", title: "Stores supervisor", avatarHue: 120 },
  { id: "USR-05", name: "Malsha Gunasekara", email: "malsha.g@femmecare.lk", roles: ["operations"], status: "active", title: "Operations executive", avatarHue: 280 },
  { id: "USR-06", name: "Tharaka Wijesinghe", email: "tharaka.w@femmecare.lk", roles: ["finance"], status: "active", title: "Finance executive", avatarHue: 160 },
  { id: "USR-07", name: "Sanjeewa Fernando", email: "sanjeewa.f@femmecare.lk", roles: ["management"], status: "active", title: "Director", avatarHue: 20 },
  { id: "USR-08", name: "Dilhani Silva", email: "dilhani.silva@femmecare.lk", roles: ["outlet_sales", "finance"], status: "inactive", title: "Accounts assistant (left Feb 2027)", avatarHue: 60 },
];

export const OUTLETS = [
  {
    name: "Cool Planet", type: "Retail" as const, contactPerson: "Shehan Wijeratne", mobile: "0771234508", email: "purchasing@coolplanet.example",
    billingAddress: "Head Office, 12 Galle Road, Colombo 03", city: "Colombo", district: "Colombo", taxId: "114502318-7000",
    paymentTerms: "45 Days", creditLimit: 3_000_000,
    addresses: [
      { label: "Colombo flagship", address: "Showroom, Galle Road, Colombo 03", city: "Colombo 03" },
      { label: "Kandy", address: "Showroom, Dalada Veediya, Kandy", city: "Kandy" },
      { label: "Galle", address: "Showroom, Main Street, Galle", city: "Galle" },
    ],
  },
  {
    name: "House of Fashion", type: "Retail" as const, contactPerson: "Nirosha Abeysekera", mobile: "0712234567", email: "buying@houseoffashion.example",
    billingAddress: "Accounts, 101 Duplication Road, Colombo 03", city: "Colombo", district: "Colombo", taxId: "114887621-7000",
    paymentTerms: "30 Days", creditLimit: 2_000_000,
    addresses: [{ label: "Main store", address: "Duplication Road, Colombo 03", city: "Colombo 03" }],
  },
  {
    name: "Fashion Park", type: "Retail" as const, contactPerson: "Asanka Liyanage", mobile: "0759876543", email: "orders@fashionpark.example",
    billingAddress: "45 High Level Road, Maharagama", city: "Maharagama", district: "Colombo", taxId: "114330987-7000",
    paymentTerms: "30 Days", creditLimit: 1_200_000,
    addresses: [{ label: "Maharagama", address: "45 High Level Road, Maharagama", city: "Maharagama" }],
  },
  {
    name: "Nelum Pharmacy", type: "Retail" as const, contactPerson: "Chandima Herath", mobile: "0812345671", email: "nelumpharmacy.kandy@gmail.com",
    billingAddress: "22 Peradeniya Road, Kandy", city: "Kandy", district: "Kandy", taxId: "",
    paymentTerms: "14 Days", creditLimit: 250_000,
    addresses: [{ label: "Pharmacy", address: "22 Peradeniya Road, Kandy", city: "Kandy" }],
  },
  {
    name: "Wellcare Mart", type: "Retail" as const, contactPerson: "Rizwan Mohamed", mobile: "0772345619", email: "wellcaremart.negombo@gmail.com",
    billingAddress: "8 Main Street, Negombo", city: "Negombo", district: "Gampaha", taxId: "409223190-7000",
    paymentTerms: "30 Days", creditLimit: 400_000,
    addresses: [{ label: "Store", address: "8 Main Street, Negombo", city: "Negombo" }],
  },
  {
    name: "Sarana Pharmacy", type: "Retail" as const, contactPerson: "Pradeep Senaratne", mobile: "0372223344", email: "",
    billingAddress: "130 Colombo Road, Kurunegala", city: "Kurunegala", district: "Kurunegala", taxId: "",
    paymentTerms: "Cash", creditLimit: 0,
    addresses: [{ label: "Pharmacy", address: "130 Colombo Road, Kurunegala", city: "Kurunegala" }],
  },
  {
    name: "Southern Health Mart", type: "Distributor" as const, contactPerson: "Lasantha Gamage", mobile: "0779988776", email: "southernhealthmart@gmail.com",
    billingAddress: "57 Anagarika Dharmapala Mawatha, Matara", city: "Matara", district: "Matara", taxId: "417760045-7000",
    paymentTerms: "30 Days", creditLimit: 600_000,
    addresses: [{ label: "Warehouse", address: "57 Anagarika Dharmapala Mawatha, Matara", city: "Matara" }],
  },
  {
    name: "Jaffna Family Pharmacy", type: "Retail" as const, contactPerson: "Kavitha Sivakumar", mobile: "0212225566", email: "jaffnafamilypharmacy@gmail.com",
    billingAddress: "14 Hospital Road, Jaffna", city: "Jaffna", district: "Jaffna", taxId: "",
    paymentTerms: "14 Days", creditLimit: 200_000,
    addresses: [{ label: "Pharmacy", address: "14 Hospital Road, Jaffna", city: "Jaffna" }],
  },
];

export const GIVEN = [
  "Hasini", "Sanduni", "Chamodi", "Piumi", "Tharushi", "Nethmi", "Sachini", "Gayani", "Shehani", "Anusha",
  "Ruvini", "Madhavi", "Dulani", "Ishani", "Kaushalya", "Nadeesha", "Yashodha", "Erandi", "Lakmali", "Sewwandi",
  "Tharshini", "Nivetha", "Priya", "Lakshmi", "Shalini", "Vithya", "Ayesha", "Rizna", "Shifana", "Hafsa",
  "Nuha", "Umaira", "Chathurika", "Harshani", "Dinithi", "Oshadi", "Kalani", "Imesha", "Pavithra", "Rashmi",
  "Thisuri", "Senuri", "Hiruni", "Malki", "Upeksha", "Achini", "Wathsala", "Samadhi", "Navodya", "Jeewani",
];

export const SURNAMES = [
  "Perera", "Fernando", "Silva", "Jayasuriya", "Subasinghe", "Wickramasinghe", "Bandara", "Dissanayake", "Herath",
  "Gunawardena", "Ranasinghe", "Karunaratne", "Weerasinghe", "Amarasinghe", "Ekanayake", "Rathnayake", "Samarasinghe",
  "Jayawardena", "Rajapaksha", "Nanayakkara", "Sivakumar", "Rajendran", "Thevarajah", "Mohamed", "Nazeer", "Rizvi",
  "Liyanage", "Kodikara", "Wijesekara", "Abeyratne",
];

export const CITIES: { city: string; postal: string; streets: string[] }[] = [
  { city: "Nugegoda", postal: "10250", streets: ["Stanley Thilakaratne Mawatha", "Pagoda Road", "Nawala Road"] },
  { city: "Maharagama", postal: "10280", streets: ["Old Road", "Pannipitiya Road", "Temple Road"] },
  { city: "Colombo 05", postal: "00500", streets: ["Havelock Road", "Thimbirigasyaya Road", "Park Road"] },
  { city: "Dehiwala", postal: "10350", streets: ["Hill Street", "Galle Road", "Station Road"] },
  { city: "Kandy", postal: "20000", streets: ["Peradeniya Road", "Katugastota Road", "William Gopallawa Mawatha"] },
  { city: "Galle", postal: "80000", streets: ["Wakwella Road", "Matara Road", "Pettigalawatta"] },
  { city: "Kurunegala", postal: "60000", streets: ["Puttalam Road", "Kandy Road", "Dambulla Road"] },
  { city: "Negombo", postal: "11500", streets: ["Lewis Place", "Chilaw Road", "Sea Street"] },
  { city: "Gampaha", postal: "11000", streets: ["Yakkala Road", "Bauddhaloka Mawatha", "Miriswatta"] },
  { city: "Matara", postal: "81000", streets: ["Akuressa Road", "Tangalle Road", "Beach Road"] },
  { city: "Jaffna", postal: "40000", streets: ["Stanley Road", "Point Pedro Road", "KKS Road"] },
  { city: "Kalutara", postal: "12000", streets: ["Nagoda Road", "Station Road", "Galle Road"] },
  { city: "Ratnapura", postal: "70000", streets: ["Main Street", "Hospital Road", "Colombo Road"] },
  { city: "Batticaloa", postal: "30000", streets: ["Trinco Road", "Bar Road", "Lake Road"] },
  { city: "Anuradhapura", postal: "50000", streets: ["Maithripala Senanayake Mawatha", "Harischandra Mawatha", "Jaffna Junction"] },
];

export const BANKS = ["Bank of Ceylon", "People's Bank", "Commercial Bank", "Sampath Bank", "Hatton National Bank", "National Savings Bank", "Seylan Bank"];

/** Named consultants from Dinusha's deck, in joining order. `sponsor` is an index in this list, or -1 for No. 1. */
export const NAMED = [
  { title: "Mrs", givenName: "Thilini", surname: "Fernando", sponsor: -1, city: "Nugegoda" },
  { title: "Ms", givenName: "Nimali", surname: "Perera", sponsor: 0, city: "Maharagama" },
  { title: "Mrs", givenName: "Fathima", surname: "Nazeer", sponsor: -1, city: "Kandy" },
  { title: "Ms", givenName: "Dilini", surname: "Fernando", sponsor: -1, city: "Negombo" },
  { title: "Mrs", givenName: "Kavitha", surname: "Rajendran", sponsor: -1, city: "Jaffna" },
  { title: "Ms", givenName: "Kavindi", surname: "Silva", sponsor: 1, city: "Dehiwala" },
  { title: "Ms", givenName: "Sashini", surname: "Perera", sponsor: 1, city: "Colombo 05" },
  { title: "Mrs", givenName: "Dilki", surname: "Fernando", sponsor: 1, city: "Gampaha" },
  { title: "Ms", givenName: "Amaya", surname: "Subasinghe", sponsor: 1, city: "Kalutara" },
  { title: "Ms", givenName: "Inara", surname: "Jayasuriya", sponsor: 1, city: "Galle" },
  { title: "Ms", givenName: "Nadee", surname: "Perera", sponsor: 0, city: "Kurunegala" },
];

export const SAMPLE_SETTINGS: Settings = {
  company: {
    name: "FemmeCare (Pvt) Ltd",
    brand: "FemmeCare",
    address: "No. 120, Kandy Road, Kurunegala 60000",
    phone: "037 222 4500",
    email: "sales@femmecare.lk",
    regNo: "PV 00271834",
    vatNo: "",
    invoiceTerms: "Goods once delivered and acknowledged cannot be returned or exchanged. Please quote the invoice number with your payment.",
  },
  numbering: { invoicePrefix: "INV", orderPrefix: "SO" },
  outlets: { trackPayments: true, backorderMode: "keep_open", notifyWaiting: "staff", creditWarning: true },
  stock: { transferApproval: true, expiryWarnDays: 90, recountLimit: 5 },
  pricing: { method: "discount", rate: 25 },
  delivery: { flatCharge: 350, freeOver: 15000, couriers: ["Domex", "Pronto Lanka", "Koombiyo"] },
  payments: {
    card: true,
    bankTransfer: true,
    cod: false,
    bankName: "Commercial Bank, Kurunegala",
    bankAccountName: "FemmeCare (Pvt) Ltd",
    bankAccountNumber: "1000 4527 8812",
    bankBranch: "Kurunegala",
  },
  commission: {
    rate: 5,
    base: "mrp",
    ownSalesEarn: false,
    threshold: 5000,
    thresholdCounts: "team_plus_own",
    no1Earns: false,
    cutoff: "23:59",
    referralTest: { enabled: false, min: 1 },
  },
  labels: { consultant: "Consultant" },
};
