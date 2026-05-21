"use client";

import { useRef, useState } from "react";
import { Button, Divider, Group } from "@mantine/core";
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

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-3 text-2xl font-bold">
            Faculty{" "}
            {isActive && facultyCount !== null && (
              <span className="text-[#808898]">({facultyCount})</span>
            )}
          </h1>
          <p className="text-sm text-[#808898] sm:max-w-2xl">
            The collective body of educators. A faculty member can be a class adviser, a subject teacher, a coordinator, or a combination of these.
          </p>
        </div>
        {isActive && (
          <Button
            color="#4EAE4A"
            radius="md"
            className="self-start"
            onClick={() => setDrawerOpened(true)}
          >
            Add a Faculty
          </Button>
        )}
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
