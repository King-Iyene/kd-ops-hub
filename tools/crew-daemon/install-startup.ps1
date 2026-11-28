# Starts the Crew daemon every time you sign in to Windows (hidden, as you), and starts it now.
# Remove it with:  Unregister-ScheduledTask -TaskName "KDOps Crew daemon" -Confirm:$false
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $here 'crew-daemon.env'))) { Write-Host "Put crew-daemon.env (downloaded from Crew > Team) in $here first."; exit 1 }
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$here\crew-daemon.mjs`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "KDOps Crew daemon" -Action $action -Trigger $trigger -Settings $settings -Description "Runs the AI executives on this PC" -Force | Out-Null
Start-ScheduledTask -TaskName "KDOps Crew daemon"
Write-Host "The Crew daemon is installed and running. Log: $here\crew-daemon.log"
