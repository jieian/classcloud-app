"use client";

import { useRef } from "react";
import { Badge, Box, Divider, Group, Popover, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

interface OverflowSubject {
  curriculum_subject_id?: number;
  code: string;
  name: string;
  subject_type: "BOTH" | "SSES";
  isPending?: boolean;
  sections?: string[];
}

interface SubjectOverflowCardProps {
  subjects: OverflowSubject[];
}

export default function SubjectOverflowCard({ subjects }: SubjectOverflowCardProps) {
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchDevice =
    typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

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

  return (
    <Popover
      opened={opened}
      onClose={close}
      width={220}
      shadow="sm"
      withinPortal
      position="right"
      closeOnClickOutside={isTouchDevice}
    >
      <Popover.Target>
        <Badge
          variant="filled"
          color="gray"
          radius="xl"
          style={{
            cursor: isTouchDevice ? "pointer" : "default",
            backgroundColor: "#868686",
            color: "#FFFFFF",
            minWidth: 44,
            justifyContent: "center",
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          +{subjects.length}
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
          More Subjects
        </Text>
        <Divider my={8} color="#e8f0e8" />
        <Box style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {subjects.map((s) => (
            <Group key={s.curriculum_subject_id ?? s.code} gap={8} wrap="nowrap" align="flex-start">
              <Box
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: s.isPending
                    ? "#F2B861"
                    : s.subject_type === "SSES"
                      ? "#70A2FF"
                      : "#B3B4B4",
                  flexShrink: 0,
                  marginTop: 5,
                }}
              />
              <Box style={{ flex: 1 }}>
                <Text
                  size="sm"
                  c={s.isPending ? "#B26B00" : "dimmed"}
                  style={{ lineHeight: 1.4 }}
                >
                  {s.name}
                </Text>
                {s.sections && s.sections.length > 0 && (
                  <Box style={{ marginTop: 2 }}>
                    {s.sections.map((sec) => (
                      <Text
                        key={sec}
                        size="xs"
                        c="dimmed"
                        style={{ lineHeight: 1.4, opacity: 0.75 }}
                      >
                        {sec}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            </Group>
          ))}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
