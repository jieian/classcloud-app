"use client";

import { useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Collapse,
  Group,
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

export default function SubjectCoordinatorsSection() {
  const [opened, { toggle }] = useDisclosure(false);
  const [search, setSearch] = useState("");
  const [coordinatorCount, setCoordinatorCount] = useState<number | null>(null);
  const [hasIncompleteAssignments, setHasIncompleteAssignments] = useState(false);
  const tableRef = useRef<SubjectCoordinatorsTableWrapperRef>(null);

  return (
    <>
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
                backgroundColor: "#FF6666",
              },
              icon: {
                alignSelf: "center",
                marginTop: 0,
              },
            }}
            icon={
              <ThemeIcon color="white" variant="transparent" size="md">
                <IconAlertTriangle size={20} />
              </ThemeIcon>
            }
          >
            <Text fw={700} size="sm">
              Incomplete Subject Coordinator Assignments
            </Text>
            <Text size="sm" fs="italic">
              One or more subject groups currently have no assigned subject coordinator.
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
    </>
  );
}
