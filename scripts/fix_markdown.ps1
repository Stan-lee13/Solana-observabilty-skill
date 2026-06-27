param()

$files = Get-ChildItem -Recurse -Include *.md -File
foreach ($f in $files) {
    try {
        $raw = Get-Content -Raw -Encoding UTF8 $f.FullName
    } catch {
        Write-Host "Unable to read: $($f.FullName) - $_" -ForegroundColor Yellow
        continue
    }
    $arr = $raw -split '\r?\n'
    $arr = $arr | ForEach-Object { $_.TrimEnd() }
    if ($arr.Count -eq 0) { $arr = @('') }
    if ($arr[-1] -ne '') { $arr += '' }
    $text = $arr -join "`n"
    try {
        Set-Content -Path $f.FullName -Value $text -Encoding UTF8
        Write-Host "Fixed: $($f.FullName)"
    } catch {
        Write-Host "Unable to write: $($f.FullName) - $_" -ForegroundColor Red
    }
}
