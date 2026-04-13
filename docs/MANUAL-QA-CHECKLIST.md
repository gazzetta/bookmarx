# BookMarx - Comprehensive Manual QA Test Plan

Use this checklist to validate ALL extension and website functionality.  
**Environment:** Local API on `http://localhost:3005`, Website on `http://localhost:3006`.

**Test Account (always premium):** `gas@gasdigital.co.uk`  
**Secondary Free Account:** Create a fresh account for free-tier testing.

---

## Pre-flight Setup

- [ ] `src/website`: run `npm run dev` (unified Next.js + API on ports 3005/3006)
- [ ] `src/extension`: run `npm run build`
- [ ] Load extension unpacked in at least one Chromium browser (`src/extension/dist`)
- [ ] Optionally load Firefox build (`src/extension/dist-firefox`)
- [ ] Confirm two accounts available:
  - [ ] `gas@gasdigital.co.uk` (always-premium test account)
  - [ ] A separate free-tier account (create fresh if needed)
- [ ] Clear browser bookmark bar to a known state before sync tests

---

## PART 1: WEBSITE TESTS

---

### 1.1 Public Pages (No Auth Required)

#### Landing Page (`/`)
- [ ] Page loads without errors
- [ ] Hero section displays correctly
- [ ] CTA buttons ("Get Started", "Sign In") work
- [ ] Navigation links are functional
- [ ] Footer renders and links work
- [ ] Theme toggle (light/dark) switches theme correctly
- [ ] Theme persists after page refresh

#### Privacy Policy (`/privacy`)
- [ ] Page loads and all sections render
- [ ] App name displays correctly (from config)
- [ ] Top nav "Sign In" / "Get Started" links work

#### Terms of Service (`/terms`)
- [ ] Page loads and all sections render
- [ ] App name displays correctly (from config)
- [ ] Top nav "Sign In" / "Get Started" links work

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.2 Authentication

#### Registration (`/register`)
- [ ] Page loads with email, password, confirm password fields
- [ ] Submitting with empty fields shows validation error
- [ ] Password mismatch shows error
- [ ] Password less than 8 chars shows error
- [ ] Successful registration redirects to `/dashboard`
- [ ] Registering with existing email shows "already registered" error
- [ ] Google Sign-Up button appears and works (if configured)
- [ ] "Already have an account?" link goes to `/login`
- [ ] Terms and Privacy links work
- [ ] `?plan=premium` query param redirects to subscription page after signup

#### Login (`/login`)
- [ ] Page loads with email and password fields
- [ ] Submitting with empty fields shows validation error
- [ ] Wrong credentials show "Invalid credentials" error
- [ ] Successful login redirects to `/dashboard`
- [ ] Show/hide password toggle works
- [ ] Google Sign-In button appears and works (if configured)
- [ ] "Forgot password?" link goes to `/forgot-password`
- [ ] "Create account" link goes to `/register`
- [ ] Login with `gas@gasdigital.co.uk` shows premium status

#### Forgot Password (`/forgot-password`)
- [ ] Page loads with email field
- [ ] Submitting with empty email shows error
- [ ] Submitting with valid email shows "Check your inbox" message
- [ ] Submitting with non-existent email still shows success (no enumeration)
- [ ] "Try again" option works

#### Reset Password (`/reset-password`)
- [ ] Page loads when `?token=...` is present
- [ ] New password + confirm password fields work
- [ ] Password mismatch shows error
- [ ] Password less than 8 chars shows error
- [ ] Invalid/expired token shows error
- [ ] Successful reset redirects to `/login` after 3 seconds
- [ ] Using same reset link twice shows "already used" error

#### Logout
- [ ] Clicking "Sign out" from user menu logs out
- [ ] Redirects to login page
- [ ] Accessing protected pages after logout redirects to `/login`
- [ ] Token is cleared from localStorage

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.3 Dashboard (`/dashboard`)

#### Auth Guard
- [ ] Unauthenticated users redirected to `/login`

