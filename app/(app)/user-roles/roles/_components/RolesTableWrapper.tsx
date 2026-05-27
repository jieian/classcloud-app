"use client";

import {
  useState,
  useImperativeHandle,
  useEffect,
  forwardRef,
  useMemo,
} from "react";
import { Alert } from "@mantine/core";
import { IconUserCog } from "@tabler/icons-react";
import RolesTable from "./RolesTable";
import RolesTableSkeleton from "./RolesTableSkeleton";
import EmptySearchState from "@/components/EmptySearchState";
import {
  fetchRolesWithPermissions,
  type RoleWithPermissions,
} from "../../users/_lib";
import { sortRoles } from "@/lib/roleUtils";

export type RoleFacultyFilter = "all" | "faculty" | "non-faculty";

export interface RolesTableWrapperRef {
  refresh: () => void;
}

interface RolesTableWrapperProps {
  initialRoles: RoleWithPermissions[];
  search?: string;
  filter?: RoleFacultyFilter;
  onCountChange?: (count: number) => void;
}

export default forwardRef<RolesTableWrapperRef, RolesTableWrapperProps>(
  function RolesTableWrapper(
    { initialRoles, search = "", filter = "all", onCountChange },
    ref,
  ) {
    const [roles, setRoles] = useState<RoleWithPermissions[]>(initialRoles);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ refresh: loadRoles }));

    async function loadRoles() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchRolesWithPermissions();
        setRoles(data);
      } catch (err) {
        setError("Failed to load roles. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const filteredRoles = useMemo(() => {
      let result = sortRoles(roles);

      if (filter === "faculty") {
        result = result.filter((r) => r.is_faculty);
      } else if (filter === "non-faculty") {
        result = result.filter((r) => !r.is_faculty);
      }

      if (search.trim()) {
        const query = search.toLowerCase().trim();
        result = result.filter((r) => r.name.toLowerCase().includes(query));
      }

      return result;
    }, [roles, search, filter]);

    useEffect(() => {
      onCountChange?.(filteredRoles.length);
    }, [filteredRoles.length]);

    if (loading) {
      return <RolesTableSkeleton />;
    }

    if (error) {
      return (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      );
    }

    if (roles.length === 0) {
      return (
        <EmptySearchState
          icon={IconUserCog}
          title="No roles available"
          description="No roles have been created yet. Create a role to get started."
        />
      );
    }

    if (filteredRoles.length === 0) {
      if (search.trim()) {
        return <EmptySearchState />;
      }
      if (filter === "faculty") {
        return (
          <EmptySearchState
            icon={IconUserCog}
            title="No faculty roles"
            description="There are no roles marked as faculty roles."
          />
        );
      }
      if (filter === "non-faculty") {
        return (
          <EmptySearchState
            icon={IconUserCog}
            title="No non-faculty roles"
            description="There are no roles marked as non-faculty roles."
          />
        );
      }
    }

    return <RolesTable roles={filteredRoles} onUpdate={loadRoles} />;
  },
);
