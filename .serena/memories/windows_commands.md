# Windows System Commands Reference

## File System Navigation
```cmd
# List directory contents
dir
dir /a    # Show hidden files
dir /s    # Recursive listing

# Change directory
cd <directory>
cd ..     # Go up one level
cd \      # Go to root
cd /d C:\ # Change drive and directory

# Current directory
cd
pwd       # If Git Bash/WSL available

# Create/Remove directories
mkdir <dirname>
rmdir <dirname>
rmdir /s <dirname>  # Remove with contents
```

## File Operations
```cmd
# Copy files
copy <source> <destination>
xcopy <source> <destination> /e /i  # Recursive copy

# Move/Rename files
move <source> <destination>
ren <oldname> <newname>

# Delete files
del <filename>
del *.tmp     # Delete by pattern
```

## Text Search and Processing
```cmd
# Search in files
findstr "pattern" <filename>
findstr /s /i "pattern" *.*  # Recursive, case-insensitive

# Display file contents
type <filename>
more <filename>   # Paginated view
```

## Process Management
```cmd
# List running processes
tasklist
tasklist /fi "imagename eq node.exe"  # Filter by name

# Kill processes
taskkill /pid <processid>
taskkill /im node.exe /f  # Force kill by name
```

## Network Commands
```cmd
# Network configuration
ipconfig
ipconfig /all

# Test connectivity
ping <hostname>
telnet <host> <port>  # If telnet client enabled
```

## Git Commands (if available)
```bash
# Common Git operations
git status
git add .
git commit -m "message"
git push
git pull
git log --oneline
```

## PowerShell Alternatives (if preferred)
```powershell
# PowerShell equivalents
Get-ChildItem     # ls/dir equivalent
Get-Content       # cat/type equivalent
Select-String     # grep/findstr equivalent
Get-Process       # tasklist equivalent
```

## Environment Variables
```cmd
# View environment variables
set
echo %PATH%
echo %USERPROFILE%

# Set temporary variable
set VARIABLE=value
```

## Notes for Development
- Use **Git Bash** or **WSL** for Unix-like commands if available
- **PowerShell** provides more advanced scripting capabilities
- **Windows Terminal** offers better terminal experience
- Consider using **scoop** or **chocolatey** for package management