#### Stats Display
- [ ] Bookmark count displays correctly
- [ ] Browser count displays correctly
- [ ] Collection count displays correctly
- [ ] Usage progress bar shows correct percentage
- [ ] Progress bar color changes at 70% and 90% thresholds

#### Quick Actions
- [ ] "Get Extension" links to `/install`
- [ ] "View Collections" links to `/collections`
- [ ] "Edit Collection" links to `/collections/default/edit` (premium only)
- [ ] "Session History" links to `/sessions` (premium only)
- [ ] "Settings" links to `/settings`

#### Premium vs Free Display
- [ ] **Free user:** Upgrade banner shown, edit/sessions actions gated
- [ ] **Premium user (`gas@gasdigital.co.uk`):** No upgrade banner, all actions available

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.4 Collections

#### Collections List (`/collections`)
- [ ] Auth required (redirect to login if not)
- [ ] Lists all user's collections
- [ ] Default collection shown with badge
- [ ] Collection name and description display correctly
- [ ] "View" button opens `/collections/[id]`
- [ ] Collection slot count displays (e.g., "1 / 1")

##### Premium-Only Actions
- [ ] **Premium:** "New Collection" button visible and functional
- [ ] **Premium:** "Organize" (edit) button visible and links to editor
- [ ] **Free:** "New Collection" button hidden or shows upgrade prompt
- [ ] **Free:** "Organize" button disabled or shows upgrade prompt

#### Collection View (`/collections/[id]`)
- [ ] Auth required
- [ ] Collection name displays as header
- [ ] Hierarchical tree of folders and bookmarks renders
- [ ] Folders expand/collapse on click
- [ ] Clicking bookmark opens URL in new tab
- [ ] Search field filters by title and URL
- [ ] Search highlights matching results
- [ ] Empty search shows all items
- [ ] **Premium:** "Modify Collection" button links to editor
- [ ] **Free:** "Upgrade to Edit" button shown instead

#### Collection Editor (`/collections/[id]/edit`)
- [ ] Auth required
- [ ] **Free users redirected** to collection view (not the editor)
- [ ] **Premium:** Editor loads with full tree

##### Drag & Drop
- [ ] Drag bookmark to different folder works
- [ ] Drag folder to reorder works
- [ ] Visual feedback during drag (highlight target)
- [ ] Changes tracked as pending

##### Editing Actions
- [ ] Double-click title to rename item
- [ ] Double-click URL to edit bookmark URL
- [ ] "New Folder" button creates folder (via modal)
- [ ] "New Link" button creates bookmark (via modal)
- [ ] Delete single item (with confirmation dialog)

##### Multi-Select & Bulk Actions
- [ ] Checkboxes appear on items
- [ ] Select multiple items
- [ ] "Clear Selection" works
- [ ] "Purge Items" deletes selected (with confirmation)

##### Save & Revert
- [ ] Pending changes indicator shows count
- [ ] "Save" / "Commit changes" persists to server
- [ ] After save, refreshing page shows saved state
- [ ] "Discard" / "Revert" undoes all pending changes
- [ ] Navigating away with unsaved changes shows warning (if implemented)

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.5 Sessions (Premium Only)

#### Sessions List (`/sessions`)
- [ ] **Free users redirected** to dashboard
- [ ] **Premium:** Lists session history
- [ ] Session cards show: source browser, type, date, item count
- [ ] Session types display correctly: "Initial Sync", "Merge", "Manual Edit"
- [ ] Clicking session opens `/sessions/[id]`
- [ ] Info text about rollback behavior displayed

#### Session Detail (`/sessions/[id]`)
- [ ] **Free users redirected** or blocked
- [ ] Session summary shows: type, source browser, date
- [ ] Item counts: total, folders, bookmarks
- [ ] List of folders and bookmarks in session displayed

