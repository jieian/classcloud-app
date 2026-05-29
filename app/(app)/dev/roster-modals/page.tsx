"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import AddStudentModal from "@/app/(app)/school/classes/[sectionId]/students/_components/AddStudentModal";
import EditStudentModal from "@/app/(app)/school/classes/[sectionId]/students/_components/EditStudentModal";
import DownloadRosterModal from "@/app/(app)/school/classes/[sectionId]/students/_components/DownloadRosterModal";
import ImportRosterModal from "@/app/(app)/school/classes/[sectionId]/students/_components/ImportRosterModal";
import type { StudentRosterEntry } from "@/lib/services/classService";

const MOCK_SECTION_ID = 1;

const MOCK_STUDENT: StudentRosterEntry = {
  enrollment_id: 1,
  lrn: "123456789012",
  full_name: "DELA CRUZ, JUAN PEDRO",
  sex: "M",
};

export default function RosterModalPreviewPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [addFullAccess, setAddFullAccess] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFullAccess, setImportFullAccess] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  return (
    <Stack gap="xl" maw={1100}>
      <Box>
        <Badge color="orange" variant="light" mb="xs">
          DEV ONLY — remove before release
        </Badge>
        <Title order={2} c="#597D37">
          Roster Modals Preview
        </Title>
        <Text c="dimmed" size="sm">
          Open each modal to review its UI. This page is for design review only
          and does not write any data.
        </Text>
      </Box>

      <Grid gutter="md">
        {/* ── 1. Add Student ─────────────────────────────────────────────────── */}
        <Grid.Col span={12}>
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb={4}>
              1. Add Student
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Phase-based modal. Enter a 12-digit LRN to trigger state
              transitions — the LRN is auto-checked against the database.
            </Text>

            <Stack gap={4} mb="md">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                States to explore:
              </Text>
              <Text size="xs">
                <strong>input</strong> — default, blank LRN field
              </Text>
              <Text size="xs">
                <strong>checking</strong> — spinner shown while 12 digits are
                typed
              </Text>
              <Text size="xs">
                <strong>new</strong> — LRN not in the system → name form
                appears
              </Text>
              <Text size="xs">
                <strong>found_active</strong> — existing student found, not yet
                enrolled here
              </Text>
              <Text size="xs">
                <strong>found_deleted</strong> — student record was soft-deleted
              </Text>
              <Text size="xs">
                <strong>already_enrolled</strong> — student is already in this
                class
              </Text>
              <Text size="xs">
                <strong>enrolled_elsewhere</strong> — student is in a different
                class (varies by access level + adviser flags)
              </Text>
              <Text size="xs">
                <strong>edit</strong> — reached from found_active /
                found_deleted / enrolled_elsewhere via "Edit info" buttons
              </Text>
              <Text size="xs">
                <strong>request_sent</strong> — shown after a transfer request
                is successfully submitted
              </Text>
            </Stack>

            <Group gap="sm">
              <Button
                color="#4EAE4A"
                onClick={() => {
                  setAddFullAccess(true);
                  setAddOpen(true);
                }}
              >
                Open — Full Access
              </Button>
              <Button
                variant="outline"
                color="#4EAE4A"
                onClick={() => {
                  setAddFullAccess(false);
                  setAddOpen(true);
                }}
              >
                Open — Limited Access (adviser)
              </Button>
            </Group>

            <AddStudentModal
              opened={addOpen}
              sectionId={MOCK_SECTION_ID}
              hasFullAccess={addFullAccess}
              onClose={() => setAddOpen(false)}
              onAdded={() => setAddOpen(false)}
            />
          </Paper>
        </Grid.Col>

        {/* ── 2. Edit Student ────────────────────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb={4}>
              2. Edit Student
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Form pre-filled with student data fetched from the DB. LRN is
              editable. Dirty-state guard on close.
            </Text>
            <Button color="#4EAE4A" onClick={() => setEditOpen(true)}>
              Open
            </Button>
            <EditStudentModal
              opened={editOpen}
              student={MOCK_STUDENT}
              onClose={() => setEditOpen(false)}
              onSaved={() => setEditOpen(false)}
            />
          </Paper>
        </Grid.Col>

        {/* ── 3. Download Roster ─────────────────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb={4}>
              3. Download Roster
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Simple confirmation. Triggers the Excel download API on confirm.
            </Text>
            <Button color="#4EAE4A" onClick={() => setDownloadOpen(true)}>
              Open
            </Button>
            <DownloadRosterModal
              opened={downloadOpen}
              sectionId={MOCK_SECTION_ID}
              sectionLabel="Grade 7 • Section A"
              gradeLevel="Grade 7"
              sectionName="Section A"
              onClose={() => setDownloadOpen(false)}
            />
          </Paper>
        </Grid.Col>

        {/* ── 4. Import Roster ───────────────────────────────────────────────── */}
        <Grid.Col span={12}>
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb={4}>
              4. Import Roster
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Multi-step: upload an Excel/CSV file → review each row's status
              (will_add, will_enroll, will_move, transfer_required, errors,
              etc.) → confirm import.
            </Text>
            <Group gap="sm">
              <Button
                color="#4EAE4A"
                onClick={() => {
                  setImportFullAccess(true);
                  setImportOpen(true);
                }}
              >
                Open — Full Access
              </Button>
              <Button
                variant="outline"
                color="#4EAE4A"
                onClick={() => {
                  setImportFullAccess(false);
                  setImportOpen(true);
                }}
              >
                Open — Limited Access (adviser)
              </Button>
            </Group>
            <ImportRosterModal
              opened={importOpen}
              sectionId={MOCK_SECTION_ID}
              hasFullAccess={importFullAccess}
              onClose={() => setImportOpen(false)}
              onImported={() => setImportOpen(false)}
            />
          </Paper>
        </Grid.Col>

        {/* ── 5. Delete Student ──────────────────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb={4}>
              5. Delete Student
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              Confirmation modal with type-to-confirm guard. Type{" "}
              <Text span ff="monospace" fw={600}>
                delete
              </Text>{" "}
              to enable the button.
            </Text>
            <Button
              color="red"
              variant="outline"
              onClick={() => setDeleteOpen(true)}
            >
              Open
            </Button>
            <Modal
              opened={deleteOpen}
              onClose={() => {
                setDeleteOpen(false);
                setDeleteText("");
              }}
              title="Delete Student"
              centered
              overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
            >
              <Text size="sm" mb="md">
                Are you sure you want to delete{" "}
                <strong>{MOCK_STUDENT.full_name}</strong> from the roster? This
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
                value={deleteText}
                onChange={(e) => setDeleteText(e.currentTarget.value)}
                mb="lg"
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  disabled={deleteText.toLowerCase() !== "delete"}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteText("");
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Modal>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
