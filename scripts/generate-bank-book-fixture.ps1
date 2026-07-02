Add-Type -AssemblyName System.Drawing

$w = 900
$h = 1200
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(252, 248, 240))
$g.TextRenderingHint = 'AntiAlias'

$titleFont = New-Object System.Drawing.Font 'Tahoma', 28, ([System.Drawing.FontStyle]::Bold)
$labelFont = New-Object System.Drawing.Font 'Tahoma', 20
$valueFont = New-Object System.Drawing.Font 'Tahoma', 22, ([System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black
$blue = [System.Drawing.Brushes]::DarkBlue

$title = [char]0x0E18 + [char]0x0E19 + [char]0x0E32 + [char]0x0E04 + [char]0x0E32 + [char]0x0E23 + [char]0x0E44 + [char]0x0E17 + [char]0x0E22 + [char]0x0E1E + [char]0x0E32 + [char]0x0E13 + [char]0x0E34 + [char]0x0E0A + [char]0x0E22 + [char]0x0E4C
$subtitle = [char]0x0E2A + [char]0x0E21 + [char]0x0E38 + [char]0x0E14 + [char]0x0E1A + [char]0x0E31 + [char]0x0E0D + [char]0x0E0A + [char]0x0E35 + [char]0x0E40 + [char]0x0E07 + [char]0x0E34 + [char]0x0E19 + [char]0x0E1D + [char]0x0E32 + [char]0x0E01

$g.DrawString($title, $titleFont, $blue, 40, 40)
$g.DrawString($subtitle, $labelFont, $brush, 40, 90)

$nameLabel = [char]0x0E0A + [char]0x0E37 + [char]0x0E48 + [char]0x0E2D + [char]0x0E1A + [char]0x0E31 + [char]0x0E0D + [char]0x0E0A + [char]0x0E35
$nameValue = [char]0x0E19 + [char]0x0E32 + [char]0x0E22 + ' ' + [char]0x0E20 + [char]0x0E39 + [char]0x0E23 + [char]0x0E34 + [char]0x0E1E + [char]0x0E31 + [char]0x0E12 + [char]0x0E19 + ' ' + [char]0x0E1B + [char]0x0E31 + [char]0x0E0D + [char]0x0E0D + [char]0x0E32
$acctLabel = [char]0x0E40 + [char]0x0E25 + [char]0x0E02 + [char]0x0E17 + [char]0x0E35 + [char]0x0E48 + [char]0x0E1A + [char]0x0E31 + [char]0x0E0D + [char]0x0E0A + [char]0x0E35
$acctValue = '431-013603-2'
$typeLabel = [char]0x0E1B + [char]0x0E23 + [char]0x0E30 + [char]0x0E40 + [char]0x0E20 + [char]0x0E17 + [char]0x0E1A + [char]0x0E31 + [char]0x0E0D + [char]0x0E0A + [char]0x0E35
$typeValue = [char]0x0E2D + [char]0x0E2D + [char]0x0E21 + [char]0x0E17 + [char]0x0E23 + [char]0x0E31 + [char]0x0E1E + [char]0x0E22 + [char]0x0E4C
$branchLabel = [char]0x0E2A + [char]0x0E32 + [char]0x0E02 + [char]0x0E32
$branchValue = [char]0x0E40 + [char]0x0E0B + [char]0x0E47 + [char]0x0E19 + [char]0x0E17 + [char]0x0E23 + [char]0x0E31 + [char]0x0E25 + [char]0x0E40 + [char]0x0E27 + [char]0x0E34 + [char]0x0E25 + [char]0x0E14 + [char]0x0E4C

$fields = @(
  @($nameLabel, $nameValue),
  @($acctLabel, $acctValue),
  @($typeLabel, $typeValue),
  @($branchLabel, $branchValue)
)

$y = 180
foreach ($f in $fields) {
  $g.DrawString($f[0], $labelFont, $brush, 40, $y)
  $g.DrawString($f[1], $valueFont, $brush, 40, ($y + 34))
  $y += 110
}

$rect = New-Object System.Drawing.Rectangle 30, 150, 840, 520
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 180, 180)), 2
$g.DrawRectangle($pen, $rect)

$outDir = Join-Path $PSScriptRoot '..\public\dev-fixtures'
$out = Join-Path $outDir 'bank-book-ocr-sample.jpg'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose()
$bmp.Dispose()
Write-Output "Saved $out"
