"use client";

import {
  Box,
  Text,
  TextInput,
  Checkbox,
  Skeleton,
  Divider,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useMemo, useState } from "react";
import type { CreateUserForm } from "../_lib/types";
import type { Role } from "../_lib/userRolesService";

interface StepAssignRoleProps {
  form: UseFormReturnType<CreateUserForm>;
  availableRoles: Role[];
  loadingRoles: boolean;
}

export default function StepAssignRole({
  form,
  availableRoles,
  loadingRoles,
}: StepAssignRoleProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Client-side search filtering
  const filteredRoles = useMemo(
    () =>
      availableRoles.filter((role) =>
        role.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [availableRoles, searchQuery],
  );

  const displayedRoles = showAll ? filteredRoles : filteredRoles.slice(0, 5);

  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Assign Role
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
          Assign Role
        </Text>

        <Text size="sm" fw={600} mb="md">
          Roles
        </Text>

        <TextInput
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          mb="md"
        />

        {loadingRoles ? (
          <>
            <Skeleton height={24} mb="sm" />
            <Divider />
            <Skeleton height={24} my="sm" />
            <Divider />
            <Skeleton height={24} my="sm" />
            <Divider />
            <Skeleton height={24} my="sm" />
            <Divider />
            <Skeleton height={24} my="sm" />
          </>
        ) : (
          <>
            {displayedRoles.length > 0 ? (
              <Checkbox.Group {...form.getInputProps("role_ids")}>
                {displayedRoles.map((role, index) => (
                  <Box key={role.role_id}>
                    <Checkbox
                      value={role.role_id.toString()}
                      label={role.name}
                      py="sm"
                    />
                    {index < displayedRoles.length - 1 && <Divider />}
                  </Box>
                ))}
              </Checkbox.Group>
            ) : (
              <Text size="sm" c="dimmed" mt="md">
                No roles found{searchQuery && ` matching "${searchQuery}"`}
              </Text>
            )}

            {filteredRoles.length > 5 && (
              <>
                <Divider />
                <Text
                  size="sm"
                  ta="center"
                  py="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? "Show Less" : "See More"}
                </Text>
                <Divider />
              </>
            )}
          </>
        )}

        {form.errors.role_ids && (
          <Text size="sm" c="red" mt="sm">
            {form.errors.role_ids}
          </Text>
        )}
      </Box>
    </Box>
  );
}
