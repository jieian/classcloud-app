"use client";

import { Box, Text, Grid, Group } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { CreateRoleForm } from "../../users/_lib/types";
import type { Permission } from "../../users/_lib/userRolesService";

interface StepReviewProps {
  form: UseFormReturnType<CreateRoleForm>;
  availablePermissions: Permission[];
}

export default function StepReview({
  form,
  availablePermissions,
}: StepReviewProps) {
  const selectedPermissions = form.values.permission_ids
    .map((permId) =>
      availablePermissions.find((p) => p.permission_id === Number(permId)),
    )
    .filter((perm): perm is Permission => perm !== undefined);

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Review and Create
      </Text>

      {/* User Information Summary */}
      <Box
        p="lg"
        mb="md"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
        }}
      >
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Role Information
        </Text>
        <Text>Name: {form.values.name}</Text>
      </Box>

      {/* Permissions Summary */}
      <Box
        p="lg"
        mb="md"
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
        }}
      >
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Permissions
        </Text>
        {selectedPermissions.length > 0 ? (
          selectedPermissions.map((permission, index) => (
            <Group key={permission.permission_id} gap="sm" mb="xs">
              <Box
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  backgroundColor: "#e9ecef",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text size="xs" fw={600} c="dimmed">
                  {index + 1}
                </Text>
              </Box>
              <Text size="sm">{permission.name}</Text>
            </Group>
          ))
        ) : (
          <Text size="sm" c="red">
            No permissions selected
          </Text>
        )}
      </Box>
    </Box>
  );
}
