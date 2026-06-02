$val = Get-ItemPropertyValue "HKCU:\Software\Elgato Systems GmbH\StreamDeck" -Name "Devices"
# Als UTF-8
Write-Host "=== UTF-8 ===" -ForegroundColor Yellow
[System.Text.Encoding]::UTF8.GetString($val).Trim([char]0)

