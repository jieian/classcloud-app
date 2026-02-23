"use client";

import { Box, Switch, Text, TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { toTitleCase } from "../../users/_lib/utils";
import { CreateRoleForm } from "../../users/_lib/types";

interface StepRoleInfoProps {
  form: UseFormReturnType<CreateRoleForm>;
}

export default function StepRoleInfo({ form }: StepRoleInfoProps) {
  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Specify Role Information
      </Text>

      {/* Card wrapper */}
      <Box
        p="lg"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
        }}
      >
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Role Information
        </Text>

        {/* Demographic Profile */}
        <Text size="sm" fw={600} mb="md">
          Name of Role
        </Text>

        <TextInput
          label="Role Name"
          placeholder="Role Name"
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
          mb="md"
        />
        <Switch
          label="Faculty Role"
          description="Assign role as teaching staff."
          checked={form.values.is_faculty}
          onChange={(e) =>
            form.setFieldValue("is_faculty", e.currentTarget.checked)
          }
        />
      </Box>
    </Box>
  );
}
