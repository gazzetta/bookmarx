
```markdown
# BookMarx Database Queries

## User Operations

### Authentication Queries
```sql
-- User registration
WITH new_user AS (
    INSERT INTO users (email, password_hash, auth_type)
    VALUES ($1, $2, 'local')
    RETURNING id
)
INSERT INTO devices (user_id, device_id, name, browser, os)
SELECT id, $3, $4, $5, $6 
FROM new_user
RETURNING user_id;

-- User login
WITH user_data AS (
    SELECT id, password_hash, subscription_type, status
    FROM users
    WHERE email = $1 AND status = 'active'
), session_create AS (
    INSERT INTO sessions (user_id, device_id, token, expires_at, device_info)
    SELECT id, $2, $3, NOW() + INTERVAL '24 hours', $4::jsonb
    FROM user_data
    WHERE password_hash = $5
    RETURNING user_id
)
UPDATE users
SET last_login = NOW()
WHERE id = (SELECT user_id FROM session_create)
RETURNING id, subscription_type;
```

### Session Management
```sql
-- Create new session
INSERT INTO sessions (user_id, device_id, token, expires_at, device_info)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, device_id) 
DO UPDATE SET 
    token = EXCLUDED.token,
    expires_at = EXCLUDED.expires_at,
    last_activity = NOW();

-- Validate session
WITH session_check AS (
    SELECT s.user_id, s.device_id, u.status, u.subscription_type
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1
      AND s.expires_at > NOW()
      AND u.status = 'active'
)
UPDATE sessions
SET last_activity = NOW()
WHERE token = $1
RETURNING (SELECT * FROM session_check);
```

## Bookmark Operations

### Create and Update
```sql
-- Create bookmark with position adjustment
WITH folder_check AS (
    SELECT id, user_id 
    FROM folders 
    WHERE id = $1 AND user_id = $2
), position_update AS (
    UPDATE bookmarks
    SET position = position + 1
    WHERE folder_id = $1
      AND position >= $3
      AND user_id = $2
)
INSERT INTO bookmarks (
    user_id, folder_id, url, title, description, 
    position, device_id, sync_version
)
SELECT $2, $1, $4, $5, $6, $3, $7, 1
FROM folder_check
RETURNING *;

-- Update bookmark with version increment
UPDATE bookmarks
SET title = COALESCE($3, title),
    url = COALESCE($4, url),
    description = COALESCE($5, description),
    sync_version = sync_version + 1,
    updated_at = NOW(),
    device_id = $6
WHERE id = $1 AND user_id = $2
RETURNING *;
```

### Folder Operations
```sql
-- Create folder with path update
WITH RECURSIVE new_folder AS (
    INSERT INTO folders (user_id, name, parent_id, position)
    VALUES ($1, $2, $3, (
        SELECT COALESCE(MAX(position) + 1, 0)
        FROM folders
        WHERE parent_id = $3 AND user_id = $1
    ))
    RETURNING *
)
SELECT f.*, array_agg(p.name) as path_names
FROM new_folder f
LEFT JOIN LATERAL (
    SELECT name
    FROM folders
    WHERE path @> f.path
    ORDER BY path
) p ON true
GROUP BY f.id, f.name, f.parent_id, f.position, f.path;

-- Move folder with children
WITH RECURSIVE folder_tree AS (
    SELECT id, path
    FROM folders
    WHERE id = $1
    UNION ALL
    SELECT f.id, f.path
    FROM folders f
    JOIN folder_tree ft ON f.path <@ ft.path
)
UPDATE folders
SET parent_id = $2,
    path = CASE 
        WHEN $2 IS NULL THEN text2ltree(id::text)
        ELSE (SELECT path || text2ltree(id::text) FROM folders WHERE id = $2)
    END
WHERE id IN (SELECT id FROM folder_tree);
```

### Sync Operations
```sql
-- Get changes since last sync
WITH last_sync AS (
    SELECT MAX(completed_at) as sync_time
    FROM sync_history
    WHERE user_id = $1 AND device_id = $2 AND status = 'success'
)
SELECT 
    'bookmark' as type,
    b.id,
    b.sync_version,
    b.updated_at,
    b.device_id,
    jsonb_build_object(
        'url', b.url,
        'title', b.title,
        'folder_id', b.folder_id,
        'position', b.position
    ) as data
FROM bookmarks b, last_sync ls
WHERE b.user_id = $1
    AND b.updated_at > ls.sync_time
UNION ALL
SELECT 
    'folder' as type,
    f.id,
    f.sync_version,
    f.updated_at,
    f.device_id,
    jsonb_build_object(
        'name', f.name,
        'parent_id', f.parent_id,
        'position', f.position
    ) as data
FROM folders f, last_sync ls
WHERE f.user_id = $1
    AND f.updated_at > ls.sync_time
ORDER BY updated_at;

