# BookMarx API Smoke Tests - Automated
# Runs against http://localhost:3005

$ErrorActionPreference = 'Stop'
$BASE = 'http://localhost:3005'
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param($Section, $Test, $Status, $Detail = '')
    $results.Add([pscustomobject]@{ Section = $Section; Test = $Test; Status = $Status; Detail = $Detail })
}

function Invoke-Api {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        [string]$Token = $null,
        $Body = $null,
        [hashtable]$ExtraHeaders = @{}
    )
    $uri = "$BASE$Path"
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }
    $params = @{ Uri = $uri; Method = $Method; Headers = $headers; UseBasicParsing = $true; ErrorAction = 'Stop' }
    if ($Body -ne $null) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $r = Invoke-WebRequest @params
        return @{ Status = [int]$r.StatusCode; Body = ($r.Content | ConvertFrom-Json -ErrorAction SilentlyContinue) }
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        $body = $null
        try { $body = ($_.ErrorDetails.Message | ConvertFrom-Json) } catch {}
        return @{ Status = $code; Body = $body; Error = $_.Exception.Message }
    }
}

Write-Host '== Logging in ==' -ForegroundColor Cyan
$prem = Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body @{ email='qa@bookmarx.cc'; password='bo24618769X.' }
$free = Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body @{ email='qa+free@bookmarx.local'; password='Bookmarx!234' }
$PT = $prem.Body.data.token
$FT = $free.Body.data.token
if (-not $PT -or -not $FT) { Write-Host 'Login failed' -ForegroundColor Red; exit 1 }

# 5.1 Auth
Write-Host '`n== 5.1 Authentication ==' -ForegroundColor Cyan

# Register new user
$rndEmail = "qa+auto+$(Get-Random)@bookmarx.local"
$reg = Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body @{ email=$rndEmail; password='Bookmarx!234' }
if ($reg.Status -in 200,201 -and $reg.Body.data.token) { Add-Result '5.1' 'Register returns token+user' 'PASS' "Status $($reg.Status)" }
else { Add-Result '5.1' 'Register returns token+user' 'FAIL' "Status $($reg.Status) Body=$($reg.Body | ConvertTo-Json -Compress)" }

# Login already verified above
if ($prem.Status -eq 200 -and $PT) { Add-Result '5.1' 'Login returns token+user' 'PASS' "Status $($prem.Status)" }
else { Add-Result '5.1' 'Login returns token+user' 'FAIL' "Status $($prem.Status)" }

# Get Me - premium (response shape: data is user directly)
$me = Invoke-Api -Path '/api/v1/auth/me' -Token $PT
if ($me.Status -eq 200 -and $me.Body.data.isPremium -eq $true) { Add-Result '5.1' 'Get Me isPremium:true (premium)' 'PASS' "tier=$($me.Body.data.subscriptionTier)" }
else { Add-Result '5.1' 'Get Me isPremium:true (premium)' 'FAIL' "Status $($me.Status) tier=$($me.Body.data.subscriptionTier) isPremium=$($me.Body.data.isPremium)" }

# Get Me - free
$meF = Invoke-Api -Path '/api/v1/auth/me' -Token $FT
if ($meF.Status -eq 200 -and $meF.Body.data.isPremium -eq $false) { Add-Result '5.1' 'Get Me isPremium:false (free)' 'PASS' "tier=$($meF.Body.data.subscriptionTier)" }
else { Add-Result '5.1' 'Get Me isPremium:false (free)' 'FAIL' "Status $($meF.Status) isPremium=$($meF.Body.data.isPremium)" }

# Invalid token
$bad = Invoke-Api -Path '/api/v1/auth/me' -Token 'invalid.jwt.token'
if ($bad.Status -eq 401) { Add-Result '5.1' 'Invalid token returns 401' 'PASS' '' }
else { Add-Result '5.1' 'Invalid token returns 401' 'FAIL' "Got $($bad.Status)" }

# 5.2 Premium-Gated Endpoints
Write-Host '`n== 5.2 Premium-Gated Endpoints ==' -ForegroundColor Cyan

