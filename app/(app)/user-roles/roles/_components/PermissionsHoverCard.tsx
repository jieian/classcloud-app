"use client";

import { useState, useEffect, useRef } from "react";
import { Badge, Box, Divider, Group, Popover, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PERM_DISPLAY_MAP } from "./PermissionsPanel";
import type { Permission } from "../../users/_lib";

interface PermissionsHoverCardProps {
  permissions: Permission[];
}

export default function PermissionsHoverCard({
  permissions,
}: PermissionsHoverCardProps) {
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none)").matches);
  }, []);

  function handleMouseEnter() {
    if (isTouchDevice) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    open();
  }

  function handleMouseLeave() {
    if (isTouchDevice) return;
    closeTimer.current = setTimeout(close, 80);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTouchDevice) toggle();
  }

  const dropdown = (
    <Box style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {permissions.map((p) => (
        <Group key={p.permission_id} gap={8} wrap="nowrap">
          <Box
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: "#4EAE4A",
              flexShrink: 0,
              marginTop: 1,
            }}
          />
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.4 }}>
            {PERM_DISPLAY_MAP[p.name] ?? p.name}
          </Text>
        </Group>
      ))}
    </Box>
  );

  return (
    <Popover
      opened={opened}
      onClose={close}
      width={230}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Badge
          variant="light"
          color="gray"
          style={{ cursor: isTouchDevice ? "pointer" : "default" }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          +{permissions.length} more
        </Badge>
      </Popover.Target>

      <Popover.Dropdown
        style={{
          border: "1px solid #d3e9d0",
          borderRadius: 10,
          padding: "12px 14px",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
      >
        <Text
          size="10px"
          fw={700}
          tt="uppercase"
          c="#4EAE4A"
          style={{ letterSpacing: "0.06em" }}
        >
          Additional Permissions
        </Text>
        <Divider my={8} color="#e8f0e8" />
        {dropdown}
      </Popover.Dropdown>
    </Popover>
  );
}
