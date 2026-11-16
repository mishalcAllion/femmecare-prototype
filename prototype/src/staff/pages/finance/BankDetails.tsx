// S34 Bank details to verify: old and new details side by side (the only place full
// account numbers are shown), verify or reject with a reason; and details never verified.

import { useMemo, useState } from "react";
import { CheckCircle2, Landmark, MessageSquareWarning, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, ReasonDialog, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { fullName } from "@/domain/consultants";
import { dateTime, lkr, relative } from "@/domain/format";
import type { BankDetails, Consultant } from "@/domain/types";
import { financeActions } from "@/domain/ext/finance";
import { act, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { ConsultantCell, useLabel } from "../consultants/shared";

const FIELDS: [keyof BankDetails, string][] = [
  ["accountName", "Account name"],
  ["accountNumber", "Account number"],
  ["bank", "Bank"],
  ["branch", "Branch"],
];

export function BankDetailsPage() {
  return (
    <Guard perms={["bank.verify"]}>
      <BankDetailsQueue />
    </Guard>
  );
}

function BankDetailsQueue() {
  const L = useLabel();
  usePageTitle("Bank details to verify");
  const db = useDb();
  const now = useNow();
  const [reject, setReject] = useState<Consultant>();
  const [ask, setAsk] = useState<Consultant>();
  const changes = useMemo(() => db.consultants.filter((c) => c.pendingBank).sort((a, b) => a.pendingBank!.requestedAt.localeCompare(b.pendingBank!.requestedAt)), [db]);
  const never = useMemo(() => db.consultants.filter((c) => c.number !== undefined && !c.bankVerified && !c.pendingBank && c.status !== "terminated"), [db]);
  const heldFor = (id: string) =>
    db.payoutBatches
      .flatMap((b) => b.lines)
      .filter((l) => l.consultantId === id && (l.status === "held" || (l.status === "failed" && l.carriedFrom !== "moved")))
      .reduce((a, l) => a + l.amount, 0);
  return (
    <div className="animate-rise">
      <PageHeader
        title="Bank details to verify"
        description={`Commission is paid only to verified accounts. Full account numbers are shown on this page only; everywhere else they are masked.`}
      />
      <h2 className="mb-3 text-sm font-semibold">
        Changes requested <span className="text-muted-foreground">({changes.length})</span>
      </h2>
      {changes.length ? (
        <div className="space-y-4">
          {changes.map((c) => {
            const nb = c.pendingBank!;
            const held = heldFor(c.id);
            return (
              <Panel key={c.id}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <ConsultantCell c={c} />
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {held > 0 && <StatusBadge tone="danger">{lkr(held)} waiting to be paid</StatusBadge>}
                    Requested {relative(nb.requestedAt, now)} · {dateTime(nb.requestedAt)}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium" />
                        <th className="px-3 py-2 font-medium">Current {c.bankVerified ? "(verified)" : "(not verified)"}</th>
                        <th className="px-3 py-2 font-medium">New</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FIELDS.map(([k, label]) => {
                        const changed = c.bank[k] !== nb[k];
                        return (
                          <tr key={k} className="border-b border-border/50 last:border-0">
                            <td className="px-3 py-2 text-xs text-muted-foreground">{label}</td>
                            <td className={cn("px-3 py-2 tabular", changed && "text-muted-foreground line-through decoration-muted-foreground/50")}>{c.bank[k]}</td>
                            <td className={cn("px-3 py-2 tabular", changed && "bg-warning-soft/60 font-semibold")}>{nb[k]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Check that the account name matches {fullName(c)} and confirm the change with her by phone on {c.mobile} before verifying. Payouts use the current details until then.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="destructive" onClick={() => setReject(c)}>
                    <XCircle className="size-4" /> Reject
                  </Button>
                  <Button onClick={() => act(actions.decideBankChange(c.id, true), `New bank details for ${fullName(c)} verified`)}>
                    <CheckCircle2 className="size-4" /> Verify new details
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Landmark className="size-5" />} title="No bank-detail changes waiting" description={`When a ${L.lower} changes her bank details in the app, the request appears here.`} />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold">
        Never verified <span className="text-muted-foreground">({never.length})</span>
      </h2>
      {never.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {never.map((c) => {
            const held = heldFor(c.id);
            return (
              <Panel key={c.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <ConsultantCell c={c} />
                  {held > 0 ? <StatusBadge tone="warning">{lkr(held)} held</StatusBadge> : <StatusBadge tone="warning">Not verified</StatusBadge>}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {FIELDS.map(([k, label]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="font-medium tabular">{c.bank[k] || <span className="text-muted-foreground">Not given</span>}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setAsk(c)}>
                    <MessageSquareWarning className="size-4" /> Ask her to correct
                  </Button>
                  <Button disabled={!c.bank.accountNumber || !c.bank.bank} onClick={() => act(actions.verifyExistingBank(c.id), `Bank details for ${fullName(c)} verified`)}>
                    <CheckCircle2 className="size-4" /> Mark verified
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<CheckCircle2 className="size-5" />} title={`Every active ${L.lower}'s bank details are verified`} />
      )}

      <ReasonDialog
        open={!!reject}
        onOpenChange={(v) => !v && setReject(undefined)}
        title={reject ? `Reject ${fullName(reject)}'s new bank details` : ""}
        description="She is told in the app and keeps her current details. She can send new ones."
        confirmLabel="Reject"
        destructive
        placeholder="For example: the account name does not match"
        onConfirm={(reason) => {
          if (!reject) return false;
          const r = actions.decideBankChange(reject.id, false, reason);
          act(r, "Bank details rejected");
          return r.ok;
        }}
      />
      <ReasonDialog
        open={!!ask}
        onOpenChange={(v) => !v && setAsk(undefined)}
        title={ask ? `Ask ${fullName(ask)} to correct her bank details` : ""}
        description="She gets an SMS and a message in the app. Her commission stays on hold until the details are verified."
        confirmLabel="Send"
        placeholder="For example: the branch name is missing"
        onConfirm={(reason) => {
          if (!ask) return false;
          const r = financeActions.askForBankDetails(ask.id, reason);
          act(r, "Message sent");
          return r.ok;
        }}
      />
    </div>
  );
}
