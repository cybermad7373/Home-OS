"use client";

import Link from "next/link";
import { Card, CardShell, CardCore } from "@/components/ui/card";
import { motion, useReducedMotion } from "motion/react";
import { SectionReveal, StaggerReveal, StaggerItem } from "@/components/motion/StaggerReveal";

interface ModuleLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}

const MODULES: ModuleLink[] = [
  {
    href: "/today",
    label: "Today",
    description: "Your daily dashboard",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    href: "/chores",
    label: "Chores",
    description: "Week view & assignments",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/money",
    label: "Money",
    description: "Expenses & settlements",
    color: "text-primary dark:text-primary",
    bgColor: "bg-primary/10 dark:bg-primary/20",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/food",
    label: "Food",
    description: "Meals & suggestions",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13a6 6 0 0 1 6-6h10a6 6 0 0 1 6 6v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
        <path d="M10 13V9" />
        <path d="M14 13V9" />
      </svg>
    ),
  },
  {
    href: "/more/calendar",
    label: "Calendar",
    description: "Schedule & events",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/more",
    label: "More",
    description: "Settings & admin",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export function HomeModuleLinks() {
  const reduce = useReducedMotion();

  return (
    <SectionReveal>
      <section className="mt-8" aria-labelledby="modules-heading">
        <h2 id="modules-heading" className="heading-text mb-4">Go to</h2>
        <StaggerReveal staggerDelay={0.06} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MODULES.map((module, index) => (
            <StaggerItem key={module.href}>
              <Link
                href={module.href}
                className="group block"
              >
                <CardShell className="h-full group transition-all duration-300 ease-[var(--ease-out)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-1">
                  <CardCore className="h-full flex flex-col items-center justify-center text-center p-4">
                    <motion.div
                      className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-3", module.bgColor, module.color)}
                      initial={reduce ? false : { scale: 0.8, opacity: 0 }}
                      animate={reduce ? false : { scale: 1, opacity: 1 }}
                      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                      style={{ willChange: "transform" }}
                    >
                      {module.icon}
                    </motion.div>
                    <motion.p
                      className="heading-text font-medium"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={reduce ? false : { opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 + 0.1, duration: 0.3 }}
                    >
                      {module.label}
                    </motion.p>
                    <motion.p
                      className="caption-text text-text-muted mt-1"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={reduce ? false : { opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 + 0.15, duration: 0.3 }}
                    >
                      {module.description}
                    </motion.p>
                  </CardCore>
                </CardShell>
              </Link>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </section>
    </SectionReveal>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}