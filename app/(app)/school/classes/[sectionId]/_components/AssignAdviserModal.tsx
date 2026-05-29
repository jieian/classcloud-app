"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
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
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notify } from "@/components/notificationIcon/notificationIcon";
import { IconRefresh, IconUser } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import EmptySearchState from "@/components/EmptySearchState";
import {
  setSectionAdviser,
  fetchAvailableAdviserCandidates,
  type AdviserCandidate,
} from "@/lib/services/classService";

const PAGE_SIZE = 5;

interface AssignAdviserModalProps {
  opened: boolean;
  sectionId: number;
  currentAdviserId: string | null;
  currentAdviserName: string | null;
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
}

function TableSkeleton() {
  return (
    <Table verticalSpacing="sm" horizontalSpacing="md">
      <TableThead>
        <TableTr>
          <TableTh>Name</TableTh>
          <TableTh w={120} ta="right" />
        </TableTr>
      </TableThead>
      <TableTbody>
        {Array(PAGE_SIZE)
          .fill(0)
          .map((_, i) => (
            <TableTr key={i}>
              <TableTd>
                <Skeleton height={20} width={160} radius="sm" />
              </TableTd>
              <TableTd w={120} ta="right">
                <Skeleton
                  height={28}
                  width={64}
                  radius="md"
                  style={{ marginLeft: "auto" }}
                />
              </TableTd>
            </TableTr>
          ))}
      </TableTbody>
    </Table>
  );
}

export default function AssignAdviserModal({
  opened,
  sectionId,
  currentAdviserId,
  currentAdviserName,
  onClose,
  onAssigned,
}: AssignAdviserModalProps) {
  const isEdit = Boolean(currentAdviserId);
  const [candidates, setCandidates] = useState<AdviserCandidate[]>([]);
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
      const data = await fetchAvailableAdviserCandidates();
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

  async function handleAssign(candidate: AdviserCandidate) {
    try {
      setAssigningUid(candidate.uid);
      setError(null);
      await setSectionAdviser({ section_id: sectionId, adviser_id: candidate.uid });
      notify({
        type: "success",
        message: `${candidate.first_name} ${candidate.last_name} assigned as class adviser.`,
      });
      await onAssigned();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to assign adviser. Please try again.",
      );
    } finally {
      setAssigningUid(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const query = search.toLowerCase().trim();
    return candidates.filter((c) => {
      const fullName = [c.first_name, c.middle_name ?? "", c.last_name]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return fullName.includes(query);
    });
  }, [candidates, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedCandidates = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openAssignConfirm(candidate: AdviserCandidate) {
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
          as adviser for this class?
          {currentAdviserName && (
            <>
              {" "}
              This will replace the current adviser,{" "}
              <Text span fw={600}>
                {currentAdviserName}
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
          document.getElementById("search-assign-adviser")?.focus(),
      }}
      title={isEdit ? "Edit Adviser" : "Assign Adviser"}
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
        Select a faculty member to assign as class adviser.
      </Text>

      {isEdit && currentAdviserName && (
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
                Current Adviser
              </Text>
              <Text size="sm" mt={2}>
                {currentAdviserName}
              </Text>
            </div>
          </Group>
        </Box>
      )}

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id="search-assign-adviser"
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
          description="No faculty members are available to be assigned as adviser."
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
                      onClick={() => openAssignConfirm(candidate)}
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
