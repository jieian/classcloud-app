"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";
import { Alert, Group, Pagination } from "@mantine/core";
import { useAuth } from "@/context/AuthContext";
import UsersTable from "./UsersTable";
import UsersTableSkeleton from "./UsersTableSkeleton";
import { fetchActiveUsersWithRoles, type UserWithRoles } from "../_lib";

const PAGE_SIZE = 5;

export type FacultyFilter = "all" | "faculty" | "non-faculty";

/**
 * Returns a numeric priority bucket for sorting within a given filter view.
 * Lower = higher in the list.
 *
 * "All" buckets:
 *   1   Principal
 *   2   Administrator + other roles
 *   3   Administrator only
 *   4   is_faculty=false & is_protected=true  (role name A–Z)
 *   5   is_faculty=false & is_protected=false (role name A–Z)
 *   6   Faculty + Coordinator
 *   7   Coordinator (no Faculty role) — Subject Coordinator first, then Grade Coordinator
 *   8   Faculty (no Coordinator role)
 *   9   is_faculty=true  & is_protected=true  (role name A–Z)
 *   10  is_faculty=true  & is_protected=false (role name A–Z)
 *   11  No roles
 *
 * "Faculty" buckets:
 *   1   Faculty + Coordinator
 *   2   Coordinator (no Faculty role) — Subject Coordinator first, then Grade Coordinator
 *   3   Faculty (no Coordinator role)
 *   4   is_faculty=true & is_protected=true  (role name A–Z)
 *   5   is_faculty=true & is_protected=false (role name A–Z)
 *
 * "Non-Faculty" buckets:
 *   1   Principal
 *   2   Administrator + other roles
 *   3   Administrator only
 *   4   is_faculty=false & is_protected=true  (role name A–Z)
 *   5   is_faculty=false & is_protected=false (role name A–Z)
 *   6   No roles
 */

// O(k) single-pass minimum role name — used as sub-sort key for "other" buckets
function getPrimaryRoleName(user: UserWithRoles): string {
  if (user.roles.length === 0) return "";
  return user.roles.reduce(
    (min, r) => (r.name < min ? r.name : min),
    user.roles[0].name,
  );
}

// Buckets where sub-sort is by role name (not person name)
const ROLE_NAME_SORT_BUCKETS_ALL        = new Set([4, 5, 9, 10]);
const ROLE_NAME_SORT_BUCKETS_FACULTY    = new Set([4, 5]);
const ROLE_NAME_SORT_BUCKETS_NONFACULTY = new Set([4, 5]);

function getRoleCategory(user: UserWithRoles, filter: FacultyFilter): number {
  // hasAnyProtected is the only value needed by all three filter paths
  const hasAnyProtected = user.roles.some((r) => r.is_protected);

  if (filter === "faculty") {
    // isPrincipal / isAdmin / hasFacultyFlag not needed here
    const names = new Set(user.roles.map((r) => r.name.toLowerCase()));
    const isFacultyRole = names.has("faculty");
    // Exact match — avoids future roles containing "coordinator" accidentally matching
    const isCoordinator = names.has("subject coordinator") || names.has("grade level coordinator");
    if (isFacultyRole && isCoordinator)  return 1;
    if (isCoordinator && !isFacultyRole) return 2;
    if (isFacultyRole && !isCoordinator) return 3;
    return hasAnyProtected ? 4 : 5;
  }

  // Both "all" and "non-faculty" need isPrincipal + isAdmin
  const names = new Set(user.roles.map((r) => r.name.toLowerCase()));
  const isPrincipal = names.has("principal");
  const isAdmin     = names.has("administrator");

  if (filter === "non-faculty") {
    // isFacultyRole / isCoordinator / hasFacultyFlag not needed here
    if (user.roles.length === 0)          return 6;
    if (isPrincipal)                      return 1;
    if (isAdmin && user.roles.length > 1) return 2;
    if (isAdmin)                          return 3;
    return hasAnyProtected ? 4 : 5;
  }

  // filter === "all" — needs the full set of flags
  if (user.roles.length === 0)            return 11;
  const hasFacultyFlag = user.roles.some((r) => r.is_faculty);
  const isFacultyRole  = names.has("faculty");
  const isCoordinator  = names.has("subject coordinator") || names.has("grade level coordinator");
  if (isPrincipal)                        return 1;
  if (isAdmin && user.roles.length > 1)   return 2;
  if (isAdmin)                            return 3;
  if (!hasFacultyFlag && hasAnyProtected) return 4;
  if (!hasFacultyFlag)                    return 5;
  if (isFacultyRole && isCoordinator)     return 6;
  if (isCoordinator && !isFacultyRole)    return 7;
  if (isFacultyRole && !isCoordinator)    return 8;
  return hasAnyProtected ? 9 : 10;
}

