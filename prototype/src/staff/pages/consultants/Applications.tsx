// S27 Applications: the queue of people who applied to sell, and the review page
// with automatic checks, approve (issues a number) or reject with a reason.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BadgeCheck, Eye, UserPlus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, FilterTabs, KeyValue, PageHeader, Panel, ReasonDialog, SimpleTable, Status, StatusBadge, Timeline, type Column } from "@/components/fc/ui";
import { Avatar } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, duplicateCheck, fullName, parseNic, STATUS_LABEL } from "@/domain/consultants";
import { consultantCode, date, dateTime, maskTail, relative } from "@/domain/format";
import type { Consultant, Db } from "@/domain/types";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { CheckRow, ConsultantCell, maskedAccount, useLabel } from "./shared";
import { ChangeSponsorDialog } from "./SponsorDialog";

const VIA: Record<Consultant["joinedVia"], string> = { link: "Referral link", number: "Sponsor number", none: "No sponsor given" };

interface Check {
  state: "ok" | "warn" | "fail";
  text: string;
  detail?: string;
}

function applicationChecks(db: Db, c: Consultant): Check[] {
  const out: Check[] = [];
  const nic = parseNic(c.nic);
  if (!nic.valid) out.push({ state: "fail", text: "NIC number is not valid", detail: nic.message });
  else if (c.dob && nic.dob !== c.dob) out.push({ state: "warn", text: "Date of birth does not match the NIC", detail: `Given ${date(c.dob)}, the NIC says ${date(nic.dob)}` });
  else out.push({ state: "ok", text: "NIC is valid and the date of birth matches", detail: `${maskTail(c.nic, 4)} · born ${date(nic.dob)}` });
  const dup = duplicateCheck(db, { nic: c.nic, mobile: c.mobile, email: c.email }, c.id);
  out.push(dup ? { state: "fail", text: dup } : { state: "ok", text: "No other account uses this NIC, mobile or email" });
  const s = consultantById(db, c.sponsorId);
  if (!s) out.push({ state: "fail", text: "No sponsor on the application" });
  else if (s.status !== "active") out.push({ state: "fail", text: `Sponsor ${fullName(s)} is ${STATUS_LABEL[s.status].toLowerCase()}`, detail: "Change the sponsor before approving" });
  else out.push({ state: "ok", text: `Sponsor ${fullName(s)} (${consultantCode(s.number)}) is active` });
  const b = c.bank;
  if (b.accountNumber && b.bank && b.accountName && b.branch) out.push({ state: "ok", text: "Bank details given", detail: `${b.bank}, ${b.branch}, account ${maskedAccount(b.accountNumber)}. Finance verifies them before the first payout` });
  else out.push({ state: "warn", text: "Bank details are incomplete", detail: "Commission is held until they are given and verified" });
  out.push(
    c.consentShareWithSponsor
      ? { state: "ok", text: "Agreed to the terms, benefit plan and policy manual, and to share name and sales with the sponsor" }
      : { state: "warn", text: "Did not agree to share name and sales with the sponsor", detail: "Her sponsor will not see her in their team" },
  );
  return out;
}

type Tab = "pending" | "approved" | "rejected";

export function ApplicationsPage() {
  return (
    <Guard perms={["applications.view"]}>
      <Applications />
    </Guard>
  );
}

