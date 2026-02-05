$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open("C:\Users\aersl\Downloads\[PUBLIC] EA historical grantmaking.xlsx")

foreach($ws in $wb.Worksheets) {
    $name = $ws.Name
    $rows = $ws.UsedRange.Rows.Count
    $cols = $ws.UsedRange.Columns.Count
    Write-Output "=== SHEET: $name === (Rows: $rows, Cols: $cols)"

    $maxR = [Math]::Min($rows, 10)
    for($r = 1; $r -le $maxR; $r++) {
        $line = @()
        for($c = 1; $c -le $cols; $c++) {
            $val = $ws.Cells.Item($r, $c).Text
            $line += $val
        }
        Write-Output ($line -join " | ")
    }
    Write-Output ""
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