export interface UsersTableWrapperRef {
  refresh: () => void;
}

interface UsersTableWrapperProps {
  search?: string;
  filter?: FacultyFilter;
  onCountChange?: (count: number) => void;
  onPrincipalCountChange?: (count: number) => void;
}

export default forwardRef<UsersTableWrapperRef, UsersTableWrapperProps>(
  function UsersTableWrapper(
    { search = "", filter = "all", onCountChange, onPrincipalCountChange },
    ref,
  ) {
    const [users, setUsers] = useState<UserWithRoles[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [lockedHeight, setLockedHeight] = useState<number | undefined>();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const { user: currentUser } = useAuth();
    const currentUid = currentUser?.id ?? null;

    useImperativeHandle(ref, () => ({ refresh: loadUsers }));

    useEffect(() => {
      loadUsers();
    }, [pathname]);

    // Reset to page 1 when search or filter changes
    useEffect(() => {
      setPage(1);
    }, [search, filter]);

    // Lock the container height after rendering a full page so the pagination
    // stays anchored on pages with fewer rows.
    useLayoutEffect(() => {
      if (!tableContainerRef.current) return;
      if (pagedUsers.length === PAGE_SIZE) {
        const h = tableContainerRef.current.offsetHeight;
        setLockedHeight((prev) => (prev === undefined ? h : Math.max(prev, h)));
      }
    });

    async function loadUsers() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchActiveUsersWithRoles();
        setUsers(data);
        const principalCount = data.filter((u) =>
          u.roles.some((r) => r.name === "Principal"),
        ).length;
        onPrincipalCountChange?.(principalCount);
      } catch (err) {
        setError("Failed to load users. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    const filteredAndSorted = useMemo(() => {
      // Step 1: filter by faculty flag
      let result = users;
      if (filter === "faculty") {
        result = users.filter((u) => u.roles.some((r) => r.is_faculty));
      } else if (filter === "non-faculty") {
        result = users.filter((u) => !u.roles.some((r) => r.is_faculty));
      }

      // Step 2: filter by search query
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        result = result.filter((u) => {
          const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
          return (
            fullName.includes(query) ||
            u.first_name.toLowerCase().includes(query) ||
            u.last_name.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
          );
        });
      }

      // Step 3: Schwartzian transform — precompute sort keys once per user (O(n)),
      // then sort on cheap cached values (O(n log n)), then unwrap.
      const roleSortBuckets =
        filter === "all"         ? ROLE_NAME_SORT_BUCKETS_ALL
        : filter === "faculty"   ? ROLE_NAME_SORT_BUCKETS_FACULTY
        : ROLE_NAME_SORT_BUCKETS_NONFACULTY;

      return result
        .map((u) => ({
          u,
          cat: getRoleCategory(u, filter),
          primaryRole: getPrimaryRoleName(u),
        }))
        .sort((a, b) => {
          if (a.u.uid === currentUid) return -1;
          if (b.u.uid === currentUid) return 1;
          const catDiff = a.cat - b.cat;
          if (catDiff !== 0) return catDiff;
          if (roleSortBuckets.has(a.cat)) {
            const roleDiff = a.primaryRole.localeCompare(b.primaryRole);
            if (roleDiff !== 0) return roleDiff;
          }
          return (
            a.u.last_name.localeCompare(b.u.last_name) ||
            a.u.first_name.localeCompare(b.u.first_name)
          );
        })
        .map(({ u }) => u);
    }, [users, search, filter, currentUid]);

    // Report filtered count to parent (before pagination)
    useEffect(() => {
      onCountChange?.(filteredAndSorted.length);
    }, [filteredAndSorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const totalPages = Math.ceil(filteredAndSorted.length / PAGE_SIZE);
    const pageStart = (page - 1) * PAGE_SIZE;
    const pagedUsers = filteredAndSorted.slice(pageStart, pageStart + PAGE_SIZE);

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

    return (
      <>
        <div ref={tableContainerRef} style={{ minHeight: lockedHeight }}>
          <UsersTable users={pagedUsers} onUpdate={loadUsers} />
        </div>
        {totalPages > 1 && (
          <Group justify="center" mt="md">
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              color="#4EAE4A"
            />
          </Group>
        )}
      </>
    );
  },
);
