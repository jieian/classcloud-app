"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconSend,
  IconUserCheck,
  IconUserOff,
} from "@tabler/icons-react";
import {
  addStudentToRoster,
  checkStudentLrn,
  createTransferRequest,
  updateStudent,
  type AddStudentAction,
  type LrnCheckCurrentSection,
  type LrnCheckStudent,
} from "@/lib/services/classService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  opened: boolean;
  sectionId: number;
  /** True when the user has students.full_access — bypasses request flow */
  hasFullAccess: boolean;
  onClose: () => void;
  onAdded: () => void;
}

interface FormValues {
  last_name: string;
  first_name: string;
  middle_name: string;
  sex: "M" | "F";
}

type Phase =
  | { tag: "input" }
  | { tag: "checking" }
  | { tag: "new" }
  | { tag: "found_active"; student: LrnCheckStudent }
  | { tag: "found_deleted"; student: LrnCheckStudent }
  | { tag: "already_enrolled"; student: LrnCheckStudent }
  | {
      tag: "enrolled_elsewhere";
      student: LrnCheckStudent;
      currentSection: LrnCheckCurrentSection;
    }
  | {
      tag: "edit";
      student: LrnCheckStudent;
      restore: boolean;
      currentSection?: LrnCheckCurrentSection;
    }
  | { tag: "request_sent"; studentName: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const NAME_RE = /^[a-zA-ZÀ-ÖØ-öø-ÿ''-]+(?:[\s][a-zA-ZÀ-ÖØ-öø-ÿ''-]+)*$/;

function nameValidator(label: string, required: boolean) {
  return (value: string) => {
    const t = value.trim();
    if (!t) return required ? `${label} is required.` : null;
    if (t.length < 2) return `${label} must be at least 2 characters.`;
    if (t.length > 100) return `${label} must be 100 characters or less.`;
    if (!NAME_RE.test(t))
      return `${label} must contain letters, apostrophes, or hyphens only (no numbers or other symbols).`;
    return null;
  };
}

function sexLabel(sex: "M" | "F") {
  return sex === "M" ? "Male" : "Female";
}

// Returns true when the enrolled_elsewhere student may be moved directly
// (no request needed for this particular combination of access + flags).
function canMoveDirect(
  hasFullAccess: boolean,
  cs: LrnCheckCurrentSection,
): boolean {
  return hasFullAccess || !cs.has_adviser || cs.self_adviser;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddStudentModal({
  opened,
  sectionId,
  hasFullAccess,
  onClose,
  onAdded,
}: Props) {
  const [lrn, setLrn] = useState("");
  const [lrnError, setLrnError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ tag: "input" });
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    validateInputOnChange: true,
    initialValues: { last_name: "", first_name: "", middle_name: "", sex: "M" },
    validate: {
      last_name: nameValidator("Last name", true),
      first_name: nameValidator("First name", true),
      middle_name: nameValidator("Middle name", false),
      sex: (v) => (!v ? "Sex is required." : null),
    },
  });

  // Full reset when modal opens or closes
  useEffect(() => {
    if (!opened) {
      setLrn("");
      setLrnError(null);
      setPhase({ tag: "input" });
      setSaving(false);
      form.reset();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // ── LRN change ──────────────────────────────────────────────────────────────
  function handleLrnChange(raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 12);
    setLrn(cleaned);
    setLrnError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (phase.tag !== "input") {
      setPhase({ tag: "input" });
      form.reset();
    }

    if (/^\d{12}$/.test(cleaned)) {
      setPhase({ tag: "checking" });
      debounceRef.current = setTimeout(() => {
        void performCheck(cleaned);
      }, 300);
    }
  }

  async function performCheck(lrnVal: string) {
    setLrnError(null);
    try {
      const result = await checkStudentLrn(sectionId, lrnVal);
      switch (result.status) {
        case "not_found":
          setPhase({ tag: "new" });
          break;
        case "active":
          setPhase({ tag: "found_active", student: result.student! });
          break;
        case "deleted":
          setPhase({ tag: "found_deleted", student: result.student! });
          break;
        case "already_enrolled":
          setPhase({ tag: "already_enrolled", student: result.student! });
          break;
        case "enrolled_elsewhere":
          setPhase({
            tag: "enrolled_elsewhere",
            student: result.student!,
            currentSection: result.current_section!,
          });
          break;
      }
    } catch (e) {
      setPhase({ tag: "input" });
      setLrnError(
        e instanceof Error
          ? e.message
          : "Failed to check LRN. Please try again.",
      );
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────
  function resetToInput() {
    setLrn("");
    setLrnError(null);
    setPhase({ tag: "input" });
    form.reset();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  function goToEditMode(
    student: LrnCheckStudent,
    restore: boolean,
    currentSection?: LrnCheckCurrentSection,
  ) {
    form.setValues({
      last_name: student.last_name,
      first_name: student.first_name,
      middle_name: student.middle_name ?? "",
      sex: student.sex,
    });
    form.resetDirty();
    setPhase({ tag: "edit", student, restore, currentSection });
  }

  function goBackFromEdit() {
    if (phase.tag !== "edit") return;
    const { student, restore, currentSection } = phase;
    if (currentSection) {
      setPhase({ tag: "enrolled_elsewhere", student, currentSection });
    } else {
      setPhase(
        restore
          ? { tag: "found_deleted", student }
          : { tag: "found_active", student },
      );
    }
    form.reset();
  }

  // ── Modal close with dirty guard ────────────────────────────────────────────
  function handleClose() {
    const isDirty =
      (phase.tag === "new" || phase.tag === "edit") && form.isDirty();

    if (isDirty) {
      modals.openConfirmModal({
        title: "Discard unsaved changes?",
        centered: true,
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to close?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Keep editing" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          form.reset();
          onClose();
        },
      });
    } else {
      onClose();
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function handleEnrollActive(student: LrnCheckStudent) {
    modals.openConfirmModal({
      title: "Add to roster?",
      centered: true,
      children: (
        <Text size="sm">
          Add <strong>{student.full_name.toUpperCase()}</strong> to this class?
        </Text>
      ),
      labels: { confirm: "Add", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitAction("enroll", student.lrn),
    });
  }

  function handleRestoreEnroll(student: LrnCheckStudent) {
    modals.openConfirmModal({
      title: "Restore & add to roster?",
      centered: true,
      children: (
        <Text size="sm">
          This will restore the deleted record for{" "}
          <strong>{student.full_name.toUpperCase()}</strong> and add them to
          this class.
        </Text>
      ),
      labels: { confirm: "Restore & Add", cancel: "Cancel" },
      confirmProps: { color: "orange" },
      onConfirm: () => void submitAction("restore_enroll", student.lrn),
    });
  }

  // Direct move (full_access, or auto-approve cases for partial_access)
  function handleMove(
    student: LrnCheckStudent,
    currentSection: LrnCheckCurrentSection,
  ) {
    const autoApproveReason = !hasFullAccess
      ? !currentSection.has_adviser
        ? "The student's current class has no assigned adviser, so the transfer is approved automatically."
        : currentSection.self_adviser
          ? "You are the adviser of the student's current class, so the transfer is approved automatically."
          : null
      : null;

    modals.openConfirmModal({
      title: "Move student to this class?",
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Move <strong>{student.full_name.toUpperCase()}</strong> from{" "}
            <strong>
              {currentSection.grade_level_display} – {currentSection.name}
            </strong>{" "}
            to this class?
          </Text>
          {autoApproveReason && (
            <Text size="xs" c="dimmed">
              {autoApproveReason}
            </Text>
          )}
        </Stack>
      ),
      labels: { confirm: "Move", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitAction("move", student.lrn),
    });
  }

  // Partial_access: send a transfer request for administrator approval
  function handleRequestTransfer(
    student: LrnCheckStudent,
    currentSection: LrnCheckCurrentSection,
  ) {
    modals.openConfirmModal({
      title: "Send transfer request?",
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Submit a transfer request to move{" "}
            <strong>{student.full_name.toUpperCase()}</strong> from{" "}
            <strong>
              {currentSection.grade_level_display} – {currentSection.name}
            </strong>{" "}
            to your class?
          </Text>
          <Text size="xs" c="dimmed">
            The adviser of the student&apos;s current class will be notified.
            An administrator will review and approve the transfer.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Send Request", cancel: "Cancel" },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitTransferRequest(student, currentSection),
    });
  }

  async function submitTransferRequest(
    student: LrnCheckStudent,
    currentSection: LrnCheckCurrentSection,
  ) {
    setSaving(true);
    try {
      await createTransferRequest({
        lrn: student.lrn,
        from_section_id: currentSection.section_id,
        to_section_id: sectionId,
      });
      setPhase({ tag: "request_sent", studentName: student.full_name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("ALREADY_PENDING")) {
        notifications.show({
          title: "Request already exists",
          message:
            "A pending transfer request for this student already exists. Please wait for it to be resolved.",
          color: "orange",
        });
      } else {
        notifications.show({
          title: "Error",
          message: "Failed to send transfer request. Please try again.",
          color: "red",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  // Form submit — handles new / edit-active / edit-deleted / edit-with-move paths
  function handleSaveAndAdd() {
    const { hasErrors } = form.validate();
    if (hasErrors) return;

    const isMove = phase.tag === "edit" && !!phase.currentSection;

    // Partial access + edit + move → transfer request path (not direct update_move)
    if (isMove && !hasFullAccess && phase.tag === "edit" && phase.currentSection) {
      const cs = phase.currentSection;
      if (!canMoveDirect(hasFullAccess, cs)) {
        const studentDisplay = `${toTitleCase(form.values.last_name)}, ${toTitleCase(form.values.first_name)}`.toUpperCase();
        modals.openConfirmModal({
          title: "Save & send transfer request?",
          centered: true,
          children: (
            <Stack gap="xs">
              <Text size="sm">
                Update <strong>{studentDisplay}</strong>'s info and send a
                transfer request to move them to this class?
              </Text>
              <Text size="xs" c="dimmed">
                The adviser of the student&apos;s current class will be
                notified. An administrator will review and approve the transfer.
              </Text>
            </Stack>
          ),
          labels: { confirm: "Save & Send Request", cancel: "Cancel" },
          confirmProps: { color: "#4EAE4A" },
          onConfirm: () => void submitEditAndRequest(phase),
        });
        return;
      }
    }

    const action: AddStudentAction =
      phase.tag === "new"
        ? "new"
        : phase.tag === "edit" && phase.currentSection
          ? "update_move"
          : phase.tag === "edit" && phase.restore
            ? "restore_update_enroll"
            : "update_enroll";

    const studentName =
      phase.tag === "edit"
        ? phase.student.full_name.toUpperCase()
        : `${toTitleCase(form.values.last_name)}, ${toTitleCase(form.values.first_name)}`.toUpperCase();

    const isDirectMove = action === "update_move";
    const autoApproveReason =
      isDirectMove && !hasFullAccess && phase.tag === "edit" && phase.currentSection
        ? !phase.currentSection.has_adviser
          ? "The student's current class has no assigned adviser, so the transfer is approved automatically."
          : phase.currentSection.self_adviser
            ? "You are the adviser of the student's current class, so the transfer is approved automatically."
            : null
        : null;

    modals.openConfirmModal({
      title: isDirectMove ? "Move student?" : "Add student?",
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {phase.tag === "new" ? (
              <>
                Add <strong>{studentName}</strong> to this class as a new
                student?
              </>
            ) : isDirectMove ? (
              <>
                Update <strong>{studentName}</strong>'s info and move them to
                this class?
              </>
            ) : (
              <>
                Update <strong>{studentName}</strong>'s info and add them to
                this class?
              </>
            )}
          </Text>
          {autoApproveReason && (
            <Text size="xs" c="dimmed">
              {autoApproveReason}
            </Text>
          )}
        </Stack>
      ),
      labels: {
        confirm: isDirectMove ? "Save & Move" : "Add",
        cancel: "Cancel",
      },
      confirmProps: { color: "#4EAE4A" },
      onConfirm: () => void submitForm(action),
    });
  }

  // Partial access: update student info then create a transfer request
  async function submitEditAndRequest(
    editPhase: Extract<Phase, { tag: "edit" }>,
  ) {
    setSaving(true);
    try {
      // Update student info only if the form has been changed
      if (form.isDirty()) {
        await updateStudent(editPhase.student.lrn, {
          lrn: editPhase.student.lrn,
          last_name: toTitleCase(form.values.last_name),
          first_name: toTitleCase(form.values.first_name),
          middle_name: form.values.middle_name.trim()
            ? toTitleCase(form.values.middle_name)
            : "",
          sex: form.values.sex,
        });
      }

      await createTransferRequest({
        lrn: editPhase.student.lrn,
        from_section_id: editPhase.currentSection!.section_id,
        to_section_id: sectionId,
      });

      const displayName = form.isDirty()
        ? `${toTitleCase(form.values.last_name)}, ${toTitleCase(form.values.first_name)}`.toUpperCase()
        : editPhase.student.full_name.toUpperCase();

      setPhase({ tag: "request_sent", studentName: displayName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("ALREADY_PENDING")) {
        notifications.show({
          title: "Request already exists",
          message:
            "A pending transfer request for this student already exists. Please wait for it to be resolved.",
          color: "orange",
        });
      } else {
        notifications.show({
          title: "Error",
          message: e instanceof Error ? e.message : "An error occurred.",
          color: "red",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(action: AddStudentAction, studentLrn: string) {
    const isMove = action === "move";
    setSaving(true);
    try {
      await addStudentToRoster(sectionId, { action, lrn: studentLrn });
      notifications.show({
        title: isMove ? "Student Moved" : "Student Added",
        message: isMove
          ? "Student has been moved to this class."
          : "Student has been added to the roster.",
        color: "green",
      });
      onAdded();
      onClose();
    } catch (e) {
      notifications.show({
        title: "Error",
        message:
          e instanceof Error
            ? e.message
            : isMove
              ? "Failed to move student."
              : "Failed to add student.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitForm(action: AddStudentAction) {
    const isMove = action === "update_move";
    setSaving(true);
    try {
      await addStudentToRoster(sectionId, {
        action,
        lrn: lrn.trim(),
        last_name: toTitleCase(form.values.last_name),
        first_name: toTitleCase(form.values.first_name),
        middle_name: form.values.middle_name.trim()
          ? toTitleCase(form.values.middle_name)
          : "",
        sex: form.values.sex,
      });
      notifications.show({
        title: isMove ? "Student Moved" : "Student Added",
        message: isMove
          ? "Student has been moved to this class."
          : "Student has been added to the roster.",
        color: "green",
      });
      onAdded();
      onClose();
    } catch (e) {
      notifications.show({
        title: "Error",
        message:
          e instanceof Error
            ? e.message
            : isMove
              ? "Failed to move student."
              : "Failed to add student.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isChecking = phase.tag === "checking";
  const lrnLocked =
    phase.tag !== "input" &&
    phase.tag !== "checking" &&
    phase.tag !== "request_sent";
  const showNameForm = phase.tag === "new" || phase.tag === "edit";
  const showLrnCheckmark =
    phase.tag === "new" ||
    phase.tag === "found_active" ||
    phase.tag === "found_deleted" ||
    phase.tag === "already_enrolled" ||
    phase.tag === "enrolled_elsewhere" ||
    phase.tag === "edit";

  // Determines labels for the edit form header/button when in move context
  const editIsRequestFlow =
    !hasFullAccess &&
    phase.tag === "edit" &&
    !!phase.currentSection &&
    !canMoveDirect(hasFullAccess, phase.currentSection);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Student"
      centered
      size="md"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Stack gap="md">
        {/* LRN field */}
        {phase.tag !== "request_sent" && (
          <Group align="flex-end" gap="xs">
            <TextInput
              label="LRN"
              placeholder="12-digit Learner Reference Number"
              description="Auto-checks the database when 12 digits are entered."
              required
              maxLength={12}
              value={lrn}
              onChange={(e) => handleLrnChange(e.currentTarget.value)}
              error={lrnError}
              disabled={lrnLocked || saving}
              style={{ flex: 1 }}
              rightSection={
                isChecking ? (
                  <Loader size="xs" />
                ) : showLrnCheckmark ? (
                  <IconCheck size={16} color="var(--mantine-color-green-6)" />
                ) : null
              }
            />
            {lrnLocked && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={resetToInput}
                disabled={saving}
                mb={lrnError ? 20 : 0}
              >
                Change
              </Button>
            )}
          </Group>
        )}

        {/* ── Found: active student ── */}
        {phase.tag === "found_active" && (
          <Stack gap="sm">
            <Alert
              color="blue"
              icon={<IconUserCheck size={16} />}
              title="Student found"
            >
              <Text size="sm" fw={600}>
                {phase.student.full_name.toUpperCase()}
              </Text>
              <Text size="xs" c="dimmed">
                {sexLabel(phase.student.sex)}
              </Text>
            </Alert>

            <Text size="sm" c="dimmed">
              What would you like to do?
            </Text>

            <Button
              variant="filled"
              color="#4EAE4A"
              fullWidth
              disabled={saving}
              onClick={() => handleEnrollActive(phase.student)}
            >
              Add to this roster
            </Button>
            <Button
              variant="outline"
              color="#4EAE4A"
              fullWidth
              disabled={saving}
              onClick={() => goToEditMode(phase.student, false)}
            >
              Edit student info & add to roster
            </Button>
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              disabled={saving}
              onClick={resetToInput}
            >
              This isn't the right student — enter a different LRN
            </Button>
          </Stack>
        )}

        {/* ── Found: deleted student ── */}
        {phase.tag === "found_deleted" && (
          <Stack gap="sm">
            <Alert
              color="orange"
              icon={<IconUserOff size={16} />}
              title="Deleted student record found"
            >
              <Text size="sm" fw={600}>
                {phase.student.full_name.toUpperCase()}
              </Text>
              <Text size="xs" c="dimmed">
                {sexLabel(phase.student.sex)} · Previously deleted
              </Text>
            </Alert>

            <Text size="sm" c="dimmed">
              This student's record exists but was deleted. What would you like
              to do?
            </Text>

            <Button
              variant="filled"
              color="orange"
              fullWidth
              disabled={saving}
              onClick={() => handleRestoreEnroll(phase.student)}
            >
              Restore & add to this roster
            </Button>
            <Button
              variant="outline"
              color="orange"
              fullWidth
              disabled={saving}
              onClick={() => goToEditMode(phase.student, true)}
            >
              Restore, update info & add to roster
            </Button>
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              disabled={saving}
              onClick={resetToInput}
            >
              This isn't the right student — enter a different LRN
            </Button>
          </Stack>
        )}

        {/* ── Already enrolled ── */}
        {phase.tag === "already_enrolled" && (
          <Stack gap="sm">
            <Alert
              color="red"
              icon={<IconAlertCircle size={16} />}
              title="Already enrolled"
            >
              <Text size="sm" fw={600}>
                {phase.student.full_name.toUpperCase()}
              </Text>
              <Text size="xs">
                This student is already enrolled in this class.
              </Text>
            </Alert>
            <Button
              variant="subtle"
              color="gray"
              fullWidth
              onClick={resetToInput}
            >
              Enter a different LRN
            </Button>
          </Stack>
        )}

        {/* ── Enrolled elsewhere ── */}
        {phase.tag === "enrolled_elsewhere" && (
          <Stack gap="sm">
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={16} />}
              title="Student is in another class"
            >
              <Text size="sm" fw={600}>
                {phase.student.full_name.toUpperCase()}
              </Text>
              <Text size="xs" c="dimmed">
                {sexLabel(phase.student.sex)} · Currently enrolled in{" "}
                <strong>
                  {phase.currentSection.grade_level_display} –{" "}
                  {phase.currentSection.name}
                </strong>
              </Text>
            </Alert>

            {/* ── Pending request block ── */}
            {!hasFullAccess && phase.currentSection.has_pending_request ? (
              <>
                <Alert
                  color="orange"
                  icon={<IconAlertCircle size={16} />}
                  title="Transfer already pending"
                >
                  <Text size="sm">
                    A transfer request for this student is already awaiting
                    approval. You cannot submit another until it is resolved.
                  </Text>
                </Alert>
                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  disabled={saving}
                  onClick={resetToInput}
                >
                  This isn't the right student — enter a different LRN
                </Button>
              </>
            ) : canMoveDirect(hasFullAccess, phase.currentSection) ? (
              /* ── Direct move path (full_access OR no source adviser OR self_adviser) ── */
              <>
                {!hasFullAccess && (
                  <Text size="sm" c="dimmed">
                    {!phase.currentSection.has_adviser
                      ? "The student's current class has no assigned adviser — the transfer will be approved automatically."
                      : "You are the adviser of the student's current class — the transfer will be approved automatically."}
                  </Text>
                )}
                {hasFullAccess && (
                  <Text size="sm" c="dimmed">
                    Move this student to your class immediately.
                  </Text>
                )}
                <Button
                  variant="filled"
                  color="#4EAE4A"
                  fullWidth
                  disabled={saving}
                  onClick={() =>
                    handleMove(phase.student, phase.currentSection)
                  }
                >
                  Move to this class
                </Button>
                <Button
                  variant="outline"
                  color="#4EAE4A"
                  fullWidth
                  disabled={saving}
                  onClick={() =>
                    goToEditMode(phase.student, false, phase.currentSection)
                  }
                >
                  Edit info & move to this class
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  disabled={saving}
                  onClick={resetToInput}
                >
                  This isn't the right student — enter a different LRN
                </Button>
              </>
            ) : (
              /* ── Transfer request path (partial_access + has adviser + not self) ── */
              <>
                <Text size="sm" c="dimmed">
                  This student is enrolled in another class. You need to send a
                  transfer request for administrator approval.
                </Text>
                <Button
                  variant="filled"
                  color="#4EAE4A"
                  fullWidth
                  disabled={saving}
                  loading={saving}
                  onClick={() =>
                    handleRequestTransfer(phase.student, phase.currentSection)
                  }
                >
                  Send transfer request
                </Button>
                <Button
                  variant="outline"
                  color="#4EAE4A"
                  fullWidth
                  disabled={saving}
                  onClick={() =>
                    goToEditMode(phase.student, false, phase.currentSection)
                  }
                >
                  Edit info & send transfer request
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  disabled={saving}
                  onClick={resetToInput}
                >
                  This isn't the right student — enter a different LRN
                </Button>
              </>
            )}
          </Stack>
        )}

        {/* ── Request sent confirmation ── */}
        {phase.tag === "request_sent" && (
          <Stack gap="md" align="center" py="sm">
            <IconSend
              size={48}
              color="var(--mantine-color-green-6)"
              stroke={1.5}
            />
            <Stack gap={4} align="center">
              <Text fw={700} ta="center" size="lg">
                Transfer request sent
              </Text>
              <Text size="sm" c="dimmed" ta="center" maw={320}>
                The adviser of{" "}
                <strong>{phase.studentName.toUpperCase()}</strong>&apos;s
                current class has been notified. An administrator will review
                and approve the transfer.
              </Text>
            </Stack>
            <Stack gap="xs" w="100%">
              <Button
                variant="light"
                color="#4EAE4A"
                fullWidth
                onClick={resetToInput}
              >
                Add another student
              </Button>
              <Button variant="subtle" color="gray" fullWidth onClick={onClose}>
                Close
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ── Name / Sex form (new student or edit mode) ── */}
        {showNameForm && (
          <>
            {phase.tag === "edit" && (
              <Divider
                label={
                  phase.currentSection
                    ? editIsRequestFlow
                      ? "Update info & send transfer request"
                      : "Update info & move to this class"
                    : phase.restore
                      ? "Restore & update student info"
                      : "Update student info"
                }
                labelPosition="center"
              />
            )}

            <TextInput
              label="Last Name"
              placeholder="e.g. Dela Cruz"
              required
              maxLength={100}
              description={`${form.values.last_name.trim().length}/100 — letters and apostrophes only, title case on save`}
              {...form.getInputProps("last_name")}
              disabled={saving}
            />
            <TextInput
              label="First Name"
              placeholder="e.g. Juan"
              required
              maxLength={100}
              description={`${form.values.first_name.trim().length}/100 — letters and apostrophes only, title case on save`}
              {...form.getInputProps("first_name")}
              disabled={saving}
            />
            <TextInput
              label="Middle Name"
              placeholder="Optional"
              maxLength={100}
              description={`${form.values.middle_name.trim().length}/100 — optional, letters and apostrophes only`}
              {...form.getInputProps("middle_name")}
              disabled={saving}
            />
            <Select
              label="Sex"
              required
              data={[
                { value: "M", label: "Male" },
                { value: "F", label: "Female" },
              ]}
              {...form.getInputProps("sex")}
              allowDeselect={false}
              disabled={saving}
            />
          </>
        )}

        {/* ── Action buttons ── */}
        {phase.tag !== "request_sent" && (
          <Group justify="flex-end" mt="xs">
            {phase.tag === "edit" && (
              <Button
                variant="subtle"
                color="gray"
                onClick={goBackFromEdit}
                disabled={saving}
                style={{ marginRight: "auto" }}
              >
                ← Back
              </Button>
            )}

            <Button variant="default" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>

            {showNameForm && (
              <Button
                color="#4EAE4A"
                onClick={handleSaveAndAdd}
                loading={saving}
                disabled={!form.isValid()}
              >
                {phase.tag === "new"
                  ? "Add Student"
                  : editIsRequestFlow
                    ? "Save & Send Request"
                    : phase.tag === "edit" && phase.currentSection
                      ? "Save & Move"
                      : "Save & Add"}
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
