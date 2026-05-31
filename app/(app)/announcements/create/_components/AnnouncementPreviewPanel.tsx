"use client";

import { useEffect, useRef, useState } from "react";
import { Collapse } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconHome2,
  IconUsers,
  IconSchool,
  IconClipboardData,
  IconFileText,
  IconBellRingingFilled,
  IconBell,
  IconMenu2,
  IconSparkles,
  IconUserCircle,
  IconLogout,
  IconChalkboard,
  IconUsersGroup,
  IconClipboardPlus,
} from "@tabler/icons-react";
import styles from "../create.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const DESKTOP_INNER_WIDTH = 1280;
const DESKTOP_INNER_HEIGHT = 680;

const MOBILE_INNER_WIDTH  = 390;
const PHONE_BODY_WIDTH    = 250;                              // bigger phone
const PHONE_BEZEL         = 8;                               // thin aluminum bezel
const PHONE_SCREEN_WIDTH  = PHONE_BODY_WIDTH - PHONE_BEZEL * 2; // 234
const MOBILE_SCALE        = PHONE_SCREEN_WIDTH / MOBILE_INNER_WIDTH; // 0.6
const PHONE_SCREEN_HEIGHT = 510;                             // screen area
const PHONE_BOTTOM_BEZEL  = 6;                               // slim bottom bezel (indicator is inside screen)
const PHONE_BODY_HEIGHT   = PHONE_BEZEL + PHONE_SCREEN_HEIGHT + PHONE_BOTTOM_BEZEL + PHONE_BEZEL; // 532
const MOBILE_INNER_HEIGHT = Math.round(PHONE_SCREEN_HEIGHT / MOBILE_SCALE); // 850

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPreviewDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}.${dd}.${yyyy}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CardProps {
  subject: string;
  message: string;
  images: string[];
  authorName: string;
  displayDate: string;
  isMobile?: boolean;
}

const PREVIEW_BODY_LIMIT = 280;

const readMoreBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#4eae4a",
  fontSize: "inherit",
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  marginLeft: 4,
  display: "inline",
};

function AnnouncementCardMock({ subject, message, images, authorName, displayDate, isMobile }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasImage = images.length > 0;
  const bodyFontSize = isMobile ? "0.8rem" : "0.9rem";

  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      border: "1px solid #d6d9e0",
      borderLeft: "8px solid #4eae4a",
      borderRadius: 8,
      background: "#fff",
      overflow: "hidden",
    }}>
      {/* Image panel */}
      {hasImage && (
        <div style={{
          width: isMobile ? "100%" : 280,
          height: isMobile ? 120 : undefined,
          flexShrink: 0,
          alignSelf: "stretch",
          overflow: "hidden",
          background: "#eef2ef",
        }}>
          <img
            src={images[0]}
            alt="preview"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      )}
      {/* Content panel */}
      <div style={{
        flex: 1,
        minWidth: 0,
        padding: isMobile ? "10px 10px 10px 12px" : "14px 16px 14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 5 : 7,
      }}>
        {/* Title — wraps naturally */}
        <p style={{
          margin: 0,
          fontWeight: 700,
          fontSize: isMobile ? "0.85rem" : "1rem",
          color: subject ? "#0f1115" : "#ccc",
          fontStyle: subject ? "normal" : "italic",
          lineHeight: 1.35,
          wordBreak: "break-word",
          overflowWrap: "break-word",
        }}>
          {subject || "Announcement Title"}
        </p>

        {/* Body — Read more / Show less */}
        <p style={{
          margin: 0,
          fontSize: bodyFontSize,
          color: message ? "#4b5563" : "#ccc",
          lineHeight: 1.55,
          fontStyle: message ? "normal" : "italic",
          whiteSpace: message ? "pre-wrap" : "normal",
          wordBreak: "break-word",
          flex: 1,
        }}>
          {message
            ? (message.length > PREVIEW_BODY_LIMIT && !expanded
              ? (
                <>
                  {message.slice(0, PREVIEW_BODY_LIMIT)}…
                  <button type="button" style={readMoreBtnStyle} onClick={() => setExpanded(true)}>
                    Read more
                  </button>
                </>
              )
              : (
                <>
                  {message}
                  {message.length > PREVIEW_BODY_LIMIT && (
                    <button type="button" style={readMoreBtnStyle} onClick={() => setExpanded(false)}>
                      Show less
                    </button>
                  )}
                </>
              ))
            : "Your announcement message will appear here…"
          }
        </p>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: isMobile ? "0.7rem" : "0.8rem",
          color: "#808898",
          borderTop: "1px solid #f0f2f5",
          paddingTop: isMobile ? 6 : 8,
          marginTop: "auto",
        }}>
          <span>By: {authorName || "Author Name"}</span>
          <span>{displayDate}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Desktop mock ─────────────────────────────────────────────────────────────

