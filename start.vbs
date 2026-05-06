Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")

' Resolve the repo root from this script's own location (portable — works for any user/path)
Dim scriptDir, repoRoot, metaDir, scriptPath, nodePath
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoRoot  = scriptDir  ' start.vbs lives in the repo root
metaDir   = fso.BuildPath(repoRoot, "command-center-meta")
scriptPath = fso.BuildPath(metaDir, "scripts\silent-start.cjs")

' Try to find node.exe — check PATH first via where.exe, fall back to common install
On Error Resume Next
nodePath = shell.Exec("where.exe node.exe").StdOut.ReadLine()
On Error GoTo 0
If nodePath = "" Then nodePath = "C:\Program Files\nodejs\node.exe"

shell.CurrentDirectory = metaDir
shell.Run """" & nodePath & """ """ & scriptPath & """", 0, False
