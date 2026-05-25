"use client";

import { useRef, useState } from "react";
import { Button, Divider, Group } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import NoActivePeriodBanner from "@/components/NoActivePeriodBanner";
import AddFacultyDrawer from "./AddFacultyDrawer";
import SubjectCoordinatorsSection from "./SubjectCoordinatorsSection";
import {
  TeachingStaffSection,
  type TeachingStaffSectionRef,
} from "./TeachingStaffSection";

interface FacultySectionProps {
  isActive: boolean;
  highlightCoordinators?: boolean;
}

export function FacultySection({ isActive, highlightCoordinators = false }: FacultySectionProps) {
  const isMobile = useMediaQuery("(max-width: 767.9px)");
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);
  const teachingStaffRef = useRef<TeachingStaffSectionRef>(null);

  return (
    <>
      {isActive && (
        <AddFacultyDrawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          onSuccess={() => {
            setDrawerOpened(false);
            teachingStaffRef.current?.refresh();
          }}
        />
      )}

      <div className="mb-3">
        <Group justify="space-between" wrap="nowrap" align="flex-end" mb="sm">
          <h1 className="mb-0 text-2xl md:text-3xl font-bold leading-tight">
            Faculty{" "}
            {isActive && facultyCount !== null && (
              <span className="text-[#808898] text-xl font-semibold">
                ({facultyCount})
              </span>
            )}
          </h1>
          {isActive && (
            <Button
              color="#4EAE4A"
              radius="md"
              size={isMobile ? "sm" : "sm"}
              px={isMobile ? "md" : undefined}
              style={isMobile ? { flexShrink: 0 } : undefined}
              onClick={() => setDrawerOpened(true)}
            >
              Add a Faculty
            </Button>
          )}
        </Group>
        <p className="text-sm text-[#808898] sm:max-w-2xl">
          The collective body of educators. A faculty member can be a class adviser, a subject teacher, a coordinator, or a combination of these.
        </p>
      </div>

      {!isActive ? (
        <NoActivePeriodBanner />
      ) : (
        <>
          <Divider my="lg" />
          <SubjectCoordinatorsSection
            defaultOpen={highlightCoordinators}
            glowOnMount={highlightCoordinators}
          />

          <Divider my="lg" />
          <TeachingStaffSection
            ref={teachingStaffRef}
            onCountChange={setFacultyCount}
          />
        </>
      )}
    </>
  );
}