$sessFree = Invoke-Api -Path '/api/v1/sessions' -Token $FT
if ($sessFree.Status -eq 403) { Add-Result '5.2' 'Free user 403 on sessions' 'PASS' '' }
else { Add-Result '5.2' 'Free user 403 on sessions' 'FAIL' "Got $($sessFree.Status)" }

$sessPrem = Invoke-Api -Path '/api/v1/sessions' -Token $PT
if ($sessPrem.Status -eq 200) { Add-Result '5.2' 'Premium 200 on sessions' 'PASS' '' }
else { Add-Result '5.2' 'Premium 200 on sessions' 'FAIL' "Got $($sessPrem.Status)" }

# Collections create - premium
$colP = Invoke-Api -Method POST -Path '/api/v1/collections' -Token $PT -Body @{ name='Auto Test Collection' }
if ($colP.Status -in 200,201) { Add-Result '5.2' 'Premium can create collection' 'PASS' "Status $($colP.Status)" }
else { Add-Result '5.2' 'Premium can create collection' 'FAIL' "Status $($colP.Status) Body=$($colP.Body | ConvertTo-Json -Compress)" }
$createdColId = $colP.Body.data.id

# Collections create - free (should fail with 403)
$colF = Invoke-Api -Method POST -Path '/api/v1/collections' -Token $FT -Body @{ name='Free Test Collection' }
if ($colF.Status -eq 403) { Add-Result '5.2' 'Free user 403 on create collection' 'PASS' '' }
else { Add-Result '5.2' 'Free user 403 on create collection' 'FAIL' "Got $($colF.Status)" }

# Editor changes - premium
$chgP = Invoke-Api -Method POST -Path '/api/v1/collections/default/changes' -Token $PT -Body @{ changes=@() }
if ($chgP.Status -in 200,201) { Add-Result '5.2' 'Premium can submit editor changes' 'PASS' '' }
else { Add-Result '5.2' 'Premium can submit editor changes' 'FAIL' "Got $($chgP.Status)" }

# Editor changes - free
$chgF = Invoke-Api -Method POST -Path '/api/v1/collections/default/changes' -Token $FT -Body @{ changes=@() }
if ($chgF.Status -eq 403) { Add-Result '5.2' 'Free user 403 on editor changes' 'PASS' '' }
else { Add-Result '5.2' 'Free user 403 on editor changes' 'FAIL' "Got $($chgF.Status)" }

# 5.3 Sync Endpoints
Write-Host '`n== 5.3 Sync Endpoints ==' -ForegroundColor Cyan

# Sync status requires X-Browser-Instance-Id header. Use first browser from list.
$brsTmp = Invoke-Api -Path '/api/v1/user/browsers' -Token $PT
$bid = $null
if ($brsTmp.Body.data -and @($brsTmp.Body.data).Count -gt 0) { $bid = @($brsTmp.Body.data)[0].browserInstanceId }
if ($bid) {
    $st = Invoke-Api -Path '/api/v1/sync/status' -Token $PT -ExtraHeaders @{ 'X-Browser-Instance-Id' = $bid }
    if ($st.Status -eq 200) { Add-Result '5.3' 'Sync status returns valid response' 'PASS' "bid=$bid" }
    else { Add-Result '5.3' 'Sync status returns valid response' 'FAIL' "Got $($st.Status)" }
    # Bonus: missing header should return 400
    $stMiss = Invoke-Api -Path '/api/v1/sync/status' -Token $PT
    if ($stMiss.Status -eq 400) { Add-Result '5.3' 'Sync status without browser id returns 400' 'PASS' '' }
    else { Add-Result '5.3' 'Sync status without browser id returns 400' 'FAIL' "Got $($stMiss.Status)" }
} else {
    Add-Result '5.3' 'Sync status returns valid response' 'SKIP' 'no browser registered'
    $st = @{ Status = 0 }
}

$cfg = Invoke-Api -Path '/api/v1/config' -Token $PT
if ($cfg.Status -eq 200 -and $cfg.Body.data) { Add-Result '5.3' 'Config returns limits/branding' 'PASS' '' }
else { Add-Result '5.3' 'Config returns limits/branding' 'FAIL' "Got $($cfg.Status)" }

