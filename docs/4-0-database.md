```markdown
# BookMarx Database Design

## Core Database Schema

### User Management
```sql
-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    auth_type VARCHAR(20) NOT NULL DEFAULT 'local', -- local, google, apple, facebook
    auth_provider_id VARCHAR(255),
    subscription_type VARCHAR(20) DEFAULT 'free',   -- free, pro
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' -- active, suspended, deleted
);

-- Sessions Table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB,  -- browser, os, etc
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Bookmark System
```sql
-- Folders Table
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    device_id VARCHAR(255),
    deleted_at TIMESTAMP WITH TIME ZONE,
    path ltree,  -- Materialized path for efficient tree operations
    CONSTRAINT valid_position CHECK (position >= 0)
);

-- Bookmarks Table
CREATE TABLE bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    device_id VARCHAR(255),
    deleted_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,  -- Flexible storage for additional bookmark data
    CONSTRAINT valid_position CHECK (position >= 0),
    CONSTRAINT valid_url CHECK (url ~ '^https?://.+')
);
```

### Sync Management
```sql
-- Sync History Table
CREATE TABLE sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    sync_type VARCHAR(50) NOT NULL,  -- manual, auto, merge
    status VARCHAR(50) NOT NULL,     -- success, failed, partial
    changes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_details TEXT,
    metadata JSONB  -- Additional sync metadata
);

-- Devices Table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    browser VARCHAR(50),
    os VARCHAR(50),
    last_sync TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    UNIQUE(user_id, device_id)
);

-- Version Control Table
CREATE TABLE version_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(20) NOT NULL, -- bookmark, folder
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    change_type VARCHAR(20) NOT NULL, -- create, update, delete, move
    previous_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device_id VARCHAR(255)
);
```

### Payment System
```sql
-- Payments Table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL,  -- paypal
    provider_transaction_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,          -- success, failed, pending
    subscription_period_start TIMESTAMP WITH TIME ZONE,
    subscription_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Subscriptions Table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_type VARCHAR(20) NOT NULL, -- monthly, yearly, lifetime
    status VARCHAR(20) NOT NULL,    -- active, cancelled, expired
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);
```

### Backup System
```sql
-- Backups Table
CREATE TABLE backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    size_bytes INTEGER NOT NULL,
    bookmark_count INTEGER NOT NULL,
    folder_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    backup_type VARCHAR(20) NOT NULL,     -- manual, auto
    status VARCHAR(20) NOT NULL,          -- pending, complete, failed
    download_url TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);
```

## Indexes

### Performance Indexes
```sql
-- User Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_provider ON users(auth_type, auth_provider_id);
CREATE INDEX idx_users_subscription ON users(subscription_type, status);

-- Session Indexes
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- Bookmark Indexes
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_folder ON bookmarks(folder_id);
CREATE INDEX idx_bookmarks_sync ON bookmarks(user_id, sync_version);
CREATE INDEX idx_bookmarks_url ON bookmarks USING gin (to_tsvector('english', url));
CREATE INDEX idx_bookmarks_title ON bookmarks USING gin (to_tsvector('english', title));

-- Folder Indexes
CREATE INDEX idx_folders_user ON folders(user_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_path ON folders USING gist(path);
CREATE INDEX idx_folders_sync ON folders(user_id, sync_version);

-- Device Indexes
CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_device ON devices(device_id);
CREATE UNIQUE INDEX idx_devices_user_device ON devices(user_id, device_id);

-- Sync History Indexes
CREATE INDEX idx_sync_history_user ON sync_history(user_id);
CREATE INDEX idx_sync_history_device ON sync_history(device_id);
CREATE INDEX idx_sync_history_status ON sync_history(status);

-- Version Control Indexes
CREATE INDEX idx_version_control_entity ON version_control(entity_id, entity_type);
CREATE INDEX idx_version_control_user ON version_control(user_id);
```

### Full-Text Search Configuration
```sql
-- Create text search configurations
CREATE TEXT SEARCH CONFIGURATION bookmarks_search (COPY = english);

-- Create text search indexes
CREATE INDEX idx_bookmarks_search ON bookmarks USING gin(
    setweight(to_tsvector('bookmarks_search', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('bookmarks_search', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('bookmarks_search', coalesce(url,'')), 'C')
);
```

## Triggers

### Automatic Timestamp Updates
```sql
-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for each table
CREATE TRIGGER update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_bookmarks_timestamp
    BEFORE UPDATE ON bookmarks
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_folders_timestamp
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
```

### Path Maintenance
```sql
-- Function to update folder paths
CREATE OR REPLACE FUNCTION update_folder_path()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path = text2ltree(NEW.id::text);
    ELSE
        SELECT path || text2ltree(NEW.id::text)
        INTO NEW.path
        FROM folders
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for folder path updates
CREATE TRIGGER maintain_folder_paths
    BEFORE INSERT OR UPDATE OF parent_id ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_folder_path();
```

### Version Control
```sql
-- Function to track version changes
CREATE OR REPLACE FUNCTION track_version_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO version_control (
        entity_id,
        entity_type,
        user_id,
        version,
        change_type,
        previous_data,
        new_data,
        device_id
    ) VALUES (
        NEW.id,
        TG_TABLE_NAME,
        NEW.user_id,
        NEW.sync_version,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'create'
            WHEN TG_OP = 'UPDATE' THEN 'update'
            ELSE 'delete'
        END,
        CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
        row_to_json(NEW),
        NEW.device_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Version control triggers
CREATE TRIGGER track_bookmark_versions
    AFTER INSERT OR UPDATE ON bookmarks
    FOR EACH ROW
    EXECUTE FUNCTION track_version_changes();

CREATE TRIGGER track_folder_versions
    AFTER INSERT OR UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION track_version_changes();
```

This database design provides:
1. Efficient data storage
2. Robust relationship management
3. Performance optimization
4. Version control
5. Full-text search
6. Automatic maintenance
7. Data integrity
```