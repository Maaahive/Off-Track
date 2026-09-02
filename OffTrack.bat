@echo off
title OffTrack Launcher
echo Starting OffTrack...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [System.Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut(\"$d\OffTrack.lnk\"); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + (Get-Location).Path + '\scripts\Launch OffTrack.vbs\"'; $s.WorkingDirectory = (Get-Location).Path; $s.IconLocation = (Get-Location).Path + '\assets\icon.ico'; $s.Save(); Start-Process 'wscript.exe' -ArgumentList ('\"' + (Get-Location).Path + '\scripts\Launch OffTrack.vbs\"')"
exit
