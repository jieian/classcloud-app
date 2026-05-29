"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  Alert,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { ProfileAssignmentsResponse } from "@/app/api/profile/assignments/route";

const accordionStyles = {
  item: {
    border: "1px solid #D6D9E0",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  control: {
    backgroundColor: "#ffffff",
    padding: "12px 14px",
    "&:hover": { backgroundColor: "#f7fbf4" },
  },
  label: { padding: 0 },
  content: { padding: "0 14px 10px" },
  panel: { padding: 0 },
};

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="sm" fw={600} mb={6}>{title}</Text>
      {children}
    </div>
  );
}

type SectionGroup = {
  gradeDisplayName: string;
  sectionName: string;
  subjects: string[];
};

function groupBySection(
  handledSubjects: ProfileAssignmentsResponse["handledSubjects"],
): SectionGroup[] {
  const map = new Map<string, SectionGroup>();
  for (const hs of handledSubjects) {
    for (const sec of hs.sections) {
      const key = `${sec.gradeDisplayName}||${sec.sectionName}`;
      if (!map.has(key)) {
        map.set(key, { gradeDisplayName: sec.gradeDisplayName, sectionName: sec.sectionName, subjects: [] });
      }
      map.get(key)!.subjects.push(hs.subjectName);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.gradeDisplayName.localeCompare(b.gradeDisplayName) || a.sectionName.localeCompare(b.sectionName),
  );
}

export default function MyAssignmentCard() {
  const [data, setData] = useState<ProfileAssignmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile/assignments")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load assignments.");
        return r.json() as Promise<ProfileAssignmentsResponse>;
      })
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load assignments."),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton height={200} radius="md" />;

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {error}
      </Alert>
    );
  }

  if (!data) return null;

  const handledSections = groupBySection(data.handledSubjects);

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={700} c="#298925" mb="md">
        My Assignments
      </Text>
      <Stack gap="md">

        {/* Advisory */}
        <SectionBlock title="Advisory">
          {data.advisorySections.length === 0 ? (
            <Text size="sm" c="dimmed">—</Text>
          ) : (
            <Stack gap={2}>
              {data.advisorySections.map((s, i) => (
                <Text key={i} size="sm">{s.gradeDisplayName} • {s.sectionName}</Text>
              ))}
            </Stack>
          )}
        </SectionBlock>

        <Divider />

        {/* Handled Subjects */}
        <SectionBlock title="Teaching Load">
          {handledSections.length === 0 ? (
            <Text size="sm" c="dimmed">—</Text>
          ) : (
            <Accordion multiple variant="separated" styles={{ ...accordionStyles, item: { ...accordionStyles.item, marginBottom: 4 } }}>
              {handledSections.map((sec) => (
                <Accordion.Item
                  key={`${sec.gradeDisplayName}||${sec.sectionName}`}
                  value={`${sec.gradeDisplayName}||${sec.sectionName}`}
                >
                  <Accordion.Control>
                    <Text fw={500} size="sm">
                      {sec.gradeDisplayName} • {sec.sectionName}{" "}
                      <Text span size="sm" c="dimmed" fw={400}>
                        ({sec.subjects.length})
                      </Text>
                    </Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={2}>
                      {sec.subjects.map((subj, i) => (
                        <Text key={i} size="sm">{subj}</Text>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </SectionBlock>

        <Divider />

        {/* Subject Leader */}
        <SectionBlock title="Grade Subject Leader">
          {data.gradeSubjectLeader.length === 0 ? (
            <Text size="sm" c="dimmed">—</Text>
          ) : (
            <Stack gap={2}>
              {data.gradeSubjectLeader.map((s, i) => (
                <Text key={i} size="sm">{s.gradeDisplayName} • {s.subjectName}</Text>
              ))}
            </Stack>
          )}
        </SectionBlock>

        <Divider />

        {/* Subject Coordinator */}
        <SectionBlock title="Subject Coordinator">
          {data.subjectCoordinator.length === 0 ? (
            <Text size="sm" c="dimmed">—</Text>
          ) : (
            <Stack gap={2}>
              {data.subjectCoordinator.map((s, i) => (
                <Text key={i} size="sm">{s.subjectGroupName}</Text>
              ))}
            </Stack>
          )}
        </SectionBlock>

      </Stack>
    </Paper>
  );
}
