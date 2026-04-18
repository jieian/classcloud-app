"use client";

import {
  Box,
  Checkbox,
  Divider,
  Group,
  Pagination,
  Skeleton,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useMemo, useState, useEffect } from "react";
import type { CreateUserForm } from "../_lib/types";
import type { Role } from "../_lib/userRolesService";
import { checkPrincipalExists } from "../_lib/userRolesService";
import { sortRoles } from "@/lib/roleUtils";

interface StepAssignRoleProps {
  form: UseFormReturnType<CreateUserForm>;
  availableRoles: Role[];
  loadingRoles: boolean;
}

const ROLES_PER_PAGE = 5;
const MAX_VISIBLE_NAMES = 2;

export default function StepAssignRole({
  form,
  availableRoles,
  loadingRoles,
}: StepAssignRoleProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rolesExpanded, setRolesExpanded] = useState(false);
  const [principalWarning, setPrincipalWarning] = useState(false);

  useEffect(() => {
    const hasPrincipal = form.values.role_ids.some(
      (id) => availableRoles.find((r) => r.role_id.toString() === id)?.name === "Principal",
    );
    if (!hasPrincipal) {
      setPrincipalWarning(false);
      return;
    }
    checkPrincipalExists()
      .then(setPrincipalWarning)
      .catch(() => setPrincipalWarning(false));
  }, [form.values.role_ids]);

  // Sort then filter
  const sortedRoles = useMemo(() => sortRoles(availableRoles), [availableRoles]);

  const filteredRoles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return q
      ? sortedRoles.filter((role) => role.name.toLowerCase().includes(q))
      : sortedRoles;
  }, [sortedRoles, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / ROLES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const displayedRoles = filteredRoles.slice(
    (safePage - 1) * ROLES_PER_PAGE,
    safePage * ROLES_PER_PAGE,
  );

  // Handle search: reset to page 1
  function handleSearch(value: string) {
    setSearchQuery(value);
    setCurrentPage(1);
  }

  // Selected role names for the summary label
  const selectedRoleNames = useMemo(
    () =>
      form.values.role_ids
        .map((id) => availableRoles.find((r) => r.role_id.toString() === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [form.values.role_ids, availableRoles],
  );

  const hiddenCount = selectedRoleNames.length - MAX_VISIBLE_NAMES;
  const visibleNames = rolesExpanded
    ? selectedRoleNames
    : selectedRoleNames.slice(0, MAX_VISIBLE_NAMES);

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
          onChange={(e) => handleSearch(e.target.value)}
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
                      py="sm"
                      label={
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{role.name}</Text>
                          {role.name === "Principal" && principalWarning && (
                            <Tooltip
                              label="A Principal already exists. Assigning this role to another user may cause conflicts."
                              withArrow
                              multiline
                              w={260}
                            >
                              <Box
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  backgroundColor: "#f59e0b",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  cursor: "default",
                                }}
                              >
                                <Text size="xs" fw={700} c="white" lh={1}>!</Text>
                              </Box>
                            </Tooltip>
                          )}
                        </Group>
                      }
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

            {totalPages > 1 && (
              <Pagination
                total={totalPages}
                value={safePage}
                onChange={setCurrentPage}
                size="sm"
                mt="md"
              />
            )}

            {/* Selected roles summary */}
            {selectedRoleNames.length > 0 && (
              <Text size="sm" c="dimmed" mt="sm">
                <strong style={{ color: "#1a1a1a" }}>
                  Selected Roles ({selectedRoleNames.length}):
                </strong>{" "}
                {visibleNames.join(", ")}
                {!rolesExpanded && hiddenCount > 0 && (
                  <>
                    {" "}
                    <Text
                      component="span"
                      size="sm"
                      c="#4EAE4A"
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setRolesExpanded(true)}
                    >
                      +{hiddenCount} more
                    </Text>
                  </>
                )}
                {rolesExpanded && hiddenCount > 0 && (
                  <>
                    {" "}
                    <Text
                      component="span"
                      size="sm"
                      c="#4EAE4A"
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setRolesExpanded(false)}
                    >
                      Show less
                    </Text>
                  </>
                )}
              </Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
