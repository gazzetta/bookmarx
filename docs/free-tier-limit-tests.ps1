# BookMarx Free-Tier Limit Tests
# Pre-requisite: app_settings has `free_bookmark_limit=10` and `free_browser_limit=2`

$ErrorActionPreference = 'Stop'
$BASE = 'http://localhost:3005'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param($Section, $Test, $Status, $Detail = '')
    $results.Add([pscustomobject]@{ Section = $Section; Test = $Test; Status = $Status; Detail = $Detail })
}

function Invoke-Api {
    param([string]$Method='GET',[string]$Path,[string]$Token=$null,$Body=$null,[hashtable]$ExtraHeaders=@{})
    $uri = "$BASE$Path"
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }
    $params = @{ Uri=$uri; Method=$Method; Headers=$headers; UseBasicParsing=$true; ErrorAction='Stop' }
    if ($Body -ne $null) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $r = Invoke-WebRequest @params
        return @{ Status=[int]$r.StatusCode; Body=($r.Content | ConvertFrom-Json -ErrorAction SilentlyContinue) }
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        $body = $null
        try { $body = ($_.ErrorDetails.Message | ConvertFrom-Json) } catch {}
        return @{ Status=$code; Body=$body; Error=$_.Exception.Message }
    }
}

# Verify the test environment: confirm config now reflects free_bookmark_limit=10
Write-Host '== Checking active app config ==' -ForegroundColor Cyan
$cfg = Invoke-Api -Path '/api/v1/config'
$activeFreeBookmarkLimit = $cfg.Body.data.limits.free.bookmarks
$activeFreeBrowserLimit = $cfg.Body.data.limits.free.browsers
Write-Host "Active free bookmark limit: $activeFreeBookmarkLimit"
Write-Host "Active free browser limit:  $activeFreeBrowserLimit"

if ($activeFreeBookmarkLimit -ne 10) {
    Write-Host "ABORT: Expected free bookmark limit to be 10 (got $activeFreeBookmarkLimit). Insert app_settings row first." -ForegroundColor Red
    exit 1
}

# Create a brand-new free user with no bookmarks
$rndEmail = "qa+limit+$(Get-Random)@bookmarx.local"
Write-Host "`n== Registering test user $rndEmail ==" -ForegroundColor Cyan
$reg = Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body @{ email=$rndEmail; password='Bookmarx!234' }
if ($reg.Status -notin 200,201) {
    Write-Host "Register failed: $($reg.Status) $($reg.Body | ConvertTo-Json)" -ForegroundColor Red; exit 1
}
$FT = $reg.Body.data.token
$userInfo = Invoke-Api -Path '/api/v1/auth/me' -Token $FT
Write-Host "User isPremium: $($userInfo.Body.data.isPremium)"
Write-Host "User effective bookmarkLimit: $($userInfo.Body.data.bookmarkLimit)"
if ($userInfo.Body.data.bookmarkLimit -ne 10) {
    Write-Host "WARNING: User auth/me reports bookmarkLimit $($userInfo.Body.data.bookmarkLimit), expected 10" -ForegroundColor Yellow
}

# Helper to build initial sync body with N bookmarks
function New-InitialSyncBody {
    param([int]$BookmarkCount, [string]$BrowserId, [string]$DeviceId)
    $now = [int][double]::Parse((Get-Date -UFormat %s)) * 1000
    $bookmarks = @()
    for ($i = 0; $i -lt $BookmarkCount; $i++) {
        $bookmarks += @{
            id = "bm-$i-$(Get-Random)"
            url = "https://example.com/auto-test/$i"
            title = "Auto Test Bookmark $i"
            parentId = '1'
            index = $i
            position = $i
            dateAdded = $now
        }
    }
    return @{
        bookmarks = $bookmarks
        folders = @()
        deviceId = $DeviceId
        metadata = @{
            timestamp = [int][double]::Parse((Get-Date -UFormat %s))
            userAgent = 'BookMarx-QA-PowerShell/1.0'
            deviceInfo = @{
                browserInstanceId = $BrowserId
                deviceId = $DeviceId
                browser = 'qa-test-chrome'
                browserVersion = '999.0.0.0'
                os = 'windows'
                osVersion = '10/11'
            }
        }
    }
}

