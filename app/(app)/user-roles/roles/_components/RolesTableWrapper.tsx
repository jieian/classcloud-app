"use client";

import {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import { Alert } from "@mantine/core";
import RolesTable from "./RolesTable";
import RolesTableSkeleton from "./RolesTableSkeleton";
import {
  fetchRolesWithPermissions,
  type RoleWithPermissions,
} from "../../users/_lib";

export interface RolesTableWrapperRef {
  refresh: () => void;
}

interface RolesTableWrapperProps {
  search?: string;
  onCountChange?: (count: number) => void;
}

export default forwardRef<RolesTableWrapperRef, RolesTableWrapperProps>(
  function RolesTableWrapper({ search = "", onCountChange }, ref) {
    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pathname = usePathname();
    const hasMounted = useRef(false);

    useImperativeHandle(ref, () => ({ refresh: loadRoles }));

    // Fetch on mount
    useEffect(() => {
      loadRoles();
      hasMounted.current = true;
    }, []);

    // Re-fetch when navigating back to this page (client-side)
    useEffect(() => {
      if (hasMounted.current) {
        loadRoles();
      }
    }, [pathname]);

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
      if (!search.trim()) return roles;
      const query = search.toLowerCase().trim();
      return roles.filter((role) =>
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

    const handleUpdate = () => {
      loadRoles();
    };

    return <RolesTable roles={filteredRoles} onUpdate={handleUpdate} />;
  },
);
