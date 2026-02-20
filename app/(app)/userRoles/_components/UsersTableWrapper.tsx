"use client";

import { useState, useEffect, useImperativeHandle, forwardRef, useMemo } from "react";
import { Alert } from "@mantine/core";
import UsersTable from "./UsersTable";
import UsersTableSkeleton from "./UsersTableSkeleton";
import {
  fetchActiveUsersWithRoles,
  type UserWithRoles,
} from "../_lib";

export interface UsersTableWrapperRef {
  refresh: () => void;
}

interface UsersTableWrapperProps {
  search?: string;
  onCountChange?: (count: number) => void;
}

export default forwardRef<UsersTableWrapperRef, UsersTableWrapperProps>(
  function UsersTableWrapper({ search = "", onCountChange }, ref) {
    const [users, setUsers] = useState<UserWithRoles[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ refresh: loadUsers }));

    useEffect(() => {
      loadUsers();
    }, []);

    async function loadUsers() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchActiveUsersWithRoles();
        setUsers(data);
        onCountChange?.(data.length);
      } catch (err) {
        setError("Failed to load users. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const filteredUsers = useMemo(() => {
      if (!search.trim()) return users;
      const query = search.toLowerCase().trim();
      return users.filter((user) => {
        const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
        return (
          fullName.includes(query) ||
          user.first_name.toLowerCase().includes(query) ||
          user.last_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      });
    }, [users, search]);

    const handleUpdate = () => {
      loadUsers();
    };

    if (loading) {
      return <UsersTableSkeleton />;
    }

    if (error) {
      return (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      );
    }

    return <UsersTable users={filteredUsers} onUpdate={handleUpdate} />;
  }
);
