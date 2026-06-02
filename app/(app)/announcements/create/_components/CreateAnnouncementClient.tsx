"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Select,
  Skeleton,
  Switch,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import { DatePickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import dayjs from "dayjs";
import {
  IconCalendarTime,
  IconCalendarPlus,
  IconCalendar,
  IconChevronDown,
  IconClock,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/context/AuthContext";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  fetchAllRoles,
  type Role,
} from "@/app/(app)/user-roles/users/_lib/userRolesService";
import { sortRoles } from "@/lib/roleUtils";
import {
  createAnnouncement,
  updateAnnouncement,
  getAttachmentUrl,
  type ScheduledAnnouncementItem,
} from "@/lib/services/announcementsService";
import { getSupabase } from "@/lib/supabase/client";
import MediaUploadList, { type MediaFile } from "./MediaUploadList";
import AnnouncementPreviewPanel from "./AnnouncementPreviewPanel";
import styles from "../create.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipients {
  everyone: boolean;
  roleIds: number[];
}

interface FormValues {
  recipients: Recipients;
  media: MediaFile[];
  subject: string;
  message: string;
  scheduleEnabled: boolean;
  scheduledDate: string | null;
  scheduledTime: string | null;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateSubject(v: string): string | null {
  const t = v.trim();
  if (!t) return "Subject is required";
  if (t.length < 3) return "Must be at least 3 characters";
  if (t.length > 50) return "Must be at most 50 characters";
  if (!/[a-zA-Z0-9]/.test(t)) return "Must contain meaningful text";
  return null;
}

function validateMessage(v: string): string | null {
  const t = v.trim();
  if (!t) return "Message is required";
  if (t.length < 5) return "Must be at least 5 characters";
  if (t.length > 2000) return "Must be at most 2,000 characters";
  if (!/[a-zA-Z0-9]/.test(t)) return "Must contain meaningful text";
  return null;
}

function isSameDayAsToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

// ─── Time slot generation ─────────────────────────────────────────────────────

const ALL_TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      slots.push({
        value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        label: `${hour12}:${String(m).padStart(2, "0")} ${ampm}`,
      });
    }
  }
  return slots;
})();

function getFilteredTimeSlots(
  dateStr: string | null,
): { value: string; label: string }[] {
  if (!isSameDayAsToday(dateStr)) return ALL_TIME_SLOTS;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return ALL_TIME_SLOTS.filter(({ value }) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m > nowMinutes;
  });
}

