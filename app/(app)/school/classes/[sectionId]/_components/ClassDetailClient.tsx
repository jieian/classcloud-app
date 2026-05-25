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
  Collapse,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArchive,
  IconBadge,
  IconBook,
  IconChalkboardTeacher,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSectionDetail,
  type SectionDetail,
  type SectionSubjectRow,
} from "@/lib/services/classService";
import ArchiveClassModal from "./ArchiveClassModal";
import AssignAdviserModal from "./AssignAdviserModal";
import EditSectionNameModal from "./EditSectionNameModal";
import ManageSubjectTeachersModal from "./ManageSubjectTeachersModal";

interface Props {
  sectionId: number;
}

function SubjectMobileRow({ subject }: { subject: SectionSubjectRow }) {
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
              {subject.name}
            </Text>
          </Group>
          <Text
            size="xs"
            fw={600}
            c={subject.assigned_teacher ? "#298925" : "dimmed"}
          >
            {subject.assigned_teacher ? "Assigned" : "Unassigned"}
          </Text>
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
            Teacher
          </Text>
          <Text
            fz="sm"
            c={subject.assigned_teacher ? undefined : "dimmed"}
            fs={subject.assigned_teacher ? undefined : "italic"}
          >
            {subject.assigned_teacher ?? "Unassigned"}
          </Text>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

export default function ClassDetailClient({ sectionId }: Props) {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const hasClassesManagement = permissions.includes("classes.full_access");
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

  if (!loading && (error || !section)) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} mt="md">
        {error ?? "Class not found."}
      </Alert>
    );
  }

  const currentSection = section;
  const canEditSectionName =
    !loading &&
    !!currentSection &&
    hasClassesManagement &&
    currentSection.section_type === "REGULAR";

  return (
    <Stack gap="md" maw={1000}>
      <Box>
        <h1
          className={
            isMobile
              ? "text-2xl font-bold text-[#597D37] mb-4 leading-tight"
              : "text-3xl font-bold mb-6 text-[#597D37]"
          }
        >
          Classes Management
        </h1>
        <BackButton href="/school/classes" mb="md" size="sm">
          Back to Classes
        </BackButton>
        {loading ? (
          <Skeleton height={32} w={isMobile ? "70%" : 320} radius="md" />
        ) : (
          <Text component="h2" fw={700} size="xl">
            {currentSection!.grade_level_display} • {currentSection!.name}
          </Text>
        )}
      </Box>

      {loading ? (
        <>
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Skeleton height={18} w="20%" radius="xl" />
              <Skeleton height={16} w="52%" radius="xl" />
              <Skeleton height={16} w="48%" radius="xl" />
              <Skeleton height={16} w="34%" radius="xl" />
            </Stack>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm" align="flex-start">
              <Skeleton height={18} w={70} radius="xl" />
              <Skeleton height={36} w={isMobile ? "100%" : 220} radius="md" />
              <Skeleton height={36} w={isMobile ? "100%" : 140} radius="md" />
            </Stack>
          </Paper>
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Skeleton height={18} w={80} radius="xl" />
                {!isMobile && <Skeleton height={18} w={70} radius="xl" />}
              </Group>
              <Divider />
              <Skeleton height={16} w="100%" radius="xl" />
              <Skeleton height={16} w="92%" radius="xl" />
              <Skeleton height={16} w="96%" radius="xl" />
              <Divider />
              <Skeleton height={36} w="100%" radius="md" />
            </Stack>
          </Paper>
        </>
      ) : (
        <>
          <Paper withBorder p="md" radius="md">
            <Text fw={700} c="#298925" mb="sm">
              About
            </Text>
            <Stack gap="xs">
              <Group gap="xs">
                <IconBook size={16} />
                <Text size="sm">
                  Grade Level: {currentSection!.grade_level_display}
                </Text>
              </Group>

              <Group gap="xs">
                <IconBadge size={16} />
                <Text size="sm">Class Name: {currentSection!.name}</Text>
                {canEditSectionName && (
                  <Tooltip label="Edit Section Name" withArrow position="right">
                    <ActionIcon
                      size="sm"
                      color="gray"
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
                <IconChalkboardTeacher size={16} />
                <Text size="sm">
                  Adviser:{" "}
                  <Text
                    span
                    c={currentSection!.adviser_name ? undefined : "dimmed"}
                  >
                    {currentSection!.adviser_name ?? "Unassigned"}
                  </Text>
                </Text>
                {hasClassesManagement && (
                  <Tooltip
                    label={
                      currentSection!.adviser_id ? "Edit Adviser" : "Assign Adviser"
                    }
                    withArrow
                    position="right"
                  >
                    <ActionIcon
                      size="sm"
                      color={currentSection!.adviser_id ? "gray" : "#4EAE4A"}
                      variant="filled"
                      radius="xl"
                      onClick={() => setAssignAdviserOpened(true)}
                    >
                      {currentSection!.adviser_id ? (
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
                {currentSection!.student_count > 0 ? (
                  <Text size="sm">Students: {currentSection!.student_count}</Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    No enrollees yet
                  </Text>
                )}
              </Group>
            </Stack>
          </Paper>

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
                    href={`/school/classes/${currentSection!.section_id}/students`}
                  >
                    {permissions.includes("students.full_access") ||
                    currentSection!.adviser_id === user?.id
                      ? "Manage Student Roster"
                      : "View Student Roster"}
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

          <Paper withBorder p="md" radius="md">
            {isMobile ? (
              <Text fw={700} c="#298925" mb="xs">
                Subjects
              </Text>
            ) : (
              <>
                <Group justify="space-between" mb="xs">
                  <Text fw={700} c="#298925">
                    Subjects
                  </Text>
                  <Text fw={700} c="#298925">
                    Teacher
                  </Text>
                </Group>
                <Divider mb="sm" />
              </>
            )}

            {subjects.length === 0 ? (
              <Stack align="center" py="md" gap="xs">
                <IconBook size={32} color="#c1c2c5" />
                <Text size="sm" c="dimmed" ta="center">
                  No subjects assigned for this grade level.
                </Text>
              </Stack>
            ) : (
              <>
                <div className="hidden sm:block">
                  <Stack gap="xs">
                    {subjects.map((sub) => (
                      <Group key={sub.subject_id} justify="space-between">
                        <Text size="sm">{sub.name}</Text>
                        <Text
                          size="sm"
                          c={sub.assigned_teacher ? undefined : "dimmed"}
                        >
                          {sub.assigned_teacher ?? "Unassigned"}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </div>
                <div className="sm:hidden">
                  <Divider />
                  {subjects.map((sub) => (
                    <SubjectMobileRow key={sub.subject_id} subject={sub} />
                  ))}
                </div>
              </>
            )}

            {hasClassesManagement && (
              <>
                <Divider my="sm" />
                <Button
                  color="#4EAE4A"
                  leftSection={<IconSettings size={16} />}
                  size="sm"
                  mt="xs"
                  w="100%"
                  onClick={() => setManageTeachersOpened(true)}
                >
                  Manage Subject Teacher Assignment
                </Button>
              </>
            )}
          </Paper>

          <AssignAdviserModal
            opened={assignAdviserOpened}
            sectionId={currentSection!.section_id}
            currentAdviserId={currentSection!.adviser_id}
            currentAdviserName={currentSection!.adviser_name}
            onClose={() => setAssignAdviserOpened(false)}
            onAssigned={loadDetail}
          />

          <EditSectionNameModal
            opened={canEditSectionName && editNameOpened}
            sectionId={currentSection!.section_id}
            gradeLevelId={currentSection!.grade_level_id}
            currentName={currentSection!.name}
            onClose={() => setEditNameOpened(false)}
            onRenamed={loadDetail}
          />

          <ArchiveClassModal
            opened={archiveOpened}
            sectionId={currentSection!.section_id}
            sectionName={currentSection!.name}
            onClose={() => setArchiveOpened(false)}
            onArchived={() => router.push("/school/classes")}
          />

          <ManageSubjectTeachersModal
            opened={manageTeachersOpened}
            sectionId={currentSection!.section_id}
            subjects={subjects}
            onClose={() => setManageTeachersOpened(false)}
            onSaved={loadDetail}
          />
        </>
      )}
    </Stack>
  );
}