$ust = Invoke-Api -Path '/api/v1/user/stats' -Token $PT
if ($ust.Status -eq 200 -and $ust.Body.data) { Add-Result '5.3' 'User stats returns counts' 'PASS' "bookmarks=$($ust.Body.data.bookmarkCount) browsers=$($ust.Body.data.browserCount)" }
else { Add-Result '5.3' 'User stats returns counts' 'FAIL' "Got $($ust.Status)" }

# 5.4 Browser Management
Write-Host '`n== 5.4 Browser Management ==' -ForegroundColor Cyan

$brs = Invoke-Api -Path '/api/v1/user/browsers' -Token $PT
if ($brs.Status -eq 200) { Add-Result '5.4' 'List browsers returns instances' 'PASS' "count=$(@($brs.Body.data).Count)" }
else { Add-Result '5.4' 'List browsers returns instances' 'FAIL' "Got $($brs.Status)" }

# 4.1 API premium-account verification
Write-Host '`n== 4.1 Premium API Verification ==' -ForegroundColor Cyan
if ($me.Body.data.isPremium -eq $true) { Add-Result '4.1' '/auth/me isPremium:true' 'PASS' '' } else { Add-Result '4.1' '/auth/me isPremium:true' 'FAIL' '' }
if ($sessPrem.Status -eq 200) { Add-Result '4.1' 'Premium /sessions returns 200' 'PASS' '' } else { Add-Result '4.1' 'Premium /sessions returns 200' 'FAIL' '' }
if ($colP.Status -in 200,201) { Add-Result '4.1' 'Premium POST /collections 201' 'PASS' '' } else { Add-Result '4.1' 'Premium POST /collections 201' 'FAIL' '' }
if ($st.Status -eq 200) { Add-Result '4.1' 'Premium sync endpoints work' 'PASS' '' } else { Add-Result '4.1' 'Premium sync endpoints work' 'FAIL' '' }

# 6.5 Special Characters via API
Write-Host '`n== 6.5 Special Characters ==' -ForegroundColor Cyan

# Submit a change with special chars + unicode + URL with query params
$specialChange = @(
    @{
        operation = 'CREATE_BOOKMARK'
        clientChangeId = "test-special-$(Get-Random)"
        timestamp = [int][double]::Parse((Get-Date -UFormat %s))
        data = @{
            id = "auto-test-$(Get-Random)"
            title = "Test <>&'`"!@# café 日本語 🎉"
            url = 'https://example.com/path?foo=bar&baz=qux%20test#frag'
            parentId = '1'
        }
    }
)
$sc = Invoke-Api -Method POST -Path '/api/v1/collections/default/changes' -Token $PT -Body @{ changes=$specialChange }
if ($sc.Status -in 200,201) { Add-Result '6.5' 'Special chars + unicode + query params accepted' 'PASS' "" }
else { Add-Result '6.5' 'Special chars + unicode + query params accepted' 'FAIL' "Status $($sc.Status) Body=$($sc.Body | ConvertTo-Json -Compress)" }

# 6.2 Token Expiry / Bad Tokens
Write-Host '`n== 6.2 Token Expiry ==' -ForegroundColor Cyan
# Tampered (signature broken)
$tampered = $PT.Substring(0, $PT.Length - 5) + 'AAAAA'
$tr = Invoke-Api -Path '/api/v1/auth/me' -Token $tampered
if ($tr.Status -eq 401) { Add-Result '6.2' 'Tampered JWT returns 401' 'PASS' '' }
else { Add-Result '6.2' 'Tampered JWT returns 401' 'FAIL' "Got $($tr.Status)" }

# Cleanup created collection
if ($createdColId -and $createdColId -ne 'default') {
    $del = Invoke-Api -Method DELETE -Path "/api/v1/collections/$createdColId" -Token $PT
    Write-Host "Cleanup collection $createdColId -> $($del.Status)"
}

# Print results summary
Write-Host '`n========================================' -ForegroundColor Yellow
Write-Host 'API SMOKE TEST RESULTS' -ForegroundColor Yellow
Write-Host '========================================' -ForegroundColor Yellow
$results | Format-Table -AutoSize

$pass = ($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Host "PASS: $pass    FAIL: $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })

$results | ConvertTo-Json -Depth 4 | Out-File 'docs/api-smoke-results.json' -Encoding utf8
Write-Host 'Results written to docs/api-smoke-results.json'