function createMediaId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  return `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CreateAnnouncementClientProps {
  mode?: "create" | "edit" | "edit-published";
  initialData?: ScheduledAnnouncementItem;
}

export default function CreateAnnouncementClient({
  mode = "create",
  initialData,
}: CreateAnnouncementClientProps = {}) {
  const isEdit = mode === "edit" || mode === "edit-published";
  const isEditPublished = mode === "edit-published";
  const router = useRouter();
  const { firstName, lastName, roles: userRoles } = useAuth();
  const authorName = [firstName, lastName].filter(Boolean).join(" ");

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: {
            width: "100%",
            maxWidth: "100%",
            borderRadius: "12px 12px 0 0",
          },
        },
      }
    : {};

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const recipientRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllRoles()
      .then((data) => setRoles(data))
      .catch(() => {
        notify({
          type: "error",
          title: "Failed to load roles",
          message: "Please refresh the page.",
        });
      })
      .finally(() => setRolesLoading(false));
  }, []);

  const isPrincipal = userRoles.some((r) => r.name === "Principal");
  const sortedRoles = useMemo(
    () =>
      sortRoles(
        isPrincipal ? roles.filter((r) => r.name !== "Principal") : roles,
      ),
    [roles, isPrincipal],
  );

  // Close recipient dropdown on outside click
  useEffect(() => {
    if (!recipientOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        recipientRef.current &&
        !recipientRef.current.contains(e.target as Node)
      ) {
        setRecipientOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [recipientOpen]);

  // Build initial values for edit mode from initialData
  const editRecipients: Recipients = initialData
    ? initialData.targets.some((t) => t.role_id === null)
      ? { everyone: true, roleIds: [] }
      : { everyone: false, roleIds: initialData.targets.map((t) => t.role_id as number) }
    : { everyone: false, roleIds: [] };

  const editMedia: MediaFile[] = (initialData?.attachments ?? []).map((a) => ({
    id: `existing-${a.attachment_id}`,
    previewUrl: getAttachmentUrl(a.storage_path),
    existingPath: a.storage_path,
    existingName: a.file_name,
    existingSizeBytes: a.file_size_bytes,
  }));

  const editScheduledDate = initialData
    ? (() => {
        const d = new Date(initialData.published_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })()
    : null;
  const editScheduledTime = initialData
    ? `${String(new Date(initialData.published_at).getHours()).padStart(2, "0")}:${String(new Date(initialData.published_at).getMinutes()).padStart(2, "0")}`
    : null;

  const form = useForm<FormValues>({
    initialValues: {
      recipients: isEdit ? editRecipients : { everyone: false, roleIds: [] },
      media: isEdit ? editMedia : [],
      subject: isEdit ? (initialData?.title ?? "") : "",
      message: isEdit ? (initialData?.body ?? "") : "",
      scheduleEnabled: isEdit,
      scheduledDate: isEdit ? editScheduledDate : null,
      scheduledTime: isEdit ? editScheduledTime : null,
    },
    validate: {
      recipients: (v) =>
        !v.everyone && v.roleIds.length === 0
          ? "Select at least one recipient"
          : null,
      subject: validateSubject,
      message: validateMessage,
      scheduledDate: (v, values) =>
        values.scheduleEnabled && !v ? "Select a date" : null,
      scheduledTime: (v, values) =>
        values.scheduleEnabled && !v ? "Select a time" : null,
    },
  });

  // ── Dirty guard ──────────────────────────────────────────────────────────────
  // In edit mode the form starts pre-filled, so compare against initial values.

  const isDirty = isEdit
    ? form.isDirty()
    : form.values.recipients.everyone ||
      form.values.recipients.roleIds.length > 0 ||
      form.values.media.length > 0 ||
      form.values.subject.trim() !== "" ||
      form.values.message.trim() !== "" ||
      form.values.scheduleEnabled;

  // Warn on browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Intercept all internal Link clicks when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href")!;
      if (/^(https?:|#|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to leave?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => router.push(href),
        ...confirmModalProps,
      });
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  // ── Recipient handlers ───────────────────────────────────────────────────────

  function handleSelectEveryone() {
    form.setFieldValue("recipients", { everyone: true, roleIds: [] });
  }

  function handleToggleRole(roleId: number) {
    const current = form.values.recipients;
    if (current.everyone) {
      form.setFieldValue("recipients", { everyone: false, roleIds: [roleId] });
      return;
    }
    const exists = current.roleIds.includes(roleId);
    form.setFieldValue("recipients", {
      everyone: false,
      roleIds: exists
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId],
    });
  }

  function removeRecipient(value: "everyone" | number) {
    if (value === "everyone") {
      form.setFieldValue("recipients", { everyone: false, roleIds: [] });
    } else {
      form.setFieldValue("recipients", {
        everyone: false,
        roleIds: form.values.recipients.roleIds.filter((id) => id !== value),
      });
    }
  }

  // ── Media handlers ───────────────────────────────────────────────────────────

  function handleMediaAdd(accepted: File[]) {
    const current = form.values.media;
    const remaining = 3 - current.length;
    const toAdd = accepted.slice(0, remaining);
    const newFiles: MediaFile[] = toAdd.map((file) => ({
      id: createMediaId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    form.setFieldValue("media", [...current, ...newFiles]);
  }

  function handleMediaRemove(id: string) {
    const target = form.values.media.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    form.setFieldValue(
      "media",
      form.values.media.filter((f) => f.id !== id),
    );
  }

  function handleMediaReorder(newOrder: MediaFile[]) {
    form.setFieldValue("media", newOrder);
  }

  // ── Schedule handlers ────────────────────────────────────────────────────────

  function handleScheduleToggle(enabled: boolean) {
    form.setValues((v) => ({
      ...v,
      scheduleEnabled: enabled,
      scheduledDate: enabled ? v.scheduledDate : null,
      scheduledTime: enabled ? v.scheduledTime : null,
    }));
  }

  function handleDateChange(dateStr: string | null) {
    form.setFieldValue("scheduledDate", dateStr);
    if (dateStr) {
      const slots = getFilteredTimeSlots(dateStr);
      const currentTime = form.values.scheduledTime;
      if (currentTime && !slots.some((s) => s.value === currentTime)) {
        form.setFieldValue("scheduledTime", null);
      }
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const cancelDest = isEditPublished ? "/" : isEdit ? "/announcements/scheduled" : "/";

  function handleCancel() {
    if (isDirty) {
      modals.openConfirmModal({
        title: "Discard changes?",
        children: (
          <Text size="sm">
            You have unsaved changes. Are you sure you want to leave?
          </Text>
        ),
        labels: { confirm: "Discard", cancel: "Stay" },
        confirmProps: { color: "red" },
        onConfirm: () => router.push(cancelDest),
        ...confirmModalProps,
      });
    } else {
      router.push(cancelDest);
    }
  }

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const result = form.validate();
    if (result.hasErrors) return;

    if (!initialData) return;

    modals.openConfirmModal({
      title: "Save changes?",
      children: (
        <Text size="sm">
          This will update the scheduled announcement. Are you sure you want to save?
        </Text>
      ),
      labels: { confirm: "Save", cancel: "Cancel" },
      confirmProps: { color: "green" },
      onConfirm: () => void doSave(),
      ...confirmModalProps,
    });
  }

  async function doSave() {
    if (!initialData) return;
    setSaving(true);

    try {
      const { recipients: rec, media, subject, message, scheduledDate, scheduledTime } = form.values;

      // Upload new files (those with a File object) to Supabase Storage
      const supabase = getSupabase();
      const resolvedAttachments: {
        storage_path: string;
        file_name: string;
        mime_type: string;
        file_size_bytes: number;
        display_order: number;
      }[] = [];

      for (let i = 0; i < media.length; i++) {
        const mf = media[i];
        if (mf.existingPath) {
          resolvedAttachments.push({
            storage_path: mf.existingPath,
            file_name: mf.existingName ?? mf.existingPath.split("/").pop() ?? "image",
            mime_type: mf.existingName?.endsWith(".png") ? "image/png" : "image/jpeg",
            file_size_bytes: mf.existingSizeBytes ?? 0,
            display_order: i + 1,
          });
        } else if (mf.file) {
          const ext = mf.file.type === "image/png" ? "png" : "jpg";
          const path = `announcements/${initialData.announcement_id}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("announcement-images")
            .upload(path, mf.file, { upsert: false });
          if (uploadError) throw new Error("Failed to upload image");
          resolvedAttachments.push({
            storage_path: path,
            file_name: mf.file.name,
            mime_type: mf.file.type,
            file_size_bytes: mf.file.size,
            display_order: i + 1,
          });
        }
      }

      const publishedAt = scheduledDate && scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
        : initialData.published_at;

      await updateAnnouncement(initialData.announcement_id, {
        title: subject.trim(),
        body: message.trim(),
        published_at: publishedAt,
        everyone: rec.everyone,
        roleIds: rec.roleIds,
        attachments: resolvedAttachments,
      });

      notify({ type: "success", title: "Saved", message: "Announcement updated." });
      router.push(isEditPublished ? "/" : "/announcements/scheduled");
    } catch {
      notify({ type: "error", title: "Error", message: "Failed to save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  function handlePublish() {
    const result = form.validate();
    if (result.hasErrors) return;

    const { scheduledDate, scheduledTime } = form.values;
    const isScheduling = scheduleEnabled;

    const confirmTitle = isScheduling ? "Schedule announcement?" : "Publish announcement?";
    const confirmBody = isScheduling
      ? `This announcement will auto-post on ${scheduledDate} at ${scheduledTime}.`
      : "This announcement will be visible to recipients immediately.";

    modals.openConfirmModal({
      title: confirmTitle,
      children: <Text size="sm">{confirmBody}</Text>,
      labels: { confirm: isScheduling ? "Schedule" : "Publish", cancel: "Cancel" },
      confirmProps: { color: "green" },
      onConfirm: () => void doPublish(),
      ...confirmModalProps,
    });
  }

  const [publishing, setPublishing] = useState(false);

  async function doPublish() {
    setPublishing(true);
    try {
      const { recipients: rec, media, subject, message, scheduledDate, scheduledTime, scheduleEnabled: isScheduling } = form.values;

      const supabase = getSupabase();
      const resolvedAttachments: {
        storage_path: string;
        file_name: string;
        mime_type: string;
        file_size_bytes: number;
        display_order: number;
      }[] = [];

      for (let i = 0; i < media.length; i++) {
        const mf = media[i];
        if (mf.file) {
          const ext = mf.file.type === "image/png" ? "png" : "jpg";
          const path = `announcements/new/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("announcement-images")
            .upload(path, mf.file, { upsert: false });
          if (uploadError) throw new Error("Failed to upload image");
          resolvedAttachments.push({
            storage_path: path,
            file_name: mf.file.name,
            mime_type: mf.file.type,
            file_size_bytes: mf.file.size,
            display_order: i + 1,
          });
        }
      }

      const status = isScheduling ? "SCHEDULED" : "PUBLISHED";
      const published_at = isScheduling && scheduledDate && scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
        : new Date().toISOString();

      await createAnnouncement({
        title: subject.trim(),
        body: message.trim(),
        status,
        published_at,
        everyone: rec.everyone,
        roleIds: rec.roleIds,
        attachments: resolvedAttachments,
      });

      notify({
        type: "success",
        title: isScheduling ? "Scheduled" : "Published",
        message: isScheduling ? "Announcement scheduled." : "Announcement published.",
      });
      router.push(isScheduling ? "/announcements/scheduled" : "/");
    } catch {
      notify({ type: "error", title: "Error", message: "Failed to submit. Please try again." });
    } finally {
      setPublishing(false);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const {
    recipients,
    media,
    subject,
    message,
    scheduleEnabled,
    scheduledDate,
  } = form.values;
  const timeSlots = getFilteredTimeSlots(scheduledDate);
  const previewImages = media.map((f) => f.previewUrl);

  const selectedBadges: {
    label: string;
    key: string | number;
    onRemove: () => void;
  }[] = [];
  if (recipients.everyone) {
    selectedBadges.push({
      label: "Everyone",
      key: "everyone",
      onRemove: () => removeRecipient("everyone"),
    });
  } else {
    for (const id of recipients.roleIds) {
      const role = roles.find((r) => r.role_id === id);
      if (role)
        selectedBadges.push({
          label: role.name,
          key: id,
          onRemove: () => removeRecipient(id),
        });
    }
  }

  return (
    <div>
      <BackButton href={cancelDest} size="sm">
        {isEditPublished ? "Back to Home" : isEdit ? "Back to Scheduled" : "Back to Home"}
      </BackButton>

      <div className={styles.pageGrid} style={{ marginTop: 24 }}>
        {/* ── Left column: form ─────────────────────────────── */}
        <div className={styles.formCol}>
          {/* Section: Recipient(s) */}
          <div className={styles.sectionCard}>
            <p className={styles.sectionTitle}>
              Recipient(s):{" "}
              <Text component="span" c="red" size="sm">
                *
              </Text>
            </p>

            <div
              style={{ position: "relative", marginTop: 10 }}
              ref={recipientRef}
            >
              {/* Field */}
              <div
                className={[
                  styles.recipientField,
                  recipientOpen ? styles.recipientFieldOpen : "",
                  form.errors.recipients ? styles.recipientFieldError : "",
                ].join(" ")}
                onClick={() => setRecipientOpen((o) => !o)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    setRecipientOpen((o) => !o);
                }}
                aria-haspopup="listbox"
                aria-expanded={recipientOpen}
              >
                {selectedBadges.length === 0 ? (
                  <span className={styles.recipientPlaceholder}>
                    Select Roles
                  </span>
                ) : (
                  selectedBadges.map((b) => (
                    <Badge
                      key={b.key}
                      variant="light"
                      color="gray"
                      size="sm"
                      rightSection={
                        <IconX
                          size={10}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            b.onRemove();
                          }}
                        />
                      }
                    >
                      {b.label}
                    </Badge>
                  ))
                )}
                <span
                  className={[
                    styles.recipientChevron,
                    recipientOpen ? styles.recipientChevronOpen : "",
                  ].join(" ")}
                >
                  <IconChevronDown size={14} />
                </span>
              </div>

              {/* Dropdown */}
              {recipientOpen && (
                <div className={styles.recipientDropdown} role="listbox">
                  {rolesLoading ? (
                    <div style={{ padding: "10px 14px" }}>
                      <Skeleton height={18} mb={8} />
                      <Skeleton height={18} mb={8} />
                      <Skeleton height={18} />
                    </div>
                  ) : (
                    <>
                      {/* Everyone option */}
                      <div
                        className={[
                          styles.recipientOption,
                          recipients.everyone
                            ? styles.recipientOptionSelected
                            : "",
                        ].join(" ")}
                        onClick={() => handleSelectEveryone()}
                        role="option"
                        aria-selected={recipients.everyone}
                      >
                        <Checkbox
                          checked={recipients.everyone}
                          onChange={() => {}}
                          color="green"
                          tabIndex={-1}
                          styles={{ root: { pointerEvents: "none" } }}
                        />
                        <span>Everyone</span>
                      </div>
                      <div className={styles.recipientDivider} />

                      {/* Role options */}
                      {sortedRoles.map((role) => {
                        const isSelected = recipients.roleIds.includes(
                          role.role_id,
                        );
                        return (
                          <div
                            key={role.role_id}
                            className={[
                              styles.recipientOption,
                              isSelected ? styles.recipientOptionSelected : "",
                            ].join(" ")}
                            onClick={() => handleToggleRole(role.role_id)}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <Checkbox
                              checked={isSelected}
                              onChange={() => {}}
                              color="green"
                              tabIndex={-1}
                              styles={{ root: { pointerEvents: "none" } }}
                            />
                            <span>{role.name}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {form.errors.recipients && (
                <p className={styles.recipientErrorText}>
                  {form.errors.recipients}
                </p>
              )}
            </div>
          </div>

          {/* Section: Media */}
          <div className={styles.sectionCard}>
            <p className={styles.sectionTitle}>Media</p>
            <p className={styles.sectionSubtitle}>
              <em>Optional.</em> Attach up to 3 photos to include in the
              announcement.
            </p>
            <MediaUploadList
              files={media}
              onAdd={handleMediaAdd}
              onRemove={handleMediaRemove}
              onReorder={handleMediaReorder}
            />
          </div>

          {/* Section: Announcement Details */}
          <div className={styles.sectionCard}>
            <p className={styles.sectionTitle}>Announcement Details</p>
            <p className={styles.sectionSubtitle}>
              Write your announcement message here.
            </p>

            <TextInput
              label="Subject"
              required
              placeholder="e.g. Deadline for Submission of Reports"
              maxLength={50}
              mb="sm"
              rightSection={
                <Text
                  size="xs"
                  c={subject.length >= 45 ? "red" : "dimmed"}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {subject.length}/50
                </Text>
              }
              rightSectionWidth={52}
              {...form.getInputProps("subject")}
            />

            <Textarea
              label="Message"
              required
              placeholder="Write your announcement message here…"
              minRows={5}
              autosize
              maxLength={2000}
              {...form.getInputProps("message")}
            />
            <div
              className={[
                styles.charCounter,
                message.length >= 1900 ? styles.charCounterWarn : "",
              ].join(" ")}
            >
              {message.length}/2,000
            </div>
          </div>

          {/* Section: Schedule — hidden when editing a published announcement */}
          {!isEditPublished && <div className={styles.sectionCard}>
            <div className={styles.scheduleHeader}>
              <div className={styles.scheduleHeaderLeft}>
                <IconCalendarTime size={18} stroke={1.8} />
                <p className={styles.sectionTitle} style={{ margin: 0 }}>
                  Schedule
                </p>
              </div>
              {!isEdit && (
                <div className={styles.scheduleHeaderRight}>
                  <span>Set date and time</span>
                  <Switch
                    checked={scheduleEnabled}
                    onChange={(e) =>
                      handleScheduleToggle(e.currentTarget.checked)
                    }
                    color="#4eae4a"
                    size="md"
                  />
                </div>
              )}
            </div>

            <Collapse in={isEdit || scheduleEnabled}>
              <div className={styles.scheduleBody}>
                <p className={styles.scheduleDescription}>
                  Set a future date and time to automatically publish this
                  announcement.
                </p>
                <div className={styles.scheduleFields}>
                  <DatePickerInput
                    placeholder="Select date"
                    leftSection={<IconCalendar size={16} />}
                    minDate={new Date()}
                    maxDate={dayjs().add(4, "month").toDate()}
                    valueFormat="MMMM D, YYYY"
                    value={scheduledDate ?? null}
                    onChange={(v) => handleDateChange(v as string | null)}
                    error={form.errors.scheduledDate}
                    clearable
                  />
                  <Select
                    placeholder="Select time"
                    leftSection={<IconClock size={16} />}
                    data={timeSlots}
                    searchable
                    nothingFoundMessage="No matching time"
                    value={form.values.scheduledTime}
                    onChange={(v) => form.setFieldValue("scheduledTime", v)}
                    error={form.errors.scheduledTime}
                    clearable
                  />
                </div>
              </div>
            </Collapse>
          </div>}

          {/* Footer — desktop only (sits beside the preview column) */}
          <div className={styles.desktopFooterOnly}>
            <Group justify="flex-end" mt="xl" wrap="nowrap">
              <UnstyledButton
                onClick={handleCancel}
                style={{ color: "#000", cursor: "pointer" }}
              >
                <Text size="sm" fw={600}>
                  Cancel
                </Text>
              </UnstyledButton>
              <Button
                onClick={isEdit ? handleSave : handlePublish}
                loading={isEdit ? saving : publishing}
                radius="md"
                leftSection={isEdit ? undefined : scheduleEnabled ? <IconCalendarPlus size={15} stroke={1.8} /> : <IconSend size={15} stroke={1.8} />}
                style={{ backgroundColor: "#4EAE4A" }}
              >
                {isEdit ? "Save" : scheduleEnabled ? "Schedule Announcement" : "Publish Now"}
              </Button>
            </Group>
          </div>
        </div>

        {/* ── Right column: preview ────────────────────────── */}
        <div className={styles.previewCol}>
          <AnnouncementPreviewPanel
            subject={subject}
            message={message}
            images={previewImages}
            authorName={authorName}
            firstName={firstName}
            scheduledDate={scheduleEnabled ? scheduledDate : null}
          />
        </div>
      </div>

      {/* Footer — mobile only (appears after preview in stacked layout) */}
      <div className={styles.mobileFooterSpacer} />
      <div className={styles.mobileFooterOnly}>
        <Group justify="flex-end" wrap="nowrap">
          <UnstyledButton
            onClick={handleCancel}
            style={{ color: "#000", cursor: "pointer" }}
          >
            <Text size="sm" fw={600}>
              Cancel
            </Text>
          </UnstyledButton>
          <Button
            onClick={isEdit ? handleSave : handlePublish}
            loading={isEdit ? saving : false}
            radius="md"
            leftSection={isEdit ? undefined : <IconSend size={15} stroke={1.8} />}
            style={{ backgroundColor: "#4EAE4A" }}
          >
            {isEdit ? "Save" : scheduleEnabled ? "Schedule Announcement" : "Publish Now"}
          </Button>
        </Group>
      </div>
    </div>
  );
}
