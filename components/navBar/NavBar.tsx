// components/NavBar.tsx
"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome2,
  IconUsers,
  IconSchool,
  IconClipboardData,
  IconFileText,
  IconX,
  IconLogout,
  IconMenu2,
  IconUserCircle,
  IconBell,
  IconFoodsteps,
} from "@tabler/icons-react";
import {
  Badge,
  Title,
  Tooltip,
  UnstyledButton,
  ActionIcon,
  Modal,
  Text,
  Button,
  Group,
  Popover,
} from "@mantine/core";
import NotificationsPanel from "@/app/(app)/_components/NotificationsPanel";
import { useMediaQuery, useDisclosure } from "@mantine/hooks";
import classes from "./NavBar.module.css";
import { useAuth } from "@/context/AuthContext";

// Add type definitions
type Sublink = {
  label: string;
  key: string;
  href: string;
  requiredPermissions: string[];
};

type NavigationLink = {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  href: string;
  sublinks: Sublink[];
  requiredPermissions: string[];
};

// 1. DATA STRUCTURE (with hrefs and permissions)
const navigationData: NavigationLink[] = [
  {
    icon: IconHome2,
    label: "Home",
    href: "/",
    sublinks: [],
    requiredPermissions: [],
  },
  {
    icon: IconUsers,
    label: "Users and Roles",
    href: "/user-roles/users",
    sublinks: [
      {
        label: "User Management",
        key: "user-management",
        href: "/user-roles/users",
        requiredPermissions: ["users.full_access"],
      },
      {
        label: "Roles Management",
        key: "roles-management",
        href: "/user-roles/roles",
        requiredPermissions: ["roles.full_access"],
      },
    ],
    requiredPermissions: ["users.full_access", "roles.full_access"],
  },
  {
    icon: IconSchool,
    label: "School",
    href: "/school",
    requiredPermissions: [
      "school_year.full_access",
      "curriculum.full_access",
      "faculty.full_access",
      "classes.full_access",
      "students.limited_access",
      "students.full_access",
    ],
    sublinks: [
      {
        label: "School Year",
        key: "school-year",
        href: "/school/year",
        requiredPermissions: ["school_year.full_access"],
      },
      {
        label: "Curriculum",
        key: "curriculum",
        href: "/school/curriculum",
        requiredPermissions: ["curriculum.full_access"],
      },
      {
        label: "Faculty",
        key: "faculty",
        href: "/school/faculty",
        requiredPermissions: ["faculty.full_access"],
      },
      {
        label: "Classes",
        key: "classes",
        href: "/school/classes",
        requiredPermissions: [
          "classes.full_access",
          "students.limited_access",
          "students.full_access",
        ],
      },
    ],
  },
  {
    icon: IconClipboardData,
    label: "Examinations",
    href: "/exam",
    sublinks: [],
    requiredPermissions: ["exams.full_access", "exams.limited_access"],
  },
  {
    icon: IconFileText,
    label: "Reports",
    href: "/reports",
    requiredPermissions: ["reports.view_all", "reports.view_assigned", "reports.monitor_grade_level", "reports.monitor_subjects"],
    sublinks: [],
  },
];

// Badge counts refresh at most this often, regardless of how many times the user
// navigates. Prevents /api/badges from being re-fetched on every route change.
const BADGE_REFRESH_MS = 30_000;

