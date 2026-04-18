"use client";

import {
  useState,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { Alert } from "@mantine/core";
import RolesTable from "./RolesTable";
import RolesTableSkeleton from "./RolesTableSkeleton";
import {
  fetchRolesWithPermissions,
  type RoleWithPermissions,
} from "../../users/_lib";
import { sortRoles } from "@/lib/roleUtils";

export interface RolesTableWrapperRef {
  refresh: () => void;
}

interface RolesTableWrapperProps {
  initialRoles: RoleWithPermissions[];
  search?: string;
  onCountChange?: (count: number) => void;
}

export default forwardRef<RolesTableWrapperRef, RolesTableWrapperProps>(
  function RolesTableWrapper({ initialRoles, search = "", onCountChange }, ref) {
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
        onCountChange?.(data.length);
      } catch (err) {
        setError("Failed to load roles. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const filteredRoles = useMemo(() => {
      const sorted = sortRoles(roles);
      if (!search.trim()) return sorted;
      const query = search.toLowerCase().trim();
      return sorted.filter((role) =>
        role.name.toLowerCase().includes(query),
      );
    }, [roles, search]);

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

    return <RolesTable roles={filteredRoles} onUpdate={loadRoles} />;
  },
);
