"use client";

import { useCallback, useEffect, useState } from "react";
import { Group, Paper, Switch, Text, Tooltip } from "@mantine/core";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { isIOS, isIOSStandalone, urlBase64ToUint8Array } from "@/lib/pwa";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Resolved UI state — see the permission × subscription matrix below.
type PushState =
  | "loading"
  | "unsupported" // browser lacks SW/Push/Notification APIs
  | "ios-needs-install" // iOS Safari, not yet added to Home Screen
  | "denied" // OS permission blocked → disabled + tooltip
  | "on" // permission granted + subscription exists
  | "off"; // permission default/granted + no subscription

function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export default function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  // Resolve the initial state from permission + existing subscription.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        // iOS Safari (not installed) has no PushManager — guide to install.
        if (!cancelled)
          setState(isIOS() && !isIOSStandalone() ? "ios-needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      notify({ type: "error", title: "Push unavailable", message: "Server key not configured." });
      return;
    }
    // Matrix: "default" → prompt; "granted" → no prompt (returns immediately).
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "denied" : "off");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      }),
    });
    if (!res.ok) {
      // Roll back the browser subscription so UI and server stay consistent.
      await sub.unsubscribe().catch(() => {});
      throw new Error("subscribe request failed");
    }
    setState("on");
    notify({ type: "success", title: "Notifications enabled", message: "You'll get alerts on this device." });
  }, []);

  const unsubscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const { endpoint } = sub;
      await sub.unsubscribe().catch(() => {});
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    setState("off");
    notify({ type: "info", title: "Notifications disabled", message: "You won't get alerts on this device." });
  }, []);

  const onToggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state === "on") await unsubscribe();
      else await subscribe();
    } catch (err) {
      console.error("[push toggle]", err);
      notify({ type: "error", title: "Something went wrong", message: "Could not update notification settings." });
    } finally {
      setBusy(false);
    }
  }, [busy, state, subscribe, unsubscribe]);

  // Don't render until we know the state (avoids a flash of the wrong toggle).
  if (state === "loading") return null;

  const checked = state === "on";
  const disabled =
    busy || state === "unsupported" || state === "denied" || state === "ios-needs-install";

  const description =
    state === "ios-needs-install"
      ? "Tap the Share icon, then “Add to Home Screen” to enable notifications."
      : state === "unsupported"
        ? "This browser doesn't support push notifications."
        : state === "denied"
          ? "Notifications are blocked. Enable them in your browser settings."
          : "Get alerts on this device for transfers, reports, and other updates.";

  const control = (
    <Switch
      checked={checked}
      onChange={onToggle}
      disabled={disabled}
      color="#4EAE4A"
      aria-label="Toggle push notifications"
    />
  );

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={700} c="#298925">
            Push Notifications
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {description}
          </Text>
        </div>
        {state === "denied" ? (
          <Tooltip label="Enable notifications in your browser settings" withArrow>
            <div>{control}</div>
          </Tooltip>
        ) : (
          control
        )}
      </Group>
    </Paper>
  );
}