// A main nav button that reflects in-flight navigation: while the enclosing
// <Link> is navigating, it shows the same active highlight as the destination
// page, so a click registers instantly (no spinner, no dead time). `pending`
// stays false for drawer-opening links that call preventDefault (no navigation).
function MainLinkButton({
  isActive,
  onClick,
  onMouseEnter,
  children,
}: {
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  const { pending } = useLinkStatus();
  return (
    <UnstyledButton
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={classes.mainLink}
      data-active={isActive || pending || undefined}
    >
      {children}
    </UnstyledButton>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 767.9px)");
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerSublinks, setDrawerSublinks] = useState<Sublink[]>([]);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingDrawer, setIsDraggingDrawer] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    active: boolean;
  }>({
    startX: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    active: false,
  });

  const { signOut, permissions, firstName, lastName } = useAuth();

  // Permission flags that decide which badges this user sees.
  const isAdmin = permissions.includes("students.full_access");
  const isAdviser = permissions.includes("students.limited_access");
  const hasUsersAccess = permissions.includes("users.full_access");

  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);

  // Raw badge counts from /api/badges (one request for all three). The visible
  // badges are derived below, so a permission change re-maps them without a refetch.
  const [badgeCounts, setBadgeCounts] = useState({
    notifications: 0,
    transferRequests: 0,
    signupNotifications: 0,
  });

  // Classes sublink: admins → pending transfers, advisers → unread notifications.
  const badgeCount = isAdmin
    ? badgeCounts.transferRequests
    : isAdviser
      ? badgeCounts.notifications
      : 0;
  // Bell badge (mobile top bar): unread notifications.
  const notificationBellCount = badgeCounts.notifications;
  // User Management sublink: unread self-registration signups.
  const usersBadgeCount = hasUsersAccess ? badgeCounts.signupNotifications : 0;

  // All NavBar badge counts in ONE request. Previously this re-fired on every
  // navigation (pathname dep) — a burst of /api/badges hits per session. Now it
  // refreshes at most once per BADGE_REFRESH_MS, plus when the tab regains focus.
  // Badges are non-critical — fail silently.
  const fetchBadges = useCallback(() => {
    fetch("/api/badges", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { notifications?: number; transferRequests?: number; signupNotifications?: number }) =>
        setBadgeCounts({
          notifications: typeof d.notifications === "number" ? d.notifications : 0,
          transferRequests: typeof d.transferRequests === "number" ? d.transferRequests : 0,
          signupNotifications: typeof d.signupNotifications === "number" ? d.signupNotifications : 0,
        }),
      )
      .catch(() => {});
  }, []);

  const lastBadgeFetchRef = useRef(0);
  const maybeRefreshBadges = useCallback(() => {
    const now = Date.now();
    if (now - lastBadgeFetchRef.current < BADGE_REFRESH_MS) return;
    lastBadgeFetchRef.current = now;
    fetchBadges();
  }, [fetchBadges]);

  // Initial load + throttled refresh on navigation.
  useEffect(() => {
    maybeRefreshBadges();
  }, [pathname, maybeRefreshBadges]);

  // Refresh when the user returns to the tab (counts may have changed elsewhere).
  useEffect(() => {
    window.addEventListener("focus", maybeRefreshBadges);
    return () => window.removeEventListener("focus", maybeRefreshBadges);
  }, [maybeRefreshBadges]);

  // Helper function to check if user has required permissions
  const hasPermission = useCallback(
    (requiredPermissions: string[]) => {
      if (requiredPermissions.length === 0) return true;
      return requiredPermissions.some((perm) => permissions.includes(perm));
    },
    [permissions],
  );

  // Current page label for mobile top bar
  const currentPageLabel = useMemo(() => {
    if (pathname === "/settings") return "My Profile";
    // Check sublinks first (more specific) — e.g. /user-roles/users → "User Management"
    for (const link of navigationData) {
      for (const sub of link.sublinks) {
        if (pathname.startsWith(sub.href)) return sub.label;
      }
    }
    // Then check main links
    for (const link of navigationData) {
      if (pathname === link.href) return link.label;
      if (link.href !== "/" && pathname.startsWith(link.href))
        return link.label;
    }
    return "Home";
  }, [pathname]);

  // Filter navigation data based on user permissions - optimized with reduce
  const filteredNavigationData = useMemo(() => {
    return navigationData.reduce<NavigationLink[]>((acc, link) => {
      if (!hasPermission(link.requiredPermissions)) return acc;

      const filteredSublinks = link.sublinks.filter((sublink) =>
        hasPermission(sublink.requiredPermissions),
      );

      acc.push({
        ...link,
        sublinks: filteredSublinks,
      });

      return acc;
    }, []);
  }, [hasPermission, permissions]);

  // HANDLERS
  const handleMainLinkClick = (e: React.MouseEvent, link: NavigationLink) => {
    if (link.sublinks.length > 0) {
      e.preventDefault();

      setIsDrawerOpen(true);
      setDrawerTitle(link.label);
      setDrawerSublinks(link.sublinks);
    } else {
      setIsDrawerOpen(false);
      if (isMobile) {
        setIsMobileMenuOpen(false);
      }
    }
  };

  const handleMainLinkHover = (link: NavigationLink) => {
    if (isMobile) return;

    if (link.sublinks.length > 0) {
      setIsDrawerOpen(true);
      setDrawerTitle(link.label);
      setDrawerSublinks(link.sublinks);
      return;
    }

    setIsDrawerOpen(false);
  };

  const handleDrawerClose = () => setIsDrawerOpen(false);

  const handleMobileMenuToggle = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const handleBackdropClick = () => {
    if (isMobile && isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const resetDrawerDrag = useCallback(() => {
    dragStateRef.current = {
      startX: 0,
      lastX: 0,
      lastTime: 0,
      velocityX: 0,
      active: false,
    };
    setDragOffset(0);
    setIsDraggingDrawer(false);
  }, []);

  const handleSimpleLinkClick = () => {
    setIsDrawerOpen(false);
    if (isMobile) setIsMobileMenuOpen(false);
  };

  // Close the drawer and mobile menu whenever the route changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDrawerOpen(false);
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [pathname, isMobile]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      resetDrawerDrag();
    }
  }, [isMobileMenuOpen, resetDrawerDrag]);

  const handleDrawerTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!isMobile || !isMobileMenuOpen) return;

    const touch = e.touches[0];
    dragStateRef.current = {
      startX: touch.clientX,
      lastX: touch.clientX,
      lastTime: e.timeStamp,
      velocityX: 0,
      active: true,
    };
    setIsDraggingDrawer(true);
  };

  const handleDrawerTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!dragStateRef.current.active || !isMobile) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStateRef.current.startX;
    const elapsed = Math.max(e.timeStamp - dragStateRef.current.lastTime, 1);
    const velocityX =
      (touch.clientX - dragStateRef.current.lastX) / elapsed;
    dragStateRef.current.velocityX = velocityX;

    if (deltaX >= 0) {
      dragStateRef.current.lastX = touch.clientX;
      dragStateRef.current.lastTime = e.timeStamp;
      setDragOffset(0);
      return;
    }

    dragStateRef.current.lastX = touch.clientX;
    dragStateRef.current.lastTime = e.timeStamp;
    setDragOffset(deltaX * 0.96);
  };

  const handleDrawerTouchEnd = () => {
    if (!dragStateRef.current.active || !isMobile) return;

    const drawerWidth = mobileDrawerRef.current?.offsetWidth ?? 320;
    const closeDistance = drawerWidth * 0.24;
    const closeVelocity = -0.55;
    const shouldClose =
      Math.abs(dragOffset) > closeDistance ||
      dragStateRef.current.velocityX < closeVelocity;

    if (shouldClose) {
      setIsMobileMenuOpen(false);
    }

    resetDrawerDrag();
  };

  const [logoutOpened, { open: openLogout, close: closeLogout }] =
    useDisclosure(false);

  const handleLogout = () => {
    if (isMobile) setIsMobileMenuOpen(false);
    openLogout();
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    closeLogout();
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  };

  // Don't hide navbar while loading - just show it with filtered navigation
  // The permissions array will be empty initially, then populate when loaded

  // JSX FOR LINKS - using pathname for active state
  const mainLinks = filteredNavigationData.map((link) => {
    const isActive =
      pathname === link.href ||
      link.sublinks.some((sublink) => pathname.startsWith(sublink.href));
    const isExpanded = isMobile && isDrawerOpen && drawerTitle === link.label;

    const hasUserManagement = link.sublinks.some((s) => s.key === "user-management");
    const showUsersDot = hasUserManagement && usersBadgeCount > 0;

    return (
      <div key={link.label}>
        <Tooltip
          label={link.label}
          position="right"
          withArrow
          disabled={isMobile}
        >
          <Link href={link.href} style={{ textDecoration: "none" }}>
            <MainLinkButton
              isActive={isActive}
              onClick={(e: React.MouseEvent) => handleMainLinkClick(e, link)}
              onMouseEnter={() => handleMainLinkHover(link)}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <link.icon size={22} stroke={1.5} />
                {showUsersDot && (
                  <span
                    style={{
                      position: "absolute",
                      top: 0,
                      right: -3,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "#fa5252",
                      border: "1.5px solid white",
                    }}
                  />
                )}
              </span>
              {isMobile && <span>{link.label}</span>}
            </MainLinkButton>
          </Link>
        </Tooltip>

        {/* Inline sublinks — mobile only, expands directly below parent */}
        {isMobile && isExpanded && link.sublinks.length > 0 && (
          <div className={classes.inlineSublinks}>
            {link.sublinks.map((sublink) => {
              const isSubActive = pathname.startsWith(sublink.href);
              const showClassesBadge = sublink.key === "classes" && badgeCount > 0;
              const showUsersBadge = sublink.key === "user-management" && usersBadgeCount > 0;
              return (
                <Link
                  href={sublink.href}
                  key={sublink.key}
                  className={classes.link}
                  data-active={isSubActive || undefined}
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      gap: "8px",
                    }}
                  >
                    <span>{sublink.label}</span>
                    {showClassesBadge && (
                      <Badge
                        size="xs"
                        color="red"
                        variant="filled"
                        style={{ flexShrink: 0 }}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </Badge>
                    )}
                    {showUsersBadge && (
                      <Badge
                        size="xs"
                        color="red"
                        variant="filled"
                        style={{ flexShrink: 0 }}
                      >
                        {usersBadgeCount > 99 ? "99+" : usersBadgeCount}
                      </Badge>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  });

  const drawerLinks = drawerSublinks.map((sublink: Sublink) => {
    const isActive = pathname === sublink.href;
    const showClassesBadge = sublink.key === "classes" && badgeCount > 0;
    const showUsersBadge = sublink.key === "user-management" && usersBadgeCount > 0;

    return (
      <Link
        href={sublink.href}
        key={sublink.key}
        className={classes.link}
        data-active={isActive || undefined}
        onClick={() => {
          setIsDrawerOpen(false);
          if (isMobile) setIsMobileMenuOpen(false);
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: "8px",
          }}
        >
          <span>{sublink.label}</span>
          {showClassesBadge && (
            <Badge
              size="xs"
              color="red"
              variant="filled"
              style={{ flexShrink: 0 }}
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          )}
          {showUsersBadge && (
            <Badge
              size="xs"
              color="red"
              variant="filled"
              style={{ flexShrink: 0 }}
            >
              {usersBadgeCount > 99 ? "99+" : usersBadgeCount}
            </Badge>
          )}
        </span>
      </Link>
    );
  });

  const settingsAndLogout = (
    <div className={classes.bottomActions}>
      {(permissions.includes("audit_logs.view_all") || permissions.includes("audit_logs.view_own")) && (
        <Tooltip label={permissions.includes("audit_logs.view_all") ? "Audit Logs" : "My Activity"} position="right" withArrow disabled={isMobile}>
          <Link href="/audit-logs" style={{ textDecoration: "none" }}>
            <UnstyledButton
              onClick={handleSimpleLinkClick}
              className={classes.mainLink}
              data-active={pathname === "/audit-logs" || undefined}
            >
              <IconFoodsteps size={22} stroke={1.5} />
              {isMobile && <span>{permissions.includes("audit_logs.view_all") ? "Audit Logs" : "My Activity"}</span>}
            </UnstyledButton>
          </Link>
        </Tooltip>
      )}
      <Tooltip label="My Profile" position="right" withArrow disabled={isMobile}>
        <Link href="/settings" style={{ textDecoration: "none" }}>
          <UnstyledButton
            onClick={handleSimpleLinkClick}
            className={classes.mainLink}
            data-active={pathname === "/settings" || undefined}
          >
            <IconUserCircle size={22} stroke={1.5} />
            {isMobile && <span>{firstName} {lastName}</span>}
          </UnstyledButton>
        </Link>
      </Tooltip>
      <Tooltip
        label="Logout"
        position="right"
        withArrow
        disabled={isMobile}
      >
        <UnstyledButton onClick={handleLogout} className={classes.mainLink}>
          <IconLogout size={22} stroke={1.5} />
          {isMobile && <span>Logout</span>}
        </UnstyledButton>
      </Tooltip>
    </div>
  );

  return (
    <>
      {/* MOBILE TOP BAR — always visible on mobile */}
      {isMobile && (
        <div className={classes.topBar}>
          <ActionIcon
            onClick={handleMobileMenuToggle}
            variant="transparent"
            size="xl"
            aria-label="Open navigation"
          >
            <IconMenu2 size={24} stroke={1.5} color="white" />
          </ActionIcon>
          <span className={classes.topBarTitle}>{currentPageLabel}</span>
          <Popover
            opened={notifPopoverOpen}
            onChange={setNotifPopoverOpen}
            position="bottom-end"
            withinPortal
            width={300}
            shadow="md"
            radius="md"
          >
            <Popover.Target>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setNotifPopoverOpen((o) => !o)}
                onKeyDown={(e) => e.key === "Enter" && setNotifPopoverOpen((o) => !o)}
                style={{ position: "relative", width: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                aria-label="Open notifications"
              >
                <IconBell size={22} stroke={1.5} color="white" />
                {notificationBellCount > 0 && (
                  <Badge
                    size="xs"
                    color="red"
                    variant="filled"
                    style={{
                      position: "absolute",
                      top: -4,
                      right: 2,
                      minWidth: 16,
                      height: 16,
                      padding: "0 3px",
                      pointerEvents: "none",
                      fontSize: 9,
                    }}
                  >
                    {notificationBellCount > 99 ? "99+" : notificationBellCount}
                  </Badge>
                )}
              </div>
            </Popover.Target>
            <Popover.Dropdown style={{ padding: 0, zIndex: 2000 }}>
              <div style={{ padding: "10px 12px 6px", fontWeight: 700, fontSize: "0.85rem", borderBottom: "1px solid #edf0f3", color: "#0f1115" }}>
                Notifications
              </div>
              <div style={{ padding: "4px 4px 6px" }}>
                <NotificationsPanel
                  onMarkRead={() =>
                    setBadgeCounts((c) => ({ ...c, notifications: Math.max(0, c.notifications - 1) }))
                  }
                />
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>
      )}

      {/* BACKDROP OVERLAY FOR MOBILE */}
      {isMobile && isMobileMenuOpen && (
        <div className={classes.backdrop} onClick={handleBackdropClick} />
      )}

      {/* THE NAVBAR ITSELF */}
      <nav
        ref={mobileDrawerRef}
        className={`${classes.navbar} ${
          isMobile && isMobileMenuOpen ? classes.open : ""
        }`}
        data-dragging={isDraggingDrawer || undefined}
        onMouseLeave={() => {
          if (!isMobile) setIsDrawerOpen(false);
        }}
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
        onTouchCancel={handleDrawerTouchEnd}
        style={
          isMobile && isMobileMenuOpen
            ? {
                transform: `translateX(${Math.min(0, dragOffset)}px)`,
              }
            : undefined
        }
      >
        {/* Logo Section with Close Button for Mobile */}
        <div className={classes.logo}>
          {!isMobile && (
            <img
              src="/logo/CCLogo.png"
              alt="ClassCloud Logo"
              className={classes.desktopLogoImage}
            />
          )}
          {isMobile && (
            <>
              <img
                src="/logo/CCLogo.png"
                alt="ClassCloud Logo"
                className={classes.mobileLogoImage}
              />
              <UnstyledButton
                onClick={() => setIsMobileMenuOpen(false)}
                className={classes.mobileCloseButton}
              >
                <IconX size={20} stroke={1.5} />
              </UnstyledButton>
            </>
          )}
        </div>

        {/* Main Navigation Links and Bottom Actions */}
        <div className={classes.aside}>
          <div className={classes.primaryLinks}>
            {mainLinks}
            <div className={classes.spacer}></div>
          </div>
          {settingsAndLogout}
        </div>

        {/* THE DRAWER (desktop only — mobile uses inline sublinks above) */}
        {!isMobile && isDrawerOpen && (
          <div className={classes.drawer}>
            <div className={classes.drawerHeader}>
              <Title order={5}>{drawerTitle}</Title>
              {!isMobile && (
                <UnstyledButton
                  onClick={handleDrawerClose}
                  className={classes.drawerCloseButton}
                >
                  <IconX size={18} stroke={1.5} />
                </UnstyledButton>
              )}
            </div>
            <div className={classes.drawerContent}>
              {drawerLinks}
            </div>
          </div>
        )}
      </nav>

      {/* LOGOUT CONFIRMATION MODAL */}
      <Modal
        opened={logoutOpened}
        onClose={closeLogout}
        title="Confirm Logout"
        centered
        size="sm"
      >
        <Text size="sm">Are you sure you want to log out?</Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={closeLogout} disabled={loggingOut}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={confirmLogout}
            loading={loggingOut}
            disabled={loggingOut}
          >
            Logout
          </Button>
        </Group>
      </Modal>
    </>
  );
}
