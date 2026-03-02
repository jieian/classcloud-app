"use client";

import { useState } from "react";
import { Button, Group, Modal, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload } from "@tabler/icons-react";

interface Props {
  opened: boolean;
  sectionId: number;
  sectionLabel: string;
  sectionName: string;
  gradeLevel: string;
  onClose: () => void;
}

export default function DownloadRosterModal({
  opened,
  sectionId,
  sectionLabel,
  sectionName,
  gradeLevel,
  onClose,
}: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        `/api/classes/${sectionId}/students/download`,
      );

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ error: "Failed to download." }));
        throw new Error(
          (err as { error?: string }).error ?? "Failed to download.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${gradeLevel} - ${sectionName} Roster.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      onClose();
    } catch (e) {
      notifications.show({
        title: "Download Failed",
        message:
          e instanceof Error ? e.message : "Failed to download the roster.",
        color: "red",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Download Roster"
      centered
      closeOnClickOutside={!downloading}
      closeOnEscape={!downloading}
      withCloseButton={!downloading}
      overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}
    >
      <Text size="sm" mb="xl">
        Download the complete student roster for <strong>{sectionLabel}</strong>{" "}
        as an Excel file?
      </Text>

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose} disabled={downloading}>
          Cancel
        </Button>
        <Button
          color="#4EAE4A"
          leftSection={<IconDownload size={16} />}
          loading={downloading}
          onClick={() => void handleDownload()}
        >
          Download
        </Button>
      </Group>
    </Modal>
  );
}
