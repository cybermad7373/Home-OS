import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ChefHat,
  ClipboardList,
  Coins,
  DoorOpen,
  Gamepad2,
  Home,
  IndianRupee,
  ListChecks,
  type LucideIcon,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Sun,
  Tags,
  UserCircle,
  Users,
  UtensilsCrossed,
  Vote,
} from "lucide-react";

/**
 * Every destination in the app, once.
 *
 * Before this file there were three navigations that did not agree: a bottom
 * bar, a sidebar of thirty plain links in seven groups, and `/more` as a single
 * ungrouped column of twenty-two cards. Food was a tab, a sidebar group and a
 * More card — three routes to the same screen, which teaches people that the
 * menu is not worth reading.
 *
 * Now the bar, the sidebar, More and the command palette all render from here,
 * so a destination cannot appear in two of them with different words or be
 * missing from one of them by accident.
 *
 * Two ideas hold the structure:
 *
 * **The bar never changes.** Six fixed slots. The old bar swapped Insights for
 * Approvals whenever something was pending, which meant the control under your
 * thumb moved depending on the state of the house. Approvals lives in the
 * header now, next to notifications, where "waiting on you" belongs.
 *
 * **Everything else is grouped by the question it answers**, not by the module
 * that owns it. "When am I around" and "who is staying" are the same question
 * to a person and live in the same group, even though one is availability and
 * one is guests.
 */

export interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line, shown on More. Says what the screen is *for*, not what it contains. */
  blurb?: string;
  /** Hidden unless the predicate passes. */
  when?: (shape: HomeShape) => boolean;
  /** Which count, if any, this destination shows. */
  badge?: "approvals" | "notifications";
  /** Words a search should match beyond the label. */
  keywords?: string[];
}

export interface HomeShape {
  isPot: boolean;
  isRota: boolean;
  isAdmin: boolean;
  isLead: boolean;
  isFamily: boolean;
  gameLayer: boolean;
  hasDependents: boolean;
}

export interface DestinationGroup {
  heading: string;
  /** Shown under the heading on More. */
  note?: string;
  items: Destination[];
  when?: (shape: HomeShape) => boolean;
}

/**
 * The six fixed slots. Add is not here — it is a control rather than a place,
 * and it is rendered by the bar itself.
 */
export const PRIMARY: Destination[] = [
  { href: "/home", label: "Home", icon: Home, keywords: ["overview", "house", "standing"] },
  { href: "/today", label: "Today", icon: Sun, keywords: ["now", "agenda", "day"] },
  { href: "/chores", label: "Chores", icon: CheckSquare, keywords: ["work", "rota", "schedule"] },
  { href: "/expenses", label: "Money", icon: IndianRupee, keywords: ["expenses", "spend", "ledger"] },
  { href: "/food", label: "Food", icon: UtensilsCrossed, keywords: ["meals", "eat", "cook"] },
  { href: "/insights", label: "Insights", icon: BarChart3, keywords: ["analytics", "reports", "trends"] },
];

/**
 * The two things that can be waiting on you. They sit in the header rather than
 * in the bar, so the bar is the same six controls on every screen in every
 * state — and so the count is visible from every screen rather than only from
 * the one that happens to be showing the tab.
 */
export const WAITING: Destination[] = [
  {
    href: "/more/approvals",
    label: "Approvals",
    icon: ShieldCheck,
    badge: "approvals",
    blurb: "Everything the house is asking you to decide, in one queue",
    keywords: ["decide", "waiting", "queue", "vote"],
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    badge: "notifications",
    blurb: "Everything the house has told you",
    keywords: ["alerts", "inbox", "activity"],
  },
];

