"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside, useDisclosure, useMediaQuery } from "@mantine/hooks";
import BackButton from "@/components/BackButton";
import EmptySearchState from "@/components/EmptySearchState";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Collapse,
  Divider,
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
  UnstyledButton,
} from "@mantine/core";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  IconAlertCircle,
  IconChevronRight,
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
} from "@/lib/services/classService";
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

const SEE_MORE_LIMIT = 10;

// ─── Skeleton ────────────────────────────────────────────────────────────────

function RosterSkeleton() {
  return (
    <Stack gap="md">
      <Group gap="xs" justify="flex-end">
        <Skeleton height={34} width={130} radius="sm" />
        <Skeleton height={34} width={130} radius="sm" />
        <Skeleton height={34} width={140} radius="sm" />
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

// ─── Group header (desktop table) ────────────────────────────────────────────

function GroupHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <TableTr>
      <TableTd
        colSpan={colSpan}
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

// ─── Group label (mobile list) ────────────────────────────────────────────────

function MobileGroupLabel({ label }: { label: string }) {
  return (
    <Text
      fw={700}
      fz="sm"
      ta="center"
      py={6}
      style={{
        backgroundColor: "var(--mantine-color-gray-1)",
        borderTop: "1px solid var(--mantine-color-gray-3)",
        borderBottom: "1px solid var(--mantine-color-gray-3)",
      }}
    >
      {label}
    </Text>
  );
}

// ─── See more row (desktop table) ────────────────────────────────────────────

function SeeMoreRow({
  colSpan,
  expanded,
  onToggle,
}: {
  colSpan: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TableTr>
      <TableTd colSpan={colSpan} ta="center" py="sm">
        <UnstyledButton onClick={onToggle}>
          <Text size="sm" c="dimmed">{expanded ? "See Less" : "See More"}</Text>
        </UnstyledButton>
      </TableTd>
    </TableTr>
  );
}

// ─── Desktop student row ──────────────────────────────────────────────────────

function StudentRow({
  student,
  canEditDelete,
  isSelected,
  onEdit,
  onDelete,
  onClick,
}: {
  student: StudentRosterEntry;
  canEditDelete: boolean;
  isSelected: boolean;
  onEdit: (s: StudentRosterEntry) => void;
  onDelete: (s: StudentRosterEntry) => void;
  onClick: (s: StudentRosterEntry) => void;
}) {
  return (
    <TableTr
      onClick={(e) => {
        e.stopPropagation();
        onClick(student);
      }}
      style={{
        cursor: "pointer",
        backgroundColor: isSelected ? "#f0f7ee" : undefined,
        transition: "background-color 0.15s ease",
      }}
    >
      <TableTd>
        <Text fz="sm" ff="monospace">
          {student.lrn}
        </Text>
      </TableTd>
      <TableTd>
        <Text fz="sm">{student.full_name}</Text>
      </TableTd>
      {canEditDelete && (
        <TableTd onClick={(e) => e.stopPropagation()}>
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

// ─── Mobile student row ───────────────────────────────────────────────────────

function StudentMobileRow({
  student,
  canEditDelete,
  onEdit,
  onDelete,
}: {
  student: StudentRosterEntry;
  canEditDelete: boolean;
  onEdit: (s: StudentRosterEntry) => void;
  onDelete: (s: StudentRosterEntry) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);

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
            <Text
              fw={500}
              fz="sm"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {student.full_name}
            </Text>
          </Group>
          {canEditDelete && (
            <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => onEdit(student)}
              >
                <IconPencil size={15} stroke={1.5} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onDelete(student)}
              >
                <IconTrash size={15} stroke={1.5} />
              </ActionIcon>
            </Group>
          )}
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
            LRN
          </Text>
          <Text fz="sm" ff="monospace">
            {student.lrn}
          </Text>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentRosterClient({ sectionId }: Props) {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const hasFullAccess = permissions.includes("students.full_access");
  const hasPartialAccess = permissions.includes("students.limited_access");

  const [section, setSection] = useState<StudentRosterSection | null>(null);
  const [students, setStudents] = useState<StudentRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentRosterEntry | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<StudentRosterEntry | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [downloadOpened, setDownloadOpened] = useState(false);
  const [addOpened, setAddOpened] = useState(false);
  const [importOpened, setImportOpened] = useState(false);
  const [showAllMale, setShowAllMale] = useState(false);
  const [showAllFemale, setShowAllFemale] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);

  const tableRef = useClickOutside(() => setSelectedEnrollmentId(null));

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
      const msg = e instanceof Error ? e.message : "Failed to load roster.";
      if (msg === "Forbidden") { router.replace("/unauthorized"); return; }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [sectionId, router]);

  useEffect(() => { void load(); }, [load]);

  // Reset "see more" when filters change so the count always reflects filtered results
  useEffect(() => {
    setShowAllMale(false);
    setShowAllFemale(false);
  }, [search, sexFilter]);

  const isAdviser = Boolean(user && section && user.id === section.adviser_id);
  const canEditDelete = hasFullAccess || (hasPartialAccess && isAdviser);
  const canAddImport = hasFullAccess || (hasPartialAccess && isAdviser);
  const canDownload = hasFullAccess || hasPartialAccess;
  const hasStudents = students.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const matchesSex = sexFilter === "" || s.sex === sexFilter;
      const matchesSearch =
        q === "" || s.full_name.toLowerCase().includes(q) || s.lrn.includes(q);
      return matchesSex && matchesSearch;
    });
  }, [students, search, sexFilter]);

  const maleStudents = useMemo(() => filtered.filter((s) => s.sex === "M"), [filtered]);
  const femaleStudents = useMemo(() => filtered.filter((s) => s.sex === "F"), [filtered]);

  const visibleMale = showAllMale ? maleStudents : maleStudents.slice(0, SEE_MORE_LIMIT);
  const visibleFemale = showAllFemale ? femaleStudents : femaleStudents.slice(0, SEE_MORE_LIMIT);
  const remainingMale = maleStudents.length - SEE_MORE_LIMIT;
  const remainingFemale = femaleStudents.length - SEE_MORE_LIMIT;

  function handleRowClick(student: StudentRosterEntry) {
    if (selectedEnrollmentId === student.enrollment_id) {
      if (canEditDelete) setEditingStudent(student);
      setSelectedEnrollmentId(null);
    } else {
      setSelectedEnrollmentId(student.enrollment_id);
    }
  }

  const hasActiveFilters = search.trim() !== "" || sexFilter !== "";
  const noResults = filtered.length === 0 && students.length > 0 && hasActiveFilters;
  const noStudents = students.length === 0 && !loading && !error;

  const colSpan = canEditDelete ? 3 : 2;

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
      notify({
        type: "success",
        title: "Student Deleted",
        message: `${deletingStudent.full_name} has been deleted.`,
      });
      closeDeleteModal();
      await load();
    } catch (e) {
      notify({
        type: "error",
        title: "Error",
        message: e instanceof Error ? e.message : "Failed to delete student.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const titleAndBack = (sectionTitle?: React.ReactNode) => (
    <Box>
      <h1
        className={
          isMobile
            ? "text-2xl font-bold text-[#597D37] mb-4 leading-tight"
            : "text-2xl md:text-3xl font-bold mb-6 text-[#597D37]"
        }
      >
        Students Management
      </h1>
      <BackButton href={`/school/classes/${sectionId}`} mb="md" size="sm">
        Back to Class Details
      </BackButton>
      {sectionTitle}
    </Box>
  );

  // ── Loading ──
  if (loading) {
    return (
      <Stack gap="md" maw={900}>
        {titleAndBack()}
        <RosterSkeleton />
      </Stack>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <Stack gap="md" maw={950}>
        {titleAndBack()}
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      </Stack>
    );
  }

  // ── Action buttons (layout differs by breakpoint) ──
  const actionButtons = isMobile ? (
    <Stack gap="xs" w="100%">
      {canAddImport && (
        <Group gap="xs" grow>
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
        </Group>
      )}
      {canDownload && hasStudents && (
        <Button
          fullWidth
          variant="outline"
          color="gray"
          leftSection={<IconDownload size={16} />}
          size="sm"
          onClick={() => setDownloadOpened(true)}
        >
          Download Roster
        </Button>
      )}
    </Stack>
  ) : (
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
  );

  // ── Filters (layout differs by breakpoint) ──
  const filters = isMobile ? (
    <Stack gap="xs">
      <SearchBar
        id="search-roster"
        placeholder="Search student name or LRN..."
        ariaLabel="Search students"
        style={{ width: "100%" }}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <Select
        data={SEX_OPTIONS}
        value={sexFilter}
        onChange={(v) => setSexFilter(v ?? "")}
        placeholder="All Sexes"
        leftSection={<IconGenderBigender size={16} />}
        style={{ width: "100%" }}
        clearable={false}
      />
    </Stack>
  ) : (
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
  );

  const desktopButtons = (
    <Group gap="xs" wrap="wrap">
      {canAddImport && (
        <>
          <Button color="#4EAE4A" leftSection={<IconPlus size={16} />} size="sm" onClick={() => setAddOpened(true)}>
            Add a Student
          </Button>
          <Button variant="outline" color="#4EAE4A" leftSection={<IconTableImport size={16} />} size="sm" onClick={() => setImportOpened(true)}>
            Import Roster
          </Button>
        </>
      )}
      {canDownload && hasStudents && (
        <Button variant="outline" color="gray" leftSection={<IconDownload size={16} />} size="sm" onClick={() => setDownloadOpened(true)}>
          Download Roster
        </Button>
      )}
    </Group>
  );

  return (
    <Stack gap="md" maw={1000}>
      {/* Mobile: title in Box, buttons below; Desktop: title+buttons side-by-side below Box */}
      {titleAndBack(
        isMobile ? (
          <Title order={3} fw={700}>
            {section?.grade_level_display} • {section?.name}
          </Title>
        ) : undefined,
      )}

      {isMobile ? (
        actionButtons
      ) : (
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Title order={3} fw={700}>
            {section?.grade_level_display} • {section?.name}
          </Title>
          {desktopButtons}
        </Group>
      )}

      {/* Filters */}
      {filters}

      {/* Empty — no students enrolled */}
      {noStudents && (
        <EmptySearchState
          icon={IconUsers}
          title="No students enrolled."
          description={
            canAddImport
              ? 'This class has no enrolled students yet. Use "Add a Student" or "Import Roster" to get started.'
              : "This class has no enrolled students yet."
          }
        />
      )}

      {/* Empty — filters return nothing */}
      {noResults && (
        <EmptySearchState
          title="No students found."
          description="No students match your current search or filter."
        />
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <>
          {/* Desktop table — hidden on mobile */}
          <div className="hidden sm:block">
            <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
              <TableScrollContainer minWidth={520} ref={tableRef}>
                <Table verticalSpacing="sm" striped={false}>
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
                    {maleStudents.length > 0 && (
                      <>
                        <GroupHeader
                          label={`Male (${maleStudents.length})`}
                          colSpan={colSpan}
                        />
                        {visibleMale.map((s) => (
                          <StudentRow
                            key={s.enrollment_id}
                            student={s}
                            canEditDelete={canEditDelete}
                            isSelected={selectedEnrollmentId === s.enrollment_id}
                            onEdit={setEditingStudent}
                            onDelete={setDeletingStudent}
                            onClick={handleRowClick}
                          />
                        ))}
                        {maleStudents.length > SEE_MORE_LIMIT && (
                          <SeeMoreRow
                            colSpan={colSpan}
                            expanded={showAllMale}
                            onToggle={() => setShowAllMale((v) => !v)}
                          />
                        )}
                      </>
                    )}
                    {femaleStudents.length > 0 && (
                      <>
                        <GroupHeader
                          label={`Female (${femaleStudents.length})`}
                          colSpan={colSpan}
                        />
                        {visibleFemale.map((s) => (
                          <StudentRow
                            key={s.enrollment_id}
                            student={s}
                            canEditDelete={canEditDelete}
                            isSelected={selectedEnrollmentId === s.enrollment_id}
                            onEdit={setEditingStudent}
                            onDelete={setDeletingStudent}
                            onClick={handleRowClick}
                          />
                        ))}
                        {femaleStudents.length > SEE_MORE_LIMIT && (
                          <SeeMoreRow
                            colSpan={colSpan}
                            expanded={showAllFemale}
                            onToggle={() => setShowAllFemale((v) => !v)}
                          />
                        )}
                      </>
                    )}
                  </TableTbody>
                </Table>
              </TableScrollContainer>
            </Paper>
          </div>

          {/* Mobile accordion list — hidden on sm+ */}
          <div className="sm:hidden">
            {maleStudents.length > 0 && (
              <>
                <MobileGroupLabel label={`Male (${maleStudents.length})`} />
                {visibleMale.map((s) => (
                  <StudentMobileRow
                    key={s.enrollment_id}
                    student={s}
                    canEditDelete={canEditDelete}
                    onEdit={setEditingStudent}
                    onDelete={setDeletingStudent}
                  />
                ))}
                {maleStudents.length > SEE_MORE_LIMIT && (
                  <Group justify="center" mt="xs">
                    <UnstyledButton onClick={() => setShowAllMale((v) => !v)}>
                      <Text size="sm" c="dimmed">{showAllMale ? "See Less" : "See More"}</Text>
                    </UnstyledButton>
                  </Group>
                )}
              </>
            )}
            {femaleStudents.length > 0 && (
              <>
                <MobileGroupLabel label={`Female (${femaleStudents.length})`} />
                {visibleFemale.map((s) => (
                  <StudentMobileRow
                    key={s.enrollment_id}
                    student={s}
                    canEditDelete={canEditDelete}
                    onEdit={setEditingStudent}
                    onDelete={setDeletingStudent}
                  />
                ))}
                {femaleStudents.length > SEE_MORE_LIMIT && (
                  <Group justify="center" mt="xs">
                    <UnstyledButton onClick={() => setShowAllFemale((v) => !v)}>
                      <Text size="sm" c="dimmed">{showAllFemale ? "See Less" : "See More"}</Text>
                    </UnstyledButton>
                  </Group>
                )}
              </>
            )}
          </div>
        </>
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
          <Button variant="default" onClick={closeDeleteModal} disabled={deleting}>
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
