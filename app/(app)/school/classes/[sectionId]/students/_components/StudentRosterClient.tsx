"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackButton from "@/components/BackButton";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableScrollContainer,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconDownload,
  IconGenderBigender,
  IconPencil,
  IconPlus,
  IconTableImport,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import { SearchBar } from "@/components/searchBar/SearchBar";
import {
  deleteStudentFromRoster,
  fetchStudentRoster,
  type StudentRosterEntry,
  type StudentRosterSection,
} from "../../../_lib/classService";
import AddStudentModal from "./AddStudentModal";
import DownloadRosterModal from "./DownloadRosterModal";
import EditStudentModal from "./EditStudentModal";
import ImportRosterModal from "./ImportRosterModal";

interface Props {
  sectionId: number;
}

const SEX_OPTIONS = [
  { value: "", label: "All Sexes" },
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
];

// ─── Skeleton ────────────────────────────────────────────────────────────────

function RosterSkeleton() {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={6}>
          <Skeleton height={28} width={220} radius="sm" />
          <Skeleton height={18} width={160} radius="sm" />
        </Stack>
        <Group>
          <Skeleton height={34} width={130} radius="sm" />
          <Skeleton height={34} width={130} radius="sm" />
          <Skeleton height={34} width={140} radius="sm" />
        </Group>
      </Group>
      <Group>
        <Skeleton height={36} style={{ flex: 1 }} radius="xl" />
        <Skeleton height={36} width={120} radius="sm" />
      </Group>
      <Paper withBorder radius="md" p={0}>
        <Table verticalSpacing="sm">
          <TableThead>
            <TableTr>
              <TableTh w={160}>LRN</TableTh>
              <TableTh>Name</TableTh>
              <TableTh w={88} />
            </TableTr>
          </TableThead>
          <TableTbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableTr key={i}>
                <TableTd>
                  <Skeleton height={14} width={100} radius="sm" />
                </TableTd>
                <TableTd>
                  <Skeleton height={14} width={180} radius="sm" />
                </TableTd>
                <TableTd>
                  <Group gap={4} justify="flex-end">
                    <Skeleton height={28} width={28} radius="sm" circle />
                    <Skeleton height={28} width={28} radius="sm" circle />
                  </Group>
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      </Paper>
    </Stack>
  );
}

