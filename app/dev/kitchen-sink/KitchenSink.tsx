"use client";

import { useState } from "react";
import { CheckSquare, IndianRupee, Sun, UtensilsCrossed } from "lucide-react";
import {
  Alert,
  Badge,
  BarChart,
  Button,
  Card,
  CardShell,
  Chip,
  ChipRow,
  ColumnChart,
  ConfirmDialog,
  DataList,
  DefinitionList,
  Dialog,
  EmptyState,
  Input,
  Legend,
  Meter,
  Segmented,
  Select,
  ShareBar,
  Skeleton,
  Sparkline,
  Readout,
  Stat,
  StatRow,
  Switch,
  SwitchRow,
  Tabs,
  Textarea,
} from "@/components/ui";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { formatMoney } from "@/lib/utils/money";

const CATEGORIES = [
  { label: "Groceries", value: 612_400 },
  { label: "Utilities", value: 312_600 },
  { label: "Maid", value: 250_000 },
  { label: "Eating out", value: 205_500 },
  { label: "Gas", value: 95_500 },
  { label: "Internet", value: 89_900 },
];

const WEEK = [
  { label: "Mon", value: 42 },
  { label: "Tue", value: 55 },
  { label: "Wed", value: 30 },
  { label: "Thu", value: 68 },
  { label: "Fri", value: 51 },
  { label: "Sat", value: 20, tone: "negative" as const },
  { label: "Sun", value: 74, tone: "positive" as const },
];

interface MemberRow {
  id: string;
  name: string;
  room: string;
  points: number;
  net: number;
}