function Applications() {
  const L = useLabel();
  usePageTitle("Applications");
  const db = useDb();
  const now = useNow();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("pending");
  const rows = useMemo(() => {
    const all = db.consultants.filter((c) => c.number !== 1);
    if (tab === "pending") return all.filter((c) => c.status === "pending").sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));
    if (tab === "rejected") return all.filter((c) => c.status === "rejected");
    return all.filter((c) => c.number !== undefined).sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? ""));
  }, [db, tab]);
  const counts = {
    pending: db.consultants.filter((c) => c.status === "pending").length,
    rejected: db.consultants.filter((c) => c.status === "rejected").length,
  };
  const cols: Column<Consultant>[] = [
    {
      key: "name",
      header: "Applicant",
      cell: (c) => <ConsultantCell c={c} link={false} sub={c.appRef} />,
      value: (c) => `${fullName(c)} ${c.appRef}`,
    },
    { key: "applied", header: "Applied", cell: (c) => <span title={dateTime(c.appliedAt)}>{relative(c.appliedAt, now)}</span>, value: (c) => c.appliedAt },
    {
      key: "sponsor",
      header: "Sponsor",
      cell: (c) => {
        const s = consultantById(db, c.sponsorId);
        return s ? `${fullName(s)} (${consultantCode(s.number)})` : "None";
      },
      value: (c) => fullName(consultantById(db, c.sponsorId) ?? { givenName: "", surname: "" }),
    },
    { key: "via", header: "Came through", cell: (c) => VIA[c.joinedVia], value: (c) => VIA[c.joinedVia], hideOnMobile: true },
    {
      key: "checks",
      header: "Checks",
      cell: (c) => {
        const ch = applicationChecks(db, c);
        const bad = ch.filter((x) => x.state === "fail").length;
        const warn = ch.filter((x) => x.state === "warn").length;
        if (c.status !== "pending") return <span className="text-muted-foreground">Done</span>;
        return bad ? <StatusBadge tone="danger">{bad} failed</StatusBadge> : warn ? <StatusBadge tone="warning">{warn} to look at</StatusBadge> : <StatusBadge tone="success">All passed</StatusBadge>;
      },
    },
    {
      key: "status",
      header: tab === "approved" ? "Number" : "Status",
      cell: (c) => (tab === "approved" ? <span className="tabular font-medium">{consultantCode(c.number)}</span> : <Status>{STATUS_LABEL[c.status]}</Status>),
      value: (c) => (tab === "approved" ? c.number ?? 0 : c.status),
    },
  ];
  return (
    <div className="animate-rise">
      <PageHeader title="Applications" description={`People who applied to become a FemmeCare ${L.lower}. Approving issues a ${L.lower} number and sends the sign-in details.`} />
      <SimpleTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.id}
        rowHref={(c) => `/staff/applications/${c.id}`}
        onRowClick={(c) => nav(`/staff/applications/${c.id}`)}
        exportName={`applications-${tab}`}
        toolbar={
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "pending", label: "Waiting", count: counts.pending },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected", count: counts.rejected },
            ]}
          />
        }
        empty={
          <EmptyState
            icon={<UserPlus className="size-5" />}
            title={tab === "pending" ? "No applications waiting" : "Nothing here yet"}
            description={tab === "pending" ? `New applications from the website appear here, oldest first.` : undefined}
          />
        }
      />
    </div>
  );
}

export function ApplicationReviewPage() {
  return (
    <Guard perms={["applications.view"]}>
      <ApplicationReview />
    </Guard>
  );
}