##### Rollback
- [ ] "Rollback" button visible for non-rolled-back sessions
- [ ] Clicking rollback removes items added in that session
- [ ] Session state updates to "rolled back"
- [ ] Confirmation required before rollback

##### Restore
- [ ] "Restore" button visible for rolled-back sessions
- [ ] Clicking restore re-adds previously rolled-back items
- [ ] Session state updates back to normal

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.6 Settings

#### Subscription (`/settings/subscription`)
- [ ] Auth required
- [ ] **Free user:** Shows "Free" plan, limits displayed
- [ ] **Free user:** Upgrade options shown (Monthly, Yearly, Lifetime)
- [ ] **Free user:** Checkout links work (go to Polar)
- [ ] **Premium user:** Shows "Premium" plan
- [ ] **Premium user:** Expiry date or "Lifetime Access" shown
- [ ] **Premium user:** Link to Polar billing portal works
- [ ] Feature comparison table renders correctly
- [ ] FAQ section renders
- [ ] "Refresh" button re-fetches user status
- [ ] `gas@gasdigital.co.uk` always shows as Premium

#### Manage Browsers (`/settings/browsers`)
- [ ] Auth required
- [ ] Lists all connected browser instances
- [ ] Per browser shows: browser type, version, OS, last seen time
- [ ] "Online" badge for browsers seen in last hour
- [ ] "Disconnect" button removes browser (with confirmation)
- [ ] After disconnect, browser disappears from list
- [ ] Usage count vs limit shown (e.g., "2 / 2")
- [ ] **Free user near limit:** Upgrade prompt shown
- [ ] Help text explains how browser connections work

#### Install Page (`/install`)
- [ ] Auth required
- [ ] Store links for Chrome, Firefox, Edge displayed (if configured)
- [ ] Steps after install are clear
- [ ] "Back to Dashboard" link works

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 1.7 Dashboard Layout & Navigation

- [ ] Logo links to dashboard
- [ ] Nav links work: Dashboard, Collections, Manage Browsers, Subscription
- [ ] **Premium:** "Sessions" nav link visible
- [ ] **Free:** "Sessions" nav link hidden
- [ ] Premium badge shown for premium users
- [ ] "Upgrade" link shown for free users
- [ ] User menu dropdown opens on click
- [ ] User menu shows: email, plan info
- [ ] User menu links work: Dashboard, Collections, Subscription, Browsers
- [ ] "Sign out" in user menu works
- [ ] Footer renders on all dashboard pages
- [ ] Theme toggle persists across navigation
- [ ] Responsive layout works on mobile viewport

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## PART 2: EXTENSION TESTS

---

### 2.1 Extension Installation

#### Chrome / Brave / Edge (Chromium)
- [ ] Extension loads from `src/extension/dist` without errors
- [ ] Extension icon appears in toolbar
- [ ] No console errors on load

#### Firefox
- [ ] Extension loads from `src/extension/dist-firefox` without errors
- [ ] Extension icon appears in toolbar
- [ ] No console errors on load

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.2 Extension Popup - Authentication

#### Email Login
- [ ] Popup opens and shows login form
- [ ] Email and password fields work
- [ ] Submitting with empty fields shows error
- [ ] Wrong credentials show error
- [ ] Successful login shows authenticated state (email, tier badge)

#### Google Login (Chrome only)
- [ ] "Continue with Google" button visible
- [ ] Google OAuth flow completes successfully
- [ ] User authenticated and shown in popup

#### Email Registration
- [ ] "Create Account" tab/link works
- [ ] Can register new account from popup
- [ ] After registration, popup shows authenticated state

#### Logout
- [ ] "Log out" button visible when logged in
- [ ] Clicking logout returns to login form
- [ ] Auth state cleared from storage

#### Premium Display
- [ ] **Free user:** "Free" tier badge shown
- [ ] **Premium user (`gas@gasdigital.co.uk`):** "Premium" badge shown
- [ ] Upgrade CTA visible for free users
- [ ] Upgrade CTA hidden for premium users

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.3 Extension Popup - Usage Stats

