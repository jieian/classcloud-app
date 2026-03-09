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
  IconFileReport,
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
        requiredPermissions: ["access_user_management"],
      },
      {
        label: "Roles Management",
        key: "roles-management",
        href: "/user-roles/roles",
        requiredPermissions: ["access_user_management"],
      },
    ],
    requiredPermissions: ["access_user_management"],
  },
  {
    icon: IconSchool,
    label: "School",
    href: "/school",
    requiredPermissions: [
      "access_year_management",
      "access_faculty_management",
      "access_subject_management",
      "access_classes_management",
      "partial_access_student_management",
      "full_access_student_management",
    ],
    sublinks: [
      {
        label: "School Year",
        key: "school-year",
        href: "/school/year",
        requiredPermissions: ["access_year_management"],
      },
      {
        label: "Faculty",
        key: "faculty",
        href: "/school/faculty",
        requiredPermissions: ["access_faculty_management"],
      },
      {
        label: "Subjects",
        key: "subjects",
        href: "/school/subjects",
        requiredPermissions: ["access_subject_management"],
      },
      {
        label: "Classes",
        key: "classes",
        href: "/school/classes",
        requiredPermissions: [
          "access_classes_management",
          "partial_access_student_management",
          "full_access_student_management",
        ],
      },
    ],
  },
  {
    icon: IconClipboardData,
    label: "Examinations",
    href: "/exam",
    sublinks: [],
    requiredPermissions: [
      "full_access_examinations",
      "partial_access_examinations",
    ],
  },
  {
    icon: IconFileReport,
    label: "Reports",
    href: "/reports",
    requiredPermissions: ["access_reports"],
    sublinks: [
      {
        label: "Item Analysis",
        key: "item-analysis",
        href: "/reports/itemAnalysis",
        requiredPermissions: ["access_reports"],
      },
      {
        label: "Level of Proficiency",
        key: "level-of-proficiency",
        href: "/reports/levelOfProficiency",
        requiredPermissions: ["access_reports"],
      },
      {
        label: "LAEMPL",
        key: "laempl",
        href: "/reports/laempl",
        requiredPermissions: ["access_reports"],
      },
    ],
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
    permissions.includes("full_access_student_management") ||
    permissions.includes("partial_access_student_management");

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
