$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open("C:\Users\aersl\Downloads\[PUBLIC] EA historical grantmaking.xlsx")

# Read OUTPUT - by grantmaker rows 5-30
$ws = $wb.Worksheets.Item(1)
Write-Output "=== FULL GRANTMAKER LIST ==="
$rows = $ws.UsedRange.Rows.Count
$cols = $ws.UsedRange.Columns.Count
for($r = 5; $r -le [Math]::Min($rows, 40); $r++) {
    $line = @()
    for($c = 1; $c -le $cols; $c++) {
        $val = $ws.Cells.Item($r, $c).Text
        $line += $val
    }
    $joined = ($line -join " | ")
    if($joined.Trim(" |") -ne "") { Write-Output $joined }
}

# Read OUTPUT - by sector full
Write-Output ""
Write-Output "=== FULL SECTOR BREAKDOWN ==="
$ws2 = $wb.Worksheets.Item(2)
$rows2 = $ws2.UsedRange.Rows.Count
$cols2 = $ws2.UsedRange.Columns.Count
for($r = 4; $r -le [Math]::Min($rows2, 60); $r++) {
    $line = @()
    for($c = 1; $c -le $cols2; $c++) {
        $val = $ws2.Cells.Item($r, $c).Text
        $line += $val
    }
    $joined = ($line -join " | ")
    if($joined.Trim(" |") -ne "") { Write-Output $joined }
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
