"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArchive,
  IconBadge,
  IconBook,
  IconPencil,
  IconPlus,
  IconSettings,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSectionDetail,
  type SectionDetail,
  type SectionSubjectRow,
} from "../../_lib/classService";
import ArchiveClassModal from "./ArchiveClassModal";
import AssignAdviserModal from "./AssignAdviserModal";
import EditSectionNameModal from "./EditSectionNameModal";
import ManageSubjectTeachersModal from "./ManageSubjectTeachersModal";

interface Props {
  sectionId: number;
}

export default function ClassDetailClient({ sectionId }: Props) {
  const router = useRouter();
  const { permissions } = useAuth();

  const hasClassesManagement = permissions.includes(
    "classes.full_access",
  );
  const hasStudentManagement =
    permissions.includes("students.full_access") ||
    permissions.includes("students.limited_access");

  const [section, setSection] = useState<SectionDetail | null>(null);
  const [subjects, setSubjects] = useState<SectionSubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignAdviserOpened, setAssignAdviserOpened] = useState(false);
  const [editNameOpened, setEditNameOpened] = useState(false);
  const [archiveOpened, setArchiveOpened] = useState(false);
  const [manageTeachersOpened, setManageTeachersOpened] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const result = await fetchSectionDetail(sectionId);
      setSection(result.section);
      setSubjects(result.subjects);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load class.");
    }
  }, [sectionId]);

  useEffect(() => {
    async function load() {
      try {
        await loadDetail();
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [loadDetail]);

  if (loading) {
    return (
      <Stack gap="md" maw={560}>
        <Skeleton height={36} w={160} radius="md" />
        <Skeleton height={36} w={340} radius="md" />
        <Skeleton height={110} radius="md" />
        <Skeleton height={80} radius="md" />
        <Skeleton height={260} radius="md" />
      </Stack>
    );
  }

  if (error || !section) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} mt="md">
        {error ?? "Class not found."}
      </Alert>
    );
  }

  return (
    <Stack gap="md" maw={1000}>
      {/* Back */}
      <Box>
        <BackButton href="/school/classes" mb="md">Back to Classes</BackButton>
      </Box>

      {/* Heading */}
      <Title order={3} fw={700}>
        {section.grade_level_display} • {section.name}
      </Title>

      {/* About */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">
          About
        </Text>
        <Stack gap="xs">
          <Group gap="xs">
            <IconBook size={16} />
            <Text size="sm">Grade Level: {section.grade_level_display}</Text>
          </Group>

          <Group gap="xs">
            <IconBadge size={16} />
            <Text size="sm">Class Name: {section.name}</Text>
            {hasClassesManagement && (
              <Tooltip label="Edit Section Name" withArrow position="right">
                <ActionIcon
                  size="sm"
                  color="yellow"
                  variant="filled"
                  radius="xl"
                  onClick={() => setEditNameOpened(true)}
                >
                  <IconPencil size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          <Group gap="xs">
            <IconUser size={16} />
            <Text size="sm">
              Adviser:{" "}
              <Text span c={section.adviser_name ? undefined : "dimmed"}>
                {section.adviser_name ?? "Unassigned"}
              </Text>
            </Text>
            {hasClassesManagement && (
              <Tooltip
                label={section.adviser_id ? "Edit Adviser" : "Assign Adviser"}
                withArrow
                position="right"
              >
                <ActionIcon
                  size="sm"
                  color={section.adviser_id ? "yellow" : "#4EAE4A"}
                  variant="filled"
                  radius="xl"
                  onClick={() => setAssignAdviserOpened(true)}
                >
                  {section.adviser_id ? (
                    <IconPencil size={12} />
                  ) : (
                    <IconPlus size={12} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>

          <Group gap="xs">
            <IconUsers size={16} />
            <Text size="sm">Students: {section.student_count}</Text>
          </Group>
        </Stack>
      </Paper>

      {/* Actions */}
      {(hasStudentManagement || hasClassesManagement) && (
        <Paper withBorder p="md" radius="md">
          <Text fw={700} c="#298925" mb="sm">
            Actions
          </Text>
          <Stack gap="sm" align="flex-start">
            {hasStudentManagement && (
              <Button
                color="#4EAE4A"
                leftSection={<IconUsers size={16} />}
                size="sm"
                component={Link}
                href={`/school/classes/${section.section_id}/students`}
              >
                Manage Student Roster
              </Button>
            )}
            {hasClassesManagement && (
              <Button
                variant="outline"
                color="red"
                leftSection={<IconArchive size={16} />}
                size="sm"
                onClick={() => setArchiveOpened(true)}
              >
                Delete Class
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      {/* Subjects */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="xs">
          <Text fw={700} c="#298925">
            Subjects
          </Text>
          <Text fw={700} c="#298925">
            Teacher
          </Text>
        </Group>
        <Divider mb="sm" />
        {subjects.length === 0 ? (
          <Stack align="center" py="md" gap="xs">
            <IconBook size={32} color="#c1c2c5" />
            <Text size="sm" c="dimmed" ta="center">
              No subjects assigned for this grade level.
            </Text>
          </Stack>
        ) : (
          <Stack gap="xs">
            {subjects.map((sub) => (
              <Group key={sub.subject_id} justify="space-between">
                <Text size="sm">{sub.name}</Text>
                <Text size="sm" c={sub.assigned_teacher ? undefined : "dimmed"}>
                  {sub.assigned_teacher ?? "Unassigned"}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
        {hasClassesManagement && (
          <>
            <Divider my="sm" />
            <Button
              color="#4EAE4A"
              leftSection={<IconSettings size={16} />}
              size="sm"
              mt="xs"
              w={"100%"}
              onClick={() => setManageTeachersOpened(true)}
            >
              Manage Subject Teacher Assignment
            </Button>
          </>
        )}
      </Paper>

      <AssignAdviserModal
        opened={assignAdviserOpened}
        sectionId={section.section_id}
        currentAdviserId={section.adviser_id}
        currentAdviserName={section.adviser_name}
        onClose={() => setAssignAdviserOpened(false)}
        onAssigned={loadDetail}
      />

      <EditSectionNameModal
        opened={editNameOpened}
        sectionId={section.section_id}
        gradeLevelId={section.grade_level_id}
        currentName={section.name}
        onClose={() => setEditNameOpened(false)}
        onRenamed={loadDetail}
      />

      <ArchiveClassModal
        opened={archiveOpened}
        sectionId={section.section_id}
        sectionName={section.name}
        onClose={() => setArchiveOpened(false)}
        onArchived={() => router.push("/school/classes")}
      />

      <ManageSubjectTeachersModal
        opened={manageTeachersOpened}
        sectionId={section.section_id}
        subjects={subjects}
        onClose={() => setManageTeachersOpened(false)}
        onSaved={loadDetail}
      />
    </Stack>
  );
}
