"use client";

import { useEffect, useRef } from "react";
import { ActionIcon, Button } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMediaQuery } from "@mantine/hooks";
import { IconGripVertical, IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { notify } from "@/components/notificationIcon/notificationIcon";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../create.module.css";

const MAX_FILES = 3;
const MAX_BYTES = 5_242_880;
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface MediaFile {
  id: string;
  /** Undefined for existing attachments loaded from DB */
  file?: File;
  previewUrl: string;
  /** Set for attachments that already exist in storage (no upload needed) */
  existingPath?: string;
  existingName?: string;
  existingSizeBytes?: number;
}

interface Props {
  files: MediaFile[];
  onAdd: (accepted: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (newOrder: MediaFile[]) => void;
}

interface SortableRowProps {
  item: MediaFile;
  onRemoveRequest: (id: string) => void;
}

function SortableMediaRow({ item, onRemoveRequest }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "#f8f9fa" : "transparent",
  };

  return (
    <div ref={setNodeRef} style={rowStyle} className={styles.mediaRow}>
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          color: "#ced4da",
          display: "flex",
          alignItems: "center",
          touchAction: "none",
          flexShrink: 0,
        }}
        aria-label="Drag to reorder"
      >
        <IconGripVertical size={16} />
      </span>

      {/* Thumbnail */}
      <img
        src={item.previewUrl}
        alt={item.file?.name ?? item.existingName ?? "Image"}
        style={{
          width: 44,
          height: 44,
          objectFit: "cover",
          borderRadius: 6,
          flexShrink: 0,
          border: "1px solid #e9ecef",
        }}
      />

      {/* File info: name + size */}
      <div className={styles.mediaFileInfo}>
        <p className={styles.mediaFileName}>{item.file?.name ?? item.existingName ?? "Image"}</p>
        <p className={styles.mediaFileSize}>
          {item.file
            ? formatFileSize(item.file.size)
            : item.existingSizeBytes
              ? formatFileSize(item.existingSizeBytes)
              : ""}
        </p>
      </div>

      {/* Remove */}
      <ActionIcon
        variant="subtle"
        color="red"
        aria-label={`Remove ${item.file?.name ?? item.existingName ?? "image"}`}
        onClick={() => onRemoveRequest(item.id)}
        style={{ flexShrink: 0 }}
      >
        <IconTrash size={16} stroke={1.5} />
      </ActionIcon>
    </div>
  );
}

export default function MediaUploadList({ files, onAdd, onRemove, onReorder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor));

  const isMobile = useMediaQuery("(max-width: 768px)");
  const confirmModalProps = isMobile
    ? {
        styles: {
          inner: { alignItems: "flex-end", paddingBottom: "20px" },
          content: { width: "100%", maxWidth: "100%", borderRadius: "12px 12px 0 0" },
        },
      }
    : {};

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = files.findIndex((f) => f.id === active.id);
    const newIndex = files.findIndex((f) => f.id === over.id);
    onReorder(arrayMove(files, oldIndex, newIndex));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";

    const valid: File[] = [];
    for (const file of picked) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        notify({ type: "error", title: "Unsupported file type", message: `"${file.name}" is not a PNG or JPEG image.` });
        continue;
      }
      if (file.size > MAX_BYTES) {
        notify({ type: "error", title: "File too large", message: `"${file.name}" exceeds the 5 MB limit.` });
        continue;
      }
      const isDuplicate = files.some(
        (existing) =>
          (existing.file?.name === file.name && existing.file?.size === file.size) ||
          (existing.existingName === file.name && existing.existingSizeBytes === file.size),
      );
      if (isDuplicate) {
        notify({ type: "error", title: "Already added", message: "This image has already been added." });
        continue;
      }
      valid.push(file);
    }

    if (valid.length > 0) onAdd(valid);
  }

  function handleRemoveRequest(id: string) {
    const file = files.find((f) => f.id === id);
    modals.openConfirmModal({
      title: "Remove photo?",
      children: (
        <span style={{ fontSize: 14 }}>
          {file ? `Remove "${file.file?.name ?? file.existingName ?? "image"}" from the announcement?` : "Remove this photo from the announcement?"}
        </span>
      ),
      labels: { confirm: "Remove", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => onRemove(id),
      ...confirmModalProps,
    });
  }

  return (
    <div>
      <input
        id="announcement-media-input"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {files.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            {files.map((item) => (
              <SortableMediaRow key={item.id} item={item} onRemoveRequest={handleRemoveRequest} />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {files.length < MAX_FILES && (
        <Button
          component="label"
          htmlFor="announcement-media-input"
          variant="default"
          radius="md"
          leftSection={<IconPhotoPlus size={16} stroke={1.8} />}
          style={{ marginTop: files.length > 0 ? 10 : 0, cursor: "pointer" }}
        >
          Add Photos
        </Button>
      )}
    </div>
  );
}
