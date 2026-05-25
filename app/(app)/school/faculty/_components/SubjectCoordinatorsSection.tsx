"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Collapse,
  Group,
  Paper,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconRefresh,
} from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import SubjectCoordinatorsTableWrapper, {
  type SubjectCoordinatorsTableWrapperRef,
} from "./SubjectCoordinatorsTableWrapper";

interface SubjectCoordinatorsSectionProps {
  defaultOpen?: boolean;
  glowOnMount?: boolean;
}

export default function SubjectCoordinatorsSection({
  defaultOpen = false,
  glowOnMount = false,
}: SubjectCoordinatorsSectionProps) {
  const [opened, { toggle }] = useDisclosure(defaultOpen);
  const [glowing, setGlowing] = useState(glowOnMount);
  const [search, setSearch] = useState("");
  const [coordinatorCount, setCoordinatorCount] = useState<number | null>(null);
  const [hasIncompleteAssignments, setHasIncompleteAssignments] =
    useState(false);
  const tableRef = useRef<SubjectCoordinatorsTableWrapperRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!glowOnMount) return;

    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 520; // gentle mid tone
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // AudioContext not available
    }

    const timer = setTimeout(() => setGlowing(false), 3000);
    return () => clearTimeout(timer);
  }, [glowOnMount]);

  const glowStyle: CSSProperties = {
    borderRadius: 8,
    padding: glowing ? 16 : 0,
    boxShadow: glowing
      ? "0 0 0 3px #4EAE4A, 0 4px 16px rgba(78,174,74,0.20)"
      : undefined,
    transition: "box-shadow 1.2s ease, padding 0.3s ease",
  };

  return (
    <div ref={wrapperRef} style={glowStyle}>
      <UnstyledButton onClick={toggle} w="100%">
        <Group justify="space-between" align="center">
          <h2
            className="mb-3 text-2xl font-bold"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            Subject Coordinators{" "}
            {coordinatorCount !== null && (
              <span className="text-[#808898]">({coordinatorCount})</span>
            )}
            {hasIncompleteAssignments && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "#fa5252",
                  flexShrink: 0,
                  marginBottom: 2,
                }}
              />
            )}
          </h2>
          <IconChevronDown
            size={22}
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
              color: "#808898",
              marginBottom: 12,
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <p className="mb-3 text-sm text-[#808898]">
          Leads who monitor a specific subject group across all grade levels.
          They ensure all teachers within that group complete and submit their
          academic reports.
        </p>
        <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
          <SearchBar
            id="search-subject-coordinators"
            placeholder="Search subject coordinators..."
            ariaLabel="Search subject coordinators"
            style={{ flex: 1, minWidth: 0 }}
            maw={700}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Tooltip label="Refresh" position="bottom" withArrow>
            <ActionIcon
              variant="outline"
              color="#808898"
              size="lg"
              radius="xl"
              aria-label="Refresh subject coordinators"
              onClick={() => tableRef.current?.refresh()}
            >
              <IconRefresh size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {hasIncompleteAssignments && (
          <Alert
            variant="filled"
            radius="md"
            mb="md"
            styles={{
              root: {
                backgroundColor: "#fae173",
              },
              icon: {
                alignSelf: "center",
                marginTop: 0,
              },
            }}
            icon={
              <ThemeIcon color="#2A2A2A" variant="transparent" size="md">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
            }
          >
            <Text fw={700} size="sm" c="#2A2A2A">
              Incomplete Subject Coordinator Assignments
            </Text>
            <Text size="sm" fs="italic" c="#2A2A2A">
              One or more subject groups currently have no assigned subject
              coordinator.
            </Text>
          </Alert>
        )}

        <SubjectCoordinatorsTableWrapper
          ref={tableRef}
          search={search}
          onCountChange={setCoordinatorCount}
          onIncompleteChange={setHasIncompleteAssignments}
        />
      </Collapse>
    </div>
  );
}
