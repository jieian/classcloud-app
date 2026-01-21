import { notifications } from "@mantine/notifications";

import {
  IconCheck,
  IconX,
  IconInfoCircle,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { ReactNode } from "react";

type NotifyType = "success" | "error" | "info" | "warning";

const iconMap: Record<NotifyType, ReactNode> = {
  success: <IconCheck size={20} />,
  error: <IconX size={20} />,
  info: <IconInfoCircle size={20} />,
  warning: <IconAlertTriangle size={20} />,
};

const colorMap: Record<NotifyType, string> = {
  success: "green",
  error: "red",
  info: "blue",
  warning: "yellow",
};

type NotifyOptions = {
  title: string;
  message: string;
  type?: NotifyType;
  color?: string;
  icon?: ReactNode;
  autoClose?: number;
};

export function notify({
  title,
  message,
  type = "info",
  color,
  icon,
  autoClose = 4000,
}: NotifyOptions) {
  notifications.show({
    title,
    message,
    color: color ?? colorMap[type],
    icon: icon ?? iconMap[type],
    autoClose,
  });
}
