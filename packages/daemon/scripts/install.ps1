#!/usr/bin/env pwsh
param(
  [String]$Version = "",
  # Skips adding nightshift to the user's %PATH%
  [Switch]$NoPathUpdate = $false,
  # Skips adding nightshift to the list of installed programs
  [Switch]$NoRegisterInstallation = $false
)

$ErrorActionPreference = "Stop"

# Validate version parameter
if ($Version -ne "" -and $Version -ne "latest" -and $Version -ne "stable") {
  if ($Version -notmatch "^v?\d+\.\d+\.\d+(-[^\s]+)?$") {
    Write-Output "Usage: install.ps1 [-Version <stable|latest|VERSION>]"
    Write-Output "Examples:"
    Write-Output "  install.ps1                # latest release"
    Write-Output "  install.ps1 -Version latest"
    Write-Output "  install.ps1 -Version stable"
    Write-Output "  install.ps1 -Version 0.1.0"
    Write-Output "  install.ps1 -Version v0.1.0"
    exit 1
  }
}

# Filter out 32 bit + ARM
if (-not ((Get-CimInstance Win32_ComputerSystem)).SystemType -match "x64-based") {
  Write-Output "Install Failed:"
  Write-Output "NightShift for Windows is currently only available for x86 64-bit Windows.`n"
  exit 1
}

# Minimum Windows version check
$MinBuild = 17763
$MinBuildName = "Windows 10 1809 / Windows Server 2019"

$WinVer = [System.Environment]::OSVersion.Version
if ($WinVer.Major -lt 10 -or ($WinVer.Major -eq 10 -and $WinVer.Build -lt $MinBuild)) {
  Write-Warning "NightShift requires at least ${MinBuildName} or newer.`n`nThe install will still continue but it may not work.`n"
}

# Repo can be overridden for forks
$NightShiftRepo = if ($env:NIGHTSHIFT_REPO) { $env:NIGHTSHIFT_REPO } else { "sipherxyz/nightshift" }
$GitHubApi = if ($env:GITHUB_API) { $env:GITHUB_API } else { "https://api.github.com" }

# Install location
$InstallDir = if ($env:NIGHTSHIFT_INSTALL_DIR) { $env:NIGHTSHIFT_INSTALL_DIR } else { "$Home\.nightshift\bin" }

# Environment helper functions (from Bun installer)
function Publish-Env {
  if (-not ("Win32.NativeMethods" -as [Type])) {
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
    uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
  }
  $HWND_BROADCAST = [IntPtr] 0xffff
  $WM_SETTINGCHANGE = 0x1a
  $result = [UIntPtr]::Zero
  [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST,
    $WM_SETTINGCHANGE,
    [UIntPtr]::Zero,
    "Environment",
    2,
    5000,
    [ref] $result
  ) | Out-Null
}

function Write-Env {
  param([String]$Key, [String]$Value)

  $RegisterKey = Get-Item -Path 'HKCU:'
  $EnvRegisterKey = $RegisterKey.OpenSubKey('Environment', $true)
  if ($null -eq $Value) {
    $EnvRegisterKey.DeleteValue($Key)
  } else {
    $RegistryValueKind = if ($Value.Contains('%')) {
      [Microsoft.Win32.RegistryValueKind]::ExpandString
    } elseif ($EnvRegisterKey.GetValue($Key)) {
      $EnvRegisterKey.GetValueKind($Key)
    } else {
      [Microsoft.Win32.RegistryValueKind]::String
    }
    $EnvRegisterKey.SetValue($Key, $Value, $RegistryValueKind)
  }

  Publish-Env
}

