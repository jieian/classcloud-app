"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import NotificationsPanel from "./NotificationsPanel";
import type { HomeActiveContext } from "@/lib/services/homeService";
import {
  IconArrowsTransferUp,
  IconBellRingingFilled,
  IconChalkboard,
  IconChalkboardTeacher,
  IconClipboardData,
  IconClipboardPlus,
  IconFileText,
  IconSchool,
  IconSparkles,
  IconUserCog,
  IconUserPlus,
  IconUsersGroup,
} from "@tabler/icons-react";
import Link from "next/link";
import { useMemo } from "react";
import MustChangePasswordModal from "./MustChangePasswordModal";
import HomeReportsSection from "./HomeReportsSection";
import AnnouncementsSection from "./AnnouncementsSection";
import QuickActionsGrid, { type QuickAction } from "./QuickActionsGrid";
import styles from "../page.module.css";

const REPORTS_PERMISSIONS = [
  "reports.view_all",
  "reports.view_assigned",
  "reports.monitor_grade_level",
  "reports.monitor_subjects",
];

function buildQuickActions(
  permissions: string[],
  advisorySectionId: number | null,
): QuickAction[] {
  const has = (p: string) => permissions.includes(p);
  const hasAny = (ps: string[]) => ps.some((p) => permissions.includes(p));
  const actions: QuickAction[] = [];

  if (has("users.full_access"))
    actions.push({ label: "Create User", href: "/user-roles/users/create", icon: IconUserPlus });

  if (has("roles.full_access"))
    actions.push({ label: "Create Role", href: "/user-roles/roles/create", icon: IconUserCog });

  if (has("school_year.full_access"))
    actions.push({ label: "Manage School Year", href: "/school/year", icon: IconSchool });

  if (has("faculty.full_access"))
    actions.push({ label: "Manage Faculty", href: "/school/faculty", icon: IconChalkboardTeacher });

  if (has("classes.full_access"))
    actions.push({ label: "Manage Classes", href: "/school/classes", icon: IconUsersGroup });

  if (has("students.full_access"))
    actions.push({ label: "Transfer Requests", href: "/school/classes/transfer-requests", icon: IconArrowsTransferUp });

  if (has("students.limited_access") && !has("classes.full_access"))
    actions.push({ label: "View Classes", href: "/school/classes", icon: IconUsersGroup });

  if (has("students.limited_access") && advisorySectionId)
    actions.push({
      label: "My Advisory Class",
      href: `/school/classes/${advisorySectionId}`,
      icon: IconChalkboard,
    });

  if (has("exams.full_access"))
    actions.push({ label: "Manage Exams", href: "/exam", icon: IconClipboardData });
  else if (has("exams.limited_access"))
    actions.push({ label: "Create Exam", href: "/exam/create", icon: IconClipboardPlus });

  if (hasAny(REPORTS_PERMISSIONS))
    actions.push({ label: "View Reports", href: "/reports", icon: IconFileText });

  return actions;
}

export default function HomeClient({
  initialActiveContext,
}: {
  initialActiveContext: HomeActiveContext;
}) {
  const { firstName, permissions } = useAuth();

  const visibleActions = useMemo(
    () => buildQuickActions(permissions, initialActiveContext.advisorySectionId),
    [permissions, initialActiveContext.advisorySectionId],
  );

  return (
    <ProtectedRoute requiredPermissions={[]}>
      <MustChangePasswordModal />
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            {/* Desktop: "Welcome, Lerma!" on one line */}
            <h1 className={`${styles.welcomeTitle} ${styles.desktopWelcome}`}>
              Welcome, {firstName || "User"}!
            </h1>
            {/* Mobile: "Welcome," then "Lerma!" each on its own line */}
            <div className={styles.mobileWelcome} aria-hidden="false">
              <h1 className={styles.welcomeTitle}>Welcome,</h1>
              <p className={styles.welcomeTitle} style={{ margin: 0 }}>{firstName || "User"}!</p>
            </div>
            {/* School name — desktop only */}
            <p className={`${styles.schoolName} ${styles.desktopSchoolName}`}>
              Baliwag North Central School
            </p>
          </div>

          <div className={styles.termBlock} aria-label="Active academic period">
            <p className={styles.termName}>
              {initialActiveContext.termName ?? "No Active Term"}
            </p>
            <p className={styles.schoolYear}>
              S.Y. {initialActiveContext.yearRange ?? "unavailable"}
            </p>
          </div>
        </header>

        <div className={styles.mobileQuickActions}>
          <QuickActionsGrid actions={visibleActions} />
        </div>

        <div className={styles.contentGrid}>
          <main className={styles.mainArea} aria-label="Home dashboard">
            <HomeReportsSection />
            <AnnouncementsSection />
          </main>

          <aside className={styles.sidebar} aria-label="Home sidebar">
            <section className={styles.panel} aria-labelledby="notifications-title">
              <div className={styles.panelHeader}>
                <IconBellRingingFilled size={22} color="#ffffff" />
                <span id="notifications-title">Notifications</span>
              </div>
              <div className={styles.panelBody}>
                <NotificationsPanel />
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="quick-actions-title">
              <div className={`${styles.panelHeader} ${styles.quickHeader}`}>
                <IconSparkles size={21} />
                <span id="quick-actions-title">Quick Actions</span>
              </div>
              <div className={styles.panelBody}>
                {visibleActions.length > 0 ? (
                  <ul className={styles.actionList}>
                    {visibleActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <li key={action.href}>
                          <Link className={styles.actionLink} href={action.href}>
                            <span className={styles.actionIcon} aria-hidden="true">
                              <Icon size={17} stroke={1.8} />
                            </span>
                            <span>{action.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.emptyState}>No quick actions available.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </ProtectedRoute>
  );
}
