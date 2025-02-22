## Revert to remote

# First, fetch the latest state from remote
git fetch --all

# Then reset to origin/master (this will overwrite local changes)
git reset --hard origin/master

# Clean up any untracked files and directories
git clean -fd

## Clean DB

DELETE FROM sync_history_errors;
DELETE FROM sync_history;
DELETE FROM bookmarks;
DELETE FROM folders;
DELETE FROM browsers;
