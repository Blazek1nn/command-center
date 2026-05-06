Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "C:\cc\command-center-meta"
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\cc\command-center-meta\scripts\silent-start.cjs""", 0, False
