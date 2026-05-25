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
import { IconUserQuestion, IconBallpen, IconMailSpark } from "@tabler/icons-react";
import PendingUsersTable from "./PendingUsersTable";
import PendingUsersTableSkeleton from "./PendingUsersTableSkeleton";
import EmptySearchState from "../../../../../components/EmptySearchState";
import { fetchPendingUsers, fetchAllRoles, type PendingUser, type Role } from "../_lib";

export type PendingFilter = "all" | "self_register" | "admin_invite";

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
    filter = "all",
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

    // Source filter
    if (filter !== "all") {
      result = result.filter((u) => u.source === filter);
    } else {
      // self_register first, then admin_invite
      const selfReg = result.filter((u) => u.source === "self_register");
      const adminInvite = result.filter((u) => u.source === "admin_invite");
      result = [...selfReg, ...adminInvite];
    }

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

  if (filteredUsers.length === 0) {
    if (search.trim()) {
      return <EmptySearchState />;
    }

    if (filter === "self_register") {
      return (
        <EmptySearchState
          icon={IconBallpen}
          title="No self-registered users"
          description="No users have signed up and are awaiting activation."
        />
      );
    }

    if (filter === "admin_invite") {
      return (
        <EmptySearchState
          icon={IconMailSpark}
          title="No admin-invited users"
          description="No users have been invited and are awaiting activation."
        />
      );
    }

    return (
      <EmptySearchState
        icon={IconUserQuestion}
        title="No pending users"
        description="There are no users waiting for account activation."
      />
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
