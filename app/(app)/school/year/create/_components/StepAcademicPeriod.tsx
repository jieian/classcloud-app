"use client";

import {
  ActionIcon,
  Box,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import type { CreateSchoolYearForm, QuarterCount } from "../_lib/types";

interface StepAcademicPeriodProps {
  form: UseFormReturnType<CreateSchoolYearForm>;
  checkingYear: boolean;
}

export default function StepAcademicPeriod({
  form,
  checkingYear,
}: StepAcademicPeriodProps) {
  const startYear = parseInt(form.values.start_year, 10);
  const endYear = isNaN(startYear) ? "—" : String(startYear + 1);

  return (
    <Box>
      <Text size="xl" fw={700} mb="md" c="#298925">
        Specify Academic Period
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #B8B8B8",
          borderRadius: "8px",
        }}
      >
        <Text size="lg" fw={700} mb="xs" c="#298925">
          Academic Period
        </Text>
        <Text size="sm" mb="lg" c="dimmed">
          Set the school year start, end year, and number of grading periods.
        </Text>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          Academic Period{" "}
          <Text span c="red">
            *
          </Text>
        </Text>
        <Group align="flex-end" gap="xs" mt="xs" mb="xl" wrap="wrap">
          {/* Start Year */}
          <TextInput
            label="Start Year"
            placeholder="e.g. 2026"
            value={form.values.start_year}
            onChange={(e) =>
              form.setFieldValue("start_year", e.currentTarget.value)
            }
            disabled={form.values.startYearLocked || checkingYear}
            rightSection={
              <Tooltip
                label={
                  form.values.startYearLocked
                    ? "Auto-set from previous school year — click to unlock"
                    : "Editing manually — click to lock"
                }
              >
                <ActionIcon
                  variant="transparent"
                  color="gray"
                  size="sm"
                  onClick={() =>
                    form.setFieldValue(
                      "startYearLocked",
                      !form.values.startYearLocked,
                    )
                  }
                >
                  {form.values.startYearLocked ? (
                    <IconLock size={16} />
                  ) : (
                    <IconLockOpen size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
            }
            style={{ width: 150 }}
            maxLength={4}
          />

          <Text pb={6} c="dimmed" size="sm">
            —
          </Text>

          {/* End Year (always locked) */}
          <TextInput
            label="End Year"
            value={endYear}
            disabled
            style={{ width: 150 }}
            rightSection={
              <Tooltip label="Always a year after the start year">
                <ActionIcon variant="transparent" color="gray" size="sm">
                  <IconLock size={16} />
                </ActionIcon>
              </Tooltip>
            }
          />
        </Group>

        <Text size="sm" fw={700} c="gray.7" mb="sm">
          No. of Quarters/Terms{" "}
          <Text span c="red">
            *
          </Text>
        </Text>

        {/* Number of Quarters or Terms*/}
        <SegmentedControl
          value={String(form.values.num_quarters)}
          onChange={(val) => {
            const n = parseInt(val, 10) as QuarterCount;
            form.setFieldValue("num_quarters", n);
          }}
          data={[
            { value: "2", label: "2 Terms" },
            { value: "3", label: "3 Terms" },
            { value: "4", label: "4 Quarters" },
          ]}
          w={{ base: "100%", sm: "40%" }}
          color="#4EAE4A"
        />

        <Text size="sm" c="dimmed" mt="xs">
          {form.values.num_quarters === 4
            ? "4 Quarters → First Quarter, Second Quarter, Third Quarter, Fourth Quarter"
            : form.values.num_quarters === 3
              ? "3 Terms → First Term, Second Term, Third Term"
              : "2 Terms → First Term, Second Term"}
        </Text>
      </Box>
    </Box>
  );
}