function Get-Env {
  param([String] $Key)

  $RegisterKey = Get-Item -Path 'HKCU:'
  $EnvRegisterKey = $RegisterKey.OpenSubKey('Environment')
  $EnvRegisterKey.GetValue($Key, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
}

function GitHub-ApiGet {
  param([String]$Url)

  $headers = @{
    "Accept" = "application/vnd.github+json"
  }
  if ($env:GITHUB_TOKEN) {
    $headers["Authorization"] = "Bearer $env:GITHUB_TOKEN"
  }

  try {
    Invoke-RestMethod -Uri $Url -Headers $headers
  } catch {
    Write-Output "Failed to fetch: $Url"
    throw $_
  }
}

function Get-AssetUrl {
  param(
    [Object]$Release,
    [String]$AssetName
  )

  foreach ($asset in $Release.assets) {
    if ($asset.name -eq $AssetName) {
      return $asset.browser_download_url
    }
  }
  return $null
}

function Install-NightShift {
  param(
    [String]$Version
  )

  $Platform = "windows-x64"
  $AssetName = "nightshift-$Platform.exe"
  $ChecksumAsset = "SHA256SUMS"

  # Resolve which release to install
  $ReleaseUrl = ""
  if ($Version -eq "" -or $Version -eq "latest" -or $Version -eq "stable") {
    $ReleaseUrl = "$GitHubApi/repos/$NightShiftRepo/releases/latest"
  } else {
    $Tag = $Version
    if ($Tag -notmatch "^v") {
      $Tag = "v$Tag"
    }
    $ReleaseUrl = "$GitHubApi/repos/$NightShiftRepo/releases/tags/$Tag"
  }

  Write-Output "Fetching release information..."
  $Release = GitHub-ApiGet -Url $ReleaseUrl

  $TagName = $Release.tag_name
  if (-not $TagName) {
    Write-Output "Could not resolve NightShift release (repo=$NightShiftRepo, target=$($Version -eq '' ? 'latest' : $Version))."
    exit 1
  }

  $BinaryUrl = Get-AssetUrl -Release $Release -AssetName $AssetName
  $ChecksumsUrl = Get-AssetUrl -Release $Release -AssetName $ChecksumAsset

  if (-not $BinaryUrl) {
    Write-Output "Release $TagName does not contain asset: $AssetName"
    exit 1
  }
  if (-not $ChecksumsUrl) {
    Write-Output "Release $TagName does not contain asset: $ChecksumAsset"
    exit 1
  }

  # Create temp directory
  $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

  try {
    $BinaryPath = Join-Path $TempDir $AssetName
    $ChecksumsPath = Join-Path $TempDir $ChecksumAsset

    Write-Output "Downloading NightShift $TagName ($AssetName)..."

    # Download binary
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $BinaryPath -UseBasicParsing

    # Download checksums
    Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsPath -UseBasicParsing

    # Verify checksum
    Write-Output "Verifying checksum..."
    $ChecksumContent = Get-Content $ChecksumsPath
    $ExpectedHash = $null
    foreach ($line in $ChecksumContent) {
      if ($line -match "^([a-f0-9]{64})\s+$AssetName$") {
        $ExpectedHash = $Matches[1]
        break
      }
    }

    if (-not $ExpectedHash) {
      Write-Output "Could not find SHA256 for $AssetName in $ChecksumAsset"
      exit 1
    }

    $ActualHash = (Get-FileHash -Path $BinaryPath -Algorithm SHA256).Hash.ToLower()

    if ($ActualHash -ne $ExpectedHash) {
      Write-Output "Checksum verification failed"
      Write-Output "Expected: $ExpectedHash"
      Write-Output "Actual:   $ActualHash"
      exit 1
    }

    # Create install directory
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $InstallPath = Join-Path $InstallDir "nightshift.exe"

    # Remove existing installation if present
    if (Test-Path $InstallPath) {
      try {
        Remove-Item $InstallPath -Force
      } catch [System.UnauthorizedAccessException] {
        $openProcesses = Get-Process -Name nightshift -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $InstallPath }
        if ($openProcesses.Count -gt 0) {
          Write-Output "Install Failed - An older installation exists and is open. Please close open NightShift processes and try again."
          exit 1
        }
        Write-Output "Install Failed - An unknown error occurred while trying to remove the existing installation"
        throw $_
      }
    }

    # Move binary to install location
    Move-Item $BinaryPath $InstallPath -Force

    $C_RESET = [char]27 + "[0m"
    $C_GREEN = [char]27 + "[1;32m"

    Write-Output ""
    Write-Output "${C_GREEN}Installed: $InstallPath${C_RESET}"
    Write-Output ""

    # Register installation in Windows
    if (-not $NoRegisterInstallation) {
      try {
        $RegistryKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NightShift"
        $null = New-Item -Path $RegistryKey -Force
        New-ItemProperty -Path $RegistryKey -Name "DisplayName" -Value "NightShift" -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $RegistryKey -Name "InstallLocation" -Value "$Home\.nightshift" -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $RegistryKey -Name "DisplayIcon" -Value $InstallPath -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $RegistryKey -Name "UninstallString" -Value "powershell -c `"Remove-Item -Recurse -Force '$Home\.nightshift'`"" -PropertyType String -Force | Out-Null
      } catch {
        # Ignore registration errors
      }
    }

    # Add to PATH
    $hasExistingOther = $false
    try {
      $existing = Get-Command nightshift -ErrorAction SilentlyContinue
      if ($existing -and $existing.Source -ne $InstallPath) {
        Write-Warning "Note: Another nightshift.exe is already in %PATH% at $($existing.Source)`nTyping 'nightshift' in your terminal will not use what was just installed.`n"
        $hasExistingOther = $true
      }
    } catch {}

    if (-not $hasExistingOther) {
      $Path = (Get-Env -Key "Path") -split ';'
      if ($Path -notcontains $InstallDir) {
        if (-not $NoPathUpdate) {
          $Path += $InstallDir
          Write-Env -Key 'Path' -Value ($Path -join ';')
          $env:PATH = $Path -join ';'
          Write-Output "Added $InstallDir to PATH"
        } else {
          Write-Output "Skipping adding '$InstallDir' to the user's %PATH%`n"
        }
      }
    }

    # Verify installation
    try {
      $VersionOutput = & $InstallPath version 2>&1
      if ($LASTEXITCODE -eq 0) {
        Write-Output ""
        Write-Output "Version:"
        Write-Output $VersionOutput
      }
    } catch {
      Write-Output "Add to PATH (if not already added):"
      Write-Output "  `$env:PATH += `";$InstallDir`""
    }

    Write-Output ""
    Write-Output "Next:"
    Write-Output "  nightshift start"

  } finally {
    # Cleanup temp directory
    if (Test-Path $TempDir) {
      Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    }
  }
}

Install-NightShift -Version $Version
