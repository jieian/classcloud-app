"use client";

import { Badge, Tooltip } from "@mantine/core";
import type { TeachingSubject } from "../_lib/facultyService";

interface SubjectBadgeProps {
  code: string;
  subject_type: TeachingSubject["subject_type"];
  subjectName: string;
  palette?: "default" | "coordinator";
  pending?: boolean;
  sections?: string[];
}

export default function SubjectBadge({
  code,
  subject_type,
  subjectName,
  palette = "default",
  pending = false,
  sections,
}: SubjectBadgeProps) {
  const isCoordinatorPalette = palette === "coordinator";
  const backgroundColor = pending
    ? "#FFE6B8"
    : isCoordinatorPalette
    ? subject_type === "SSES"
      ? "#70A2FF"
      : "#B3B4B4"
    : undefined;
  const textColor = pending ? "#B26B00" : isCoordinatorPalette ? "#FFFFFF" : undefined;
  const borderColor = pending ? "#F2B861" : undefined;

  const hasMultipleSections = sections && sections.length > 1;
  const hasSections = sections && sections.length > 0;
  const badgeLabel = hasMultipleSections ? `(${sections.length}) ${code}` : code;

  const tooltipLabel = hasSections ? (
    <div>
      <div>{pending ? `${subjectName} (Unsaved)` : subjectName}</div>
      <div style={{ marginTop: 4 }}>
        {sections.map((s) => (
          <div key={s} style={{ paddingLeft: 6, fontSize: "0.88em", opacity: 0.85 }}>
            – {s}
          </div>
        ))}
      </div>
    </div>
  ) : pending ? `${subjectName} (Unsaved)` : subjectName;

  return (
    <Tooltip label={tooltipLabel} withArrow position="top" maw={220}>
      <Badge
        color={pending ? undefined : subject_type === "SSES" ? "blue" : "gray"}
        variant={pending || isCoordinatorPalette ? "filled" : "light"}
        radius="xl"
        style={{
          cursor: "default",
          backgroundColor,
          color: textColor,
          border: borderColor ? `1px solid ${borderColor}` : undefined,
          minWidth: 48,
          justifyContent: "center",
        }}
      >
        {badgeLabel}
      </Badge>
    </Tooltip>
  );
}
