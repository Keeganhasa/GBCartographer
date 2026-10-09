' GB Cartographer launcher for the Windows shortcuts (npm run install-shortcut): rebuilds and opens the desktop app
' from this repo without a console window, so a git pull is picked up on the next launch.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run "cmd /c npm run desktop", 0, False