# Test 1: Try to upload 11 bookmarks (limit is 10) → expect 403 BOOKMARK_LIMIT_REACHED
Write-Host "`n== Test 1: Upload 11 bookmarks via /sync/initial (limit=10) ==" -ForegroundColor Cyan
$bid1 = [guid]::NewGuid().ToString()
$did1 = [guid]::NewGuid().ToString()
$body11 = New-InitialSyncBody -BookmarkCount 11 -BrowserId $bid1 -DeviceId $did1
$r11 = Invoke-Api -Method POST -Path '/api/v1/sync/initial' -Token $FT -Body $body11
Write-Host "Status: $($r11.Status)"
Write-Host "Body:   $($r11.Body | ConvertTo-Json -Compress -Depth 5)"
if ($r11.Status -eq 403 -and $r11.Body.error.code -eq 'BOOKMARK_LIMIT_REACHED') {
    Add-Result '2.6' 'Free user with 11>10 bookmarks gets BOOKMARK_LIMIT_REACHED' 'PASS' "limit=$($r11.Body.error.limit) attemptedToAdd=$($r11.Body.error.attemptedToAdd)"
    if ($r11.Body.error.upgradeUrl) {
        Add-Result '2.6' 'Error message includes upgrade link' 'PASS' "upgradeUrl=$($r11.Body.error.upgradeUrl)"
    } else {
        Add-Result '2.6' 'Error message includes upgrade link' 'FAIL' 'no upgradeUrl in response'
    }
} else {
    Add-Result '2.6' 'Free user with 11>10 bookmarks gets BOOKMARK_LIMIT_REACHED' 'FAIL' "Status=$($r11.Status) Code=$($r11.Body.error.code)"
}

# Test 2: Upload exactly 10 bookmarks (at limit) → expect success
Write-Host "`n== Test 2: Upload 10 bookmarks (at limit) ==" -ForegroundColor Cyan
# Use a fresh user to start clean
$rndEmail2 = "qa+limit2+$(Get-Random)@bookmarx.local"
$reg2 = Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body @{ email=$rndEmail2; password='Bookmarx!234' }
$FT2 = $reg2.Body.data.token
$bid2 = [guid]::NewGuid().ToString()
$did2 = [guid]::NewGuid().ToString()
$body10 = New-InitialSyncBody -BookmarkCount 10 -BrowserId $bid2 -DeviceId $did2
$r10 = Invoke-Api -Method POST -Path '/api/v1/sync/initial' -Token $FT2 -Body $body10
Write-Host "Status: $($r10.Status)"
if ($r10.Status -in 200,201) {
    Add-Result '2.6' 'Free user with 10 bookmarks (at limit) succeeds' 'PASS' "Status=$($r10.Status)"
} else {
    Add-Result '2.6' 'Free user with 10 bookmarks (at limit) succeeds' 'FAIL' "Status=$($r10.Status) Body=$($r10.Body | ConvertTo-Json -Compress)"
}

# Test 3: Already at 10, try to add 1 more via /sync/merge → expect 403
Write-Host "`n== Test 3: User at 10 bookmarks tries to merge 1 more ==" -ForegroundColor Cyan
$mergeBody = @{
    bookmarks = @(@{
        id = "bm-extra-$(Get-Random)"
        url = 'https://example.com/extra-bookmark'
        title = 'One More Bookmark'
        parentId = '1'
        index = 0
        position = 0
        dateAdded = ([int][double]::Parse((Get-Date -UFormat %s)) * 1000)
    })
    folders = @()
    deviceId = $did2
    metadata = @{
        timestamp = [int][double]::Parse((Get-Date -UFormat %s))
        userAgent = 'BookMarx-QA-PowerShell/1.0'
        deviceInfo = @{
            browserInstanceId = $bid2
            deviceId = $did2
            browser = 'qa-test-chrome'
            browserVersion = '999.0.0.0'
            os = 'windows'
            osVersion = '10/11'
        }
    }
}
$rMerge = Invoke-Api -Method POST -Path '/api/v1/sync/merge' -Token $FT2 -Body $mergeBody
Write-Host "Status: $($rMerge.Status)"
Write-Host "Body:   $($rMerge.Body | ConvertTo-Json -Compress -Depth 4)"
if ($rMerge.Status -eq 403 -and $rMerge.Body.error.code -eq 'BOOKMARK_LIMIT_REACHED') {
    Add-Result '2.6' 'Adding 1 more when already at limit returns BOOKMARK_LIMIT_REACHED' 'PASS' ''
} else {
    Add-Result '2.6' 'Adding 1 more when already at limit returns BOOKMARK_LIMIT_REACHED' 'FAIL' "Status=$($rMerge.Status) Code=$($rMerge.Body.error.code)"
}

