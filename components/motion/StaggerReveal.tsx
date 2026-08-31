"use client";

import { motion } from "motion/react";
import * as React from "react";
import type { ReactNode, HTMLAttributes } from "react";
import { useMediaQuery } from "@/lib/utils/media-query";

interface StaggerRevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  staggerDelay?: number;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  once?: boolean;
}

export function StaggerReveal({
  children,
  staggerDelay = 0.06,
  direction = "up",
  amount = 0.3,
  once = true,
  className,
  ...props
}: StaggerRevealProps) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  const variants = {
    hidden: {
      opacity: 0,
      y: direction === "up" ? 24 : direction === "down" ? -24 : 0,
      x: direction === "left" ? 24 : direction === "right" ? -24 : 0,
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
    },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };

  const childVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  };

  if (reduce) {
    return <div className={className} {...props}>{children}</div>;
  }

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={containerVariants}
      {...props}
    >
      {React.Children.map(children, (child, index) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, {
              key: child.key ?? index,
              variants: childVariants,
              initial: "hidden",
            } as any)
          : child
      )}
    </MotionDiv>
  );
}

interface RevealItemProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  delay?: number;
}

export function RevealItem({ children, delay = 0, className, ...props }: RevealItemProps) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (reduce) {
    return <div className={className} {...props}>{children}</div>;
  }

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </MotionDiv>
  );
}

interface SectionRevealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  delay?: number;
}

export function SectionReveal({ children, delay = 0, className, ...props }: SectionRevealProps) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (reduce) {
    return <div className={className} {...props}>{children}</div>;
  }

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      {...props}
    >
      {children}
    </MotionDiv>
  );
}

export function StaggerContainer({ children, className, ...props }: { children: ReactNode; className?: string }) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (reduce) {
    return <div className={className} {...props}>{children}</div>;
  }

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      {...props}
    >
      {React.Children.map(children, (child, index) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, {
              key: child.key ?? index,
              initial: "hidden",
            } as any)
          : child
      )}
    </MotionDiv>
  );
}

export function StaggerItem({ children, className, ...props }: { children: ReactNode; className?: string }) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (reduce) {
    return <div className={className} {...props}>{children}</div>;
  }

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
      }}
      initial="hidden"
      animate="visible"
      {...props}
    >
      {children}
    </MotionDiv>
  );
}