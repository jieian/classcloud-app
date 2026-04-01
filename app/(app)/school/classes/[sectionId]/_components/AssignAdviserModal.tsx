"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { IconPlus, IconRefresh, IconUserOff } from "@tabler/icons-react";
import { SearchBar } from "@/components/searchBar/SearchBar";
import {
  setSectionAdviser,
  fetchAvailableAdviserCandidates,
  type AdviserCandidate,
} from "@/lib/services/classService";

interface AssignAdviserModalProps {
  opened: boolean;
  sectionId: number;
  currentAdviserId: string | null;
  currentAdviserName: string | null;
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
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
  const [confirmOpened, setConfirmOpened] = useState(false);
  const [selectedCandidate, setSelectedCandidate] =
    useState<AdviserCandidate | null>(null);
  const [isRemoveMode, setIsRemoveMode] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setSearch("");
    void loadCandidates();
  }, [opened]);

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
          : "Failed to load adviser candidates. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAssign(uid: string) {
    try {
      setAssigningUid(uid);
      setError(null);
      await setSectionAdviser({ section_id: sectionId, adviser_id: uid });
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

  async function handleRemove() {
    try {
      setAssigningUid("__remove__");
      setError(null);
      await setSectionAdviser({ section_id: sectionId, adviser_id: null });
      await onAssigned();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to remove adviser. Please try again.",
      );
    } finally {
      setAssigningUid(null);
    }
  }

  function openAssignConfirm(candidate: AdviserCandidate) {
    setSelectedCandidate(candidate);
    setIsRemoveMode(false);
    setConfirmOpened(true);
  }

  function openRemoveConfirm() {
    setSelectedCandidate(null);
    setIsRemoveMode(true);
    setConfirmOpened(true);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const query = search.toLowerCase().trim();
    return candidates.filter((candidate) => {
      const fullName = [
        candidate.first_name,
        candidate.middle_name ?? "",
        candidate.last_name,
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const roles = candidate.roles.map((r) => r.name.toLowerCase()).join(" ");
      return fullName.includes(query) || roles.includes(query);
    });
  }, [candidates, search]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? "Edit Adviser" : "Assign Adviser"}
      centered
      size="lg"
    >
      <Text size="sm" c="dimmed" mb="md">
        Select a faculty member to assign as class adviser.
      </Text>

      {/* No Adviser option — only shown in edit mode, above the candidate list */}
      {isEdit && (
        <>
          <Paper withBorder p="sm" radius="md" mb="md" bg="red.0">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Remove Adviser
                </Text>
                <Text size="sm" c="red.7">
                  Set section to have no adviser
                </Text>
              </Stack>
              <Button
                color="red"
                variant="light"
                size="sm"
                leftSection={<IconUserOff size={15} />}
                loading={assigningUid === "__remove__"}
                disabled={Boolean(assigningUid)}
                onClick={openRemoveConfirm}
              >
                No Adviser
              </Button>
            </Group>
          </Paper>
          <Divider label="Or select a replacement" labelPosition="center" mb="md" />
        </>
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
        />
        <Tooltip label="Refresh" position="bottom" withArrow>
          <ActionIcon
            variant="outline"
            color="#808898"
            size="lg"
            radius="xl"
            aria-label="Refresh adviser candidates"
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

      {!error && !loading && filtered.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          No eligible faculty found.
        </Text>
      )}

      {!error && filtered.length > 0 && (
        <TableScrollContainer minWidth={520}>
          <Table verticalSpacing="sm">
            <TableThead>
              <TableTr>
                <TableTh>Employee</TableTh>
                <TableTh>Roles</TableTh>
                <TableTh>
                  <VisuallyHidden>Actions</VisuallyHidden>
                </TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {filtered.map((candidate) => {
                const fullName = [candidate.first_name, candidate.last_name]
                  .join(" ")
                  .replace(/\s+/g, " ")
                  .trim();

                return (
                  <TableTr key={candidate.uid}>
                    <TableTd>
                      <Text fz="sm" fw={500}>
                        {fullName}
                      </Text>
                    </TableTd>
                    <TableTd>
                      {candidate.roles.length > 0 ? (
                        <Group gap="xs">
                          {candidate.roles.map((role) => (
                            <Badge key={role.role_id} variant="light">
                              {role.name}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text c="dimmed" size="sm">
                          No role assigned
                        </Text>
                      )}
                    </TableTd>
                    <TableTd>
                      <Tooltip label="Assign adviser" withArrow>
                        <ActionIcon
                          variant="filled"
                          color="#4EAE4A"
                          aria-label={`Assign ${fullName} as adviser`}
                          style={{ backgroundColor: "#4EAE4A", color: "#FFFFFF" }}
                          loading={assigningUid === candidate.uid}
                          disabled={Boolean(assigningUid)}
                          onClick={() => openAssignConfirm(candidate)}
                        >
                          <IconPlus size={16} stroke={1.8} color="#FFFFFF" />
                        </ActionIcon>
                      </Tooltip>
                    </TableTd>
                  </TableTr>
                );
              })}
            </TableTbody>
          </Table>
        </TableScrollContainer>
      )}

      {loading && (
        <Stack py="lg">
          <Text c="dimmed" ta="center" size="sm">
            Loading adviser candidates...
          </Text>
        </Stack>
      )}

      {/* Shared confirm modal for both assign and remove */}
      <Modal
        opened={confirmOpened}
        onClose={() => setConfirmOpened(false)}
        title={isRemoveMode ? "Remove Adviser" : "Confirm Adviser Assignment"}
        centered
      >
        <Text size="sm" mb="md">
          {isRemoveMode ? (
            <>
              Remove{" "}
              <Text span fw={600}>
                {currentAdviserName ?? "the current adviser"}
              </Text>{" "}
              from this class? The section will have no adviser.
            </>
          ) : (
            <>
              Assign{" "}
              <Text span fw={600}>
                {selectedCandidate
                  ? [selectedCandidate.first_name, selectedCandidate.last_name]
                      .join(" ")
                      .replace(/\s+/g, " ")
                      .trim()
                  : "this faculty member"}
              </Text>{" "}
              as adviser for this class?
            </>
          )}
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => setConfirmOpened(false)}
            disabled={Boolean(assigningUid)}
          >
            Cancel
          </Button>
          <Button
            color={isRemoveMode ? "red" : "#4EAE4A"}
            loading={Boolean(assigningUid)}
            onClick={async () => {
              if (isRemoveMode) {
                await handleRemove();
              } else {
                if (!selectedCandidate) return;
                await handleAssign(selectedCandidate.uid);
              }
              setConfirmOpened(false);
            }}
          >
            {isRemoveMode ? "Remove" : "Confirm"}
          </Button>
        </Group>
      </Modal>
    </Modal>
  );
}
