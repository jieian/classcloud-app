"use client";

import { useEffect, useState } from "react";
import { Anchor, Button, Checkbox, Drawer, Group, Modal, Stack, Text } from "@mantine/core";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";
import PrivacyNoticeContent from "@/app/privacy/_components/PrivacyNoticeContent";

// Marks, per browser session, that the signed-in user's consent has been resolved
// (already current, or just re-acknowledged) so we never re-query on navigation.
// The marker is `${uid}:${version}` so a different user — or a newly deployed
// notice version (reloaded bundle) — forces a fresh check; intra-session
// navigation never re-queries.
const SESSION_KEY = "cc_consent_checked";
const marker = (uid: string) => `${uid}:${PRIVACY_NOTICE_VERSION}`;

/**
 * Blocking re-consent gate (RA 10173). When the signed-in user's stored
 * privacy_consent_version is NULL (legacy account) or older than the current
 * PRIVACY_NOTICE_VERSION, this modal requires them to re-acknowledge the Privacy
 * Notice before continuing.
 *
 * Efficiency: the detection query runs at most ONCE per session (guarded by
 * SESSION_KEY), never per navigation. Invited users consent at activation, so
 * their version is already current and they never see this.
 *
 * Mounted once in app/(app)/layout.tsx inside <AuthProvider>.
 */
export default function PrivacyReconsentModal() {
  const { user } = useAuth();
  const [opened, setOpened] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Resolved already this session for this user + version — no query.
    if (sessionStorage.getItem(SESSION_KEY) === marker(user.id)) return;

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from("users")
          .select("privacy_consent_version, must_change_password")
          .eq("uid", user.id)
          .maybeSingle();

        if (cancelled || !data) return;

        // Password change comes first; the forced-password modal handles them.
        // Don't mark resolved — re-check after that flow completes.
        if (data.must_change_password === true) return;

        if (data.privacy_consent_version === PRIVACY_NOTICE_VERSION) {
          sessionStorage.setItem(SESSION_KEY, marker(user.id));
          return;
        }

        // NULL (legacy/never-consented) or an older version → require re-consent.
        setOpened(true);
      } catch {
        // Non-fatal: if the check fails, fall through without blocking the app.
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-run only when the signed-in user changes; `user` object identity is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Block navbar/link navigation while the gate is open.
  useEffect(() => {
    if (!opened) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      // Allow opening the Privacy Notice (and other external/anchor links).
      if (/^(https?:|#|mailto:|tel:)/.test(href) || href === "/privacy") return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [opened]);

  const handleAccept = async () => {
    if (!agreed || !user) return;
    try {
      setSaving(true);
      const res = await fetch("/api/settings/privacy-consent", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to record your consent.");
      }
      sessionStorage.setItem(SESSION_KEY, marker(user.id));
      setOpened(false);
      notify({
        type: "success",
        title: "Thank you",
        message: "Your acknowledgement of the updated Privacy Notice has been recorded.",
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Failed to record your consent.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        size="lg"
        padding="xl"
        title={
          <Text fw={700} fz="lg" c="#45903B">
            We&apos;ve updated our Privacy Notice
          </Text>
        }
      >
        <Stack gap="md">
          <Text size="sm" c="#3a3f4a" style={{ lineHeight: 1.6 }}>
            Our Privacy Notice has been updated. To continue using ClassCloud, please review it and
            confirm your acknowledgement. This is required under the Data Privacy Act of 2012
            (Republic Act No. 10173).
          </Text>

          <Checkbox
            color="#4EAE4A"
            checked={agreed}
            onChange={(e) => setAgreed(e.currentTarget.checked)}
            label={
              <Text size="sm">
                I have read and agree to the{" "}
                <Anchor
                  component="button"
                  type="button"
                  c="#4EAE4A"
                  onClick={() => setNoticeOpen(true)}
                >
                  updated Privacy Notice
                </Anchor>
                .
              </Text>
            }
          />

          <Group justify="flex-end">
            <Button
              radius="md"
              style={agreed ? { backgroundColor: "#4EAE4A" } : undefined}
              disabled={!agreed}
              loading={saving}
              onClick={handleAccept}
            >
              Agree and Continue
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        opened={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        position="bottom"
        size="90vh"
        title={
          <Text fw={700} fz="md" c="#45903B">
            Privacy Notice
          </Text>
        }
      >
        <PrivacyNoticeContent />
      </Drawer>
    </>
  );
}