// ─── Group rows ──────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
  return (
    <TableTr>
      <TableTd
        colSpan={3}
        fw={700}
        fz="sm"
        ta="center"
        style={{
          backgroundColor: "var(--mantine-color-gray-1)",
          borderTop: "1px solid var(--mantine-color-gray-3)",
        }}
      >
        {label}
      </TableTd>
    </TableTr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentRosterClient({ sectionId }: Props) {
  const { user, permissions } = useAuth();

  const hasFullAccess = permissions.includes("students.full_access");
  const hasPartialAccess = permissions.includes(
    "students.limited_access",
  );

  const [section, setSection] = useState<StudentRosterSection | null>(null);
  const [students, setStudents] = useState<StudentRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] =
    useState<StudentRosterEntry | null>(null);
  const [deletingStudent, setDeletingStudent] =
    useState<StudentRosterEntry | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [downloadOpened, setDownloadOpened] = useState(false);
  const [addOpened, setAddOpened] = useState(false);
  const [importOpened, setImportOpened] = useState(false);

  const [search, setSearch] = useState("");
  const [sexFilter, setSexFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudentRoster(sectionId);
      setSection(data.section);
      setStudents(data.students);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roster.");
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived permission flags (need section.adviser_id) ──
  const isAdviser = Boolean(user && section && user.id === section.adviser_id);
  const canEditDelete = hasFullAccess || (hasPartialAccess && isAdviser);
  const canAddImport = hasFullAccess || (hasPartialAccess && isAdviser);
  const canDownload = hasFullAccess || hasPartialAccess;
  const hasStudents = students.length > 0;

  // ── Filtered students ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesSex = sexFilter === "" || s.sex === sexFilter;
      const matchesSearch =
        q === "" || s.full_name.toLowerCase().includes(q) || s.lrn.includes(q);
      return matchesSex && matchesSearch;
    });
  }, [students, search, sexFilter]);

  const maleStudents = useMemo(
    () => filtered.filter((s) => s.sex === "M"),
    [filtered],
  );
  const femaleStudents = useMemo(
    () => filtered.filter((s) => s.sex === "F"),
    [filtered],
  );

  const hasActiveFilters = search.trim() !== "" || sexFilter !== "";
  const noResults =
    filtered.length === 0 && students.length > 0 && hasActiveFilters;
  const noStudents = students.length === 0 && !loading && !error;

  const closeDeleteModal = () => {
    if (deleting) return;
    setConfirmDeleteText("");
    setDeletingStudent(null);
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;
    try {
      setDeleting(true);
      await deleteStudentFromRoster(sectionId, deletingStudent.lrn);
      notifications.show({
        title: "Student Deleted",
        message: `${deletingStudent.full_name} has been deleted.`,
        color: "green",
      });
      closeDeleteModal();
      await load();
    } catch (e) {
      notifications.show({
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to delete student.",
        color: "red",
      });
    } finally {
      setDeleting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <Stack gap="md" maw={900}>
        <Box>
          <Skeleton height={34} width={160} radius="sm" />
        </Box>
        <RosterSkeleton />
      </Stack>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <Stack gap="md" maw={950}>
        <Box>
          <BackButton href={`/school/classes/${sectionId}`} size="sm">Back to Class</BackButton>
        </Box>
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" maw={1000}>
      {/* Back */}
      <Box>
        <BackButton href={`/school/classes/${sectionId}`} mb="sm" size="sm">Back to Class Details</BackButton>
      </Box>

      {/* Header */}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Box>
          <Title order={3} fw={700}>
            {section?.grade_level_display} • {section?.name}
          </Title>
        </Box>

        <Group gap="xs" wrap="wrap">
          {canAddImport && (
            <>
              <Button
                color="#4EAE4A"
                leftSection={<IconPlus size={16} />}
                size="sm"
                onClick={() => setAddOpened(true)}
              >
                Add a Student
              </Button>
              <Button
                variant="outline"
                color="#4EAE4A"
                leftSection={<IconTableImport size={16} />}
                size="sm"
                onClick={() => setImportOpened(true)}
              >
                Import Roster
              </Button>
            </>
          )}
          {canDownload && hasStudents && (
            <Button
              variant="outline"
              color="gray"
              leftSection={<IconDownload size={16} />}
              size="sm"
              onClick={() => setDownloadOpened(true)}
            >
              Download Roster
            </Button>
          )}
        </Group>
      </Group>

      {/* Filters */}
      <Group gap="sm" align="flex-end">
        <SearchBar
          id="search-roster"
          placeholder="Search student name or LRN..."
          ariaLabel="Search students"
          style={{ flex: 1, minWidth: 0 }}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          data={SEX_OPTIONS}
          value={sexFilter}
          onChange={(v) => setSexFilter(v ?? "")}
          placeholder="All Sexes"
          leftSection={<IconGenderBigender size={16} />}
          w={140}
          clearable={false}
        />
      </Group>

      {/* Empty — no students enrolled */}
      {noStudents && (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="xs">
            <IconUsers size={40} color="var(--mantine-color-gray-4)" />
            <Text fw={600} size="sm">
              No students enrolled
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              This class has no enrolled students yet.
              {canAddImport &&
                ' Use "Add a Student" or "Import Roster" to get started.'}
            </Text>
          </Stack>
        </Paper>
      )}

      {/* Empty — filters return nothing */}
      {noResults && (
        <Paper withBorder radius="md" p="xl">
          <Stack align="center" gap="xs">
            <IconUsers size={40} color="var(--mantine-color-gray-4)" />
            <Text fw={600} size="sm">
              No students found
            </Text>
            <Text size="sm" c="dimmed">
              No students match your current search or filter.
            </Text>
          </Stack>
        </Paper>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
          <TableScrollContainer minWidth={520}>
            <Table verticalSpacing="sm" striped={false} highlightOnHover>
              <TableThead>
                <TableTr>
                  <TableTh w={160}>LRN</TableTh>
                  <TableTh>
                    Name{" "}
                    <Text span size="xs" c="dimmed" fw={400}>
                      (Last Name, First Name, <em>Middle Name</em>)
                    </Text>
                  </TableTh>
                  {canEditDelete && <TableTh w={88} ta="right" />}
                </TableTr>
              </TableThead>
              <TableTbody>
                {/* Male group */}
                {maleStudents.length > 0 && (
                  <>
                    <GroupHeader label={`Male (${maleStudents.length})`} />
                    {maleStudents.map((s) => (
                      <StudentRow
                        key={s.enrollment_id}
                        student={s}
                        canEditDelete={canEditDelete}
                        onEdit={setEditingStudent}
                        onDelete={setDeletingStudent}
                      />
                    ))}
                  </>
                )}

                {/* Female group */}
                {femaleStudents.length > 0 && (
                  <>
                    <GroupHeader label={`Female (${femaleStudents.length})`} />
                    {femaleStudents.map((s) => (
                      <StudentRow
                        key={s.enrollment_id}
                        student={s}
                        canEditDelete={canEditDelete}
                        onEdit={setEditingStudent}
                        onDelete={setDeletingStudent}
                      />
                    ))}
                  </>
                )}
              </TableTbody>
            </Table>
          </TableScrollContainer>
        </Paper>
      )}

      <AddStudentModal
        opened={addOpened}
        sectionId={sectionId}
        hasFullAccess={hasFullAccess}
        onClose={() => setAddOpened(false)}
        onAdded={() => void load()}
      />

      <ImportRosterModal
        opened={importOpened}
        sectionId={sectionId}
        hasFullAccess={hasFullAccess}
        onClose={() => setImportOpened(false)}
        onImported={() => void load()}
      />

      <DownloadRosterModal
        opened={downloadOpened}
        sectionId={sectionId}
        sectionLabel={`${section?.grade_level_display} • ${section?.name}`}
        gradeLevel={section?.grade_level_display ?? ""}
        sectionName={section?.name ?? ""}
        onClose={() => setDownloadOpened(false)}
      />

      <EditStudentModal
        opened={editingStudent !== null}
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onSaved={() => void load()}
      />

      <Modal
        opened={deletingStudent !== null}
        onClose={closeDeleteModal}
        title="Delete Student"
        centered
        closeOnClickOutside={!deleting}
        closeOnEscape={!deleting}
        withCloseButton={!deleting}
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete{" "}
          <strong>{deletingStudent?.full_name}</strong> from the roster? This
          action cannot be undone.
        </Text>
        <Text size="sm" mb="md" c="dimmed">
          Type{" "}
          <Text span fw={700} c="var(--mantine-color-text)">
            delete
          </Text>{" "}
          to confirm.
        </Text>
        <TextInput
          placeholder="Type delete to confirm"
          value={confirmDeleteText}
          onChange={(e) => setConfirmDeleteText(e.currentTarget.value)}
          mb="lg"
          disabled={deleting}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={closeDeleteModal}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            color="red"
            disabled={confirmDeleteText.toLowerCase() !== "delete"}
            loading={deleting}
            onClick={handleDeleteStudent}
          >
            Delete
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

// ─── Student row ──────────────────────────────────────────────────────────────

function StudentRow({
  student,
  canEditDelete,
  onEdit,
  onDelete,
}: {
  student: StudentRosterEntry;
  canEditDelete: boolean;
  onEdit: (student: StudentRosterEntry) => void;
  onDelete: (student: StudentRosterEntry) => void;
}) {
  return (
    <TableTr>
      <TableTd>
        <Text fz="sm" ff="monospace">
          {student.lrn}
        </Text>
      </TableTd>
      <TableTd>
        <Text fz="sm">{student.full_name}</Text>
      </TableTd>
      {canEditDelete && (
        <TableTd>
          <Group gap={4} justify="flex-end" wrap="nowrap">
            <Tooltip label="Edit student" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => onEdit(student)}
              >
                <IconPencil size={15} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Remove from roster" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onDelete(student)}
              >
                <IconTrash size={15} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </TableTd>
      )}
    </TableTr>
  );
}
