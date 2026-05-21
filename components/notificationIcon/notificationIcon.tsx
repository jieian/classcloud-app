import { notifications } from "@mantine/notifications";

import {
  IconCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { ReactNode } from "react";

type NotifyType = "success" | "error" | "info" | "warning";

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

function playNotifySound(type: NotifyType) {
  try {
    const ctx = new AudioContext();

    const sounds: Record<NotifyType, { freqs: number[]; gap: number; vol: number; dur: number }> = {
      success: { freqs: [520, 660],  gap: 0.13, vol: 0.08, dur: 0.4  },
      error:   { freqs: [220, 180],  gap: 0.18, vol: 0.12, dur: 0.35 },
      info:    { freqs: [440],       gap: 0,    vol: 0.07, dur: 0.3  },
      warning: { freqs: [380, 380],  gap: 0.15, vol: 0.10, dur: 0.3  },
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
  title: string;
  message: string;
  type?: NotifyType;
  color?: string;
  icon?: ReactNode;
  autoClose?: number | false;
};

export function notify({
  title,
  message,
  type = "info",
  color,
  icon,
  autoClose = 4000,
}: NotifyOptions) {
  playNotifySound(type);
  notifications.show({
    title,
    message,
    color: color ?? colorMap[type],
    icon: icon ?? iconMap[type],
    autoClose,
  });
}
