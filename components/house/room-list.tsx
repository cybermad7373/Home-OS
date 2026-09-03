"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { MemberAvatar } from "@/components/ui/avatar";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatMoney, paiseToRupeeString } from "@/lib/utils/money";
import type { MemberView, RoomView } from "@/lib/types/domain";

/**
 * S-25 — rooms.
 *
 * A card per room with its rent and its occupants, and the per-person share of
 * that rent, which is the number people actually argue about.
 */
export function RoomList({
  rooms,
  members,
  currency,
  isAdmin,
}: {
  rooms: RoomView[];
  members: MemberView[];
  currency: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<RoomView | "new" | null>(null);
  const [assigning, setAssigning] = useState<RoomView | null>(null);
  const [busy, setBusy] = useState(false);

  const activeMembers = members.filter((member) => member.status === "active");
  const unhoused = activeMembers.filter((member) => !member.room);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast(payload?.error?.message ?? "That did not work", "danger");
      return false;
    }

    setEditing(null);
    setAssigning(null);
    startTransition(() => router.refresh());
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {isAdmin ? (
        <Button block onClick={() => setEditing("new")}>
          Add a room
        </Button>
      ) : null}

      {unhoused.length > 0 ? (
        <p className="caption-text text-warning">
          {unhoused.length}{" "}
          {unhoused.length === 1 ? "member has" : "members have"} no room. They
          are excluded from room-rent splits until they get one.
        </p>
      ) : null}

      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          body="Add every room with its rent, then put people in them. Rent splits use this."
          action={
            isAdmin ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                Add the first room
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {/* Rooms are objects too — a room card holding a rent and two occupants
          does not want to be 1100px wide. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const perPerson =
            room.occupants.length > 0
              ? Math.round(room.monthlyRentPaise / room.occupants.length)
              : room.monthlyRentPaise;

          return (
            <Card key={room.id}>
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{room.name}</CardTitle>
                  <p className="caption-text text-text-muted">
                    {room.occupants.length} of {room.capacity} ·{" "}
                    <span className="tabular">
                      {formatMoney(room.monthlyRentPaise, { currency })}
                    </span>{" "}
                    a month
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(room)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssigning(room)}
                    >
                      Assign
                    </Button>
                  </div>
                ) : null}
              </div>

              {room.occupants.length === 0 ? (
                <p className="caption-text text-text-subtle">
                  Vacant. Its rent is split equally across every active member.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {room.occupants.map((occupant) => (
                    <li
                      key={occupant.memberId}
                      className="flex items-center gap-2"
                    >
                      <MemberAvatar
                        name={occupant.displayName}
                        avatarUrl={occupant.avatarUrl}
                        size="sm"
                      />
                      <span className="flex-1 truncate">
                        {occupant.displayName}
                      </span>
                      <span className="caption-text tabular text-text-muted">
                        {formatMoney(perPerson, { currency })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {editing ? (
        <RoomSheet
          room={editing === "new" ? null : editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            editing === "new"
              ? send("/api/rooms", "POST", body)
              : send(`/api/rooms/${editing.id}`, "PATCH", body)
          }
          onDelete={
            editing === "new"
              ? undefined
              : () => send(`/api/rooms/${editing.id}`, "DELETE")
          }
        />
      ) : null}

      {assigning ? (
        <AssignSheet
          room={assigning}
          candidates={activeMembers}
          busy={busy}
          onClose={() => setAssigning(null)}
          onAssign={(memberId) =>
            send(`/api/rooms/${assigning.id}/assign`, "POST", {
              member_id: memberId,
            })
          }
        />
      ) : null}
    </div>
  );
}

function RoomSheet({
  room,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  room: RoomView | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 2));
  const [rent, setRent] = useState(
    room ? paiseToRupeeString(room.monthlyRentPaise) : "0.00",
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <BottomSheet open onClose={onClose} title={room ? room.name : "Add a room"}>
      <Field label="Name" htmlFor="room_name">
        <Input
          id="room_name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Front room"
        />
      </Field>

      <Field
        label="Capacity"
        htmlFor="room_capacity"
        hint="how many sleep here"
      >
        <Input
          id="room_capacity"
          type="number"
          min={1}
          max={10}
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
        />
      </Field>

      <Field label="Monthly rent" htmlFor="room_rent" hint="for the whole room">
        <Input
          id="room_rent"
          inputMode="decimal"
          value={rent}
          onChange={(event) => setRent(event.target.value)}
        />
      </Field>

      <Button
        block
        loading={busy}
        onClick={() =>
          onSave({ name, capacity: Number(capacity), monthly_rent: rent })
        }
      >
        Save room
      </Button>

      {onDelete ? (
        confirmingDelete ? (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-danger-bg p-3">
            <p className="caption-text mb-2 text-danger">
              Delete {room?.name}? Past rent splits keep it; it just stops being
              offered.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busy}
                onClick={onDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <Button
            block
            variant="ghost"
            className="mt-2 text-danger"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete room
          </Button>
        )
      ) : null}
    </BottomSheet>
  );
}

function AssignSheet({
  room,
  candidates,
  busy,
  onClose,
  onAssign,
}: {
  room: RoomView;
  candidates: MemberView[];
  busy: boolean;
  onClose: () => void;
  onAssign: (memberId: string) => Promise<boolean>;
}) {
  const occupantIds = new Set(
    room.occupants.map((occupant) => occupant.memberId),
  );
  const selectable = candidates.filter((member) => !occupantIds.has(member.id));
  const [memberId, setMemberId] = useState(selectable[0]?.id ?? "");
  const full = room.occupants.length >= room.capacity;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Move someone into ${room.name}`}
    >
      {full ? (
        <p className="caption-text mb-4 text-danger">
          {room.name} is at capacity ({room.occupants.length} of {room.capacity}
          ). Move somebody out first.
        </p>
      ) : null}

      {selectable.length === 0 ? (
        <p className="caption-text text-text-muted">
          Everybody active is already in this room.
        </p>
      ) : (
        <>
          <Field label="Member" htmlFor="assign_member">
            <Select
              id="assign_member"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              {selectable.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                  {member.room ? ` — currently in ${member.room.name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <p className="caption-text mb-4 text-text-muted">
            Their previous room assignment closes today, so this month splits
            proportionally by the days spent in each room.
          </p>

          <Button
            block
            loading={busy}
            disabled={full}
            onClick={() => onAssign(memberId)}
          >
            Move them in
          </Button>
        </>
      )}
    </BottomSheet>
  );
}