# Test 4: Browser limit. Free limit = 2. Register browsers 1 & 2, then try a 3rd → expect 403 BROWSER_LIMIT_REACHED
Write-Host "`n== Test 4: Free-tier 3rd browser registration blocked ==" -ForegroundColor Cyan
# Use fresh user to avoid pollution
$rndEmail3 = "qa+browsers+$(Get-Random)@bookmarx.local"
$reg3 = Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body @{ email=$rndEmail3; password='Bookmarx!234' }
$FT3 = $reg3.Body.data.token

# Register 1st browser via initial sync (uses checkBrowserLimit middleware)
$b1 = [guid]::NewGuid().ToString(); $d1 = [guid]::NewGuid().ToString()
$body_b1 = New-InitialSyncBody -BookmarkCount 0 -BrowserId $b1 -DeviceId $d1
# Override deviceInfo to make each fingerprint unique (different OS versions)
$body_b1.metadata.deviceInfo.osVersion = 'win-1'; $body_b1.metadata.deviceInfo.browser = 'chrome'
$r_b1 = Invoke-Api -Method POST -Path '/api/v1/sync/initial' -Token $FT3 -Body $body_b1
Write-Host "  1st browser status: $($r_b1.Status)"

# 2nd browser
$b2 = [guid]::NewGuid().ToString(); $d2 = [guid]::NewGuid().ToString()
$body_b2 = New-InitialSyncBody -BookmarkCount 0 -BrowserId $b2 -DeviceId $d2
$body_b2.metadata.deviceInfo.osVersion = 'win-2'; $body_b2.metadata.deviceInfo.browser = 'firefox'
$r_b2 = Invoke-Api -Method POST -Path '/api/v1/sync/initial' -Token $FT3 -Body $body_b2
Write-Host "  2nd browser status: $($r_b2.Status)"

# 3rd browser → should be blocked
$b3 = [guid]::NewGuid().ToString(); $d3 = [guid]::NewGuid().ToString()
$body_b3 = New-InitialSyncBody -BookmarkCount 0 -BrowserId $b3 -DeviceId $d3
$body_b3.metadata.deviceInfo.osVersion = 'win-3'; $body_b3.metadata.deviceInfo.browser = 'edge'
$r_b3 = Invoke-Api -Method POST -Path '/api/v1/sync/initial' -Token $FT3 -Body $body_b3
Write-Host "  3rd browser status: $($r_b3.Status)"
Write-Host "  3rd browser body: $($r_b3.Body | ConvertTo-Json -Compress -Depth 4)"

if ($r_b3.Status -eq 403 -and $r_b3.Body.error.code -eq 'BROWSER_LIMIT_REACHED') {
    Add-Result '2.6' 'Free 3rd browser registration returns BROWSER_LIMIT_REACHED' 'PASS' ''
    if ($r_b3.Body.error.upgradeUrl) {
        Add-Result '2.6' 'Browser-limit error includes upgrade link' 'PASS' ''
    } else {
        Add-Result '2.6' 'Browser-limit error includes upgrade link' 'FAIL' 'no upgradeUrl in response'
    }
} else {
    Add-Result '2.6' 'Free 3rd browser registration returns BROWSER_LIMIT_REACHED' 'FAIL' "Status=$($r_b3.Status) Code=$($r_b3.Body.error.code)"
}

# Print summary
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host 'FREE-TIER LIMIT TEST RESULTS' -ForegroundColor Yellow
Write-Host '========================================' -ForegroundColor Yellow
$results | Format-Table -AutoSize

$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Host "PASS: $pass    FAIL: $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })

# Cleanup test users
Write-Host "`n== Test users created (will need to be cleaned up manually or via DB) ==" -ForegroundColor Yellow
Write-Host "  $rndEmail"
Write-Host "  $rndEmail2"
Write-Host "  $rndEmail3"

$results | ConvertTo-Json -Depth 4 | Out-File 'docs/free-tier-limit-results.json' -Encoding utf8
