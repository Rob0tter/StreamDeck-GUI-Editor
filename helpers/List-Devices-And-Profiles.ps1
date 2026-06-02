$modelNames = @{
    # Stream Deck (Original / MK.2)
    "10GAA9901" = "Stream Deck (Original, 15 Keys)"
    "20GAA9901" = "Stream Deck (Original, 15 Keys)"
    "10GBA9901" = "Stream Deck MK.2 (15 Keys)"
    "20GBA9901" = "Stream Deck MK.2 (15 Keys)"
    # Stream Deck Mini
    "10GAI9901" = "Stream Deck Mini (6 Keys)"
    "20GAI9901" = "Stream Deck Mini (6 Keys)"
    # Stream Deck XL
    "10GAT9901" = "Stream Deck XL (32 Keys)"
    "20GAT9901" = "Stream Deck XL (32 Keys)"
    # Stream Deck +
    "10GBD9901" = "Stream Deck+ (8 Keys + 4 Dials)"
    "20GBD9901" = "Stream Deck+ (8 Keys + 4 Dials)"
    # Stream Deck + XL
    "10GBX9901" = "Stream Deck+ XL (36 Keys + 6 Dials)"
    "20GBX9901" = "Stream Deck+ XL (36 Keys + 6 Dials)"
    # Stream Deck Neo
    "10GBJ9901" = "Stream Deck Neo (8 Keys)"
    "20GBJ9901" = "Stream Deck Neo (8 Keys)"
    # Stream Deck Pedal
    "10GAP9901" = "Stream Deck Pedal (3 Pedals)"
    "20GAP9901" = "Stream Deck Pedal (3 Pedals)"
    # Stream Deck Studio
    "20GBM9901" = "Stream Deck Studio (32 Keys)"
    # Virtuell / Software
    "UI Stream Deck" = "Virtual Stream Deck (Software)"
}

$ProfilesPath = "$env:APPDATA\Elgato\StreamDeck\ProfilesV3\*.sdProfile"

Get-ChildItem $ProfilesPath | ForEach-Object {
    $manifest = Get-Content "$($_.FullName)\manifest.json" | ConvertFrom-Json
    $model = $manifest.Device.Model
    [PSCustomObject]@{
        Device      = if ($modelNames[$model]) { $modelNames[$model] } else { "Unknown ($model)" }
        ProfileName = $manifest.Name
        ModelNo     = $model
        SerialNo    = $manifest.Device.UUID -replace '.*/', '' -replace '\]', ''
        GUID        = $_.BaseName
    }
} | Sort-Object Device, ProfileName | Format-Table -AutoSize
