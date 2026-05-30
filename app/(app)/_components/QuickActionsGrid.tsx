"use client";

import { useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import styles from "./QuickActionsGrid.module.css";

export type QuickAction = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
};

const PER_PAGE = 4;

export default function QuickActionsGrid({ actions }: { actions: QuickAction[] }) {
  const [page, setPage] = useState(0);

  if (actions.length === 0) return null;

  const totalPages = Math.ceil(actions.length / PER_PAGE);
  const slice = actions.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  return (
    <div
      className={styles.strip}
      style={{ paddingLeft: hasPrev ? 34 : 0, paddingRight: hasNext ? 34 : 0 }}
    >
      {/* Always rendered — opacity + pointer-events transition for smooth fade */}
      <button
        type="button"
        className={`${styles.navBtn} ${styles.navBtnPrev}`}
        onClick={() => setPage((p) => p - 1)}
        aria-label="Previous actions"
        style={{ opacity: hasPrev ? 1 : 0, pointerEvents: hasPrev ? "auto" : "none" }}
      >
        <IconChevronLeft size={14} stroke={2.5} />
      </button>

      <div
        className={styles.grid}
        style={slice.length < PER_PAGE ? { justifyContent: "flex-start", gap: 28 } : undefined}
      >
        {slice.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className={styles.item}>
              <span className={styles.iconBox}>
                <Icon size={24} stroke={1.8} />
              </span>
              <span className={styles.label}>{action.label}</span>
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        className={`${styles.navBtn} ${styles.navBtnNext}`}
        onClick={() => setPage((p) => p + 1)}
        aria-label="Next actions"
        style={{ opacity: hasNext ? 1 : 0, pointerEvents: hasNext ? "auto" : "none" }}
      >
        <IconChevronRight size={14} stroke={2.5} />
      </button>
    </div>
  );
}
