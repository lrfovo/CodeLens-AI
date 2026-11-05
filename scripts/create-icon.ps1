Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$pngPath = Join-Path $output 'icon.png'
$icoPath = Join-Path $output 'icon.ico'

$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc(12, 12, 72, 72, 180, 90)
$path.AddArc(172, 12, 72, 72, 270, 90)
$path.AddArc(172, 172, 72, 72, 0, 90)
$path.AddArc(12, 172, 72, 72, 90, 90)
$path.CloseFigure()
$background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(161, 225, 202))
$graphics.FillPath($background, $path)

$ink = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(26, 56, 47), 12)
$ink.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ink.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($ink, 128, 45, 128, 211)
$graphics.DrawLine($ink, 45, 128, 211, 128)
foreach ($point in @(@(77, 77), @(179, 77), @(77, 179), @(179, 179))) {
  $graphics.DrawEllipse($ink, $point[0] - 23, $point[1] - 23, 46, 46)
}

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$ink.Dispose()
$background.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

$data = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$data.Length)
$writer.Write([uint32]22)
$writer.Write($data)
$writer.Dispose()
