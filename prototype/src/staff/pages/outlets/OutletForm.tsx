// New and edit outlet: every field of the Customer Master, several delivery
// addresses, and a duplicate check on name and tax ID.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, MapPin, Plus, Trash2 } from "lucide-react";
import { useDb, uid } from "@/domain/db";
import { actions } from "@/domain/actions";
import type { DeliveryAddress, Outlet } from "@/domain/types";
import { date } from "@/domain/format";
import { act } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { PageHeader, Panel } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DISTRICTS, Field, OUTLET_STATUS_LABEL, OUTLET_TYPES, PAYMENT_TERMS, done } from "./shared";

type FormState = Omit<Outlet, "id" | "since">;

const blank = (): FormState => ({
  name: "",
  type: "Retail",
  contactPerson: "",
  mobile: "",
  email: "",
  billingAddress: "",
  deliveryAddresses: [{ id: uid("DA"), label: "Main store", address: "", city: "" }],
  city: "",
  district: "Colombo",
  taxId: "",
  paymentTerms: "30 Days",
  creditLimit: 0,
  openingBalance: 0,
  status: "active",
  notes: "",
});

export function OutletForm() {
  return (
    <Guard perms={["outlets.edit"]}>
      <Form />
    </Guard>
  );
}

function Form() {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const existing = id ? db.outlets.find((o) => o.id === id) : undefined;
  usePageTitle(existing ? `Edit ${existing.name}` : "New outlet");
  const [f, setF] = useState<FormState>(() => (existing ? { ...existing, deliveryAddresses: existing.deliveryAddresses.map((a) => ({ ...a })) } : blank()));
  const [tried, setTried] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setAddr = (i: number, patch: Partial<DeliveryAddress>) =>
    setF((s) => ({ ...s, deliveryAddresses: s.deliveryAddresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const duplicates = useMemo(() => {
    const name = f.name.trim().toLowerCase();
    const tax = f.taxId.trim();
    return db.outlets.filter((o) => o.id !== existing?.id && ((name && o.name.toLowerCase() === name) || (tax && o.taxId === tax)));
  }, [db, f.name, f.taxId, existing?.id]);

  const errors: Partial<Record<string, string>> = {};
  if (!f.name.trim()) errors.name = "Enter the outlet's name";
  if (!f.contactPerson.trim()) errors.contactPerson = "Enter who places orders";
  if (!/^0\d{9}$/.test(f.mobile.replace(/[\s-]/g, ""))) errors.mobile = "10 digits starting with 0, for example 0771234567";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.email = "This email address doesn't look right";
  if (!f.billingAddress.trim()) errors.billingAddress = "Enter the billing address";
  if (!f.city.trim()) errors.city = "Enter the city";
  if (f.creditLimit < 0) errors.creditLimit = "Can't be negative";
  f.deliveryAddresses.forEach((a, i) => {
    if (!a.label.trim() || !a.address.trim() || !a.city.trim()) errors[`addr${i}`] = "Give each delivery address a name, address and city";
  });
  const valid = Object.keys(errors).length === 0 && duplicates.length === 0;
  const show = (k: string) => (tried ? errors[k] : undefined);

  if (id && !existing) return <NotFound />;

  const save = () => {
    setTried(true);
    if (!valid) return;
    const payload = { ...f, name: f.name.trim(), mobile: f.mobile.replace(/[\s-]/g, ""), email: f.email.trim(), taxId: f.taxId.trim() };
    if (existing) {
      if (done(actions.updateOutlet(existing.id, payload), "Outlet saved")) navigate(`/staff/outlets/${existing.id}`);
    } else {
      const { status: _s, ...rest } = payload;
      void _s;
      const newId = act(actions.createOutlet(rest), (v) => `${payload.name} registered as ${v}`);
      if (newId) navigate(`/staff/outlets/${newId}`);
    }
  };

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        back={existing ? { to: `/staff/outlets/${existing.id}`, label: existing.name } : { to: "/staff/outlets", label: "Outlets" }}
        title={existing ? `Edit ${existing.name}` : "New outlet"}
        description={existing ? `${existing.id} · customer since ${date(existing.since)}` : "The customer ID is issued when you save."}
      />

      {duplicates.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">This outlet may already be registered</div>
            {duplicates.map((d) => (
              <div key={d.id} className="text-muted-foreground">
                <Link to={`/staff/outlets/${d.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                  {d.name} ({d.id})
                </Link>{" "}
                has the same {d.name.toLowerCase() === f.name.trim().toLowerCase() ? "name" : "tax ID"}
                {d.name.toLowerCase() === f.name.trim().toLowerCase() && f.taxId && d.taxId === f.taxId.trim() ? " and tax ID" : ""}.
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Outlet">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Outlet name" error={show("name")} className="sm:col-span-2" htmlFor="o-name">
                <Input id="o-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="For example: Cool Planet" aria-invalid={!!show("name") || duplicates.length > 0} />
              </Field>
              <Field label="Type">
                <NativeSelect value={f.type} onChange={(e) => set("type", e.target.value as Outlet["type"])}>
                  {OUTLET_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Status"
                hint={
                  f.status === "inactive"
                    ? "Inactive outlets can't be chosen for new orders"
                    : f.status === "on_hold"
                      ? "New orders are saved On Hold and nothing is picked until the hold is released"
                      : !existing
                        ? "New outlets start as Active"
                        : undefined
                }
              >
                <NativeSelect value={f.status} onChange={(e) => set("status", e.target.value as Outlet["status"])} disabled={!existing}>
                  {(Object.keys(OUTLET_STATUS_LABEL) as Outlet["status"][]).map((k) => (
                    <option key={k} value={k}>
                      {OUTLET_STATUS_LABEL[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Contact person" error={show("contactPerson")}>
                <Input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
              </Field>
              <Field label="Phone" error={show("mobile")}>
                <Input value={f.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" placeholder="0771234567" />
              </Field>
              <Field label="Email" error={show("email")} hint="Invoices and delivery notes are emailed here as PDF" className="sm:col-span-2">
                <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="purchasing@outlet.lk" />
              </Field>
            </div>
          </Panel>

          <Panel title="Addresses">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Billing address" error={show("billingAddress")} className="sm:col-span-2">
                <Input value={f.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} />
              </Field>
              <Field label="City" error={show("city")}>
                <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="District">
                <NativeSelect value={f.district} onChange={(e) => set("district", e.target.value)}>
                  {DISTRICTS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Delivery addresses</div>
                  <div className="text-xs text-muted-foreground">One per showroom or store. Each order picks one.</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => set("deliveryAddresses", [...f.deliveryAddresses, { id: uid("DA"), label: "", address: "", city: "" }])}>
                  <Plus className="size-4" /> Add address
                </Button>
              </div>
              <div className="space-y-3">
                {f.deliveryAddresses.map((a, i) => (
                  <div key={a.id} className="rounded-xl border border-border/70 bg-muted/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
                      <Field label="Name">
                        <Input value={a.label} onChange={(e) => setAddr(i, { label: e.target.value })} placeholder="Kandy showroom" />
                      </Field>
                      <Field label="Address">
                        <Input value={a.address} onChange={(e) => setAddr(i, { address: e.target.value })} />
                      </Field>
                      <Field label="City">
                        <Input value={a.city} onChange={(e) => setAddr(i, { city: e.target.value })} />
                      </Field>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove address"
                        disabled={f.deliveryAddresses.length === 1}
                        onClick={() => set("deliveryAddresses", f.deliveryAddresses.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {show(`addr${i}`) && <p className="mt-2 text-xs text-destructive">{show(`addr${i}`)}</p>}
                  </div>
                ))}
                <Button
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() =>
                    setAddr(0, {
                      address: f.deliveryAddresses[0].address || f.billingAddress,
                      city: f.deliveryAddresses[0].city || f.city,
                    })
                  }
                >
                  <MapPin className="size-4" /> Same as billing address
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Terms and credit">
            <div className="grid gap-4">
              <Field label="Tax / VAT ID" hint="Leave empty if the outlet isn't registered">
                <Input value={f.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="114502318-7000" />
              </Field>
              <Field label="Payment terms">
                <NativeSelect value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Credit limit (LKR)" error={show("creditLimit")} hint="0 means no credit limit check">
                <Input type="number" min={0} step={1000} value={f.creditLimit} onChange={(e) => set("creditLimit", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Opening balance (LKR)" hint="Amount owed when the outlet was moved into the system">
                <Input type="number" step={100} value={f.openingBalance} onChange={(e) => set("openingBalance", Number(e.target.value) || 0)} />
              </Field>
            </div>
          </Panel>
          <Panel title="Notes">
            <Textarea rows={4} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Delivery times, who to call, anything the team should know" />
          </Panel>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={tried && !valid}>
              {existing ? "Save changes" : "Register outlet"}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link to={existing ? `/staff/outlets/${existing.id}` : "/staff/outlets"} />}>
              Cancel
            </Button>
          </div>
          {tried && !valid && <p className="text-xs text-destructive">{duplicates.length ? "Check the possible duplicate above." : "Fix the fields marked in red."}</p>}
        </div>
      </div>
    </div>
  );
}
