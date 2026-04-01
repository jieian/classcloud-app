// components/NavBar.tsx
"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome2,
  IconUsers,
  IconSchool,
  IconClipboardData,
  IconFileText,
  IconX,
  IconLogout,
  IconSettings,
  IconMenu2,
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
} from "@mantine/core";
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
      "curriculum.limited_access",
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
        requiredPermissions: [
          "curriculum.full_access",
          "curriculum.limited_access",
        ],
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
    requiredPermissions: [
      "reports.view_all",
      "reports.view_assigned",
      "reports.monitor_grade_level",
      "reports.monitor_subjects",
      "reports.approve",
    ],
    sublinks: [],
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const isMobile = useMediaQuery("(max-width: 767.9px)");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerSublinks, setDrawerSublinks] = useState<Sublink[]>([]);

  const { signOut, permissions, loading } = useAuth();

  // Pending transfer request count — drives the badge on the Classes sublink
  const [pendingTransferCount, setPendingTransferCount] = useState(0);
  const canReviewTransfers =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");

  useEffect(() => {
    if (!canReviewTransfers) {
      setPendingTransferCount(0);
      return;
    }
    fetch("/api/classes/transfer-requests/count", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { count?: number }) => {
        if (typeof d.count === "number") setPendingTransferCount(d.count);
      })
      .catch(() => {}); // Badge is non-critical — fail silently
    // Re-check whenever the user navigates so the count stays fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, canReviewTransfers]);

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
    if (pathname === "/settings") return "Account Settings";
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

    return (
      <div key={link.label}>
        <Tooltip
          label={link.label}
          position="right"
          withArrow
          disabled={isMobile}
        >
          <Link href={link.href} style={{ textDecoration: "none" }}>
            <UnstyledButton
              onClick={(e: React.MouseEvent) => handleMainLinkClick(e, link)}
              onMouseEnter={() => handleMainLinkHover(link)}
              className={classes.mainLink}
              data-active={isActive || undefined}
            >
              <link.icon size={22} stroke={1.5} />
              {isMobile && <span>{link.label}</span>}
            </UnstyledButton>
          </Link>
        </Tooltip>

        {/* Inline sublinks — mobile only, expands directly below parent */}
        {isMobile && isExpanded && link.sublinks.length > 0 && (
          <div className={classes.inlineSublinks}>
            {link.sublinks.map((sublink) => {
              const isSubActive = pathname.startsWith(sublink.href);
              const showBadge =
                sublink.key === "classes" && pendingTransferCount > 0;
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
                    {showBadge && (
                      <Badge
                        size="xs"
                        color="red"
                        variant="filled"
                        style={{ flexShrink: 0 }}
                      >
                        {pendingTransferCount > 99
                          ? "99+"
                          : pendingTransferCount}
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
    const showBadge = sublink.key === "classes" && pendingTransferCount > 0;

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
          {showBadge && (
            <Badge
              size="xs"
              color="red"
              variant="filled"
              style={{ flexShrink: 0 }}
            >
              {pendingTransferCount > 99 ? "99+" : pendingTransferCount}
            </Badge>
          )}
        </span>
      </Link>
    );
  });

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
          <div style={{ width: 44 }} />
        </div>
      )}

      {/* BACKDROP OVERLAY FOR MOBILE */}
      {isMobile && isMobileMenuOpen && (
        <div className={classes.backdrop} onClick={handleBackdropClick} />
      )}

      {/* THE NAVBAR ITSELF */}
      <nav
        className={`${classes.navbar} ${
          isMobile && isMobileMenuOpen ? classes.open : ""
        }`}
        onMouseLeave={() => {
          if (!isMobile) setIsDrawerOpen(false);
        }}
      >
        {/* Logo Section with Close Button for Mobile */}
        <div className={classes.logo}>
          {!isMobile && (
            <img
              src="/logo/CCLogo.png"
              alt="ClassCloud Logo"
              style={{ height: "28px", width: "auto" }}
            />
          )}
          {isMobile && (
            <>
              <img
                src="/logo/CCLogo.png"
                alt="ClassCloud Logo"
                style={{ height: "32px", width: "auto" }}
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
          {mainLinks}
          <div className={classes.spacer}></div>

          {/* Account Settings Link */}
          <Tooltip
            label="Account Settings"
            position="right"
            withArrow
            disabled={isMobile}
          >
            <Link href="/settings" style={{ textDecoration: "none" }}>
              <UnstyledButton
                onClick={handleSimpleLinkClick}
                className={classes.mainLink}
                data-active={pathname === "/settings" || undefined}
              >
                <IconSettings size={22} stroke={1.5} />
                {isMobile && <span>Account Settings</span>}
              </UnstyledButton>
            </Link>
          </Tooltip>

          {/* Logout Button */}
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
            <div className={classes.drawerContent}>{drawerLinks}</div>
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
