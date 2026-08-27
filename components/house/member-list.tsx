"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { MemberAvatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { RESIDENCY_LABEL, type MemberView } from "@/lib/types/domain";
import type { ResidencyType } from "@/lib/types/database";

/**
 * S-24 — members.
 *
 * Pending joiners are pinned at the top with Approve and Decline, because a
 * request nobody notices is the same as a refusal.
 */
export function MemberList({
  members,
  isAdmin,
  currentMemberId,
  isFamily,
}: {
  members: MemberView[];
  isAdmin: boolean;
  currentMemberId: string;
  /** Changes the wording only. A shared flat can have dependents too. */
  isFamily: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<MemberView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingDependent, setAddingDependent] = useState(false);

  async function patchMember(member: MemberView, body: Record<string, unknown>) {
    setBusyId(member.id);
    const response = await fetch(`/api/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return false;
    }

    setEditing(null);
    startTransition(() => router.refresh());
    return true;
  }

  const waiting = members.filter((member) => member.status === "requested");
  const active = members.filter(
    (member) => member.status === "active" && member.kind === "adult",
  );
  const dependents = members.filter(
    (member) => member.status === "active" && member.kind === "dependent",
  );
  const inactive = members.filter((member) => member.status === "inactive");

  const nameOf = (memberId: string | null) =>
    members.find((member) => member.id === memberId)?.displayName ?? "nobody";

  async function removeDependent(member: MemberView) {
    setBusyId(member.id);
    const response = await fetch(`/api/members/dependents/${member.id}`, {
      method: "DELETE",
    });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return;
    }
    toast(`${member.displayName} removed.`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      {waiting.length > 0 ? (
        <section>
          <h2 className="heading-text mb-2">
            Waiting to join
            <span className="ml-2 text-text-muted">{waiting.length}</span>
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {waiting.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.displayName}</p>
                    <p className="caption-text truncate text-text-muted">
                      {member.username ? `@${member.username}` : member.email}
                    </p>
                  </div>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busyId === member.id}
                        onClick={async () => {
                          const ok = await patchMember(member, { status: "inactive" });
                          if (ok) toast(`${member.displayName} declined.`);
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        loading={busyId === member.id}
                        onClick={async () => {
                          const ok = await patchMember(member, { status: "active" });
                          if (ok) toast(`${member.displayName} is in.`, "success");
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  ) : (
                    <Badge tone="warning">Pending</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="heading-text mb-2">Members</h2>
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {active.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <MemberAvatar
                  name={member.displayName}
                  avatarUrl={member.avatarUrl}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {member.displayName}
                    {member.id === currentMemberId ? (
                      <span className="caption-text text-text-subtle"> · you</span>
                    ) : null}
                  </p>
                  <p className="caption-text text-text-muted">
                    {member.username ? `@${member.username} · ` : ""}
                    {member.room?.name ?? "No room"} · {RESIDENCY_LABEL[member.residency]}
                    {member.canCook ? " · cooks" : ""}
                  </p>
                </div>
                {member.role === "admin" ? <Badge tone="primary">Admin</Badge> : null}
                {isAdmin ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(member)}>
                    Edit
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="heading-text mb-2">
          {isFamily ? "Children and dependents" : "Dependents"}
        </h2>
        <CardDescription className="mb-2">
          People who live here and have no account of their own. They count as a
          head when the shopping is split, and their share sits on whoever looks
          after them.
        </CardDescription>

        {dependents.length > 0 ? (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {dependents.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                  <MemberAvatar name={member.displayName} avatarUrl={null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{member.displayName}</p>
                    <p className="caption-text text-text-muted">
                      {member.sharesCost
                        ? "Pays their own share"
                        : `Billed to ${nameOf(member.guardianMemberId)}`}
                      {member.doesChores ? " · does chores" : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busyId === member.id}
                      onClick={() => removeDependent(member)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {isAdmin ? (
          <Button
            variant="outline"
            block
            className={dependents.length > 0 ? "mt-2" : undefined}
            onClick={() => setAddingDependent(true)}
          >
            Add someone without an account
          </Button>
        ) : null}
      </section>

      {inactive.length > 0 ? (
        <section>
          <h2 className="heading-text mb-2">Former members</h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {inactive.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                  <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-text-muted">{member.displayName}</p>
                    <p className="caption-text text-text-subtle">
                      Left {member.leftDate ?? "—"}
                    </p>
                  </div>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyId === member.id}
                      onClick={() => patchMember(member, { status: "active" })}
                    >
                      Reactivate
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {editing ? (
        <EditMemberSheet
          member={editing}
          busy={busyId === editing.id || pending}
          onClose={() => setEditing(null)}
          onSave={(body) => patchMember(editing, body)}
        />
      ) : null}

      {addingDependent ? (
        <AddDependentSheet
          candidates={active}
          isFamily={isFamily}
          onClose={() => setAddingDependent(false)}
          onSaved={() => {
            setAddingDependent(false);
            startTransition(() => router.refresh());
          }}
          onError={(message) => toast(message, "danger")}
        />
      ) : null}
    </div>
  );
}

/**
 * Adding a resident who will never log in.
 *
 * The guardian is the load-bearing field: it decides whose bill this person
 * lands on. It is required unless they pay their own way, and the database
 * refuses the row without it, so the two cannot drift apart.
 */
function AddDependentSheet({
  candidates,
  isFamily,
  onClose,
  onSaved,
  onError,
}: {
  candidates: MemberView[];
  isFamily: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [guardianId, setGuardianId] = useState(candidates[0]?.id ?? "");
  const [sharesCost, setSharesCost] = useState(false);
  const [doesChores, setDoesChores] = useState(false);
  const [residency, setResidency] = useState<ResidencyType>("full_time");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);

    const response = await fetch("/api/members/dependents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        guardian_member_id: sharesCost ? undefined : guardianId,
        shares_cost: sharesCost,
        does_chores: doesChores,
        residency,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      onError(payload?.error?.message ?? "That did not work");
      return;
    }
    onSaved();
  }

  return (
    <BottomSheet
      open
      title={isFamily ? "Add a child or dependent" : "Add a dependent"}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="dependent-name">
          <Input
            id="dependent-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={isFamily ? "Meera" : "Ajith's mother"}
            autoFocus
          />
        </Field>

        <label className="mb-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={sharesCost}
            onChange={(event) => setSharesCost(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="caption-text">
            They pay their own share of the shopping
          </span>
        </label>

        {!sharesCost ? (
          <Field
            label="Whose bill are they on?"
            htmlFor="dependent-guardian"
            hint="their share of every split lands here"
          >
            <Select
              id="dependent-guardian"
              value={guardianId}
              onChange={(event) => setGuardianId(event.target.value)}
            >
              {candidates.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <label className="mb-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={doesChores}
            onChange={(event) => setDoesChores(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="caption-text">
            Give them chores — they will appear on the schedule and somebody with
            an account marks the work done for them
          </span>
        </label>

        <Field label="How often are they here?" htmlFor="dependent-residency">
          <Select
            id="dependent-residency"
            value={residency}
            onChange={(event) => setResidency(event.target.value as ResidencyType)}
          >
            {(Object.keys(RESIDENCY_LABEL) as ResidencyType[]).map((value) => (
              <option key={value} value={value}>
                {RESIDENCY_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Button
          type="submit"
          block
          loading={saving}
          disabled={name.trim().length === 0 || (!sharesCost && !guardianId)}
        >
          Add them
        </Button>
      </form>
    </BottomSheet>
  );
}

function EditMemberSheet({
  member,
  busy,
  onClose,
  onSave,
}: {
  member: MemberView;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  // A Requested member has no role and is never editable here, so "member"
  // is only ever the starting value of a control the caller will not see.
  const [role, setRole] = useState(member.role ?? "member");
  const [residency, setResidency] = useState<ResidencyType>(member.residency);
  const [canCook, setCanCook] = useState(member.canCook);

  return (
    <BottomSheet open onClose={onClose} title={member.displayName}>
      <div className="mb-4">
        <label className="label-text mb-1.5 block" htmlFor="role">
          Role
        </label>
        <Select
          id="role"
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
        >
          <option value="member">Member</option>
          <option value="co_admin">Co-admin</option>
          <option value="admin">Admin</option>
        </Select>
      </div>

      <div className="mb-4">
        <label className="label-text mb-1.5 block" htmlFor="residency">
          Residency
        </label>
        <Select
          id="residency"
          value={residency}
          onChange={(event) => setResidency(event.target.value as ResidencyType)}
        >
          {Object.entries(RESIDENCY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="label-text">Can cook a full meal</span>
        <Button
          type="button"
          variant={canCook ? "primary" : "outline"}
          size="sm"
          aria-pressed={canCook}
          onClick={() => setCanCook((value) => !value)}
        >
          {canCook ? "Yes" : "No"}
        </Button>
      </div>

      <Button
        block
        loading={busy}
        onClick={() => onSave({ role, residency, can_cook: canCook })}
      >
        Save
      </Button>

      <Button
        block
        variant="ghost"
        className="mt-2 text-danger"
        loading={busy}
        onClick={() => onSave({ status: "inactive" })}
      >
        Deactivate member
      </Button>
      <p className="caption-text mt-2 text-text-muted">
        Deactivating keeps every expense, split and assignment they were part of. It only
        stops new ones.
      </p>
    </BottomSheet>
  );
}
