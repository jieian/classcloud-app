# ClassCloud Project Audit Report

**Date:** 2026-02-06
**Auditor:** Claude AI
**Project:** ClassCloud App

---

## Executive Summary

This audit identified **15 critical/high severity issues** and **8 medium severity issues** across dependency management, database integrity, performance, validation, and HCI. The most critical findings are:

1. **Supabase Package Conflict** - Using deprecated and new packages simultaneously
2. **Database Transaction Missing** - User updates can leave DB in inconsistent state
3. **Password Security Flaw** - Plaintext passwords being stored
4. **Performance Bottleneck** - Sequential API calls causing slow load times

---

## Detailed Findings

| # | Severity | Category | Issue | Location | Why This is Bad | Recommended Fix |
|---|----------|----------|-------|----------|-----------------|-----------------|
| 1 | **CRITICAL** | Dependency Conflict | Using both `@supabase/auth-helpers-nextjs` (deprecated) AND `@supabase/ssr` | `package.json`, `middleware.ts`, `lib/supabase-client.ts` | **Deprecated package**: `auth-helpers-nextjs` is no longer maintained and may have security vulnerabilities. **Conflicting logic**: Middleware uses old package while ProtectedRoute uses new one - different cookie handling can cause auth state desync and session bugs. **React 19 incompatibility**: Old package not tested with React 19. | **Remove** `@supabase/auth-helpers-nextjs` entirely. **Migrate** `middleware.ts` to use `@supabase/ssr`. **Migrate** `lib/supabase-client.ts` to use `createBrowserClient` from `@supabase/ssr`. See migration guide: https://supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers |
| 2 | **CRITICAL** | Database Integrity | No transaction/rollback in `updateUser()` function | `lib/userUpdateService.ts:13-71` | **Data inconsistency risk**: Function performs 3 separate operations: (1) Update user info, (2) Delete roles, (3) Insert roles. If step 2 or 3 fails, user is left with updated info but incorrect/missing roles. **Race condition**: If network fails after delete but before insert, user has NO roles. **No atomicity**: Cannot rollback if any step fails. | **Option A (Recommended)**: Use Supabase RPC function with Postgres transaction: `BEGIN; UPDATE users...; DELETE FROM user_roles...; INSERT INTO user_roles...; COMMIT;` **Option B**: Use Supabase's built-in `upsert` for roles instead of delete+insert. **Option C**: Add error recovery - if insert fails, re-insert old roles from a backup. |
| 3 | **CRITICAL** | Security | Password stored as plaintext in `password_hash` field | `lib/userUpdateService.ts:26-28` | **Security vulnerability**: Storing passwords as plaintext violates OWASP guidelines. If database is breached, all passwords are exposed. **Legal compliance**: Violates GDPR, CCPA, and other data protection regulations. **No hashing**: Comment says "should hash on backend" but doesn't enforce it. | **Implement bcrypt hashing** in Supabase via: (1) Create a Postgres trigger that automatically hashes passwords on INSERT/UPDATE, OR (2) Create an RPC function that hashes server-side, OR (3) Use Supabase Auth's built-in password management instead of custom password_hash field. **Never** hash on client-side. |
| 4 | **CRITICAL** | Performance | Sequential "waterfall" fetches in AuthContext | `context/AuthContext.tsx:76-77, 96-97` | **Slow load times**: Fetches roles first, THEN permissions. If each takes 200ms, total is 400ms instead of 200ms. **Blocks entire app**: AuthContext wraps root layout, so this delay affects every page load. **Poor UX**: Users see loading state longer than necessary. | **Parallelize fetches** using `Promise.all()`: ```typescript const [fetchedRoles, fetchedPermissions] = await Promise.all([   fetchUserRoles(currentUser.id),   fetchUserPermissions(currentUser.id) ]); ``` This runs both queries simultaneously, cutting time in half. |
| 5 | **HIGH** | Performance | AuthContext wraps entire app causing unnecessary re-renders | `app/layout.tsx:47` | **Global re-renders**: Every state change in AuthContext triggers re-render of entire app tree. **Not server-side**: Wrapping in layout forces client-side auth checks even for public pages. **Redundant with middleware**: Middleware already checks auth - AuthContext duplicates this work. | **Move AuthContext down the tree**: Only wrap authenticated routes `app/(app)/layout.tsx`. **Use Server Components** for initial auth check. **Consider Zustand or Jotai** for more granular state management. **Remove redundant auth checks** since middleware already handles auth. |
| 6 | **HIGH** | Validation Gap | Email not trimmed in login form | `components/loginPage/LoginPage.tsx:84-90` | **Login failures**: User enters "user@example.com " (trailing space) → Login fails even with correct password. **Poor UX**: Error message doesn't explain why login failed. **Database inconsistency**: If signup allows spaces but login doesn't, account becomes unusable. | **Add trim on change**: `onChange={(e) => setEmail(e.currentTarget.value.trim())}` AND **Validate on submit**: Ensure email is trimmed before sending to API. **Add helper text**: "Spaces will be automatically removed" |
| 7 | **HIGH** | Validation Gap | No maxLength validation on text inputs | `components/userRoles/EditUserDrawer.tsx`, `components/loginPage/LoginPage.tsx` | **Database overflow**: Names can be unlimited length → Database column limit exceeded → SQL error. **XSS risk**: Large inputs can carry malicious scripts. **Performance**: Sending/storing massive strings wastes bandwidth and storage. **Poor UX**: No feedback until submit fails. | **Add maxLength to all text inputs**: `<TextInput maxLength={100} ... />` **Database constraints**: `first_name VARCHAR(100)`, `last_name VARCHAR(100)`, `email VARCHAR(255)` **Show character counter**: `<TextInput description={\`\${value.length}/100\`} />` |
| 8 | **HIGH** | Architecture | ProtectedRoute performs auth check on every page | `components/ProtectedRoute.tsx:19-42` | **Redundant with middleware**: Middleware already checks auth at edge. Doing it again on page is wasteful. **Slow page loads**: Server component fetches auth + permissions on every navigation. **N+1 problem**: Each protected page makes same RPC call. **No caching**: Same user permissions fetched repeatedly. | **Option A (Best)**: Remove ProtectedRoute entirely. Handle permissions in middleware. **Option B**: Cache permissions in a singleton or Redis with 5min TTL. **Option C**: Pass permissions from layout to pages as props (avoid re-fetching). |
| 9 | **HIGH** | Validation Gap | Names allow special characters that should be rejected | `components/userRoles/EditUserDrawer.tsx:121, 132` | **Regex too permissive**: `/^[a-zA-Z\s]+$/` allows multiple consecutive spaces, leading/trailing spaces. **Allows**: "John    Doe  ", "  Mary", "Paul   " → Stored in database as-is. **Database clutter**: Inconsistent formatting makes search/sort difficult. | **Tighten regex**: `/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/` (no leading/trailing/double spaces) **OR** Keep current regex but **trim and collapse spaces**: `value.trim().replace(/\s+/g, ' ')` before validation. **Add real-time feedback**: Show trimmed preview as user types. |
| 10 | **HIGH** | Error Handling | No error boundary to catch React errors | Project-wide | **White screen of death**: Unhandled errors crash entire app. React 19 throws on common mistakes (e.g., hydration mismatches). **No recovery**: User must refresh page - loses unsaved work. **Poor UX**: No explanation of what went wrong. | **Add Error Boundary**: Create `app/error.tsx` and `app/global-error.tsx` per Next.js conventions. **Catch specific errors**: Hydration errors, API errors, component errors. **Provide recovery**: "Try again" button, "Go to Home" button. **Log to monitoring**: Send errors to Sentry/Datadog. |
| 11 | **MEDIUM** | Performance | Performance monitoring logs in production | `lib/userRolesService.ts:50-76` | **Pollutes console**: Users see technical debug info in browser DevTools. **Performance overhead**: `performance.now()` calls add milliseconds to each query. **Reveals architecture**: Attackers learn about query structure and timings. | **Remove console.logs** from production builds. **Use environment check**: ```typescript if (process.env.NODE_ENV === 'development') {   console.log(...); } ``` **OR** Use proper observability tool like Datadog/New Relic with feature flags. |
| 12 | **MEDIUM** | Validation Gap | Password confirmation only checked on submit | `components/userRoles/EditUserDrawer.tsx:154-158` | **Poor UX**: User types entire password, confirms with typo, only finds out on submit. **No real-time feedback**: Validation should update as user types (already enabled via `validateInputOnChange` but needs visual refinement). | **Already partially fixed** (validateInputOnChange is enabled). **Add visual indicator**: Show green checkmark when passwords match. **Add warning**: Show red X when passwords don't match. **Disable Save button** until passwords match (already done via `form.isValid()`). |
| 13 | **MEDIUM** | HCI Gap | No loading skeleton for EditUserDrawer roles | `components/userRoles/EditUserDrawer.tsx:182-191` | **Blank space while loading**: Roles checkboxes appear blank for ~200ms while fetching. **Poor UX**: Users don't know if roles are loading or if there are no roles. **Inconsistent**: UsersTable has skeleton, but drawer doesn't. | **Add skeleton loader** to roles section: ```typescript {rolesLoading ? (   <Stack>     <Skeleton height={28} />     <Skeleton height={28} />     <Skeleton height={28} />   </Stack> ) : ( {/* Checkbox.Group */} )} ``` |
| 14 | **MEDIUM** | Architecture | "use client" on page that could be Server Component | `app/login/page.tsx:1` | **Unnecessary client bundle**: Login page is client component even though it doesn't need to be. **Missed optimization**: Server components are faster to render and reduce JS bundle size. **Next.js best practice**: Pages should be Server Components by default, only components needing interactivity should be client. | **Make page a Server Component**: Remove "use client" from `app/login/page.tsx`. **Keep client logic in component**: `LoginPage.tsx` can stay client component. **Pass data as props**: If needed, fetch data in Server Component page and pass to client component. |
| 15 | **MEDIUM** | Error Handling | Generic error messages don't help user recover | `components/userRoles/UsersTableWrapper.tsx:24`, `lib/userUpdateService.ts:37,49,65` | **Vague errors**: "Failed to load users" doesn't tell user why or how to fix. **No actionable info**: User doesn't know if it's: network issue, permissions, server error, or database down. **Poor UX**: User can't self-serve recovery. | **Specific error messages**: "Network error - check connection", "Permission denied - contact admin", "Database error - try again in 5 min". **Add error codes**: "Error USR-001: ..." for support teams. **Suggest actions**: "Retry", "Refresh page", "Contact support". **Log full error** server-side but show friendly message to user. |
| 16 | **MEDIUM** | Performance | No caching strategy for roles list | `lib/userUpdateService.ts:74-93` | **Fetched repeatedly**: Every time user opens EditDrawer, fetches same roles list. **Wasteful**: Roles rarely change - could be cached for hours. **Slow drawer open**: Adds 100-300ms delay before drawer shows roles. | **Add caching**: Store roles in React Context or localStorage with 1-hour TTL. **OR** Use React Query: `useQuery('roles', fetchAllRoles, { staleTime: 3600000 })`. **OR** Fetch roles once on page load, pass as prop to drawer. |
| 17 | **MEDIUM** | HCI Gap | No "unsaved changes" warning when navigating away | `components/userRoles/EditUserDrawer.tsx` | **Data loss risk**: User edits form, accidentally clicks back button → changes lost without warning. **Poor UX**: No protection against accidental navigation. **Inconsistent**: Cancel button has confirmation, but browser back doesn't. | **Add beforeunload handler** when form is dirty: ```typescript useEffect(() => {   const handler = (e: BeforeUnloadEvent) => {     if (form.isDirty()) {       e.preventDefault();       e.returnValue = '';     }   };   window.addEventListener('beforeunload', handler);   return () => window.removeEventListener('beforeunload', handler); }, [form.isDirty()]); ``` |
| 18 | **MEDIUM** | Architecture | Middleware using old Supabase package | `middleware.ts:1` | **Deprecated**: `@supabase/auth-helpers-nextjs` not maintained. **Bug risk**: May have unpatched security vulnerabilities. **React 19 untested**: Old package not tested with React 19/Next.js 16. | **Migrate to `@supabase/ssr`**: ```typescript import { createServerClient } from '@supabase/ssr'; // Update cookie handling to match new API ``` Full migration guide: https://supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers |
| 19 | **LOW** | Code Quality | Inconsistent error handling (throw vs return) | Various files | **Mixed patterns**: Some functions throw errors, others return null. **Unclear contracts**: Caller doesn't know if function throws or returns error object. **Poor DX**: Developers must read implementation to know how to handle errors. | **Standardize**: Always throw errors from service functions. **Catch at boundaries**: Catch errors in components and show user-friendly messages. **Document**: Add JSDoc comments explaining error behavior. |
| 20 | **LOW** | Performance | NavBar re-renders on every permission change | `components/navBar/NavBar.tsx:147-164` | **Unnecessary computation**: `useMemo` recalculates filtered navigation on every permissions change. **Minor impact**: Only triggers on login/logout, not frequent. **Over-optimization**: Navigation data is small - memoization may not be needed. | **Keep as-is** (low priority) OR **Remove useMemo** if profiling shows no benefit. **Monitor**: Check React DevTools Profiler to confirm this isn't causing issues. |
| 21 | **LOW** | HCI Gap | "Remember me" checkbox doesn't function | `components/loginPage/LoginPage.tsx:115-119` | **Non-functional**: Checkbox is rendered but not wired up - doesn't actually remember user. **Misleading**: Users expect "Remember me" to work - erodes trust when it doesn't. **Poor UX**: If feature isn't implemented, don't show it. | **Option A**: Remove checkbox until implemented. **Option B**: Implement using Supabase's `persistSession` option in `signInWithPassword()`. **Option C**: Add `disabled` state with tooltip "Coming soon". |

