# Generates placeholder app assets: icon.png, adaptive-icon.png, splash-icon.png, favicon.png
# Cream canvas + terracotta bookmark glyph (website brand). Replace with real artwork before release.
param([string]$OutDir = (Join-Path $PSScriptRoot '..\assets'))

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null

$BrandCream = [System.Drawing.Color]::FromArgb(255, 251, 248, 243)  # #FBF8F3
$BrandTerra = [System.Drawing.Color]::FromArgb(255, 212, 99, 74)    # #D4634A

function New-BookmarkPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    # Rounded-top bookmark glyph with V notch at bottom.
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $notch = $h * 0.30
    $path.AddArc($x, $y, $r * 2, $r * 2, 180, 90)                    # top-left corner
    $path.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)      # top-right corner
    $path.AddLine($x + $w, $y + $r, $x + $w, $y + $h)                # right edge to bottom
    $path.AddLine($x + $w, $y + $h, $x + ($w / 2), $y + $h - $notch) # notch right side
    $path.AddLine($x + ($w / 2), $y + $h - $notch, $x, $y + $h)      # notch left side
    $path.AddLine($x, $y + $h, $x, $y + $r)                          # left edge back up
    $path.CloseFigure()
    return $path
}

function Save-Icon([string]$Path, [int]$Size, [bool]$TransparentBg, [float]$GlyphScale, [float]$GlyphYOffset) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    if ($TransparentBg) { $g.Clear([System.Drawing.Color]::Transparent) }
    else { $g.Clear($BrandCream) }

    $gw = $Size * $GlyphScale * 0.62
    $gh = $Size * $GlyphScale
    $gx = ($Size - $gw) / 2
    $gy = ($Size - $gh) / 2 + ($Size * $GlyphYOffset)
    $r = $gw * 0.18

    $bookmark = New-BookmarkPath $gx $gy $gw $gh $r
    $brush = New-Object System.Drawing.SolidBrush($BrandTerra)
    $g.FillPath($brush, $bookmark)
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output "Wrote $Path"
}

# App icon: full-bleed cream square, glyph ~55% of canvas
Save-Icon -Path (Join-Path $OutDir 'icon.png')         -Size 1024 -TransparentBg $false -GlyphScale 0.55 -GlyphYOffset 0
# Android adaptive icon foreground: transparent, glyph ~45% (safe zone)
Save-Icon -Path (Join-Path $OutDir 'adaptive-icon.png') -Size 1024 -TransparentBg $true  -GlyphScale 0.42 -GlyphYOffset 0
# Splash icon: transparent bg, smaller glyph
Save-Icon -Path (Join-Path $OutDir 'splash-icon.png')   -Size 512  -TransparentBg $true  -GlyphScale 0.60 -GlyphYOffset 0
# Favicon
Save-Icon -Path (Join-Path $OutDir 'favicon.png')       -Size 48   -TransparentBg $false -GlyphScale 0.62 -GlyphYOffset 0
