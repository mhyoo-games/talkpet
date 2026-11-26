# 톡펫 연결 프로그램 (Windows · 카카오톡 PC)
# 봇 부계정으로 로그인한 카카오톡 PC에서 "따로 열어 둔 채팅방 창"을 2초마다 읽어 톡펫 서버에 보내고, 서버의 답을 그 방에 보낸다.
# 1분마다 펫이 먼저 할 말(배고파요, 좋은 아침…)도 받아서 보낸다.
#
#   start-bridge.cmd 를 두 번 눌러 켜거나:
#   powershell -ExecutionPolicy Bypass -File talkpet-bridge.ps1 [-Server http://127.0.0.1:8790] [-Every 2]
#
# 읽는 방법: 채팅 목록에 Ctrl+A, Ctrl+C를 보내 클립보드로 복사 → 읽은 뒤 원래 클립보드 글을 되돌려 놓는다.
#   (그래서 같은 Windows 계정에서 복사·붙여넣기를 하면 겹칠 수 있다 → 봇은 따로 만든 Windows 계정에서 돌리는 것을 권함)
param(
  [string]$Server = 'http://127.0.0.1:8790',
  [double]$Every = 2,
  [string]$Token = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Kakao {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool on);
  [DllImport("user32.dll")] static extern bool GetKeyboardState(byte[] s);
  [DllImport("user32.dll")] static extern bool SetKeyboardState(byte[] s);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  const uint WM_SETTEXT = 0x000C, WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101;
  const int VK_RETURN = 0x0D, VK_CONTROL = 0x11;
  public const string LIST = "EVA_VH_ListControl_Dblclk", EDIT = "RICHEDIT50W";

  static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  static IntPtr Child(IntPtr p, string cls) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(p, (h, l) => { if (Cls(h) == cls) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public class Room { public IntPtr Win, List, Edit; public string Name; }
  /// 카카오톡 프로세스의 보이는 창 가운데 채팅 목록과 입력칸이 있는 것 = 따로 열어 둔 채팅방
  public static List<Room> Rooms(int[] pids) {
    var set = new HashSet<uint>(); foreach (var p in pids) set.Add((uint)p);
    var rooms = new List<Room>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (!set.Contains(pid) || !IsWindowVisible(h)) return true;
      var list = Child(h, LIST); var edit = Child(h, EDIT);
      if (list != IntPtr.Zero && edit != IntPtr.Zero) rooms.Add(new Room { Win = h, List = list, Edit = edit, Name = Title(h) });
      return true;
    }, IntPtr.Zero);
    return rooms;
  }
  /// 다른 창의 키 상태를 빌려 Ctrl+키를 보낸다 (창을 앞으로 가져오지 않음)
  public static void CtrlKey(IntPtr h, char key) {
    uint target = GetWindowThreadProcessId(h, IntPtr.Zero), me = GetCurrentThreadId();
    AttachThreadInput(me, target, true);
    var old = new byte[256]; GetKeyboardState(old);
    var st = (byte[])old.Clone(); st[VK_CONTROL] |= 0x80; SetKeyboardState(st);
    Thread.Sleep(10);
    IntPtr lp = (IntPtr)(MapVirtualKey(key, 0) << 16 | 1);
    PostMessage(h, WM_KEYDOWN, (IntPtr)key, lp);
    PostMessage(h, WM_KEYUP, (IntPtr)key, (IntPtr)((long)lp | 0xC0000000L));
    Thread.Sleep(10);
    SetKeyboardState(old);
    AttachThreadInput(me, target, false);
  }
  public static void Send(Room r, string text) {
    SendMessage(r.Edit, WM_SETTEXT, IntPtr.Zero, text);
    Thread.Sleep(50);
    IntPtr lp = (IntPtr)(MapVirtualKey(VK_RETURN, 0) << 16 | 1);
    PostMessage(r.Edit, WM_KEYDOWN, (IntPtr)VK_RETURN, lp);
    PostMessage(r.Edit, WM_KEYUP, (IntPtr)VK_RETURN, (IntPtr)((long)lp | 0xC0000000L));
  }
}
"@