- [ ] Bookmark count shows (X / limit)
- [ ] Collection count shows
- [ ] Browser count shows
- [ ] Stats refresh on popup open
- [ ] Near-limit styling appears when approaching limits
- [ ] At-limit styling appears when at limit

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.4 Sync - Initial Sync / Onboarding

#### First-Time User (Never Synced)
- [ ] Onboarding dialog appears on popup open
- [ ] Three options presented:
  - [ ] **Overwrite Local** – replaces local bookmarks with master collection
  - [ ] **Merge Into Master** – uploads local bookmarks to server
  - [ ] **Cancel** – dismisses dialog
- [ ] "Overwrite Local" works correctly
- [ ] "Merge Into Master" works correctly
- [ ] "Cancel" closes dialog without changes

#### Initial Sync
- [ ] If master collection is empty, initial sync notice shown
- [ ] "Sync Up" triggers initial sync (sends full bookmark tree to server)
- [ ] Success message shown after initial sync
- [ ] Master collection now populated on server

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.5 Sync - Ongoing Operations

#### Sync Up (Push Local Changes)
- [ ] Create a bookmark in browser
- [ ] Open popup, click "Sync Up"
- [ ] Confirmation dialog appears
- [ ] Confirm → sync executes successfully
- [ ] New bookmark appears in master collection (verify via website or master page)

#### Sync Down (Pull Remote Changes)
- [ ] Make a change on the website (e.g., rename bookmark in editor)
- [ ] Open extension popup, click "Sync Down"
- [ ] Change reflected in local bookmarks

#### Individual Change Types
- [ ] **Create bookmark** → syncs up correctly
- [ ] **Create folder** → syncs up correctly
- [ ] **Rename bookmark** → syncs up correctly
- [ ] **Move bookmark to different folder** → syncs up correctly
- [ ] **Delete bookmark** → syncs up correctly
- [ ] **Delete folder** → syncs up correctly

#### Sync Status
- [ ] Last sync time displays correctly
- [ ] "Syncing..." state shown during sync
- [ ] Error state shown if sync fails
- [ ] Pending changes count updates in real-time

#### Overwrite from Master
- [ ] "Overwrite from Master Collection" button visible
- [ ] Confirmation dialog appears
- [ ] Local bookmarks replaced with master collection contents
- [ ] Folder structure matches master collection

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.6 Sync - Limit Enforcement

#### Bookmark Limit (Free User)
- [ ] Free user with >250 bookmarks gets `BOOKMARK_LIMIT_REACHED` error
- [ ] Error message shows upgrade link
- [ ] Clicking upgrade link opens website

#### Browser Limit (Free User)
- [ ] Free user installing on 3rd browser gets `BROWSER_LIMIT_REACHED` error
- [ ] Error message shows upgrade link

#### Premium User Limits
- [ ] Premium user (`gas@gasdigital.co.uk`) can sync >250 bookmarks
- [ ] Premium user can use multiple browsers without limit
- [ ] No upgrade prompts shown

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.7 Master Collection Page

- [ ] "View Master Collection" button opens full-page view
- [ ] Tree structure renders with folders and bookmarks
- [ ] Folders expand/collapse
- [ ] Clicking bookmark opens URL in new tab
- [ ] Source browser pill shown per bookmark
- [ ] Date shown per bookmark
- [ ] Empty state shown when no bookmarks
- [ ] **Premium:** "Edit in Web" link present, opens `/collections/default/edit`
- [ ] **Free:** "Upgrade to Edit" link present, opens `/settings/subscription`
- [ ] User info (email, timezone) displayed

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 2.8 Extension - Background / Alarms

