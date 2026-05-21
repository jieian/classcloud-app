"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
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
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import {
  IconExclamationCircle,
  IconArrowLeft,
  IconBinoculars,
  IconChevronRight,
  IconPencil,
  IconUser,
} from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import { fetchActiveUsersWithRoles, type UserWithRoles } from "@/app/(app)/user-roles/users/_lib";
import SubjectBadge from "@/app/(app)/school/faculty/_components/SubjectBadge";
import SubjectOverflowCard from "@/app/(app)/school/faculty/_components/SubjectOverflowCard";
import type {
  CoordinatorDraftMap,
  CreateSchoolYearForm,
  PreviousSySnapshot,
  WizardCurriculumDetail,
  WizardFacultyOption,
  WizardSubjectGroup,
} from "../_lib/types";
import { replicateCoordinatorDraft } from "../_lib/replicateService";

function EnterToConfirm({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter") onEnter();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const MAX_VISIBLE_MEMBERS = 3;
const PAGE_SIZE = 5;

interface StepSubjectCoordinatorsProps {
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
  coordinatorDraft: CoordinatorDraftMap;
  setCoordinatorDraft: React.Dispatch<
    React.SetStateAction<CoordinatorDraftMap>
  >;
  extraCoordinatorNames: Map<string, string>;
  setExtraCoordinatorNames: React.Dispatch<React.SetStateAction<Map<string, string>>>;
}

export default function StepSubjectCoordinators({
  form,
  curriculumDetail,
  faculty,
  prevSy,
  snapshot,
  snapshotLoading,
  onSnapshotNeeded,
  coordinatorDraft,
  setCoordinatorDraft,
  extraCoordinatorNames,
  setExtraCoordinatorNames,
}: StepSubjectCoordinatorsProps) {
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
            const draft = replicateCoordinatorDraft(
              snapshot,
              curriculumDetail.subject_groups,
            );
            setCoordinatorDraft(draft);
          } else if (selected === "scratch") {
            setCoordinatorDraft(new Map());
          }
        }}
        snapshotLoading={snapshotLoading}
      />
    );
  }

  return (
    <CoordinatorTable
      curriculumDetail={curriculumDetail}
      faculty={faculty}
      coordinatorDraft={coordinatorDraft}
      setCoordinatorDraft={setCoordinatorDraft}
      extraCoordinatorNames={extraCoordinatorNames}
      setExtraCoordinatorNames={setExtraCoordinatorNames}
      hasPrevSy={hasPrevSy}
      onResetMode={() => {
        form.setFieldValue("step5Mode", null);
        setCoordinatorDraft(new Map());
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
        Assign Subject Coordinators
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Stack gap="lg" align="center" py="xl">
          <ThemeIcon size={64} radius="xl" variant="light" color="gray">
            <IconBinoculars size={36} />
          </ThemeIcon>
          <Text fw={600} size="lg" ta="center" mb="md">
            How would you like to assign subject coordinators?
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

// ── Coordinator table ──────────────────────────────────────────────────────────

interface CoordinatorTableProps {
  curriculumDetail: WizardCurriculumDetail;
  faculty: WizardFacultyOption[];
  coordinatorDraft: CoordinatorDraftMap;
  setCoordinatorDraft: React.Dispatch<
    React.SetStateAction<CoordinatorDraftMap>
  >;
  extraCoordinatorNames: Map<string, string>;
  setExtraCoordinatorNames: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  hasPrevSy: boolean;
  onResetMode: () => void;
}

function CoordinatorTable({
  curriculumDetail,
  faculty,
  coordinatorDraft,
  setCoordinatorDraft,
  extraCoordinatorNames,
  setExtraCoordinatorNames,
  hasPrevSy,
  onResetMode,
}: CoordinatorTableProps) {
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

  const [editingGroup, setEditingGroup] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const facultyNames = useMemo(() => {
    const map = new Map(faculty.map((f) => [f.uid, `${f.first_name} ${f.last_name}`]));
    for (const [uid, name] of extraCoordinatorNames) map.set(uid, name);
    return map;
  }, [faculty, extraCoordinatorNames]);

  // All UIDs currently assigned across all groups
  const assignedCoordinatorUids = useMemo(() => {
    const s = new Set<string>();
    for (const uid of coordinatorDraft.values()) {
      if (uid) s.add(uid);
    }
    return s;
  }, [coordinatorDraft]);

  const missingCount = curriculumDetail.subject_groups.filter(
    (sg) => !coordinatorDraft.get(sg.subject_group_id),
  ).length;

  // No coordinator first, then alphabetical — same as SubjectCoordinatorsTableWrapper
  const sortedGroups = useMemo(
    () =>
      [...curriculumDetail.subject_groups]
        .map((sg) => ({
          sg,
          sortKey: [
            coordinatorDraft.get(sg.subject_group_id) ? 1 : 0,
            sg.name.toLowerCase(),
          ] as [number, string],
        }))
        .sort((a, b) => {
          const diff = a.sortKey[0] - b.sortKey[0];
          if (diff !== 0) return diff;
          return a.sortKey[1].localeCompare(b.sortKey[1]);
        })
        .map(({ sg }) => sg),
    [curriculumDetail.subject_groups, coordinatorDraft],
  );

  function handleAssign(sgId: number, uid: string | null) {
    setCoordinatorDraft((prev) => {
      const next = new Map(prev);
      next.set(sgId, uid);
      return next;
    });
  }

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Assign Subject Coordinators
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Subject Coordinators
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Assign a coordinator to each subject group.
        </Text>

        {missingCount > 0 && (
          <Alert
            variant="filled"
            radius="md"
            mb="md"
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
            <Text fw={700} size="sm">
              Incomplete Subject Coordinator Assignments
            </Text>
            <Text size="sm" fs="italic">
              One or more subject groups currently have no assigned subject
              coordinator.
            </Text>
          </Alert>
        )}

        {/* Desktop table */}
        <div className="hidden sm:block">
          <TableScrollContainer minWidth={600} type="native">
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>Subject Group Name</TableTh>
                  <TableTh>Description</TableTh>
                  <TableTh>Members</TableTh>
                  <TableTh>Subject Coordinator</TableTh>
                  <TableTh w={40} ta="right" />
                </TableTr>
              </TableThead>
              <TableTbody>
                {sortedGroups.map((sg) => {
                  const uid = coordinatorDraft.get(sg.subject_group_id) ?? null;
                  const isEmpty = !uid;
                  return (
                    <TableTr key={sg.subject_group_id}>
                      <TableTd>
                        <Group gap={6} wrap="nowrap" align="center">
                          <Text size="sm" fw={500}>
                            {sg.name}
                          </Text>
                          {isEmpty && (
                            <Tooltip
                              label="No coordinator assigned"
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
                        <Text size="sm" c="dimmed">
                          {sg.description ?? "—"}
                        </Text>
                      </TableTd>
                      <TableTd>
                        <MemberBadges members={sg.members} />
                      </TableTd>
                      <TableTd>
                        {uid ? (
                          <Text size="sm">{facultyNames.get(uid) ?? uid}</Text>
                        ) : (
                          <Text size="sm" c="dimmed" fs="italic">
                            None
                          </Text>
                        )}
                      </TableTd>
                      <TableTd w={40}>
                        <Group justify="flex-end">
                          <Tooltip
                            label="Edit subject coordinator"
                            withArrow
                            position="left"
                          >
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              aria-label="Edit subject coordinator"
                              onClick={() =>
                                setEditingGroup({
                                  id: sg.subject_group_id,
                                  name: sg.name,
                                })
                              }
                            >
                              <IconPencil size={16} stroke={1.5} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </div>

        {/* Mobile accordion list */}
        <div className="sm:hidden">
          <Divider />
          {sortedGroups.map((sg) => {
            const uid = coordinatorDraft.get(sg.subject_group_id) ?? null;
            return (
              <CoordinatorMobileRow
                key={sg.subject_group_id}
                sg={sg}
                uid={uid}
                coordinatorName={uid ? (facultyNames.get(uid) ?? null) : null}
                onEdit={() =>
                  setEditingGroup({ id: sg.subject_group_id, name: sg.name })
                }
              />
            );
          })}
        </div>

        {hasPrevSy && (
          <Button
            onClick={() => {
              let resetId!: string;
              resetId = modals.openConfirmModal({
                title: "Change setup mode?",
                children: (
                  <>
                    <EnterToConfirm
                      onEnter={() => {
                        onResetMode();
                        modals.close(resetId);
                      }}
                    />
                    <Text size="sm">
                      Going back will discard all coordinator assignments you have
                      configured so far. This cannot be undone.
                    </Text>
                  </>
                ),
                labels: { confirm: "Yes, go back", cancel: "Keep editing" },
                confirmProps: { color: "red" },
                onConfirm: onResetMode,
                ...confirmModalProps,
              });
            }}
            variant="default"
            radius="md"
            mt="md"
            leftSection={<IconArrowLeft size={16} />}
          >
            Back to mode selection
          </Button>
        )}
      </Box>

      <WizardCoordinatorModal
        opened={editingGroup !== null}
        subjectGroupName={editingGroup?.name ?? ""}
        currentCoordinatorUid={
          editingGroup ? (coordinatorDraft.get(editingGroup.id) ?? null) : null
        }
        currentCoordinatorName={
          editingGroup
            ? (facultyNames.get(coordinatorDraft.get(editingGroup.id) ?? "") ?? null)
            : null
        }
        faculty={faculty}
        hasPrevSy={hasPrevSy}
        assignedCoordinatorUids={assignedCoordinatorUids}
        onClose={() => setEditingGroup(null)}
        onAssign={(uid, name) => {
          if (!editingGroup) return;
          handleAssign(editingGroup.id, uid);
          if (uid && name && !facultyNames.has(uid)) {
            setExtraCoordinatorNames((prev) => new Map(prev).set(uid, name));
          }
          setEditingGroup(null);
        }}
      />
    </Box>
  );
}

// ── Mobile accordion row ───────────────────────────────────────────────────────

function CoordinatorMobileRow({
  sg,
  uid,
  coordinatorName,
  onEdit,
}: {
  sg: WizardSubjectGroup;
  uid: string | null;
  coordinatorName: string | null;
  onEdit: () => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const visible = sg.members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = sg.members.slice(MAX_VISIBLE_MEMBERS);
  const isEmpty = !uid;

  return (
    <>
      <div onClick={toggle} style={{ cursor: "pointer", padding: "12px 4px" }}>
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
            <Group gap={6} wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <Text
                fw={500}
                fz="sm"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sg.name}
              </Text>
              {isEmpty && (
                <Tooltip label="No coordinator assigned" withArrow position="top">
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
            <Tooltip label="Edit subject coordinator" withArrow position="left">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Edit subject coordinator"
                onClick={onEdit}
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
            c={sg.description ? undefined : "dimmed"}
            fs={sg.description ? undefined : "italic"}
            mb="sm"
          >
            {sg.description ?? "—"}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={6}
            style={{ letterSpacing: "0.04em" }}
          >
            Members
          </Text>
          {sg.members.length === 0 ? (
            <Text fz="sm" c="dimmed" fs="italic" mb="sm">
              None
            </Text>
          ) : (
            <Group gap={6} wrap="wrap" mb="sm">
              {visible.map((m) => (
                <SubjectBadge
                  key={m.curriculum_subject_id}
                  code={m.code}
                  subject_type={m.subject_type}
                  subjectName={m.name}
                  palette="coordinator"
                />
              ))}
              {overflow.length > 0 && <SubjectOverflowCard subjects={overflow} />}
            </Group>
          )}

          <Text
            size="xs"
            c="dimmed"
            fw={600}
            tt="uppercase"
            mb={2}
            style={{ letterSpacing: "0.04em" }}
          >
            Subject Coordinator
          </Text>
          {coordinatorName ? (
            <Text fz="sm">{coordinatorName}</Text>
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

// ── Wizard coordinator modal ───────────────────────────────────────────────────

interface WizardCoordinatorModalProps {
  opened: boolean;
  subjectGroupName: string;
  currentCoordinatorUid: string | null;
  currentCoordinatorName: string | null;
  faculty: WizardFacultyOption[];
  hasPrevSy: boolean;
  assignedCoordinatorUids: Set<string>;
  onClose: () => void;
  onAssign: (uid: string | null, name: string | null) => void;
}

function WizardCoordinatorModal({
  opened,
  subjectGroupName,
  currentCoordinatorUid,
  currentCoordinatorName,
  faculty,
  hasPrevSy,
  assignedCoordinatorUids,
  onClose,
  onAssign,
}: WizardCoordinatorModalProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [allUsers, setAllUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAllUsers = useCallback(async () => {
    setLoading(true);
    try {
      const users = await fetchActiveUsersWithRoles();
      setAllUsers(users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!opened) return;
    setSearch("");
    setPage(1);
    if (!hasPrevSy) loadAllUsers();
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    // When no prev SY: all active users; otherwise faculty-role only
    // Either way: exclude the current coordinator of this group and anyone already coordinating another group
    const candidates: { uid: string; first_name: string; last_name: string }[] = hasPrevSy
      ? faculty.filter((f) => f.uid !== currentCoordinatorUid && !assignedCoordinatorUids.has(f.uid))
      : allUsers
          .filter((u) => u.uid !== currentCoordinatorUid && !assignedCoordinatorUids.has(u.uid))
          .map((u) => ({ uid: u.uid, first_name: u.first_name, last_name: u.last_name }));

    const list = query
      ? candidates.filter((c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(query),
        )
      : candidates;

    return list.sort(
      (a, b) =>
        a.first_name.localeCompare(b.first_name) ||
        a.last_name.localeCompare(b.last_name),
    );
  }, [faculty, allUsers, hasPrevSy, search, currentCoordinatorUid, assignedCoordinatorUids]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Subject Coordinator"
      centered
      size="lg"
      transitionProps={{ onEntered: () => document.getElementById("search-wizard-coordinator")?.focus() }}
    >
      <Text size="sm" c="dimmed" mb="md">
        Select a{hasPrevSy ? " faculty member" : " user"} to assign as subject coordinator for{" "}
        <Text span fw={600}>
          {subjectGroupName}
        </Text>
        .
      </Text>

      {currentCoordinatorUid && currentCoordinatorName && (
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
          <Group wrap="nowrap" align="flex-start" gap="sm" justify="space-between">
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
                  Current Subject Coordinator
                </Text>
                <Text size="sm" c="dimmed">
                  {subjectGroupName}
                </Text>
                <Text size="sm" mt={2}>
                  {currentCoordinatorName}
                </Text>
              </div>
            </Group>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => onAssign(null, null)}
            >
              Remove
            </Button>
          </Group>
        </Box>
      )}

      <SearchBar
        id="search-wizard-coordinator"
        placeholder={hasPrevSy ? "Search faculty..." : "Search users..."}
        ariaLabel="Search"
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
        autoFocus
      />

      {!loading && filtered.length === 0 && (
        <EmptySearchState
          title={search.trim() ? "No results found." : "No available users."}
          description={
            search.trim()
              ? "Try adjusting your search to find what you're looking for."
              : "All eligible users are already assigned as coordinators."
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <>
          <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
            <TableThead>
              <TableTr>
                <TableTh>Name</TableTh>
                <TableTh w={120} ta="right" />
              </TableTr>
            </TableThead>
            <TableTbody>
              {paged.map((c) => (
                <TableTr key={c.uid}>
                  <TableTd>
                    <Text size="sm" fw={500}>
                      {c.first_name} {c.last_name}
                    </Text>
                  </TableTd>
                  <TableTd ta="right">
                    <Button
                      color="#4EAE4A"
                      radius="md"
                      size="xs"
                      onClick={() => onAssign(c.uid, `${c.first_name} ${c.last_name}`)}
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

// ── Member badges with overflow ────────────────────────────────────────────────

function MemberBadges({ members }: { members: WizardSubjectGroup["members"] }) {
  if (members.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        —
      </Text>
    );
  }
  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = members.slice(MAX_VISIBLE_MEMBERS);

  return (
    <Group gap={6} wrap="nowrap">
      {visible.map((m) => (
        <SubjectBadge
          key={m.curriculum_subject_id}
          code={m.code}
          subject_type={m.subject_type}
          subjectName={m.name}
          palette="coordinator"
        />
      ))}
      {overflow.length > 0 && <SubjectOverflowCard subjects={overflow} />}
    </Group>
  );
}
