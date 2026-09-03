"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { List, Section } from "@/components/layout/section";
import { Readout } from "@/components/ui/readout";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildDemand, totalPoints } from "@/lib/domain/scheduling/demand";
import { LastDoneLine } from "@/components/chores/last-done-line";
import type {
  ChoreCategory,
  ChoreFrequency,
  ChoreSlot,
  ChoreTemplateRow,
} from "@/lib/types/database";
import type { TemplateLastDone } from "@/lib/domain/chores/last-done";
import type { RoomView } from "@/lib/types/domain";

/**
 * S-29 — chore templates.
 *
 * The live panel is the point of this screen: change a number and see what it
 * does to everybody's weekly target immediately. A house that cannot see the
 * consequence of "30 points for cooking" will argue about it later instead.
 */

const CATEGORIES: { value: ChoreCategory; label: string }[] = [
  { value: "cooking", label: "Cooking" },
  { value: "kitchen_cleaning", label: "Kitchen" },
  { value: "bathroom_cleaning", label: "Bathroom" },
  { value: "room_cleaning", label: "Rooms" },
  { value: "common_cleaning", label: "Common areas" },
  { value: "mopping", label: "Mopping" },
  { value: "other", label: "Other" },
];

/** The descriptive anchors from the UI spec, so "25 points" means something. */
function pointsAnchor(points: number): string {
  if (points <= 7) return "a minute";
  if (points <= 18) return "quick";
  if (points <= 38) return "a real job";
  return "the worst one";
}

export function TemplateAdmin({
  templates,
  rooms,
  memberCount,
  weekStart,
  isAdmin,
}: {
  templates: (ChoreTemplateRow & TemplateLastDone)[];
  rooms: RoomView[];
  memberCount: number;
  weekStart: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<ChoreTemplateRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(() => {
    const active = templates.filter((template) => template.active);
    const instances = buildDemand({
      weekStart,
      templates: active.map((template) => ({
        id: template.id,
        name: template.name,
        effortPoints: template.effort_points,
        durationMin: template.duration_min,
        slot: template.slot,
        scope: template.scope,
        roomId: template.room_id,
        frequency: template.frequency,
        timesPerWeek: template.times_per_week,
        requiresCookingSkill: template.requires_cooking_skill,
        isHeavy: template.is_heavy,
      })),
      roomIds: rooms.map((room) => room.id),
    });

    const points = totalPoints(instances);
    return {
      points,
      instances: instances.length,
      perMember: memberCount > 0 ? Math.round(points / memberCount) : 0,
    };
  }, [templates, rooms, memberCount, weekStart]);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(
        payload?.error?.details?.fields
          ? (Object.values(payload.error.details.fields)[0] as string)
          : (payload?.error?.message ?? "That did not work"),
      );
      return false;
    }

    setEditing(null);
    toast("Saved.", "success");
    router.refresh();
    return true;
  }

  const byCategory = new Map<string, (ChoreTemplateRow & TemplateLastDone)[]>();
  for (const template of templates) {
    const list = byCategory.get(template.category) ?? [];
    list.push(template);
    byCategory.set(template.category, list);
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <p className="eyebrow-text mb-3">The weekly load</p>
        <Readout value={String(load.points)} size="lg" />
        <CardDescription className="mt-2">
          points a week, across {load.instances} chores.{" "}
          For {memberCount} {memberCount === 1 ? "person" : "people"}, that is about{" "}
          <span className="font-medium text-text">{load.perMember} points each</span> —
          roughly one substantial chore a day. If that looks wrong for your house, adjust
          the points rather than the people.
        </CardDescription>
      </Card>

      {isAdmin ? (
        <Button block onClick={() => setEditing("new")}>
          Add a chore
        </Button>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState
          title="No chores defined"
          body="Nothing can be scheduled until the house says what needs doing."
          action={
            isAdmin ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                Add the first one
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {[...byCategory.entries()].map(([category, list]) => (
        <Section
          key={category}
          label={CATEGORIES.find((entry) => entry.value === category)?.label ?? category}
        >
          <List>
              {list.map((template) => (
                <li
                  key={template.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {template.name}
                      {template.is_heavy ? <Badge>Heavy</Badge> : null}
                      {template.requires_cooking_skill ? <Badge>Cooks only</Badge> : null}
                      {template.active ? null : <Badge tone="neutral">Off</Badge>}
                    </p>
                    <p className="caption-text text-text-muted">
                      {template.effort_points} pts · {template.duration_min} min ·{" "}
                      {template.slot === "any" ? "any time" : template.slot} ·{" "}
                      {template.frequency === "times_per_week"
                        ? `${template.times_per_week}× a week`
                        : template.frequency}
                    </p>
                    <LastDoneLine
                      lastDoneAt={template.last_done_at}
                      lastDoneByName={template.last_done_by_name}
                    />
                  </div>
                  {isAdmin ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(template)}>
                      Edit
                    </Button>
                  ) : null}
                </li>
            ))}
          </List>
        </Section>
      ))}

      {editing ? (
        <TemplateSheet
          template={editing === "new" ? null : editing}
          rooms={rooms}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(body) =>
            editing === "new"
              ? send("/api/chores/templates", "POST", body)
              : send(`/api/chores/templates/${editing.id}`, "PATCH", body)
          }
          onDeactivate={
            editing === "new"
              ? undefined
              : () => send(`/api/chores/templates/${editing.id}`, "DELETE")
          }
        />
      ) : null}
    </div>
  );
}

