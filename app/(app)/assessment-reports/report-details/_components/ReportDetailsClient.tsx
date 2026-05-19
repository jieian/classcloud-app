"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
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
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBook,
  IconFileText,
  IconSchool,
  IconUser,
} from "@tabler/icons-react";
import {
  fetchReportSectionOverview,
  type ReportSectionOverview,
} from "@/lib/services/reportsAnalysisService";

interface Props {
  sectionId: number;
  initialGradeLevelId?: number | null;
}

export default function ReportDetailsClient({
  sectionId,
  initialGradeLevelId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportSectionOverview | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchReportSectionOverview(sectionId);
        if (!mounted) return;
        if (!result) {
          setError("Section reports not found.");
          return;
        }
        setDetail(result);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load section report.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [sectionId]);

  const backHref = "/assessment-reports";

  if (loading) {
    return (
      <Stack gap="md" maw={1000}>
        <Skeleton height={32} w={170} radius="md" />
        <Skeleton height={30} w={320} radius="md" />
        <Skeleton height={130} radius="md" />
        <Skeleton height={100} radius="md" />
        <Skeleton height={220} radius="md" />
      </Stack>
    );
  }

  if (error || !detail) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} mt="md">
        {error ?? "Section reports not found."}
      </Alert>
    );
  }

  return (
    <Stack gap="md" maw={1000}>
      <Box>
        <BackButton href={backHref} mb="md" size="sm">
          Back to Assessment Reports
        </BackButton>
      </Box>

      <Title order={3} fw={700}>
        {detail.gradeDisplayName} - {detail.sectionName}
      </Title>

      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">
          About
        </Text>
        <Stack gap="xs">
          <Group gap="xs">
            <IconSchool size={16} />
            <Text size="sm">Grade Level: {detail.gradeDisplayName}</Text>
          </Group>
          <Group gap="xs">
            <IconBook size={16} />
            <Text size="sm">Section: {detail.sectionName}</Text>
          </Group>
          <Group gap="xs">
            <IconFileText size={16} />
            <Text size="sm">
              Examinations: {detail.finalizedExams}/{detail.totalExams} finalized
            </Text>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">
          Actions
        </Text>
        <Button
          color="#4EAE4A"
          size="sm"
          onClick={() => {
            const base = `/assessment-reports/report-analytics/${detail.gradeLevelId}/${detail.sectionId}`;
            const href = detail.latestExamId ? `${base}/${detail.latestExamId}` : base;
            router.push(href);
          }}
        >
          View Reports
        </Button>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="xs">
          <Text fw={700} c="#298925">
            Subjects
          </Text>
          <Group gap={28}>
            <Text fw={700} c="#298925" w={180} ta="left">
              Teacher
            </Text>
            <Text fw={700} c="#298925" w={130} ta="left">
              Status
            </Text>
          </Group>
        </Group>
        <Divider mb="sm" />
        {detail.subjects.length === 0 ? (
          <Stack align="center" py="md" gap="xs">
            <IconBook size={32} color="#c1c2c5" />
            <Text size="sm" c="dimmed" ta="center">
              No subjects available for this section yet.
            </Text>
          </Stack>
        ) : (
          <Stack gap="xs">
            {detail.subjects.map((subject) => (
              <Group key={subject.subjectId} justify="space-between" align="center">
                <Text size="sm" w="45%" lineClamp={1}>
                  {subject.subjectName}
                </Text>
                <Group gap="xs" wrap="nowrap" w={180}>
                  <IconUser size={14} />
                  <Text
                    size="sm"
                    c={subject.teacherName ? undefined : "dimmed"}
                    ta="left"
                    lineClamp={1}
                  >
                    {subject.teacherName ?? "Unassigned"}
                  </Text>
                </Group>
                <Text
                  size="sm"
                  w={130}
                  ta="left"
                  fw={500}
                  c={
                    subject.status === "Finalized"
                      ? "green"
                      : subject.status === "Not Finalized"
                        ? "red"
                        : "dimmed"
                  }
                >
                  {subject.status}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
