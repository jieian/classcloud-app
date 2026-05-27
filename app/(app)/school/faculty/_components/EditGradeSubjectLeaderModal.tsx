"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Pagination,
  Skeleton,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { IconRefresh, IconUser } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import {
  fetchFaculty,
  assignGradeSubjectLeader,
  type FacultyMember,
  type SubjectLeaderEntry,
} from "../_lib/facultyService";

const PAGE_SIZE = 5;

interface EditGradeSubjectLeaderModalProps {
  opened: boolean;
  entry: SubjectLeaderEntry | null;
  assignedLeaderUids: Set<string>;
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
}

function TableSkeleton() {
  const rows = Array(PAGE_SIZE)
    .fill(0)
    .map((_, i) => (
      <TableTr key={i}>
        <TableTd>
          <Skeleton height={20} width={160} radius="sm" />
        </TableTd>
        <TableTd w={120} ta="right">
          <Skeleton height={28} width={64} radius="md" style={{ marginLeft: "auto" }} />
        </TableTd>
      </TableTr>
    ));

  return (
    <Table verticalSpacing="sm" horizontalSpacing="md">
      <TableThead>
        <TableTr>
          <TableTh>Name</TableTh>
          <TableTh w={120} ta="right" />
        </TableTr>
      </TableThead>
      <TableTbody>{rows}</TableTbody>
    </Table>
  );
}

export default function EditGradeSubjectLeaderModal({
  opened,
  entry,
  assignedLeaderUids,
  onClose,
  onAssigned,
}: EditGradeSubjectLeaderModalProps) {
  const [candidates, setCandidates] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningUid, setAssigningUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const isMobile = useMediaQuery("(max-width: 768px)");
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
    setError(null);
    void loadCandidates();
  }, [opened]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  async function loadCandidates() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFaculty();
      setCandidates(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load faculty. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(candidate: FacultyMember) {
    if (!entry) return;
    try {
      setAssigningUid(candidate.uid);
      await assignGradeSubjectLeader(
        entry.curriculum_subject_id,
        entry.grade_level_id,
        candidate.uid,
      );
      notify({
        type: "success",
        message: `${candidate.first_name} ${candidate.last_name} assigned as Grade Subject Leader for ${entry.subject_name}.`,
      });
      await onAssigned();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to assign grade subject leader. Please try again.",
      );
    } finally {
      setAssigningUid(null);
    }
  }

  const filtered = useMemo(() => {
    // Exclude anyone already assigned as a GSL elsewhere (they can only hold the role once).
    // The current slot's leader is excluded too — they're shown in the info card above.
    const available = candidates.filter((c) => !assignedLeaderUids.has(c.uid));

    const list = search.trim()
      ? (() => {
          const query = search.toLowerCase().trim();
          return available.filter((c) => {
            const fullName = [c.first_name, c.middle_name ?? "", c.last_name]
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
            return fullName.includes(query);
          });
        })()
      : available;

    return [...list].sort(
      (a, b) =>
        a.first_name.localeCompare(b.first_name) ||
        a.last_name.localeCompare(b.last_name),
    );
  }, [candidates, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedCandidates = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentLeaderName = entry?.leader
    ? `${entry.leader.first_name} ${entry.leader.last_name}`
    : null;

  function openConfirm(candidate: FacultyMember) {
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
      onConfirm: async () => {
        await handleAssign(candidate);
      },
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      transitionProps={{
        onEntered: () =>
          document.getElementById("search-edit-gsl")?.focus(),
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
        </Box>
      )}

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-edit-gsl"
          placeholder="Search faculty..."
          ariaLabel="Search faculty"
          style={{ flex: 1, minWidth: 0 }}
          maw={700}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          autoFocus
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            aria-label="Refresh faculty list"
            loading={loading}
            onClick={loadCandidates}
          >
            <IconRefresh size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" title="Error" mb="md">
          {error}
        </Alert>
      )}

      {!error && loading && <TableSkeleton />}

      {!error && !loading && filtered.length === 0 && search.trim() && (
        <EmptySearchState />
      )}

      {!error && !loading && filtered.length === 0 && !search.trim() && (
        <EmptySearchState
          title="No eligible faculty available."
          description="All faculty members are already assigned as grade subject leaders."
        />
      )}

      {!error && !loading && filtered.length > 0 && (
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
                      loading={assigningUid === candidate.uid}
                      disabled={Boolean(assigningUid)}
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
