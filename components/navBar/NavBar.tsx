// components/NavBar.tsx
"use client";
import { useState, useMemo, useCallback } from "react";
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
import { Title, Tooltip, UnstyledButton, ActionIcon } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
    href: "/userRoles",
    sublinks: [],
    requiredPermissions: ["access_user_management"],
  },
  {
    icon: IconSchool,
    label: "School",
    href: "/school",
    requiredPermissions: ["access_school_management"],
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
        label: "Students",
        key: "students",
        href: "/school/students",
        requiredPermissions: ["access_student_management"],
      },
      {
        label: "Sections",
        key: "sections",
        href: "/school/sections",
        requiredPermissions: ["access_section_management"],
      },
    ],
  },
  {
    icon: IconClipboardData,
    label: "Examinations",
    href: "/exam",
    sublinks: [],
    requiredPermissions: ["access_examinations"],
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
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerSublinks, setDrawerSublinks] = useState<Sublink[]>([]);

  const { signOut, permissions, loading } = useAuth();

  // Helper function to check if user has required permissions
  const hasPermission = useCallback(
    (requiredPermissions: string[]) => {
      if (requiredPermissions.length === 0) return true;
      return requiredPermissions.some((perm) => permissions.includes(perm));
    },
    [permissions],
  );

  // Filter navigation data based on user permissions - optimized with reduce
  const filteredNavigationData = useMemo(() => {
    return navigationData.reduce<NavigationLink[]>((acc, link) => {
      // Skip if user doesn't have permission for parent
      if (!hasPermission(link.requiredPermissions)) return acc;

      // Filter sublinks
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
  const handleMainLinkClick = (link: NavigationLink) => {
    if (link.sublinks.length > 0) {
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

  const handleDrawerClose = () => setIsDrawerOpen(false);

  const handleMobileMenuToggle = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const handleBackdropClick = () => {
    if (isMobile && isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const handleSimpleLinkClick = () => {
    setIsDrawerOpen(false);
    if (isMobile) setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    if (isMobile) setIsMobileMenuOpen(false);
    signOut();
  };

  // Early return AFTER all hooks - this is the fix!
  if (loading) {
    return null;
  }

  // JSX FOR LINKS - using pathname for active state
  const mainLinks = filteredNavigationData.map((link) => {
    const isActive =
      pathname === link.href ||
      (link.sublinks.length > 0 && pathname.startsWith(link.href + "/"));

    return (
      <Tooltip
        label={link.label}
        position="right"
        withArrow
        disabled={isMobile}
        key={link.label}
      >
        <Link href={link.href} style={{ textDecoration: "none" }}>
          <UnstyledButton
            onClick={() => handleMainLinkClick(link)}
            className={classes.mainLink}
            data-active={isActive || undefined}
          >
            <link.icon size={22} stroke={1.5} />
            {isMobile && <span>{link.label}</span>}
          </UnstyledButton>
        </Link>
      </Tooltip>
    );
  });

  const drawerLinks = drawerSublinks.map((sublink: Sublink) => {
    const isActive = pathname === sublink.href;

    return (
      <Link
        href={sublink.href}
        key={sublink.key}
        className={classes.link}
        data-active={isActive || undefined}
        onClick={() => {
          if (isMobile) setIsMobileMenuOpen(false);
        }}
      >
        {sublink.label}
      </Link>
    );
  });

  return (
    <>
      {/* HAMBURGER BUTTON FOR MOBILE */}
      {isMobile && !isMobileMenuOpen && (
        <ActionIcon
          onClick={handleMobileMenuToggle}
          variant="subtle"
          size="xl"
          radius="md"
          style={{
            position: "fixed",
            top: 20,
            left: 20,
            zIndex: 2100,
            backgroundColor: "var(--mantine-color-white)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          <IconMenu2 size={24} stroke={1.5} color="#4eae4a" />
        </ActionIcon>
      )}

      {/* BACKDROP OVERLAY FOR MOBILE */}
      {isMobile && isMobileMenuOpen && (
        <div
          onClick={handleBackdropClick}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1999,
            cursor: "pointer",
          }}
        />
      )}

      {/* THE NAVBAR ITSELF */}
      <nav
        className={`${classes.navbar} ${
          isMobile && isMobileMenuOpen ? classes.open : ""
        }`}
      >
        {/* Logo Section with Close Button for Mobile */}
        <div className={classes.logo}>
          {!isMobile && (
            <img
              src="/logo/CCLogo.png"
              alt="ClassCloud Logo"
              style={{ height: "32px", width: "auto" }}
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

        {/* THE DRAWER (shows sublinks when available) */}
        {isDrawerOpen && (
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
    </>
  );
}