interface MockProps extends CardProps {
  firstName: string;
  // displayDate is already in CardProps
}

const NAV_ICONS = [IconUsers, IconSchool, IconClipboardData, IconFileText];

function DesktopMock({ subject, message, images, authorName, firstName, displayDate }: MockProps) {
  return (
    <div style={{
      display: "flex",
      width: DESKTOP_INNER_WIDTH,
      height: DESKTOP_INNER_HEIGHT,
      background: "#ffffff",
      overflow: "hidden",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>

      {/* ── NavBar (70px) ──────────────────────────────────── */}
      <div style={{
        width: 70,
        minWidth: 70,
        flexShrink: 0,
        height: "100%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(245,248,245,0.98))",
        borderRight: "1px solid #e9ecef",
        boxShadow: "inset -1px 0 0 rgba(255,255,255,0.75), 6px 0 18px rgba(12,20,16,0.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        {/* Logo */}
        <div style={{
          height: 80,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid rgba(53,132,50,0.12)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.35))",
        }}>
          <img src="/logo.png" alt="CC" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        </div>

        {/* Nav icons */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", gap: 4 }}>
          {/* Home – active */}
          <div style={{ width: 42, height: 42, borderRadius: 8, background: "#f0faf0", display: "flex", alignItems: "center", justifyContent: "center", color: "#4eae4a" }}>
            <IconHome2 size={20} stroke={1.8} />
          </div>
          {/* Other nav links */}
          {NAV_ICONS.map((Icon, i) => (
            <div key={i} style={{ width: 42, height: 42, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#adb5bd" }}>
              <Icon size={20} stroke={1.8} />
            </div>
          ))}
        </div>

        {/* Bottom actions: profile + logout */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 4, paddingBottom: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#adb5bd" }}>
            <IconUserCircle size={22} stroke={1.5} />
          </div>
          <div style={{ width: 42, height: 42, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#adb5bd" }}>
            <IconLogout size={22} stroke={1.5} />
          </div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: 16, overflow: "hidden" }}>

        {/* Page header */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          paddingBottom: 12,
          borderBottom: "1px solid #d6d9de",
        }}>
          <div>
            <h1 style={{ margin: 0, color: "#0f1115", fontSize: "1.7rem", fontWeight: 800, lineHeight: 1.15 }}>
              Welcome, {firstName || "User"}!
            </h1>
            <p style={{ margin: "8px 0 0", color: "#808898", fontSize: "0.92rem" }}>
              Baliwag North Central School
            </p>
          </div>
          <div style={{ flexShrink: 0, paddingTop: 1, textAlign: "right" }}>
            <p style={{ margin: 0, color: "#0f1115", fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.15 }}>
              First Term
            </p>
            <p style={{ margin: "8px 0 0", color: "#808898", fontSize: "0.86rem" }}>
              S.Y. 2026–2027
            </p>
          </div>
        </div>

        {/* Content grid: main (1fr) + sidebar (248px) */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 248px",
          gap: 24,
          alignItems: "start",
          marginTop: 18,
        }}>

          {/* ── Main area ──────────────────────────────── */}
          <div style={{ minWidth: 0 }}>

            {/* Announcements section */}
            <div style={{
              border: "1px solid #b9d6c0",
              borderRadius: 8,
              background: "#ffffff",
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0,0,0,0.09)",
            }}>
              {/* Header */}
              <div style={{ padding: "14px 16px 12px" }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: "1.1rem", color: "#0f1115" }}>
                  Announcements
                </p>
              </div>
              {/* Body */}
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #edf0f3", paddingTop: 14 }}>
                <AnnouncementCardMock
                  subject={subject}
                  message={message}
                  images={images}
                  authorName={authorName}
                  displayDate={displayDate}
                />
              </div>
            </div>
          </div>

          {/* ── Sidebar (248px) ────────────────────────── */}
          <div style={{ display: "grid", gap: 18, alignItems: "start" }}>

            {/* Notifications panel */}
            <div style={{ border: "1px solid #cfd3d8", borderRadius: 5, background: "#ffffff", overflow: "hidden", minHeight: 200 }}>
              <div style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#ffffff",
                padding: "7px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 36,
                fontWeight: 700,
                fontSize: "1rem",
              }}>
                <IconBellRingingFilled size={20} color="#ffffff" />
                Notifications
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 18 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f1f3f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconBellRingingFilled size={20} color="#adb5bd" />
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#7f8792", textAlign: "center" }}>
                  You&apos;re all caught up!
                </p>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#adb5bd", textAlign: "center" }}>
                  No new notifications.
                </p>
              </div>
            </div>

            {/* Quick Actions panel */}
            <div style={{ border: "1px solid #cfd3d8", borderRadius: 5, background: "#ffffff", overflow: "hidden" }}>
              <div style={{
                background: "linear-gradient(135deg, #4eae4a 0%, #357a32 100%)",
                color: "#ffffff",
                padding: "7px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 36,
                fontWeight: 700,
                fontSize: "1rem",
              }}>
                <IconSparkles size={20} />
                Quick Actions
              </div>
              <div style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
                {[
                  { label: "My Advisory Class", icon: IconChalkboard },
                  { label: "View Classes", icon: IconUsersGroup },
                  { label: "Create Exam", icon: IconClipboardPlus },
                  { label: "View Reports", icon: IconFileText },
                ].map(({ label, icon: Icon }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 34, padding: "7px 8px", border: "1px solid #e4e7eb", borderRadius: 5, color: "#1f252c", fontSize: "0.84rem", fontWeight: 600 }}>
                    <span style={{ color: "#4eae4a", display: "flex", flexShrink: 0 }}><Icon size={17} stroke={1.8} /></span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile mock ──────────────────────────────────────────────────────────────

const MOBILE_QUICK_ACTIONS = [
  { label: "My Advisory Class", icon: IconChalkboard },
  { label: "View Classes",      icon: IconUsersGroup },
  { label: "Create Exam",       icon: IconClipboardPlus },
  { label: "View Reports",      icon: IconFileText },
];

function MobileMock({ subject, message, images, authorName, firstName, displayDate }: MockProps) {
  return (
    <div style={{
      width: MOBILE_INNER_WIDTH,
      height: MOBILE_INNER_HEIGHT,
      background: "#ffffff",
      overflow: "hidden",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>

      {/* ── Green top bar ──────────────────────────────────── */}
      <div style={{
        height: 56,
        background: "#358432",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        flexShrink: 0,
        position: "relative",
      }}>
        {/* Hamburger */}
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconMenu2 size={24} stroke={1.5} color="#ffffff" />
        </div>
        {/* Page title — centered absolutely */}
        <span style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#ffffff",
          fontSize: "1rem",
          fontWeight: 600,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          Home
        </span>
        {/* Bell icon */}
        <div style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconBell size={22} stroke={1.5} color="#ffffff" />
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────── */}
      <div style={{ padding: "14px 16px 16px", overflow: "hidden" }}>

        {/* Page header: split welcome + term */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 12,
          borderBottom: "1px solid #d6d9de",
        }}>
          <div>
            <p style={{ margin: 0, color: "#0f1115", fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.15 }}>Welcome,</p>
            <p style={{ margin: 0, color: "#0f1115", fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.15 }}>{firstName || "User"}!</p>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 1 }}>
            <p style={{ margin: 0, color: "#0f1115", fontSize: "1.4rem", fontWeight: 800, lineHeight: 1.15 }}>First Term</p>
            <p style={{ margin: "4px 0 0", color: "#808898", fontSize: "0.88rem" }}>S.Y. 2026–2027</p>
          </div>
        </div>

        {/* Mobile quick actions strip */}
        <div style={{ paddingTop: 14, paddingBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            {MOBILE_QUICK_ACTIONS.map(({ label, icon: Icon }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 58,
                  height: 58,
                  borderRadius: 14,
                  background: "#f0f7ee",
                  border: "1px solid #d3e9d0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#4eae4a",
                }}>
                  <Icon size={24} stroke={1.8} />
                </div>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 500,
                  color: "#1f252c",
                  textAlign: "center",
                  maxWidth: 68,
                  lineHeight: 1.25,
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Announcements section */}
        <div style={{
          border: "1px solid #b9d6c0",
          borderRadius: 8,
          background: "#ffffff",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.09)",
          marginTop: 8,
        }}>
          {/* Header */}
          <div style={{ padding: "12px 14px 10px" }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: "1rem", color: "#0f1115" }}>Announcements</p>
          </div>
          {/* Body */}
          <div style={{ padding: "0 14px 14px", borderTop: "1px solid #edf0f3", paddingTop: 12 }}>
            <AnnouncementCardMock
              subject={subject}
              message={message}
              images={images}
              authorName={authorName}
              displayDate={displayDate}
              isMobile
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  subject: string;
  message: string;
  images: string[];
  authorName: string;
  firstName: string;
  scheduledDate?: string | null;
}

type ViewMode = "desktop" | "mobile";

export default function AnnouncementPreviewPanel({ subject, message, images, authorName, firstName, scheduledDate }: Props) {
  const [mode, setMode] = useState<ViewMode>("desktop");
  const [collapsed, setCollapsed] = useState(true);
  const isMobileLayout = useMediaQuery("(max-width: 1024px)");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 500);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const desktopScale = containerWidth / DESKTOP_INNER_WIDTH;
  const desktopViewportHeight = Math.round(DESKTOP_INNER_HEIGHT * desktopScale);

  const displayDate = scheduledDate
    ? formatPreviewDate(new Date(scheduledDate))
    : formatPreviewDate(new Date());

  const mockProps: MockProps = { subject, message, images, authorName, firstName, displayDate };

  return (
    <div className={styles.previewPanel}>
      {/* Header */}
      <div className={styles.previewHeader}>
        <p className={styles.previewTitle}>Announcement Preview</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className={styles.previewToggleGroup}>
            <button
              type="button"
              className={mode === "desktop" ? `${styles.previewToggleBtn} ${styles.previewToggleBtnActive}` : styles.previewToggleBtn}
              onClick={() => setMode("desktop")}
              aria-label="Desktop preview"
            >
              <IconDeviceDesktop size={16} stroke={1.8} />
            </button>
            <button
              type="button"
              className={mode === "mobile" ? `${styles.previewToggleBtn} ${styles.previewToggleBtnActive}` : styles.previewToggleBtn}
              onClick={() => setMode("mobile")}
              aria-label="Mobile preview"
            >
              <IconDeviceMobile size={16} stroke={1.8} />
            </button>
          </div>

          {/* Collapse chevron — mobile layout only */}
          {isMobileLayout && (
            <button
              type="button"
              className={styles.previewToggleBtn}
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand preview" : "Collapse preview"}
            >
              {collapsed
                ? <IconChevronDown size={16} stroke={1.8} />
                : <IconChevronUp size={16} stroke={1.8} />
              }
            </button>
          )}
        </div>
      </div>

      {/* Viewport — always visible on desktop, collapsible on mobile */}
      <Collapse in={!isMobileLayout || !collapsed}>
      <div ref={containerRef}>
        {mode === "desktop" ? (
          /* Desktop: scale the full 1280px mock down to fill the container */
          <div style={{ height: desktopViewportHeight, overflow: "hidden", position: "relative" }}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: DESKTOP_INNER_WIDTH,
              transform: `scale(${desktopScale})`,
              transformOrigin: "top left",
            }}>
              <DesktopMock {...mockProps} />
            </div>
          </div>
        ) : (
          /* Mobile: realistic iPhone mockup centred on a neutral pane */
          <div style={{
            background: "linear-gradient(160deg, #e8e8e8 0%, #d8d8d8 100%)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "28px 20px 32px",
          }}>
            {/* Relative wrapper so side buttons can be absolutely positioned */}
            <div style={{ position: "relative", flexShrink: 0 }}>

              {/* ── Side buttons ───────────────────────────────── */}
              {/* Mute switch */}
              <div style={{ position: "absolute", left: -6, top: 98, width: 5, height: 30, background: "linear-gradient(90deg, #8c8c92, #c0c0c6)", borderRadius: "3px 0 0 3px", boxShadow: "-1px 0 3px rgba(0,0,0,0.22)" }} />
              {/* Volume up */}
              <div style={{ position: "absolute", left: -6, top: 142, width: 5, height: 52, background: "linear-gradient(90deg, #8c8c92, #c0c0c6)", borderRadius: "3px 0 0 3px", boxShadow: "-1px 0 3px rgba(0,0,0,0.22)" }} />
              {/* Volume down */}
              <div style={{ position: "absolute", left: -6, top: 206, width: 5, height: 52, background: "linear-gradient(90deg, #8c8c92, #c0c0c6)", borderRadius: "3px 0 0 3px", boxShadow: "-1px 0 3px rgba(0,0,0,0.22)" }} />
              {/* Power / side button */}
              <div style={{ position: "absolute", right: -6, top: 166, width: 5, height: 80, background: "linear-gradient(90deg, #c0c0c6, #8c8c92)", borderRadius: "0 3px 3px 0", boxShadow: "1px 0 3px rgba(0,0,0,0.22)" }} />

              {/* ── Phone body ─────────────────────────────────── */}
              <div style={{
                width: PHONE_BODY_WIDTH,
                height: PHONE_BODY_HEIGHT,
                background: "linear-gradient(155deg, #f2f2f4 0%, #dcdce0 35%, #c8c8cc 65%, #b8b8be 100%)",
                border: "1.5px solid #a0a0a8",
                borderRadius: 44,
                padding: PHONE_BEZEL,
                boxShadow: [
                  "0 32px 80px rgba(0,0,0,0.30)",
                  "0 12px 32px rgba(0,0,0,0.18)",
                  "0 4px 10px rgba(0,0,0,0.12)",
                  "inset 0 1px 0 rgba(255,255,255,0.75)",
                  "inset 0 -1px 0 rgba(0,0,0,0.06)",
                ].join(", "),
                display: "flex",
                flexDirection: "column",
              }}>

                {/* ── Screen ───────────────────────────────────── */}
                <div style={{
                  borderRadius: 28,
                  overflow: "hidden",
                  background: "#ffffff",
                  height: PHONE_SCREEN_HEIGHT,
                  flex: "0 0 auto",
                  position: "relative",
                }}>
                  {/* Scaled app content */}
                  <div style={{
                    width: MOBILE_INNER_WIDTH,
                    transform: `scale(${MOBILE_SCALE})`,
                    transformOrigin: "top left",
                  }}>
                    <MobileMock {...mockProps} />
                  </div>

                  {/* Home indicator — inside screen at bottom */}
                  <div style={{
                    position: "absolute",
                    bottom: 8,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 100,
                    height: 4,
                    borderRadius: 2,
                    background: "rgba(0,0,0,0.22)",
                  }} />
                </div>

                {/* Slim bottom bezel spacer */}
                <div style={{ height: PHONE_BOTTOM_BEZEL }} />

              </div>
            </div>
          </div>
        )}
      </div>
      </Collapse>
    </div>
  );
}
