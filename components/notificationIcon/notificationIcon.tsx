import { notifications } from "@mantine/notifications";

import {
  IconCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconSchool,
  IconShieldLock,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { ReactNode } from "react";

type NotifyType = "success" | "error" | "info" | "warning";
type NotifyMode = "facultyView" | "adminView";
type NotifySound = NotifyType | NotifyMode;
type NotifySoundSpec = {
  freqs: number[];
  gap: number;
  vol: number;
  dur: number;
};

const iconMap: Record<NotifyType, ReactNode> = {
  success: <IconCheck size={20} />,
  error: <IconExclamationCircle size={20} />,
  info: <IconInfoCircle size={20} />,
  warning: <IconAlertTriangle size={20} />,
};

const colorMap: Record<NotifyType, string> = {
  success: "green",
  error: "red",
  info: "blue",
  warning: "yellow",
};

const modeMap: Record<
  NotifyMode,
  {
    title: string;
    message: string;
    color: string;
    icon: ReactNode;
  }
> = {
  facultyView: {
    title: "Switched to Faculty View",
    message: "Showing only classes assigned to you.",
    color: "#4EAE4A",
    icon: <IconSchool size={20} />,
  },
  adminView: {
    title: "Switched to Admin View",
    message: "Showing all classes for the selected school year.",
    color: "#4A72AE",
    icon: <IconShieldLock size={20} />,
  },
};

function playNotifySound(type: NotifySound) {
  try {
    const ctx = new AudioContext();

    const sounds: Record<NotifySound, NotifySoundSpec> = {
      success: { freqs: [520, 660], gap: 0.13, vol: 0.08, dur: 0.4 },
      error: { freqs: [220, 180], gap: 0.18, vol: 0.12, dur: 0.35 },
      info: { freqs: [440], gap: 0, vol: 0.07, dur: 0.3 },
      warning: { freqs: [380, 380], gap: 0.15, vol: 0.1, dur: 0.3 },
      facultyView: { freqs: [494, 622], gap: 0.11, vol: 0.075, dur: 0.34 },
      adminView: { freqs: [392, 523], gap: 0.12, vol: 0.075, dur: 0.34 },
    };

    const { freqs, gap, vol, dur } = sounds[type];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * gap;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.start(start);
      osc.stop(start + dur);
    });
  } catch {
    // AudioContext not available
  }
}

type NotifyOptions = {
  title?: string;
  message?: string;
  type?: NotifyType;
  mode?: NotifyMode;
  color?: string;
  icon?: ReactNode;
  autoClose?: number | false;
};

export function notify({
  title,
  message,
  type = "info",
  mode,
  color,
  icon,
  autoClose = 3000,
}: NotifyOptions) {
  const modeConfig = mode ? modeMap[mode] : null;

  playNotifySound(mode ?? type);
  notifications.show({
    title: title ?? modeConfig?.title ?? "Notice",
    message: message ?? modeConfig?.message ?? "",
    color: color ?? modeConfig?.color ?? colorMap[type],
    icon: icon ?? modeConfig?.icon ?? iconMap[type],
    autoClose,
  });
}