function TemplateSheet({
  template,
  rooms,
  busy,
  onClose,
  onSave,
  onDeactivate,
}: {
  template: ChoreTemplateRow | null;
  rooms: RoomView[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
  onDeactivate?: () => Promise<boolean>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState<ChoreCategory>(template?.category ?? "other");
  const [points, setPoints] = useState(String(template?.effort_points ?? 15));
  const [duration, setDuration] = useState(String(template?.duration_min ?? 20));
  const [slot, setSlot] = useState<ChoreSlot>(template?.slot ?? "any");
  const [scope, setScope] = useState(template?.scope ?? "house");
  const [roomId, setRoomId] = useState(template?.room_id ?? rooms[0]?.id ?? "");
  const [frequency, setFrequency] = useState<ChoreFrequency>(
    template?.frequency ?? "weekly",
  );
  const [timesPerWeek, setTimesPerWeek] = useState(String(template?.times_per_week ?? 2));
  const [requiresCooking, setRequiresCooking] = useState(
    template?.requires_cooking_skill ?? false,
  );
  const [isHeavy, setIsHeavy] = useState(template?.is_heavy ?? false);

  return (
    <BottomSheet open onClose={onClose} title={template ? template.name : "New chore"}>
      <Field label="Name" htmlFor="chore_name">
        <Input
          id="chore_name"
          value={name}
          placeholder="Clean bathroom"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Category" htmlFor="chore_category">
        <Select
          id="chore_category"
          value={category}
          onChange={(event) => setCategory(event.target.value as ChoreCategory)}
        >
          {CATEGORIES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="mb-4">
        <label className="label-text mb-1.5 block" htmlFor="chore_points">
          Effort points
          <span className="ml-2 font-normal text-text-subtle">
            {points} — {pointsAnchor(Number(points))}
          </span>
        </label>
        <input
          id="chore_points"
          type="range"
          min={5}
          max={50}
          step={1}
          value={points}
          onChange={(event) => setPoints(event.target.value)}
          className="w-full accent-[var(--primary)]"
        />
        <p className="caption-text mt-1 text-text-muted">
          Points are the unit of fairness. Cooking dinner and wiping a table are not the
          same job, and counting them equally is what lets freeloading hide.
        </p>
      </div>

      <Field label="How long it takes" htmlFor="chore_duration" hint="minutes">
        <Input
          id="chore_duration"
          type="number"
          min={1}
          max={240}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </Field>

      <Field label="When" htmlFor="chore_slot">
        <Select
          id="chore_slot"
          value={slot}
          onChange={(event) => setSlot(event.target.value as ChoreSlot)}
        >
          <option value="any">Any time of day</option>
          <option value="morning">Morning</option>
          <option value="evening">Evening</option>
        </Select>
      </Field>

      <Field label="How often" htmlFor="chore_frequency">
        <Select
          id="chore_frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as ChoreFrequency)}
        >
          <option value="daily">Every day</option>
          <option value="weekly">Once a week</option>
          <option value="times_per_week">Several times a week</option>
        </Select>
      </Field>

      {frequency === "times_per_week" ? (
        <Field label="Times a week" htmlFor="chore_times">
          <Input
            id="chore_times"
            type="number"
            min={1}
            max={7}
            value={timesPerWeek}
            onChange={(event) => setTimesPerWeek(event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Scope" htmlFor="chore_scope">
        <Select
          id="chore_scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as "house" | "room")}
        >
          <option value="house">The whole house</option>
          <option value="room">One room — its occupants only</option>
        </Select>
      </Field>

      {scope === "room" ? (
        <Field label="Room" htmlFor="chore_room">
          <Select
            id="chore_room"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="label-text">Only people who can cook</span>
        <Button
          type="button"
          size="sm"
          variant={requiresCooking ? "primary" : "outline"}
          aria-pressed={requiresCooking}
          onClick={() => setRequiresCooking((value) => !value)}
        >
          {requiresCooking ? "Yes" : "No"}
        </Button>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="label-text">
          Heavy
          <span className="ml-1 font-normal text-text-subtle">
            — not the same person two weeks running
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant={isHeavy ? "primary" : "outline"}
          aria-pressed={isHeavy}
          onClick={() => setIsHeavy((value) => !value)}
        >
          {isHeavy ? "Yes" : "No"}
        </Button>
      </div>

      <Button
        block
        loading={busy}
        onClick={() =>
          onSave({
            name,
            category,
            effort_points: Number(points),
            duration_min: Number(duration),
            slot,
            scope,
            room_id: scope === "room" ? roomId : null,
            frequency,
            times_per_week: frequency === "times_per_week" ? Number(timesPerWeek) : null,
            requires_cooking_skill: requiresCooking,
            is_heavy: isHeavy,
          })
        }
      >
        Save
      </Button>

      {onDeactivate ? (
        <>
          <Button
            block
            variant="ghost"
            className="mt-2 text-danger"
            loading={busy}
            onClick={onDeactivate}
          >
            Stop scheduling this
          </Button>
          <p className="caption-text mt-2 text-text-muted">
            It stops appearing in new weeks. Everything already assigned or confirmed
            stays exactly as it is.
          </p>
        </>
      ) : null}
    </BottomSheet>
  );
}
