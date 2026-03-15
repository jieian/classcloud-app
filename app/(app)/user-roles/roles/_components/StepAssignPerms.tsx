"use client";

import { Box, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { CreateRoleForm } from "../../users/_lib/types";
import type { Permission } from "../../users/_lib/userRolesService";
import { PermissionsPanel } from "./PermissionsPanel";

interface StepAssignPermsProps {
  form: UseFormReturnType<CreateRoleForm>;
  availablePermissions: Permission[];
  loadingPermissions: boolean;
}

export default function StepAssignPerms({
  form,
  availablePermissions,
  loadingPermissions,
}: StepAssignPermsProps) {
  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Assign Permissions
      </Text>
      <PermissionsPanel
        selectedIds={form.values.permission_ids}
        onChange={(ids) => form.setFieldValue("permission_ids", ids)}
        availablePermissions={availablePermissions}
        loading={loadingPermissions}
      />
    </Box>
  );
}