function Say($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
$headers = @{}; if ($Token) { $headers['x-token'] = $Token }
function Post($path, $obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 4
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri ($Server + $path) -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' -Headers $headers -TimeoutSec 10
}

function Read-Room($r) {
  # 원래 클립보드(글·그림)를 기억했다가 되돌림
  $oldText = $null; $oldImage = $null
  try {
    if ([System.Windows.Forms.Clipboard]::ContainsText()) { $oldText = [System.Windows.Forms.Clipboard]::GetText() }
    elseif ([System.Windows.Forms.Clipboard]::ContainsImage()) { $oldImage = [System.Windows.Forms.Clipboard]::GetImage() }
  } catch {}
  try { [System.Windows.Forms.Clipboard]::Clear() } catch {}
  [Kakao]::CtrlKey($r.List, [char]'A')
  [Kakao]::CtrlKey($r.List, [char]'C')
  $text = ''
  for ($i = 0; $i -lt 20 -and -not $text; $i++) { Start-Sleep -Milliseconds 25; try { $text = [System.Windows.Forms.Clipboard]::GetText() } catch {} }
  try {
    if ($oldText) { [System.Windows.Forms.Clipboard]::SetText($oldText) }
    elseif ($oldImage) { [System.Windows.Forms.Clipboard]::SetImage($oldImage) }
    else { [System.Windows.Forms.Clipboard]::Clear() }
  } catch {}
  return $text
}

function Send-Lines($r, $lines) {
  foreach ($t in $lines) {
    [Kakao]::Send($r, ($t -replace "`r?`n", "`r`n"))
    Start-Sleep -Milliseconds 400
  }
}

Say "톡펫 연결 프로그램 시작 · 서버 $Server · $Every 초마다"
try { $null = Invoke-RestMethod -Uri ($Server + '/api/rooms') -Headers $headers -TimeoutSec 5; Say '서버 연결 확인' } catch { Say "서버에 연결할 수 없어요: $Server (Docker의 talkpet 서버가 켜져 있는지 확인)"; }
$lastDue = Get-Date
$known = @{}
while ($true) {
  try {
    $pids = @(Get-Process -Name KakaoTalk -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    if (-not $pids.Count) { Say '카카오톡 PC가 켜져 있지 않아요. 기다리는 중…'; Start-Sleep 10; continue }
    $rooms = [Kakao]::Rooms([int[]]$pids)
    $names = ($rooms | ForEach-Object { $_.Name }) -join ', '
    if ($known['names'] -ne $names) { Say ("열린 채팅방: " + ($(if ($names) { $names } else { '(없음 — 채팅방을 두 번 눌러 따로 열어 두세요)' }))); $known['names'] = $names }
    foreach ($r in $rooms) {
      $text = Read-Room $r
      if (-not $text) { continue }
      $res = Post '/api/kakao' @{ room = $r.Name; text = $text }
      if ($res.out -and $res.out.Count) { Say "[$($r.Name)] 답 $($res.out.Count)개"; Send-Lines $r $res.out }
    }
    if (((Get-Date) - $lastDue).TotalSeconds -ge 60) {
      $lastDue = Get-Date
      $res = Post '/api/due' @{}
      foreach ($o in @($res.out)) {
        if (-not $o) { continue }
        $r = $rooms | Where-Object { $_.Name -eq $o.room } | Select-Object -First 1
        if ($r) { Say "[$($o.room)] 펫이 먼저 말함"; Send-Lines $r @($o.text) } else { Say "[$($o.room)] 창이 열려 있지 않아 못 보냄" }
      }
    }
  } catch { Say "오류: $($_.Exception.Message)" }
  Start-Sleep -Milliseconds ([int]($Every * 1000))
}
