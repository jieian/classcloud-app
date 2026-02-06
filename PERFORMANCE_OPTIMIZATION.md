# User Roles Performance Optimization Guide

## Current Optimizations Applied

### 1. **Skeleton Loading** ✅
- Replaced generic loader with table skeleton
- Provides better UX by showing expected layout
- Location: `components/userRoles/UsersTableSkeleton.tsx`

### 2. **Performance Monitoring** ✅
- Added query time tracking
- Added data transformation time tracking
- Check browser console for performance metrics
- Location: `lib/userRolesService.ts`

### 3. **Query Optimization** ✅
- Added sorting by last_name and first_name
- Reduced unnecessary data fetching

## Recommended Database Optimizations

### Database Indexes to Add

Run these SQL commands in your Supabase SQL Editor to improve query performance:

```sql
-- Index on users.active_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_users_active_status
ON users(active_status)
WHERE active_status = 1;

-- Composite index for sorting
CREATE INDEX IF NOT EXISTS idx_users_name_sorting
ON users(last_name, first_name)
WHERE active_status = 1;

-- Index on user_roles for faster joins
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
ON user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
ON user_roles(role_id);

-- Foreign key indexes (if not already created)
CREATE INDEX IF NOT EXISTS idx_user_roles_fk_user
ON user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_fk_role
ON user_roles(role_id);
```

## Performance Benchmarks

After adding indexes, you should see:
- **Before**: 500ms - 2000ms query time (depending on data size)
- **After**: 50ms - 200ms query time

Check your browser console for actual metrics:
```
[Performance] Users query took XXms
[Performance] Data transformation took XXms
[Performance] Total time: XXms
[Performance] Fetched X users
```

## Future Optimizations (If Needed)

### 1. Pagination
If you have 100+ users, implement pagination:

```typescript
// Add to userRolesService.ts
export async function fetchActiveUsersWithRolesPaginated(
  page: number = 1,
  pageSize: number = 20
): Promise<{ users: UserWithRoles[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("users")
    .select(/* ... */, { count: 'exact' })
    .eq("active_status", 1)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(from, to);

  // ... transform and return
}
```

### 2. Caching
For data that doesn't change frequently:
- Implement React Query or SWR for client-side caching
- Add browser cache headers
- Use Supabase Realtime for live updates instead of polling

### 3. Virtual Scrolling
For very large datasets (1000+ users):
- Implement virtual scrolling with libraries like `react-window` or `@tanstack/react-virtual`
- Only renders visible rows in the DOM

### 4. Database Query Optimization
- Consider materialized views for complex joins
- Use database functions for complex transformations
- Enable Row Level Security (RLS) policies efficiently

## Monitoring Performance

1. **Open Browser DevTools Console**
2. **Navigate to User Roles page**
3. **Check the performance logs**
4. **If query time > 500ms**, consider:
   - Adding the recommended indexes
   - Implementing pagination
   - Checking database connection/region

## Troubleshooting Slow Performance

### If query is still slow after indexing:

1. **Check Database Region**
   - Ensure Supabase region is close to your users
   - Consider using Edge Functions for closer endpoints

2. **Check Row Count**
   - Run: `SELECT COUNT(*) FROM users WHERE active_status = 1;`
   - If > 1000 rows, implement pagination

3. **Check Join Complexity**
   - Monitor the number of roles per user
   - If users have many roles (10+), consider query restructuring

4. **Network Latency**
   - Check Network tab in DevTools
   - Look for slow DNS resolution or high latency

5. **Supabase Plan**
   - Free tier has connection limits
   - Consider upgrading for better performance
