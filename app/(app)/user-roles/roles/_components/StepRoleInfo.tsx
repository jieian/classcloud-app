"use client";

import {
  ActionIcon,
  Box,
  Group,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type { UseFormReturnType } from "@mantine/form";
import { toTitleCase } from "../../users/_lib/utils";
import { CreateRoleForm } from "../../users/_lib/types";

interface StepRoleInfoProps {
  form: UseFormReturnType<CreateRoleForm>;
}

function SwitchLabel({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <span>{label}</span>
      <Tooltip
        label={tooltip}
        multiline
        maw={260}
        withArrow
        events={{ hover: true, touch: true, focus: true }}
      >
        <ActionIcon
          variant="transparent"
          size="xs"
          color="#808898"
          tabIndex={0}
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export default function StepRoleInfo({ form }: StepRoleInfoProps) {
  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Specify Role Information and Configuration
      </Text>

      <Box
        p="lg"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
        }}
      >
        <Text size="md" fw={700} mb="xs" c="#4EAE4A">
          Role Information
        </Text>

        <TextInput
          label="Role Name"
          placeholder="e.g. Class Adviser"
          required
          maxLength={50}
          withErrorStyles
          {...form.getInputProps("name")}
          description={`${form.values.name.length}/50 characters`}
          onBlur={(e) => {
            if (e.target.value.trim()) {
              form.setFieldValue("name", toTitleCase(e.target.value));
            }
            form.validateField("name");
          }}
          mb="xl"
        />

        <Text size="md" fw={700} mb="xs" c="#4EAE4A">
          Role Configuration
        </Text>
        <Text size="sm" c="#808898" mb="md">
          Configure how this role behaves in the system and who can see it
          during sign-up.
        </Text>

        <Box style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Switch
            label={
              <SwitchLabel
                label="Faculty Role"
                tooltip="When enabled, users with this role can be assigned an advisory class, a teaching load, or a coordinator position."
              />
            }
            description="This user can be assigned teaching responsibilities and advisory duties."
            checked={form.values.is_faculty}
            onChange={(e) =>
              form.setFieldValue("is_faculty", e.currentTarget.checked)
            }
          />

          <Switch
            label={
              <SwitchLabel
                label="Self-Registerable"
                tooltip="When enabled, this role will appear as an option during sign-up. For security, only expose roles that are safe for public self-registration."
              />
            }
            description="This role will be visible and selectable by users on the sign-up page."
            checked={form.values.is_self_registerable}
            onChange={(e) =>
              form.setFieldValue(
                "is_self_registerable",
                e.currentTarget.checked,
              )
            }
          />
        </Box>
      </Box>
    </Box>
  );
}
