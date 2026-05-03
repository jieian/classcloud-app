"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Box,
  Group,
  Modal,
  Pagination,
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
import { IconRefresh, IconUser } from "@tabler/icons-react";
import EmptySearchState from "@/components/EmptySearchState";
import { SearchBar } from "@/components/searchBar/SearchBar";
import {
  fetchActiveUsersWithRoles,
  type UserWithRoles,
} from "@/app/(app)/user-roles/users/_lib";
import SubjectBadge from "../../_components/SubjectBadge";
import SubjectOverflowCard from "../../_components/SubjectOverflowCard";
import type { MasterlistTeacherLoad } from "../../_lib/masterlistService";

type AssignmentPickerMode = "adviser" | "subject";
const PAGE_SIZE = 5;

interface MasterlistAssignmentModalProps {
  opened: boolean;
  mode: AssignmentPickerMode;
  currentAssignedUid: string | null;
  currentAssignedName: string | null;
  assignmentLabel: string;
  assignedAdviserUids: Set<string>;
  teachingLoadByTeacher: Map<string, MasterlistTeacherLoad[]>;
  onClose: () => void;
  onAssign: (uid: string) => void;
}

interface CandidateRow {
  uid: string;
  first_name: string;
  last_name: string;
  teaching_subjects: MasterlistTeacherLoad[];
}

const MAX_VISIBLE_SUBJECTS = 3;

function getFullName(person: Pick<CandidateRow, "first_name" | "last_name">): string {
  return `${person.first_name} ${person.last_name}`;
}

export default function MasterlistAssignmentModal({
  opened,
  mode,
  currentAssignedUid,
  currentAssignedName,
  assignmentLabel,
  assignedAdviserUids,
  teachingLoadByTeacher,
  onClose,
  onAssign,
}: MasterlistAssignmentModalProps) {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!opened) return;
    setSearch("");
    setPage(1);
    loadCandidates();
  }, [opened]);

  useEffect(() => {
    setPage(1);
  }, [search, mode]);

  async function loadCandidates() {
    try {
      setLoading(true);
      setError(null);
      const allUsers = await fetchActiveUsersWithRoles();
      setUsers(allUsers);
    } catch {
      setError("Failed to load faculty options. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const candidates = useMemo(() => {
    const facultyRoleUsers = users.filter((user) =>
      user.roles.some((role) => role.is_faculty === true),
    );

    return facultyRoleUsers
      .filter((user) => {
        if (user.uid === currentAssignedUid) return false;
        if (mode !== "adviser") return true;
        return !assignedAdviserUids.has(user.uid);
      })
      .map((user) => {
        return {
          uid: user.uid,
          first_name: user.first_name,
          last_name: user.last_name,
          teaching_subjects: teachingLoadByTeacher.get(user.uid) ?? [],
        } satisfies CandidateRow;
      })
      .sort((a, b) => {
        if (mode === "subject") {
          const teachingLoadDiff =
            Number(a.teaching_subjects.length > 0) - Number(b.teaching_subjects.length > 0);
          if (teachingLoadDiff !== 0) return teachingLoadDiff;
        }

        return (
          a.first_name.localeCompare(b.first_name) ||
          a.last_name.localeCompare(b.last_name)
        );
      });
  }, [assignedAdviserUids, currentAssignedUid, mode, teachingLoadByTeacher, users]);

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase().trim();
    return candidates.filter((candidate) =>
      getFullName(candidate).toLowerCase().includes(q) ||
      candidate.first_name.toLowerCase().includes(q) ||
      candidate.last_name.toLowerCase().includes(q),
    );
  }, [candidates, search]);

  const title = mode === "adviser" ? "Assign Class Adviser" : "Assign Subject Teacher";
  const description =
    mode === "adviser"
      ? "Choose a faculty member who does not yet hold an advisory class."
      : "Choose a faculty member to handle this subject assignment.";
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedCandidates = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      transitionProps={{ onEntered: () => document.getElementById(`search-masterlist-${mode}`)?.focus() }}
      title={title}
      centered
      size={mode === "subject" ? "xl" : "lg"}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>

      {currentAssignedUid && currentAssignedName && (
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
                Current {mode === "adviser" ? "Class Adviser" : "Subject Teacher"}
              </Text>
              <Text size="sm" c="dimmed">
                {assignmentLabel}
              </Text>
              <Text size="sm" mt={2}>
                {currentAssignedName}
              </Text>
            </div>
          </Group>
        </Box>
      )}

      <Group mb="md" wrap="nowrap" align="flex-end" gap="sm">
        <SearchBar
          id={`search-masterlist-${mode}`}
          placeholder={mode === "adviser" ? "Search faculty..." : "Search teaching staff..."}
          ariaLabel={mode === "adviser" ? "Search faculty" : "Search teaching staff"}
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
            aria-label="Refresh faculty options"
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

      {!error && !loading && filtered.length === 0 && search.trim() && (
        <EmptySearchState />
      )}

      {!error && !loading && filtered.length === 0 && !search.trim() && (
        <EmptySearchState
          title={
            mode === "adviser"
              ? "No eligible advisers available."
              : "No faculty members available."
          }
          description={
            mode === "adviser"
              ? "All faculty members already have an advisory class assigned."
              : "There are no active faculty members to assign right now."
          }
        />
      )}

      {!error && filtered.length > 0 && (
        <>
          <TableScrollContainer minWidth={mode === "subject" ? 760 : 420} type="native">
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh>Name</TableTh>
                  {mode === "subject" && <TableTh>Teaching Load</TableTh>}
                  <TableTh w={120} ta="right" />
                </TableTr>
              </TableThead>
              <TableTbody>
                {pagedCandidates.map((candidate) => {
                  const visibleSubjects = candidate.teaching_subjects.slice(0, MAX_VISIBLE_SUBJECTS);
                  const overflowSubjects = candidate.teaching_subjects.slice(MAX_VISIBLE_SUBJECTS);

                  return (
                    <TableTr key={candidate.uid}>
                      <TableTd>
                        <Text size="sm" fw={500}>
                          {getFullName(candidate)}
                        </Text>
                      </TableTd>
                      {mode === "subject" && (
                        <TableTd>
                          {candidate.teaching_subjects.length === 0 ? (
                            <Text c="dimmed" size="sm" fs="italic">
                              None
                            </Text>
                          ) : (
                            <Group gap={6} wrap="nowrap">
                              {visibleSubjects.map((subject) => (
                                <SubjectBadge
                                  key={subject.curriculum_subject_id}
                                  code={subject.code}
                                  subject_type={subject.subject_type}
                                  subjectName={subject.name}
                                  pending={subject.isPending}
                                  palette="coordinator"
                                  sections={subject.sections}
                                />
                              ))}
                              {overflowSubjects.length > 0 && (
                                <SubjectOverflowCard subjects={overflowSubjects} />
                              )}
                            </Group>
                          )}
                        </TableTd>
                      )}
                      <TableTd ta="right">
                        <Button
                          color="#4EAE4A"
                          radius="md"
                          size="xs"
                          onClick={() => onAssign(candidate.uid)}
                        >
                          Assign
                        </Button>
                      </TableTd>
                    </TableTr>
                  );
                })}
              </TableTbody>
            </Table>
          </TableScrollContainer>
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
