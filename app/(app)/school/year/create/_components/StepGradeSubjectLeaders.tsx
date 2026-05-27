"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  Pagination,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useClickOutside, useDisclosure, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
    IconExclamationCircle,
  IconArrowLeft,
  IconBinoculars,
  IconChevronDown,
  IconChevronRight,
  IconPencil,
  IconUser,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import type {
  CreateSchoolYearForm,
  GslDraftMap,
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardCurriculumSubject,
  WizardFacultyOption,
  WizardGradeLevel,
} from "../_lib/types";
import { replicateGslDraft } from "../_lib/replicateService";

const DIRTY_BG = "#FFE6B8";
const ERROR_BG = "#FECACA";
const BORDER_COLOR = "var(--mantine-color-gray-3)";
const PAGE_SIZE = 5;

// ── Wizard-adapted entry (mirrors SubjectLeaderEntry from facultyService) ──────

interface WizardGslEntry {
  curriculum_subject_id: number;
  grade_level_id: number;
  subject_name: string;
  subject_description: string | null;
  subject_type: "BOTH" | "SSES";
  leader: { uid: string; first_name: string; last_name: string } | null;
  draftKey: string;
}

// ── Main export ────────────────────────────────────────────────────────────────

interface StepGradeSubjectLeadersProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  prevSy: {
    sy_id: number;
    start_year: number;
    curriculum_id: number | null;
  } | null;
  snapshot: PreviousSySnapshot | null;
  snapshotLoading: boolean;
  onSnapshotNeeded: () => Promise<void>;
  gslDraft: GslDraftMap;
  setGslDraft: React.Dispatch<React.SetStateAction<GslDraftMap>>;
  extraGslNames: Map<string, string>;
  setExtraGslNames: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

export default function StepGradeSubjectLeaders({
  form,
  curriculumDetail,
  faculty,
  prevSy,
  snapshot,
  snapshotLoading,
  onSnapshotNeeded,
  gslDraft,
  setGslDraft,
  extraGslNames,
  setExtraGslNames,
}: StepGradeSubjectLeadersProps) {
  const hasPrevSy = prevSy !== null;
  const mode = form.values.step5Mode;

  if (hasPrevSy && mode === null) {
    return (
      <ModePicker
        onSelect={async (selected) => {
          if (selected === "replicate") {
            await onSnapshotNeeded();
          }
          form.setFieldValue("step5Mode", selected);
          if (selected === "replicate" && snapshot) {
            setGslDraft(replicateGslDraft(snapshot, curriculumDetail));
          } else if (selected === "scratch") {
            setGslDraft(new Map());
          }
        }}
        snapshotLoading={snapshotLoading}
      />
    );
  }

  return (
    <GslAssignmentTable
      curriculumDetail={curriculumDetail}
      faculty={faculty}
      gslDraft={gslDraft}
      setGslDraft={setGslDraft}
      extraGslNames={extraGslNames}
      setExtraGslNames={setExtraGslNames}
      hasPrevSy={hasPrevSy}
      mode={form.values.step5Mode ?? "scratch"}
      snapshot={snapshot}
      onResetMode={() => {
        form.setFieldValue("step5Mode", null);
        setGslDraft(new Map());
      }}
    />
  );
}

// ── Mode picker ────────────────────────────────────────────────────────────────

function ModePicker({
  onSelect,
  snapshotLoading,
}: {
  onSelect: (mode: "scratch" | "replicate") => Promise<void>;
  snapshotLoading: boolean;
}) {
  const [loading, setLoading] = useState<"scratch" | "replicate" | null>(null);

  async function handleSelect(mode: "scratch" | "replicate") {
    setLoading(mode);
    try {
      await onSelect(mode);
    } finally {
      setLoading(null);
    }
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Assign Grade Subject Leaders
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Stack gap="lg" align="center" py="xl">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconBinoculars size={36} />
          </ThemeIcon>
          <Text fw={600} size="lg" ta="center" mb="md">
            How would you like to assign grade subject leaders?
          </Text>

          <Group gap="sm" justify="center" wrap="wrap">
            <Button
              variant="outline"
              color="#4EAE4A"
              loading={loading === "scratch"}
              disabled={loading !== null}
              onClick={() => handleSelect("scratch")}
            >
              Start from Scratch
            </Button>
            <Button
              variant="filled"
              color="#4EAE4A"
              loading={loading === "replicate" || snapshotLoading}
              disabled={loading !== null}
              onClick={() => handleSelect("replicate")}
            >
              Replicate Previous School Year
            </Button>
          </Group>
        </Stack>
      </Box>
    </Box>
  );
}

