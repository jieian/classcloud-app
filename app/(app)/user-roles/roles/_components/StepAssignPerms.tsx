"use client";

import {
  Box,
  TextInput,
  Checkbox,
  Skeleton,
  Text,
  Divider,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useMemo, useState } from "react";
import { CreateRoleForm } from "../../users/_lib/types";
import type { Permission } from "../../users/_lib/userRolesService";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Client-side search filtering
  const filteredPermissions = useMemo(
    () =>
      availablePermissions.filter((permission) =>
        permission.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [availablePermissions, searchQuery],
  );

  const displayedPermissions = showAll
    ? filteredPermissions
    : filteredPermissions.slice(0, 5);

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Assign Permissions
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
          Assign Permissions
        </Text>

        <TextInput
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          mb="md"
        />

        {loadingPermissions ? (
          <>
            <Skeleton height={24} radius="xl" mb="sm" />
            <Divider />
            <Skeleton height={24} radius="xl" mb="sm" />
            <Divider />
            <Skeleton height={24} radius="xl" mb="sm" />
            <Divider />
            <Skeleton height={24} radius="xl" mb="sm" />
            <Divider />
            <Skeleton height={24} radius="xl" mb="sm" />
          </>
        ) : (
          <>
            {displayedPermissions.length > 0 ? (
              <Checkbox.Group {...form.getInputProps("permission_ids")}>
                {displayedPermissions.map((permission, index) => (
                  <Box key={permission.permission_id}>
                    <Checkbox
                      value={permission.permission_id.toString()}
                      label={permission.name}
                      py="sm"
                    />
                    {index < displayedPermissions.length - 1 && <Divider />}
                  </Box>
                ))}
              </Checkbox.Group>
            ) : (
              <Text size="sm" c="dimmed" mt="md">
                No permissions found
                {searchQuery && ` matching "${searchQuery}"`}
              </Text>
            )}

            {filteredPermissions.length > 5 && (
              <>
                <Divider />
                <Text
                  size="sm"
                  ta="center"
                  py="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "Show Less" : "Show All Permissions"}
                </Text>
                <Divider />
              </>
            )}
          </>
        )}

      </Box>
    </Box>
  );
}