function ApplicationReview() {
  const { id } = useParams();
  const db = useDb();
  const now = useNow();
  const L = useLabel();
  const c = db.consultants.find((x) => x.id === id);
  usePageTitle(c ? `Application ${c.appRef}` : "Application");
  const canDecide = useCan("applications.decide");
  const canSponsor = useCan("sponsor.change");
  const [reject, setReject] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [issued, setIssued] = useState<number>();
  const [showNic, setShowNic] = useState(false);
  if (!c || c.number === 1) return <NotFound />;
  const checks = applicationChecks(db, c);
  const failed = checks.filter((x) => x.state === "fail");
  const sponsor = consultantById(db, c.sponsorId);
  const events = c.statusHistory.map((h) => ({
    ts: h.ts,
    by: h.by,
    text: h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}${h.reason ? `: ${h.reason}` : ""}` : "Application received",
  }));
  const approve = () => {
    const r = actions.approveApplication(c.id);
    act(r);
    if (r.ok) {
      setConfirm(false);
      setIssued(db.consultants.reduce((m, x) => Math.max(m, x.number ?? 0), 0) + 1);
    }
  };
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/applications", label: "Applications" }}
        eyebrow={c.appRef}
        title={`${c.title ? `${c.title} ` : ""}${fullName(c)}`}
        description={`Applied ${dateTime(c.appliedAt)} (${relative(c.appliedAt, now)}) through ${VIA[c.joinedVia].toLowerCase()}`}
        actions={<Status>{STATUS_LABEL[c.status]}</Status>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Panel title="Personal details">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={fullName(c)} hue={c.avatarHue} size="lg" />
              <div>
                <div className="font-medium">{fullName(c)}</div>
                <div className="text-sm text-muted-foreground">{c.city}</div>
              </div>
            </div>
            <KeyValue
              items={[
                [
                  "NIC number",
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular">{showNic ? c.nic : maskTail(c.nic, 4)}</span>
                    {canDecide && (
                      <button type="button" onClick={() => setShowNic((v) => !v)} className="text-xs font-medium text-primary hover:underline">
                        {showNic ? "Hide" : "Show"}
                      </button>
                    )}
                  </span>,
                ],
                ["Date of birth", date(c.dob)],
                ["Home address", c.address],
                ["City and postal code", `${c.city} ${c.postalCode}`],
              ]}
            />
          </Panel>
          <Panel title="Contact">
            <KeyValue
              items={[
                ["Mobile", <span className="tabular">{c.mobile}</span>],
                ["Email", c.email],
                ["Office phone", c.officePhone],
                ["Home phone", c.homePhone],
              ]}
            />
          </Panel>
          <Panel title="Bank details" description="Shown masked. Finance sees the full number while verifying.">
            <KeyValue
              items={[
                ["Account name", c.bank.accountName],
                ["Account number", <span className="tabular">{maskedAccount(c.bank.accountNumber)}</span>],
                ["Bank", c.bank.bank],
                ["Branch", c.bank.branch],
              ]}
            />
          </Panel>
          <Panel
            title="Sponsor"
            actions={
              canSponsor && c.status === "pending" ? (
                <Button size="sm" variant="outline" onClick={() => setSponsorOpen(true)}>
                  Change sponsor
                </Button>
              ) : undefined
            }
          >
            {sponsor ? (
              <div className="flex items-center justify-between gap-3">
                <ConsultantCell c={sponsor} />
                <Status>{STATUS_LABEL[sponsor.status]}</Status>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No sponsor</p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="Automatic checks">
            <ul className="-my-2 divide-y divide-border/60">
              {checks.map((x, i) => (
                <CheckRow key={i} state={x.state} detail={x.detail}>
                  {x.text}
                </CheckRow>
              ))}
            </ul>
          </Panel>
          {c.status === "pending" && !issued && (
            <Panel title="Decision">
              {canDecide ? (
                <div className="space-y-3">
                  {failed.length > 0 && <p className="text-sm text-destructive">Resolve the failed check{failed.length > 1 ? "s" : ""} before approving, or reject with a reason.</p>}
                  <Button className="w-full" size="lg" disabled={failed.length > 0} onClick={() => setConfirm(true)}>
                    <BadgeCheck className="size-4" /> Approve and issue number
                  </Button>
                  <Button className="w-full" variant="destructive" onClick={() => setReject(true)}>
                    <UserX className="size-4" /> Reject
                  </Button>
                </div>
              ) : (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Eye className="mt-0.5 size-4 shrink-0" /> You can see this application. An Administrator approves or rejects it.
                </p>
              )}
            </Panel>
          )}
          {(issued || (c.status !== "pending" && c.number !== undefined)) && (
            <Panel>
              <div className="flex flex-col items-center py-2 text-center">
                <div className="animate-pop flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                  <BadgeCheck className="size-7" />
                </div>
                <div className="mt-3 text-sm text-muted-foreground">{L.one} number issued</div>
                <div className="font-display text-3xl font-semibold tabular">{consultantCode(c.number ?? issued)}</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Joined {date(c.joinedAt)}. Sign-in details went to {c.email} and {c.mobile}.
                </p>
                <Button className="mt-4" variant="outline" render={<Link to={`/staff/consultants/${c.id}`} />}>
                  Open profile
                </Button>
              </div>
            </Panel>
          )}
          {c.status === "rejected" && (
            <Panel title="Rejected">
              <p className="text-sm">{c.rejectReason}</p>
              <p className="mt-1 text-xs text-muted-foreground">The applicant was told by email and may apply again.</p>
            </Panel>
          )}
          <Panel title="History">
            <Timeline events={events} nameOf={(x) => actorName(db, x)} />
          </Panel>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {fullName(c)}?</DialogTitle>
            <DialogDescription>
              She gets the next {L.lower} number, can sign in, order at the {L.lower} price, and joins {sponsor ? `${fullName(sponsor)}'s` : "FemmeCare's"} team. We send her the sign-in details by email and SMS.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={approve}>Approve and issue number</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={reject}
        onOpenChange={setReject}
        title={`Reject ${fullName(c)}'s application`}
        description="The applicant receives this reason by email."
        confirmLabel="Reject application"
        destructive
        placeholder="For example: the NIC number did not match the name given"
        onConfirm={(reason) => {
          const r = actions.rejectApplication(c.id, reason);
          act(r, "Application rejected");
          return r.ok;
        }}
      />
      <ChangeSponsorDialog open={sponsorOpen} onOpenChange={setSponsorOpen} consultant={c} />
    </div>
  );
}