// ── GSL assignment table ───────────────────────────────────────────────────────

interface GslAssignmentTableProps {
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  gslDraft: GslDraftMap;
  setGslDraft: React.Dispatch<React.SetStateAction<GslDraftMap>>;
  extraGslNames: Map<string, string>;
  setExtraGslNames: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  hasPrevSy: boolean;
  mode: "scratch" | "replicate";
  snapshot: PreviousSySnapshot | null;
  onResetMode: () => void;
}

function GslAssignmentTable({
  curriculumDetail,
  faculty,
  gslDraft,
  setGslDraft,
  extraGslNames,
  setExtraGslNames,
  hasPrevSy,
  mode,
  snapshot,
  onResetMode,
}: GslAssignmentTableProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const [editingEntry, setEditingEntry] = useState<WizardGslEntry | null>(null);

  const facultyNames = useMemo(() => {
    const map = new Map(
      faculty.map((f) => [f.uid, `${f.first_name} ${f.last_name}`]),
    );
    for (const [uid, name] of extraGslNames) map.set(uid, name);
    return map;
  }, [faculty, extraGslNames]);

  // Stable baseline for dirty tracking in replicate mode
  const originalDraft = useMemo(() => {
    if (mode !== "replicate" || !snapshot)
      return new Map<string, string | null>();
    return replicateGslDraft(snapshot, curriculumDetail);
  }, [mode, snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  function isCellDirty(key: string): boolean {
    if (mode !== "replicate") return false;
    return (gslDraft.get(key) ?? null) !== (originalDraft.get(key) ?? null);
  }

  // Set of all UIDs currently used in the draft (for filtering in modal)
  const assignedLeaderUids = useMemo(() => {
    const s = new Set<string>();
    for (const uid of gslDraft.values()) {
      if (uid) s.add(uid);
    }
    return s;
  }, [gslDraft]);

  // Compute missing counts per grade level
  const { totalMissing, panelMissing } = useMemo(() => {
    let total = 0;
    const perPanel = new Map<number, number>();
    for (const gl of curriculumDetail.grade_levels) {
      let glMissing = 0;
      for (const sub of gl.subjects) {
        const key = `gsl:${gl.grade_level_id}:${sub.curriculum_subject_id}`;
        if (!gslDraft.get(key)) glMissing++;
      }
      if (glMissing > 0) {
        perPanel.set(gl.grade_level_id, glMissing);
        total += glMissing;
      }
    }
    return { totalMissing: total, panelMissing: perPanel };
  }, [gslDraft, curriculumDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildEntries(gl: WizardGradeLevel): WizardGslEntry[] {
    return gl.subjects.map((sub) => {
      const draftKey = `gsl:${gl.grade_level_id}:${sub.curriculum_subject_id}`;
      const uid = gslDraft.get(draftKey) ?? null;
      const leaderFaculty = uid ? faculty.find((f) => f.uid === uid) : null;
      const leaderName = uid ? (facultyNames.get(uid) ?? null) : null;
      return {
        curriculum_subject_id: sub.curriculum_subject_id,
        grade_level_id: gl.grade_level_id,
        subject_name: sub.name,
        subject_description: sub.description ?? null,
        subject_type: sub.subject_type,
        leader:
          uid && leaderName
            ? {
                uid,
                first_name:
                  leaderFaculty?.first_name ?? leaderName.split(" ")[0] ?? "",
                last_name:
                  leaderFaculty?.last_name ??
                  leaderName.split(" ").slice(1).join(" ") ??
                  "",
              }
            : null,
        draftKey,
      };
    });
  }

  function handleAssign(
    draftKey: string,
    uid: string | null,
    name: string | null,
  ) {
    setGslDraft((prev) => {
      const next = new Map(prev);
      if (!uid) {
        next.delete(draftKey);
      } else {
        next.set(draftKey, uid);
      }
      return next;
    });
    if (uid && name && !facultyNames.has(uid)) {
      setExtraGslNames((prev) => new Map(prev).set(uid, name));
    }
    setEditingEntry(null);
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Assign Grade Subject Leaders
      </Text>

      <Box p="lg" style={{ border: "1px solid #B8B8B8", borderRadius: "8px" }}>
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Grade Subject Leaders
        </Text>
        <p className="mb-3 text-sm text-[#808898]">
          Assign a leader to each subject within grade levels.
        </p>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          Grade Subject Leader Assignments{" "}
          <Text span c="red">
            *
          </Text>
        </Text>

        <Box
          mt="md"
          mb="lg"
          p="md"
          style={{
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
          }}
        >
          <Stack gap="sm">
            {totalMissing > 0 && (
              <Alert
                variant="filled"
                radius="md"
                styles={{
                  root: { backgroundColor: "#FF6666" },
                  icon: { alignSelf: "center", marginTop: 0 },
                }}
                icon={
                  <ThemeIcon color="white" variant="transparent" size="md">
                    <IconExclamationCircle size={20} />
                  </ThemeIcon>
                }
              >
                <Text fw={700} size="sm" c="white">
                  Incomplete Grade Subject Leader Assignments
                </Text>
                <Text size="sm" fs="italic" c="white">
                  {totalMissing === 1
                    ? "One subject is missing a grade subject leader."
                    : `${totalMissing} subjects are missing a grade subject leader.`}
                </Text>
              </Alert>
            )}

            {curriculumDetail.grade_levels.map((gl) => (
              <GradeLevelPanel
                key={gl.grade_level_id}
                gl={gl}
                entries={buildEntries(gl)}
                gslDraft={gslDraft}
                missingCount={panelMissing.get(gl.grade_level_id) ?? 0}
                isCellDirty={isCellDirty}
                isMobile={isMobile ?? false}
                onEdit={setEditingEntry}
              />
            ))}
          </Stack>
        </Box>

        {hasPrevSy && (
          <Button
            onClick={() => {
              let resetId!: string;
              resetId = modals.openConfirmModal({
                title: "Change setup mode?",
                children: (
                  <Text size="sm">
                    Going back will discard all grade subject leader assignments
                    you have configured so far. This cannot be undone.
                  </Text>
                ),
                labels: { confirm: "Yes, go back", cancel: "Keep editing" },
                confirmProps: { color: "red" },
                onConfirm: () => {
                  onResetMode();
                  modals.close(resetId);
                },
                ...confirmModalProps,
              });
            }}
            variant="default"
            radius="md"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back to mode selection
          </Button>
        )}
      </Box>

      <WizardEditGslModal
        opened={editingEntry !== null}
        entry={editingEntry}
        faculty={faculty}
        assignedLeaderUids={assignedLeaderUids}
        isMobile={isMobile ?? false}
        onClose={() => setEditingEntry(null)}
        onAssign={handleAssign}
      />
    </Box>
  );
}

// ── Grade level panel ─────────────────────────────────────────────────────────

function GradeLevelPanel({
  gl,
  entries,
  gslDraft,
  missingCount,
  isCellDirty,
  isMobile,
  onEdit,
}: {
  gl: WizardGradeLevel;
  entries: WizardGslEntry[];
  gslDraft: GslDraftMap;
  missingCount: number;
  isCellDirty: (key: string) => boolean;
  isMobile: boolean;
  onEdit: (entry: WizardGslEntry) => void;
}) {
  const [opened, setOpened] = useState(false);

  // Header turns orange when any cell is dirty
  const hasDirtyCell = useMemo(
    () => entries.some((e) => isCellDirty(e.draftKey)),
    [gslDraft, entries], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const headerBg = hasDirtyCell ? DIRTY_BG : "#ffffff";

  return (
    <Box
      style={{
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setOpened((o) => !o)}
        style={{
          width: "100%",
          backgroundColor: headerBg,
          transition: "background-color 200ms ease",
        }}
        px="md"
        py={12}
      >
        <Group justify="space-between" align="center">
          <Group gap={6} wrap="nowrap" align="center">
            <Text fw={700} size="sm">
              {gl.display_name}
            </Text>
            <Text c="#808898" size="sm">
              ({gl.subjects.length})
            </Text>
            {missingCount > 0 && (
              <Tooltip
                label={`${missingCount} subject${missingCount > 1 ? "s" : ""} missing a grade subject leader`}
                withArrow
                position="top"
                events={
                  isMobile
                    ? { hover: false, focus: false, touch: true }
                    : undefined
                }
              >
                <IconExclamationCircle
                  size={16}
                  color="#EF4444"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
          <IconChevronDown
            size={16}
            color="#555"
            style={{
              transform: opened ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        {opened && (
          <div
            style={{
              borderTop: `1px solid ${BORDER_COLOR}`,
              padding: "16px 20px",
            }}
          >
            <GslTable
              entries={entries}
              gslDraft={gslDraft}
              isCellDirty={isCellDirty}
              onEdit={onEdit}
            />
          </div>
        )}
      </Collapse>
    </Box>
  );
}

// ── GSL table (mirrors GradeSubjectLeadersTable.tsx) ──────────────────────────

function sortEntries(entries: WizardGslEntry[]): WizardGslEntry[] {
  return [...entries].sort((a, b) => {
    const aNoLeader = a.leader === null ? 0 : 1;
    const bNoLeader = b.leader === null ? 0 : 1;
    if (aNoLeader !== bNoLeader) return aNoLeader - bNoLeader;
    const aSses = a.subject_type === "SSES" ? 0 : 1;
    const bSses = b.subject_type === "SSES" ? 0 : 1;
    if (aSses !== bSses) return aSses - bSses;
    return a.subject_name.localeCompare(b.subject_name);
  });
}

function SsesLabel() {
  return (
    <Badge
      size="xs"
      variant="filled"
      radius="xl"
      style={{ backgroundColor: "#70A2FF", color: "#fff", flexShrink: 0 }}
    >
      SSES
    </Badge>
  );
}

function GslTable({
  entries,
  gslDraft,
  isCellDirty,
  onEdit,
}: {
  entries: WizardGslEntry[];
  gslDraft: GslDraftMap;
  isCellDirty: (key: string) => boolean;
  onEdit: (entry: WizardGslEntry) => void;
}) {
  const sorted = useMemo(() => sortEntries(entries), [entries, gslDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const tableRef = useClickOutside(() => setSelectedId(null));

  // Deselect whenever gslDraft changes (after an assignment)
  useEffect(() => {
    setSelectedId(null);
  }, [gslDraft]);

  if (sorted.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No subjects found for this grade level.
      </Text>
    );
  }

  function handleRowClick(entry: WizardGslEntry) {
    if (selectedId === entry.curriculum_subject_id) {
      onEdit(entry);
    } else {
      setSelectedId(entry.curriculum_subject_id);
    }
  }

  const rows = sorted.map((entry) => {
    const leaderName = entry.leader
      ? `${entry.leader.first_name} ${entry.leader.last_name}`
      : null;
    const isSelected = selectedId === entry.curriculum_subject_id;
    const isDirty = isCellDirty(entry.draftKey);
    const isEmpty = entry.leader === null;

    // Row background: selected > dirty > default (no red — IconExclamationCircle signals missing)
    let rowBg: string | undefined;
    if (isSelected) rowBg = "#f0f7ee";
    else if (isDirty) rowBg = DIRTY_BG;

    return (
      <TableTr
        key={entry.curriculum_subject_id}
        onClick={(e) => {
          e.stopPropagation();
          handleRowClick(entry);
        }}
        style={{
          cursor: "pointer",
          backgroundColor: rowBg,
          transition: "background-color 0.15s ease",
        }}
      >
        <TableTd>
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="sm" fw={500}>
              {entry.subject_name}
            </Text>
            {entry.subject_type === "SSES" && <SsesLabel />}
            {entry.leader === null && (
              <Tooltip
                label="No grade subject leader assigned"
                withArrow
                position="top"
              >
                <IconExclamationCircle
                  size={14}
                  color="#EF4444"
                  style={{ flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Group>
        </TableTd>
        <TableTd>
          <Text c="dimmed" size="sm">
            {entry.subject_description ?? "--"}
          </Text>
        </TableTd>
        <TableTd>
          {leaderName ? (
            <Text size="sm">{leaderName}</Text>
          ) : (
            <Text c="dimmed" size="sm" fs="italic">
              None
            </Text>
          )}
        </TableTd>
        <TableTd w={40}>
          <Group justify="flex-end" onClick={(e) => e.stopPropagation()}>
            <Tooltip
              label="Edit grade subject leader"
              withArrow
              position="left"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit grade subject leader"
                onClick={() => onEdit(entry)}
              >
                <IconPencil size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </TableTd>
      </TableTr>
    );
  });

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block">
        <TableScrollContainer minWidth={600} type="native" ref={tableRef}>
          <Table
            verticalSpacing="sm"
            horizontalSpacing="md"
            highlightOnHover
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "37%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "40px" }} />
            </colgroup>
            <TableThead>
              <TableTr>
                <TableTh>Subject Name</TableTh>
                <TableTh>Description</TableTh>
                <TableTh>Grade Subject Leader</TableTh>
                <TableTh w={40} ta="right">
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>{rows}</TableTbody>
          </Table>
        </TableScrollContainer>
      </div>

      {/* Mobile accordion */}
      <div className="sm:hidden">
        <Divider />
        {sorted.map((entry) => (
          <GslMobileRow
            key={entry.curriculum_subject_id}
            entry={entry}
            isDirty={isCellDirty(entry.draftKey)}
            onEdit={onEdit}
          />
        ))}
      </div>
    </>
  );
}

// ── Mobile row (mirrors GradeSubjectLeaderMobileRow) ──────────────────────────

function GslMobileRow({
  entry,
  isDirty,
  onEdit,
}: {
  entry: WizardGslEntry;
  isDirty: boolean;
  onEdit: (entry: WizardGslEntry) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const leaderName = entry.leader
    ? `${entry.leader.first_name} ${entry.leader.last_name}`
    : null;

  const rowBg = isDirty ? DIRTY_BG : undefined;

  return (
    <>
      <div
        onClick={toggle}
        style={{
          cursor: "pointer",
          padding: "12px 4px",
          backgroundColor: rowBg,
          transition: "background-color 0.15s ease",
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <IconChevronRight
              size={16}
              style={{
                transform: opened ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 200ms ease",
                flexShrink: 0,
                color: "#808898",
              }}
            />
            <Group
              gap={6}
              wrap="nowrap"
              align="center"
              style={{ flex: 1, minWidth: 0 }}
            >
              <Text
                fw={500}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.subject_name}
              </Text>
              {entry.subject_type === "SSES" && <SsesLabel />}
              {entry.leader === null && (
                <Tooltip
                  label="No grade subject leader assigned"
                  withArrow
                  position="top"
                >
                  <IconExclamationCircle
                    size={14}
                    color="#EF4444"
                    style={{ flexShrink: 0 }}
                  />
                </Tooltip>
              )}
            </Group>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>
            <Tooltip
              label="Edit grade subject leader"
              withArrow
              position="left"
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit grade subject leader"
                onClick={() => onEdit(entry)}
              >
                <IconPencil size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Group>
      </div>

      <Collapse in={opened}>
        <Box pb="md" pl={28} pr={4}>
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Description
          </Text>
          <Text
            fz="sm"
            c={entry.subject_description ? undefined : "dimmed"}
            fs={entry.subject_description ? undefined : "italic"}
            mb="sm"
          >
            {entry.subject_description ?? "—"}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Grade Subject Leader
          </Text>
          {leaderName ? (
            <Text fz="sm">{leaderName}</Text>
          ) : (
            <Text fz="sm" c="dimmed" fs="italic">
              None
            </Text>
          )}
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ── Wizard-adapted Edit GSL modal (mirrors EditGradeSubjectLeaderModal.tsx) ────

interface WizardEditGslModalProps {
  opened: boolean;
  entry: WizardGslEntry | null;
  faculty: WizardFacultyOption[];
  assignedLeaderUids: Set<string>;
  isMobile: boolean;
  onClose: () => void;
  onAssign: (draftKey: string, uid: string | null, name: string | null) => void;
}

function WizardEditGslModal({
  opened,
  entry,
  faculty,
  assignedLeaderUids,
  isMobile,
  onClose,
  onAssign,
}: WizardEditGslModalProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const confirmModalStyles = isMobile
    ? {
        inner: { alignItems: "flex-end", paddingBottom: "20px" },
        content: {
          width: "100%",
          maxWidth: "100%",
          borderRadius: "12px 12px 0 0",
        },
      }
    : {};

  useEffect(() => {
    if (!opened) return;
    setSearch("");
    setPage(1);
  }, [opened]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    // Exclude anyone already assigned as a GSL elsewhere — including the current slot's leader
    // (they are shown in the current assignment card above, not in the list)
    const available = faculty.filter((f) => !assignedLeaderUids.has(f.uid));

    const list = search.trim()
      ? (() => {
          const query = search.toLowerCase().trim();
          return available.filter((f) =>
            `${f.first_name} ${f.last_name}`.toLowerCase().includes(query),
          );
        })()
      : available;

    return [...list].sort(
      (a, b) =>
        a.first_name.localeCompare(b.first_name) ||
        a.last_name.localeCompare(b.last_name),
    );
  }, [faculty, assignedLeaderUids, search, entry]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedCandidates = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentLeaderName = entry?.leader
    ? `${entry.leader.first_name} ${entry.leader.last_name}`
    : null;

  function openConfirm(candidate: WizardFacultyOption) {
    if (!entry) return;
    const candidateName = `${candidate.first_name} ${candidate.last_name}`;
    modals.openConfirmModal({
      title: "Confirm Assignment",
      styles: confirmModalStyles,
      labels: { confirm: "Confirm", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      children: (
        <Text size="sm">
          Assign{" "}
          <Text span fw={600}>
            {candidateName}
          </Text>{" "}
          as Grade Subject Leader for{" "}
          <Text span fw={600}>
            {entry.subject_name}
          </Text>
          ?
          {currentLeaderName && (
            <>
              {" "}
              This will replace the current leader,{" "}
              <Text span fw={600}>
                {currentLeaderName}
              </Text>
              .
            </>
          )}
        </Text>
      ),
      onConfirm: () => {
        onAssign(entry!.draftKey, candidate.uid, candidateName);
      },
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      transitionProps={{
        onEntered: () => document.getElementById("search-wizard-gsl")?.focus(),
      }}
      title="Edit Grade Subject Leader"
      centered
      size="lg"
      vars={() => ({
        root: {},
        inner: {
          "--modal-y-offset": isMobile ? "16px" : "5dvh",
          "--modal-x-offset": isMobile ? "16px" : "10px",
        },
      })}
      styles={{
        content: { maxHeight: "85dvh" },
        body: { overflowY: "auto" },
      }}
    >
      <Text size="sm" c="dimmed" mb="md">
        Select a faculty member to assign as Grade Subject Leader for{" "}
        <Text span fw={600}>
          {entry?.subject_name ?? ""}
        </Text>
        .
      </Text>

      {/* Current assignment card */}
      {entry?.leader && currentLeaderName && (
        <Box
          mb="md"
          px="md"
          py="sm"
          style={{
            border: "1px solid #D7DCE5",
            borderRadius: 12,
            backgroundColor: "#F3F4F6",
          }}
        >
          <Group
            wrap="nowrap"
            align="flex-start"
            gap="sm"
            justify="space-between"
          >
            <Group wrap="nowrap" align="flex-start" gap="sm">
              <ThemeIcon
                size="md"
                radius="xl"
                variant="light"
                color="gray"
                style={{ flexShrink: 0, marginTop: 2 }}
              >
                <IconUser size={16} />
              </ThemeIcon>
              <div>
                <Text fw={700} size="sm">
                  Current Grade Subject Leader
                </Text>
                <Text size="sm" c="dimmed">
                  {entry.subject_name}
                </Text>
                <Text size="sm" mt={2}>
                  {currentLeaderName}
                </Text>
              </div>
            </Group>
            <Button
              variant="filled"
              color="red"
              size="xs"
              onClick={() => {
                if (!entry) return;
                onAssign(entry.draftKey, null, null);
              }}
            >
              Remove
            </Button>
          </Group>
        </Box>
      )}

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-wizard-gsl"
          placeholder="Search faculty..."
          ariaLabel="Search faculty"
          style={{ flex: 1, minWidth: 0 }}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          autoFocus
        />
      </Group>

      {filtered.length === 0 && search.trim() && <EmptySearchState />}

      {filtered.length === 0 && !search.trim() && (
        <EmptySearchState
          title="No eligible faculty available."
          description="All faculty members are already assigned as grade subject leaders."
        />
      )}

      {filtered.length > 0 && (
        <>
          <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Name</TableTh>
                <TableTh w={120} ta="right" />
              </TableTr>
            </TableThead>
            <TableTbody>
              {pagedCandidates.map((candidate) => (
                <TableTr key={candidate.uid}>
                  <TableTd>
                    <Text size="sm" fw={500}>
                      {candidate.first_name} {candidate.last_name}
                    </Text>
                  </TableTd>
                  <TableTd ta="right">
                    <Button
                      color="#4EAE4A"
                      radius="md"
                      size="xs"
                      onClick={() => openConfirm(candidate)}
                    >
                      Assign
                    </Button>
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>

          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination
                value={page}
                onChange={setPage}
                total={totalPages}
                color="#4EAE4A"
              />
            </Group>
          )}
        </>
      )}
    </Modal>
  );
}
