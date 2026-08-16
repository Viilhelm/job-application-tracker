Add-Type -AssemblyName System.Drawing

$outputDir = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

foreach ($size in 16, 32, 48, 128) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Max(1, [Math]::Round($size * 0.06))
    $diameter = [Math]::Round($size * 0.28)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $bounds = [System.Drawing.RectangleF]::new($margin, $margin, $size - 2 * $margin, $size - 2 * $margin)
    $path.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
    $path.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
    $path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#0B5D3B"))
    $graphics.FillPath($background, $path)

    $accent = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#B8F34A"))
    $accentSize = [Math]::Max(2, [Math]::Round($size * 0.18))
    $graphics.FillEllipse($accent, $size - $margin - $accentSize, $margin, $accentSize, $accentSize)

    $fontSize = [Math]::Max(7, $size * 0.40)
    $font = [System.Drawing.Font]::new("Arial", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textBounds = [System.Drawing.RectangleF]::new(0, $size * 0.08, $size, $size * 0.92)
    $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $graphics.DrawString("JV", $font, $foreground, $textBounds, $format)

    $bitmap.Save((Join-Path $outputDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $foreground.Dispose()
    $format.Dispose()
    $font.Dispose()
    $accent.Dispose()
    $background.Dispose()
    $path.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