-- Apply batch of changes
WITH batch_data AS (
    SELECT jsonb_array_elements($1::jsonb) as change
), applied_changes AS (
    INSERT INTO version_control (
        entity_id,
        entity_type,
        user_id,
        version,
        change_type,
        new_data,
        device_id
    )
    SELECT 
        (change->>'id')::uuid,
        change->>'type',
        $2,  -- user_id
        (change->>'version')::integer,
        change->>'change_type',
        change->'data',
        $3   -- device_id
    FROM batch_data
    RETURNING entity_id, entity_type
)
SELECT count(*) as applied_count FROM applied_changes;
```

### Search and Retrieval
```sql
-- Full-text search with ranking
SELECT 
    b.id,
    b.title,
    b.url,
    b.description,
    ts_rank(
        setweight(to_tsvector('bookmarks_search', coalesce(b.title,'')), 'A') ||
        setweight(to_tsvector('bookmarks_search', coalesce(b.description,'')), 'B') ||
        setweight(to_tsvector('bookmarks_search', coalesce(b.url,'')), 'C'),
        plainto_tsquery('bookmarks_search', $1)
    ) as rank
FROM bookmarks b
WHERE b.user_id = $2
    AND b.deleted_at IS NULL
    AND (
        to_tsvector('bookmarks_search', coalesce(b.title,'')) ||
        to_tsvector('bookmarks_search', coalesce(b.description,'')) ||
        to_tsvector('bookmarks_search', coalesce(b.url,''))
    ) @@ plainto_tsquery('bookmarks_search', $1)
ORDER BY rank DESC
LIMIT $3 OFFSET $4;

-- Get folder tree with bookmark counts
WITH RECURSIVE folder_tree AS (
    SELECT 
        f.id,
        f.name,
        f.parent_id,
        f.path,
        0 as level
    FROM folders f
    WHERE f.user_id = $1 AND f.parent_id IS NULL
    UNION ALL
    SELECT 
        f.id,
        f.name,
        f.parent_id,
        f.path,
        ft.level + 1
    FROM folders f
    JOIN folder_tree ft ON f.parent_id = ft.id
)
SELECT 
    ft.*,
    count(b.id) as bookmark_count
FROM folder_tree ft
LEFT JOIN bookmarks b ON b.folder_id = ft.id
WHERE b.deleted_at IS NULL
GROUP BY ft.id, ft.name, ft.parent_id, ft.path, ft.level
ORDER BY ft.path;
```

## Analytics Queries

### User Analytics
```sql
-- User activity summary
SELECT 
    u.id,
    u.email,
    u.created_at,
    u.subscription_type,
    count(DISTINCT b.id) as bookmark_count,
    count(DISTINCT f.id) as folder_count,
    count(DISTINCT d.id) as device_count,
    max(s.last_activity) as last_activity,
    jsonb_agg(DISTINCT jsonb_build_object(
        'device_id', d.device_id,
        'browser', d.browser,
        'os', d.os,
        'last_sync', d.last_sync
    )) as devices
FROM users u
LEFT JOIN bookmarks b ON b.user_id = u.id AND b.deleted_at IS NULL
LEFT JOIN folders f ON f.user_id = u.id AND f.deleted_at IS NULL
LEFT JOIN devices d ON d.user_id = u.id AND d.is_active = true
LEFT JOIN sessions s ON s.user_id = u.id
WHERE u.id = $1
GROUP BY u.id;

-- Sync statistics
SELECT 
    date_trunc('day', created_at) as sync_date,
    count(*) as sync_count,
    sum(changes_count) as total_changes,
    count(*) FILTER (WHERE status = 'success') as successful_syncs,
    count(*) FILTER (WHERE status = 'failed') as failed_syncs,
    avg(
        EXTRACT(EPOCH FROM (completed_at - created_at))
    ) as avg_sync_duration
FROM sync_history
WHERE user_id = $1
GROUP BY date_trunc('day', created_at)
ORDER BY sync_date DESC;
```

### System Analytics
```sql
-- Overall system usage
SELECT
    count(DISTINCT u.id) as total_users,
    count(DISTINCT u.id) FILTER (
        WHERE u.created_at > now() - interval '24 hours'
    ) as new_users_24h,
    count(DISTINCT s.id) FILTER (
        WHERE s.last_activity > now() - interval '1 hour'
    ) as active_users_1h,
    count(DISTINCT b.id) as total_bookmarks,
    count(DISTINCT f.id) as total_folders,
    count(DISTINCT d.id) as total_devices
FROM users u
LEFT JOIN sessions s ON s.user_id = u.id
LEFT JOIN bookmarks b ON b.user_id = u.id AND b.deleted_at IS NULL
LEFT JOIN folders f ON f.user_id = u.id AND f.deleted_at IS NULL
LEFT JOIN devices d ON d.user_id = u.id AND d.is_active = true
WHERE u.status = 'active';

-- Error monitoring
SELECT
    date_trunc('hour', created_at) as error_hour,
    status,
    count(*) as error_count,
    array_agg(DISTINCT error_details) as unique_errors
FROM sync_history
WHERE status = 'failed'
    AND created_at > now() - interval '24 hours'
GROUP BY date_trunc('hour', created_at), status
ORDER BY error_hour DESC;
```