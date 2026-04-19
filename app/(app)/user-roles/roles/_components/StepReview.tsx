"use client";

import { useState } from "react";
import { Badge, Box, Group, Pagination, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { CreateRoleForm } from "../../users/_lib/types";
import type { Permission } from "../../users/_lib/userRolesService";
import { PERM_DISPLAY_MAP } from "./PermissionsPanel";

const PERMS_PER_PAGE = 5;

interface StepReviewProps {
  form: UseFormReturnType<CreateRoleForm>;
  availablePermissions: Permission[];
}

export default function StepReview({
  form,
  availablePermissions,
}: StepReviewProps) {
  const [permPage, setPermPage] = useState(1);

  const selectedPermissions = form.values.permission_ids
    .map((id) =>
      availablePermissions.find((p) => p.permission_id === Number(id)),
    )
    .filter((p): p is Permission => p !== undefined);

  const totalPages = Math.max(
    1,
    Math.ceil(selectedPermissions.length / PERMS_PER_PAGE),
  );
  const safePage = Math.min(permPage, totalPages);
  const pagedPerms = selectedPermissions.slice(
    (safePage - 1) * PERMS_PER_PAGE,
    safePage * PERMS_PER_PAGE,
  );

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Review and Create
      </Text>

      {/* Role Information */}
      <Box
        p="lg"
        mb="md"
        style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}
      >
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Role Information
        </Text>
        <Group gap="xs" mb="lg">
          <Text size="sm" fw={600}>Role Name:</Text>
          <Text size="sm">{form.values.name}</Text>
        </Group>

        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Role Configuration
        </Text>
        <Group gap="xs" mb="xs">
          <Text size="sm" fw={600}>
            Faculty Role:
          </Text>
          <Badge
            color={form.values.is_faculty ? "#4EAE4A" : "gray"}
            variant="filled"
          >
            {form.values.is_faculty ? "Yes" : "No"}
          </Badge>
        </Group>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Self-Registerable:
          </Text>
          <Badge
            color={form.values.is_self_registerable ? "#4EAE4A" : "gray"}
            variant="filled"
          >
            {form.values.is_self_registerable ? "Yes" : "No"}
          </Badge>
        </Group>
      </Box>

      {/* Permissions */}
      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Permissions
        </Text>

        {selectedPermissions.length > 0 ? (
          <>
            {pagedPerms.map((perm, i) => (
              <Group key={perm.permission_id} gap="sm" mb="xs">
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
                    {(safePage - 1) * PERMS_PER_PAGE + i + 1}
                  </Text>
                </Box>
                <Text size="sm">
                  {PERM_DISPLAY_MAP[perm.name] ?? perm.name}
                </Text>
              </Group>
            ))}

            {totalPages > 1 && (
              <Group justify="center" mt="md">
                <Pagination
                  total={totalPages}
                  value={safePage}
                  onChange={setPermPage}
                  color="#4EAE4A"
                  size="sm"
                />
              </Group>
            )}
          </>
        ) : (
          <Text size="sm" c="red">
            No permissions selected
          </Text>
        )}
      </Box>
    </Box>
  );
}