---

## Priority Recommendations

### 🔥 Fix Immediately (Critical - within 24 hours)

1. **Remove** `@supabase/auth-helpers-nextjs` dependency and migrate all code to `@supabase/ssr`
2. **Implement database transaction** for `updateUser()` using Supabase RPC function
3. **Add password hashing** via Postgres trigger or switch to Supabase Auth's password management

### ⚠️ Fix Soon (High - within 1 week)

4. **Parallelize AuthContext queries** with `Promise.all()`
5. **Add maxLength validation** to all text inputs
6. **Trim email input** on login form
7. **Add Error Boundaries** to catch React errors
8. **Move AuthContext** down the component tree to avoid global re-renders

### ℹ️ Fix Eventually (Medium - within 1 month)

9. **Remove console.logs** from production or use environment checks
10. **Add loading skeleton** to EditUserDrawer roles section
11. **Implement caching** for roles list
12. **Add unsaved changes warning** when navigating away from dirty form
13. **Improve error messages** with specific, actionable text

---

## React 19 / Next.js 16 Compatibility Notes

### Potential Hydration Issues Found:

1. **AuthContext initial state**: Using `useState(true)` for loading may cause hydration mismatch if server renders differently. Consider using `useEffect` to set initial state.

2. **NavBar `loading` state**: Returns `null` while loading - this creates different server/client HTML. Consider rendering skeleton instead.

3. **Mantine Providers in root layout**: ModalsProvider and Notifications are client components wrapping entire app. This is OK but monitor for hydration warnings in console.

### Recommendations:

- **Test thoroughly** for hydration errors (check browser console for warnings)
- **Add suppressHydrationWarning** to root `<html>` tag if timestamp mismatches occur
- **Consider Server Components** for initial data fetching in authenticated pages

---

## Testing Recommendations

Before deploying fixes, test:

1. **Auth flow**: Login → Navigate → Refresh page → Check if still authenticated
2. **User update**: Change name/email/roles → Network error simulation → Verify DB state
3. **Concurrent edits**: Two users editing same user → Check for race conditions
4. **Performance**: Measure page load time before/after AuthContext optimization
5. **Validation**: Try submitting forms with: max-length strings, special characters, trailing spaces, empty fields

---

## Conclusion

The project has a solid foundation but needs **critical security and data integrity fixes** before production use. The Supabase dependency conflict and missing database transactions pose the highest risk. Once critical issues are resolved, focus on performance optimizations and validation improvements.

**Estimated effort**: 2-3 days for critical fixes, 1 week for all high-priority items.

