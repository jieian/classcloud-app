"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import {
  fetchNotifications,
  type NotificationItem,
} from "@/lib/services/classService";
import {
  fetchHomeActiveContext,
  type HomeActiveContext,
} from "@/lib/services/homeService";
import {
  IconBell,
  IconBook2,
  IconClipboardData,
  IconFileText,
  IconSchool,
  IconSettings,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MustChangePasswordModal from "./_components/MustChangePasswordModal";
import styles from "./page.module.css";

type QuickAction = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  permissions?: string[];
};

const quickActions: QuickAction[] = [
  {
    label: "Create Exam",
    href: "/exam/create",
    icon: IconClipboardData,
    permissions: ["exams.full_access"],
  },
  {
    label: "Examinations",
    href: "/exam",
    icon: IconClipboardData,
    permissions: ["exams.full_access", "exams.limited_access"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: IconFileText,
    permissions: [
      "reports.view_all",
      "reports.view_assigned",
      "reports.monitor_grade_level",
      "reports.monitor_subjects",
      "reports.approve",
    ],
  },
  {
    label: "Classes",
    href: "/school/classes",
    icon: IconBook2,
    permissions: [
      "classes.full_access",
      "students.limited_access",
      "students.full_access",
    ],
  },
  {
    label: "School Year",
    href: "/school/year",
    icon: IconSchool,
    permissions: ["school_year.full_access"],
  },
  {
    label: "Users",
    href: "/user-roles/users",
    icon: IconUsers,
    permissions: ["users.full_access"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: IconSettings,
  },
];

function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions?: string[],
) {
  if (!requiredPermissions || requiredPermissions.length === 0) return true;
  return requiredPermissions.some((permission) =>
    userPermissions.includes(permission),
  );
}

export default function Home() {
  const { firstName, permissions } = useAuth();
  const [activeContext, setActiveContext] = useState<HomeActiveContext>({
    termName: null,
    yearRange: null,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetchHomeActiveContext(), fetchNotifications()])
      .then(([context, notificationRows]) => {
        if (!mounted) return;
        setActiveContext(context);
        setNotifications(notificationRows.slice(0, 5));
      })
      .catch(() => {
        if (!mounted) return;
        setActiveContext({ termName: null, yearRange: null });
        setNotifications([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const visibleActions = useMemo(
    () =>
      quickActions.filter((action) =>
        hasAnyPermission(permissions, action.permissions),
      ),
    [permissions],
  );

  return (
    <ProtectedRoute requiredPermissions={[]}>
      <MustChangePasswordModal />
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.welcomeTitle}>
              Welcome, {firstName || "User"}!
            </h1>
            <p className={styles.schoolName}>Baliwag North Central School</p>
          </div>

          <div className={styles.termBlock} aria-label="Active academic period">
            <p className={styles.termName}>
              {activeContext.termName ?? "No Active Term"}
            </p>
            <p className={styles.schoolYear}>
              S.Y. {activeContext.yearRange ?? "unavailable"}
            </p>
          </div>
        </header>

        <div className={styles.contentGrid}>
          <main className={styles.mainArea} aria-label="Home dashboard" />

          <aside className={styles.sidebar} aria-label="Home sidebar">
            <section className={styles.panel} aria-labelledby="notifications-title">
              <div className={styles.panelHeader}>
                <IconBell size={22} color="#f2cf10" fill="#f2cf10" />
                <span id="notifications-title">Notifications</span>
              </div>
              <div className={styles.panelBody}>
                {notifications.length > 0 ? (
                  <ul className={styles.notificationList}>
                    {notifications.map((notification) => (
                      <li
                        key={notification.notification_id}
                        className={styles.notificationItem}
                      >
                        <span
                          className={`${styles.notificationDot} ${
                            notification.read_at
                              ? styles.notificationDotRead
                              : ""
                          }`}
                          aria-hidden="true"
                        />
                        <span className={styles.notificationTitle}>
                          {notification.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyState}>No notifications yet.</p>
                )}
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
