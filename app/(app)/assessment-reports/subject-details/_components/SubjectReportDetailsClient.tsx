"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
  Alert,
  Badge,
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
import { IconAlertCircle, IconBook, IconCheck, IconFileText, IconSchool, IconUser, IconUsers } from "@tabler/icons-react";
import {
  fetchReportSubjectOverview,
  type ReportSubjectOverview,
  type ReportSubjectStatus,
} from "@/lib/services/reportsAnalysisService";

interface Props {
  gradeLevelId: number;
  subjectId: number;
}

const SSES_COLOR = "#70A2FF";

function SsesDot() {
  return (
    <Box
      component="span"
      aria-label="SSES subject"
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        backgroundColor: SSES_COLOR,
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}

function StatusBadge({ status }: { status: ReportSubjectStatus | "Finalized" | "Not Finalized" }) {
  const isFinalized = status === "Finalized";
  const isPending = status === "Not Finalized";
  return (
    <Badge color={isFinalized ? "green" : isPending ? "red" : "gray"} variant="light">
      {status}
    </Badge>
  );
}

export default function SubjectReportDetailsClient({ gradeLevelId, subjectId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportSubjectOverview | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchReportSubjectOverview(gradeLevelId, subjectId);
        if (!mounted) return;
        if (!result) {
          setError("Subject report not found.");
          return;
        }
        setDetail(result);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load subject report.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [gradeLevelId, subjectId]);

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
        {error ?? "Subject report not found."}
      </Alert>
    );
  }

  return (
    <Stack gap="md" maw={1000}>
      <Box>
        <BackButton href="/assessment-reports/subject" mb="md" size="sm">
          Back to Subject Reports
        </BackButton>
      </Box>

      <Group justify="space-between" align="center">
        <Group gap="xs" align="center" style={{ minWidth: 0 }}>
          <Title order={3} fw={700}>
            {detail.gradeDisplayName} - {detail.subjectName}
          </Title>
          {detail.subjectType === "SSES" && <SsesDot />}
        </Group>
        <StatusBadge status={detail.isFinalized ? "Finalized" : "Not Finalized"} />
      </Group>

      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">About</Text>
        <Stack gap="xs">
          <Group gap="xs">
            <IconSchool size={16} />
            <Text size="sm">Grade Level: {detail.gradeDisplayName}</Text>
          </Group>
          <Group gap="xs">
            <IconBook size={16} />
            <Group gap={6} wrap="nowrap">
              <Text size="sm">Subject: {detail.subjectName}</Text>
              {detail.subjectType === "SSES" && <SsesDot />}
            </Group>
          </Group>
          <Group gap="xs">
            <IconUsers size={16} />
            <Text size="sm">Sections: {detail.sectionCount}</Text>
          </Group>
          <Group gap="xs">
            <IconCheck size={16} />
            <Text size="sm">Finalized: {detail.finalizedSections}/{detail.sectionCount}</Text>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Text fw={700} c="#298925" mb="sm">Actions</Text>
        <Button
          color="#4EAE4A"
          size="sm"
          onClick={() => {
            const base = `/assessment-reports/report-analytics/subject/${detail.gradeLevelId}/${detail.subjectId}`;
            const href = detail.latestExamId ? `${base}/${detail.latestExamId}` : base;
            router.push(href);
          }}
        >
          View Reports
        </Button>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="xs">
          <Text fw={700} c="#298925">Sections</Text>
          <Group gap={28}>
            <Text fw={700} c="#298925" w={180} ta="left">Teacher</Text>
            <Text fw={700} c="#298925" w={130} ta="left">Status</Text>
          </Group>
        </Group>
        <Divider mb="sm" />
        {detail.sections.length === 0 ? (
          <Stack align="center" py="md" gap="xs">
            <IconFileText size={32} color="#c1c2c5" />
            <Text size="sm" c="dimmed" ta="center">No sections available for this subject yet.</Text>
          </Stack>
        ) : (
          <Stack gap="xs">
            {detail.sections.map((section) => (
              <Group key={section.sectionId} justify="space-between" align="center">
                <Text size="sm" w="45%" lineClamp={1}>{section.sectionName}</Text>
                <Group gap="xs" wrap="nowrap" w={180}>
                  <IconUser size={14} />
                  <Text size="sm" c={section.teacherName ? undefined : "dimmed"} ta="left" lineClamp={1}>
                    {section.teacherName ?? "Unassigned"}
                  </Text>
                </Group>
                <Group w={130} justify="flex-start">
                  <StatusBadge status={section.status} />
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