export const GROUPS: DestinationGroup[] = [
  {
    heading: "Your week",
    note: "What you owe the house, and when you are around to give it",
    items: [
      {
        href: "/chores/mine",
        label: "My chores",
        icon: ListChecks,
        blurb: "Only yours, today first",
        keywords: ["mine", "todo"],
      },
      {
        href: "/chores/dependents",
        label: "Dependents' chores",
        icon: Users,
        blurb: "The children in your care, and what they have been given",
        when: (shape) => shape.hasDependents,
        keywords: ["children", "kids", "guardian"],
      },
      {
        href: "/chores/standing",
        label: "House standing",
        icon: BarChart3,
        blurb: "Who is carrying the house, and who is coasting",
        // A rota household has asked not to be scored, so the screen would
        // show numbers it has declined to keep.
        when: (shape) => !shape.isRota,
        keywords: ["leaderboard", "points", "fairness"],
      },
      {
        href: "/house/availability",
        label: "My week",
        icon: CalendarDays,
        blurb: "When the house can call on you, and when it cannot",
        keywords: ["availability", "hours", "free"],
      },
      {
        href: "/house/away",
        label: "Away days",
        icon: Plane,
        blurb: "Declare a day off — the schedule moves, and so does your target",
        keywords: ["absence", "holiday", "leave"],
      },
      {
        href: "/more/calendar",
        label: "Calendar",
        icon: CalendarDays,
        blurb: "Chores, money, food and decisions on one timeline",
        keywords: ["month", "week", "timeline"],
      },
    ],
  },
  {
    heading: "Money",
    note: "The ledger, and the arrangements behind it",
    items: [
      {
        href: "/settle",
        label: "Settle up",
        icon: Coins,
        blurb: "Who pays whom this month, and what is confirmed",
        // A pot household nets nothing between members, so this screen could
        // only ever say "nobody owes anybody".
        when: (shape) => !shape.isPot,
        keywords: ["pay", "transfer", "upi", "owe"],
      },
      {
        href: "/money/daily",
        label: "Running cost",
        icon: Receipt,
        blurb: "What the house costs a day, and whether that is more than it means to",
        keywords: ["daily", "burn", "budget"],
      },
      {
        href: "/expenses/approvals",
        label: "Expense approvals",
        icon: ShieldCheck,
        blurb: "Expenses waiting on somebody other than the payer",
        keywords: ["approve", "pending"],
      },
      {
        href: "/expenses/recurring",
        label: "Recurring",
        icon: Repeat,
        blurb: "Rent, the bill and the maid, posted automatically",
        keywords: ["rent", "monthly", "automatic"],
      },
      {
        href: "/house/categories",
        label: "Categories and budgets",
        icon: Tags,
        blurb: "What the house buys, and what it means to spend on each",
        keywords: ["budget", "category", "limit"],
      },
      {
        href: "/expenses/close",
        label: "Close the month",
        icon: PiggyBank,
        blurb: "Lock the month and work out who owes whom",
        when: (shape) => shape.isLead,
        keywords: ["close", "period", "month end"],
      },
    ],
  },
  {
    heading: "Food",
    note: "What the house eats, and what it costs",
    items: [
      {
        href: "/food/library",
        label: "Library",
        icon: ChefHat,
        blurb: "Everything the house cooks, and how often",
        keywords: ["dishes", "recipes"],
      },
      {
        href: "/food/shopping",
        label: "Shopping list",
        icon: ShoppingCart,
        blurb: "What to buy, and what somebody already picked up",
        keywords: ["buy", "groceries"],
      },
      {
        href: "/food/history",
        label: "Meal history",
        icon: ClipboardList,
        blurb: "What was eaten, by whom, and what it cost each of them",
        keywords: ["meals", "past"],
      },
      {
        href: "/food/preferences",
        label: "Preferences",
        icon: Sparkles,
        blurb: "Likes, dislikes, allergies and what nobody will touch",
        keywords: ["allergy", "diet", "restriction"],
      },
    ],
  },
  {
    heading: "The home",
    note: "Who lives here, and what has been agreed",
    items: [
      {
        href: "/more/decisions",
        label: "Decisions",
        icon: Vote,
        blurb: "Everything the house has been asked, and how it answered",
        keywords: ["vote", "governance", "history"],
      },
      {
        href: "/more/rules",
        label: "House rules",
        icon: ScrollText,
        blurb: "What this home agreed, in its own words — and every version of it",
        keywords: ["rules", "agreement"],
      },
      {
        href: "/house/members",
        label: "Members",
        icon: Users,
        blurb: "Everyone who lives here, accounts and dependents alike",
        keywords: ["people", "housemates", "flatmates"],
      },
      {
        href: "/house/rooms",
        label: "Rooms",
        icon: DoorOpen,
        blurb: "Rooms, rent and who sleeps where",
        keywords: ["room", "rent", "bed"],
      },
      {
        href: "/house/guests",
        label: "Guests",
        icon: UserCircle,
        blurb: "Who is staying, and whose bill and chores they are",
        keywords: ["visitor", "staying"],
      },
      {
        href: "/homes",
        label: "My homes",
        icon: Home,
        blurb: "Every home you belong to, and requests you have out",
        keywords: ["switch", "join", "another"],
      },
      {
        href: "/more/game",
        label: "Game layer",
        icon: Gamepad2,
        blurb: "Streaks, badges and game points",
        when: (shape) => shape.gameLayer,
        keywords: ["streak", "badge", "points"],
      },
    ],
  },
  {
    heading: "You",
    items: [
      {
        href: "/onboarding/profile",
        label: "My profile",
        icon: UserCircle,
        blurb: "Cooking, UPI ID, your room",
        keywords: ["me", "upi", "account"],
      },
      {
        href: "/house/notifications",
        label: "Notification settings",
        icon: Bell,
        blurb: "What reaches you, quiet hours, and which devices",
        keywords: ["quiet", "push", "device"],
      },
    ],
  },
  {
    heading: "Admin",
    note: "Only leads see this",
    when: (shape) => shape.isAdmin,
    items: [
      {
        href: "/admin/chores",
        label: "Chore list",
        icon: ListChecks,
        blurb: "What needs doing, and what each job is worth",
        keywords: ["templates", "chores", "setup"],
      },
      {
        href: "/admin/schedule",
        label: "Schedule runs",
        icon: CalendarDays,
        blurb: "Generate a week, and see how past ones were produced",
        keywords: ["generate", "week", "rota"],
      },
      {
        href: "/admin/settings",
        label: "House settings",
        icon: Settings,
        blurb: "Penalty rate, thresholds, invite code, AI",
        keywords: ["settings", "config", "invite", "ai"],
      },
      {
        href: "/admin/settings/ai",
        label: "AI",
        icon: Sparkles,
        blurb: "The provider key this home uses, and which features may use it",
        keywords: ["ai", "llm", "key", "gemini"],
      },
    ],
  },
];

/** Groups and items filtered to this home's shape and this member's role. */
export function visibleGroups(shape: HomeShape): DestinationGroup[] {
  return GROUPS.filter((group) => !group.when || group.when(shape))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.when || item.when(shape)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Everything a search should be able to reach, flattened. */
export function searchable(shape: HomeShape): Destination[] {
  const seen = new Set<string>();
  return [...PRIMARY, ...WAITING, ...visibleGroups(shape).flatMap((group) => group.items)].filter(
    (item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    },
  );
}

/**
 * The longest matching destination wins, so standing on `/more/approvals`
 * lights Approvals rather than both it and More.
 */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  return (
    hrefs
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}