#### Change Detection
- [ ] Creating a bookmark queues a CREATE change
- [ ] Deleting a bookmark queues a DELETE change
- [ ] Renaming a bookmark queues an UPDATE change
- [ ] Moving a bookmark queues a MOVE change
- [ ] Changes are debounced (rapid edits don't flood queue)

#### Notifications
- [ ] Sync status check alarm fires every 5 minutes
- [ ] Notification shown when new local pending changes detected
- [ ] Notification shown when new remote pending changes detected
- [ ] "Test Notification" debug action works
- [ ] "Reset Notification State" clears stored counts

#### Debug Actions
- [ ] "Debug Storage" logs storage state to console
- [ ] "Debug Bookmark Data" opens debug page with bookmark tree info
- [ ] "Clear Storage" clears all data (with confirmation)
- [ ] Debug page shows: browser info, folder count, bookmark count, folder table, sample bookmarks

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## PART 3: CROSS-BROWSER SYNC

---

### 3.1 Two-Browser Sync

Setup: Install extension in Browser A (e.g., Chrome) and Browser B (e.g., Brave/Edge).
Login with `gas@gasdigital.co.uk` in both.

- [ ] Both browsers register successfully in `/settings/browsers`
- [ ] Create bookmark in Browser A → Sync Up
- [ ] Sync Down in Browser B → bookmark appears
- [ ] Create folder in Browser B → Sync Up
- [ ] Sync Down in Browser A → folder appears
- [ ] Rename item in Browser A → Sync Up → Sync Down in B → rename reflected
- [ ] Delete item in Browser B → Sync Up → Sync Down in A → item removed
- [ ] No duplicate items created after multiple sync cycles
- [ ] Folder hierarchy maintained across browsers

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 3.2 Cross-Browser Folder Mapping

- [ ] Bookmarks Bar (Chrome) maps to Toolbar (Firefox)
- [ ] Other Bookmarks (Chrome) maps to Other (Firefox)
- [ ] Root folder structure preserved across browser types
- [ ] Nested folders maintain hierarchy

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## PART 4: PREMIUM ACCOUNT VERIFICATION

---

### 4.1 Always-Premium Account (`gas@gasdigital.co.uk`)

#### Website
- [ ] Login shows premium tier
- [ ] Dashboard shows premium badge (no upgrade banner)
- [ ] All premium features accessible (sessions, editor, create collections)
- [ ] Subscription page shows "Premium" status
- [ ] No limits enforced on bookmarks/browsers/collections

#### Extension
- [ ] Popup shows "Premium" tier badge
- [ ] No upgrade CTAs shown
- [ ] Sync works without limit errors
- [ ] Master collection page shows "Edit in Web" link

#### API (via curl or extension)
- [ ] `/api/v1/auth/me` returns `isPremium: true`
- [ ] `/api/v1/sessions` returns 200 (not 403)
- [ ] `/api/v1/collections` POST returns 201 (not 403)
- [ ] Sync endpoints work without bookmark/browser limit errors

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

### 4.2 Free Account Verification

#### Website
- [ ] Login shows "Free" tier
- [ ] Dashboard shows upgrade banner
- [ ] Sessions page redirects to dashboard
- [ ] Collection editor redirects to view page
- [ ] "New Collection" hidden or gated
- [ ] Subscription page shows upgrade options

#### Extension
- [ ] Popup shows "Free" tier badge
- [ ] Upgrade CTA visible
- [ ] Sync limits enforced (250 bookmarks, 2 browsers)
- [ ] Master collection page shows "Upgrade to Edit" link

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## PART 5: API SMOKE TESTS

Set tokens for both accounts:

```powershell
# Login and get tokens
# Premium account
$PREMIUM_TOKEN = "<JWT from login with gas@gasdigital.co.uk>"
# Free account
$FREE_TOKEN = "<JWT from login with free account>"
```

---

### 5.1 Auth Endpoints

```powershell
# Register
curl -X POST -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"test1234"}' http://localhost:3005/api/v1/auth/register

# Login
curl -X POST -H "Content-Type: application/json" -d '{"email":"gas@gasdigital.co.uk","password":"<password>"}' http://localhost:3005/api/v1/auth/login

# Get Me
curl -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/auth/me
```

- [ ] Register returns token + user
- [ ] Login returns token + user
- [ ] Get Me returns user with `isPremium: true` for premium account
- [ ] Get Me returns user with `isPremium: false` for free account
- [ ] Invalid token returns 401

---

### 5.2 Premium-Gated Endpoints

#### Sessions (Free → 403, Premium → 200)

```powershell
# Free user
curl -i -H "Authorization: Bearer $FREE_TOKEN" http://localhost:3005/api/v1/sessions
# Expected: 403 PREMIUM_REQUIRED

# Premium user
curl -i -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/sessions
# Expected: 200
```

- [ ] Free user gets 403 on sessions
- [ ] Premium user gets 200 on sessions

#### Collections CRUD (Free → limited, Premium → full access)

```powershell
# Create collection (Premium)
curl -i -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PREMIUM_TOKEN" -d '{"name":"Test Collection"}' http://localhost:3005/api/v1/collections
# Expected: 201

# Create collection (Free - may be blocked by limit or premium gate)
curl -i -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $FREE_TOKEN" -d '{"name":"Test Collection"}' http://localhost:3005/api/v1/collections
# Expected: 403
```

- [ ] Premium can create collections
- [ ] Free user blocked from creating collections

#### Editor Changes

```powershell
curl -i -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $PREMIUM_TOKEN" -d '{"changes":[]}' http://localhost:3005/api/v1/collections/default/changes
```

- [ ] Premium can submit editor changes
- [ ] Free user blocked from submitting editor changes

---

### 5.3 Sync Endpoints

```powershell
# Sync status
curl -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/sync/status

# Config
curl -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/config

# User stats
curl -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/user/stats
```

- [ ] Sync status returns valid response
- [ ] Config returns limits and branding
- [ ] User stats returns bookmark/browser/collection counts

---

### 5.4 Browser Management

```powershell
# List browsers
curl -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/user/browsers

# Disconnect browser (replace :id)
curl -i -X DELETE -H "Authorization: Bearer $PREMIUM_TOKEN" http://localhost:3005/api/v1/user/browsers/:id
```

- [ ] List browsers returns connected instances
- [ ] Disconnect removes browser and returns success

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## PART 6: EDGE CASES & ERROR HANDLING

---

### 6.1 Network Errors
- [ ] Extension popup shows error state when API is down
- [ ] Sync shows error when API unreachable
- [ ] Website shows appropriate error messages on API failure
- [ ] No unhandled exceptions in console

### 6.2 Token Expiry
- [ ] Expired JWT returns 401 from API
- [ ] Website redirects to login on 401
- [ ] Extension popup shows login form on 401

### 6.3 Concurrent Sync
- [ ] Multiple sync operations don't corrupt data
- [ ] Rapid bookmark changes don't cause duplicate entries

### 6.4 Large Data Sets
- [ ] User with many bookmarks (100+) can view master collection
- [ ] Editor handles large trees without freezing
- [ ] Sync handles large change sets

### 6.5 Special Characters
- [ ] Bookmark with special chars in title syncs correctly
- [ ] Folder with unicode name syncs correctly
- [ ] Bookmark URL with query params preserved

**Result:** [ ] PASS  [ ] FAIL  
**Notes:**

---

## RELEASE GATE

Only mark release-ready when ALL of the below are complete:

- [ ] All website page tests passed
- [ ] All authentication flows tested
- [ ] Premium/Free gating correct on all features
- [ ] Extension popup fully functional
- [ ] Sync (up/down/initial/merge/overwrite) all working
- [ ] Cross-browser sync verified
- [ ] `gas@gasdigital.co.uk` confirmed as always-premium
- [ ] API smoke tests passed
- [ ] Edge cases checked
- [ ] No console errors on website or extension

**Final Decision:**
- [ ] RELEASE READY
- [ ] NOT READY

**Tested By:**  
**Date:**  
**Browser(s) Tested:**  
**Notes:**