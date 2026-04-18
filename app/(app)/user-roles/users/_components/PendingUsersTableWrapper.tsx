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
import PendingUsersTable from "./PendingUsersTable";
import PendingUsersTableSkeleton from "./PendingUsersTableSkeleton";
import { fetchPendingUsers, fetchAllRoles, type PendingUser, type Role } from "../_lib";

export type PendingFilter = "self_register" | "admin_invite";

export interface PendingUsersTableWrapperRef {
  refresh: () => void;
}

interface PendingUsersTableWrapperProps {
  search?: string;
  filter?: PendingFilter;
  onCountChange?: (count: number) => void;
  onSelfRegCountChange?: (count: number) => void;
  unreadMap?: Map<string, string>;
  onMarkRead?: (uid: string) => void;
}

export default forwardRef<
  PendingUsersTableWrapperRef,
  PendingUsersTableWrapperProps
>(function PendingUsersTableWrapper(
  {
    search = "",
    filter = "self_register",
    onCountChange,
    onSelfRegCountChange,
    unreadMap = new Map(),
    onMarkRead = () => {},
  },
  ref,
) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const hasMounted = useRef(false);

  useImperativeHandle(ref, () => ({ refresh: loadUsers }));

  // Fetch on mount
  useEffect(() => {
    loadUsers();
    hasMounted.current = true;
  }, []);

  // Re-fetch when navigating back to this page (client-side)
  useEffect(() => {
    if (hasMounted.current) {
      loadUsers();
    }
  }, [pathname]);

  async function loadUsers() {
    try {
      setLoading(true);
      setError(null);
      const [data, allRoles] = await Promise.all([
        fetchPendingUsers(),
        fetchAllRoles(),
      ]);
      setUsers(data);
      setRoles(allRoles);
      onCountChange?.(data.length);
      onSelfRegCountChange?.(
        data.filter((u) => u.source === "self_register").length,
      );
    } catch (err) {
      setError("Failed to load pending users. Please try again later.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    let result = users;

    // Source filter — always applied (no "all" option)
    result = result.filter((u) => u.source === filter);

    // Search filter
    const query = search.toLowerCase().trim();
    if (query) {
      result = result.filter((user) => {
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        return (
          fullName.includes(query) ||
          user.first_name.toLowerCase().includes(query) ||
          user.last_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [users, search, filter]);

  const handleUpdate = () => {
    loadUsers();
  };

  if (loading) {
    return <PendingUsersTableSkeleton />;
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        {error}
      </Alert>
    );
  }

  return (
    <PendingUsersTable
      users={filteredUsers}
      roles={roles}
      onUpdate={handleUpdate}
      unreadMap={unreadMap}
      onMarkRead={onMarkRead}
    />
  );
});
