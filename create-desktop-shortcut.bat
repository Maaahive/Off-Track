@echo off
echo Creating OffTrack Desktop Shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut(\"$d\OffTrack.lnk\"); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + (Get-Location).Path + '\Launch OffTrack.vbs\"'; $s.WorkingDirectory = (Get-Location).Path; $s.IconLocation = (Get-Location).Path + '\icon.ico'; $s.Save(); Write-Host 'Done! OffTrack shortcut placed on your Desktop with custom icon.'"
echo.
echo You can now close this window and launch OffTrack from your Desktop!
pause