const MEMBERS: MemberRow[] = [
  { id: "1", name: "Ravi Kumar", room: "Front room", points: 305, net: 128_400 },
  { id: "2", name: "Kumar S", room: "Front room", points: 280, net: -46_200 },
  { id: "3", name: "Vinoth R", room: "Middle room", points: 195, net: -12_050 },
  { id: "4", name: "Sathish B", room: "Back room", points: 90, net: -70_150 },
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <div>
        <h2 className="title-text">{title}</h2>
        {note ? <p className="caption-text mt-1 text-text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function KitchenSink() {
  const [tab, setTab] = useState("chores");
  const [range, setRange] = useState<"day" | "week" | "month">("week");
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [confirm, setConfirm] = useState(false);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow-text">HouseOS design system 3.0 · monochrome</p>
          <h1 className="display-xl mt-2">KITCHEN SINK</h1>
          <p className="mt-3 max-w-[62ch] text-text-muted">
            The interface is black and white. The only colour in the entire app is your
            money — green means the house owes you, red means you owe the house. Flip the
            theme and read it again; anything that only works in one of them is a bug, and
            this is where it shows.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section
        title="Colour"
        note="The brand is ink. Only three hues exist, and all three are about money."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Ink · brand", "bg-primary", "text-primary-fg"],
            ["Surface 2", "bg-surface-2", "text-text"],
            ["Surface 3", "bg-surface-3", "text-text"],
            ["Accent · rare", "bg-accent", "text-accent-fg"],
            ["Owed to you", "bg-success", "text-white"],
            ["You owe", "bg-danger", "text-white"],
            ["Waiting", "bg-warning", "text-white"],
            ["Info · plain", "bg-info-bg", "text-text"],
          ].map(([name, bg, fg]) => (
            <div key={name} className={`rounded-[var(--radius-md)] border border-border p-4 ${bg} ${fg}`}>
              <p className="text-[13px] font-medium">{name}</p>
            </div>
          ))}
        </div>
        <p className="rule-label eyebrow-text">Chart ramp · greyscale</p>
        <Legend
          items={Array.from({ length: 8 }, (_, index) => ({
            label: `chart-${index + 1}`,
            color: `var(--chart-${index + 1})`,
          }))}
        />
      </Section>

      <Section
        title="Type"
        note="Geist reads, Geist Mono counts, Doto is the readout. A headline number is a dot matrix because that is what it is — an instrument reading, not a sentence."
      >
        <div className="flex flex-col gap-3">
          <Readout value="₹1,24,850" size="xl" />
          <Readout value="₹1,24,850" size="lg" />
          <Readout value="305 pts" size="md" />
          <p className="title-text">Title — where the Home stands</p>
          <p className="heading-text">Heading — this week&rsquo;s effort</p>
          <p>Body — the house completed 85% of assigned chores this week.</p>
          <p className="label-text">Label — paid by</p>
          <p className="caption-text text-text-muted">Caption — updated four minutes ago</p>
          <p className="eyebrow-text">Eyebrow — outstanding</p>
        </div>
      </Section>

      <Section
        title="Elevation"
        note="Only three things float, and all three are temporary. Everything else is a hairline."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          {["elev-1", "elev-2", "elev-3", "elev-4"].map((level) => (
            <div
              key={level}
              className="rounded-[var(--radius-lg)] border border-border bg-surface p-5"
              style={{ boxShadow: `var(--${level})` }}
            >
              <p className="caption-text text-text-muted">{level}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Log an expense</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Remove Deepak</Button>
          <Button variant="success">Mark it done</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </div>
        <Button block>Full width</Button>
      </Section>

      <Section title="Badges and chips">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success">Confirmed</Badge>
          <Badge tone="warning">Waiting on you</Badge>
          <Badge tone="danger">Missed</Badge>
          <Badge tone="info">Rota</Badge>
          <Badge tone="primary">Critical</Badge>
        </div>
        <ChipRow label="Filter">
          {[
            ["all", "Everything", 34],
            ["mine", "Mine", 6],
            ["waiting", "Waiting on me", 2],
            ["done", "Done", 26],
          ].map(([id, label, count]) => (
            <Chip
              key={id as string}
              selected={filter === id}
              count={count as number}
              onClick={() => setFilter(id as string)}
            >
              {label as string}
            </Chip>
          ))}
        </ChipRow>
      </Section>

      <Section title="Navigation">
        <Tabs
          items={[
            { id: "chores", label: "Chores", count: 6 },
            { id: "money", label: "Money", count: 2 },
            { id: "food", label: "Food" },
            { id: "decisions", label: "Decisions", count: 0 },
          ]}
          active={tab}
          onChange={setTab}
        />
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
      </Section>

      <Section title="Numbers" note="The tile, the meter and the sparkline.">
        <StatRow>
          <Stat label="Spent this month" value={formatMoney(1_566_900)} sub="₹1,80,000 budget" tone="neutral">
            <Meter value={1_566_900} max={1_800_000} />
          </Stat>
          <Stat label="You are owed" value={formatMoney(128_400)} tone="positive" sub="From 3 people" />
          <Stat label="You owe" value={formatMoney(46_200)} tone="negative" sub="To Ravi" />
          <Stat label="Your points" value="305" tone="brand" sub="of 260 this week">
            <Sparkline points={[180, 210, 240, 190, 260, 280, 305]} />
          </Stat>
        </StatRow>
      </Section>

      <Section title="Charts" note="Server-rendered SVG. One palette, one grid weight, both themes.">
        <div className="grid gap-6 lg:grid-cols-2">
          <CardShell>
            <p className="heading-text mb-3">Where the month went</p>
            <BarChart data={CATEGORIES} format={formatMoney} />
          </CardShell>
          <CardShell>
            <p className="heading-text mb-3">Share of spend</p>
            <ShareBar data={CATEGORIES.slice(0, 4)} format={formatMoney} />
            <div className="mt-6">
              <p className="heading-text mb-3">Points this week</p>
              <ColumnChart data={WEEK} format={(value) => String(value)} />
            </div>
          </CardShell>
        </div>
      </Section>

      <Section title="Lists" note="A table on a laptop, a stack of rows on a phone. Resize to check.">
        <DataList
          rows={MEMBERS}
          rowKey={(row) => row.id}
          caption="Members, their room and their standing"
          columns={[
            {
              key: "name",
              header: "Member",
              priority: "primary",
              render: (row) => <span className="font-medium">{row.name}</span>,
            },
            { key: "room", header: "Room", priority: "meta", render: (row) => row.room },
            {
              key: "points",
              header: "Points",
              priority: "meta",
              render: (row) => <span className="tabular">{row.points}</span>,
            },
            {
              key: "net",
              header: "Net",
              numeric: true,
              render: (row) => (
                <span className={row.net >= 0 ? "text-success" : "text-danger"}>
                  {row.net >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(row.net))}
                </span>
              ),
            },
          ]}
        />
        <Card>
          <DefinitionList
            items={[
              { label: "Home", value: "Anna Nagar Boys" },
              { label: "Shape", value: "Shared · points · split" },
              { label: "Members", value: "8 active, 1 waiting" },
              { label: "Rent", value: formatMoney(2_500_000), hint: "Split by room" },
            ]}
          />
        </Card>
      </Section>

      <Section title="Forms">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Amount" placeholder="0" inputMode="decimal" prefix="₹" />
          <Input label="Description" placeholder="Weekly vegetables" />
          <Select label="Category" defaultValue="groceries">
            <option value="groceries">Groceries</option>
            <option value="utilities">Utilities</option>
          </Select>
          <Input label="With an error" error="Enter an amount above zero" defaultValue="0" />
        </div>
        <Textarea label="Note" placeholder="Anything the house should know" rows={3} />

        {/* The one on/off control. Four different ones were in the app before
            it: a Button labelled "On", a Button labelled "Yes", and two native
            checkboxes tinted through two different token names. */}
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <SwitchRow
            label="Chore reminders"
            help="Before a window opens, and again before the deadline"
            checked={reminders}
            onChange={setReminders}
          />
          <SwitchRow
            label="Weekly digest"
            help="Disabled — the row still says where the setting stands"
            checked={false}
            disabled
          />
          <SwitchRow
            locked
            label="Settlement"
            help="Cannot be turned off, and says so rather than hiding"
          />
        </ul>
        <div className="mt-3 flex items-center gap-3">
          <Switch label="On its own" checked={reminders} onChange={setReminders} />
          <span className="caption-text text-text-muted">
            the control on its own, outside a row
          </span>
        </div>
      </Section>

      <Section title="Feedback">
        <Alert tone="info" title="Rent posts on the 1st">
          It is a recurring expense, so nobody has to remember it.
        </Alert>
        <Alert tone="warning" title="One expense is waiting on you">
          Kumar logged ₹3,126 for electricity. It needs somebody other than the payer.
        </Alert>
        <Alert tone="danger" title="The August period is closed">
          Post this as an adjustment, or ask an admin to reopen it.
        </Alert>
        <Alert tone="success" title="Settled">
          Ravi confirmed your ₹462 transfer.
        </Alert>
      </Section>

      <Section title="Empty and loading">
        <EmptyState
          title="No chores are set up yet"
          body="A house needs its chore list before anything can be scheduled. The defaults cover most houses and take a minute to adjust."
          action={<Button size="sm">Set up the chore list</Button>}
        />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog(true)}>
            Open a dialog
          </Button>
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Open a confirm
          </Button>
        </div>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Reopen August?"
          description="Everything already settled stays settled. New expenses land as adjustments."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialog(false)}>Ask the house</Button>
            </>
          }
        >
          <p className="text-text-muted">
            Reopening is a Critical decision, so it needs the house to agree rather than one
            admin to decide.
          </p>
        </Dialog>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => setConfirm(false)}
          title="Remove Deepak from this home?"
          description="His share of the open month is settled first. This cannot be undone."
          confirmLabel="Remove Deepak"
          destructive
        />
      </Section>

      <Section
        title="Structure"
        note="The frame, made visible: a dot grid and a labelled rule."
      >
        <div className="dot-grid-lg h-24 rounded-[var(--radius-lg)] border border-border" />
        <p className="rule-label eyebrow-text">Section break</p>
      </Section>

      <Section title="Icons" note="One set, lucide. Phosphor was installed and never used; it is gone.">
        <div className="flex gap-4 text-text-muted">
          <Sun size={20} />
          <CheckSquare size={20} />
          <IndianRupee size={20} />
          <UtensilsCrossed size={20} />
        </div>
      </Section>
    </main>
  );
}
