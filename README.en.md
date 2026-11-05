# dsh-chime

Sound cues for DSH (DeepSeek Harness): a short chime at the moments that **need you**
and at the end of **each turn**. No popups, no focus stealing, no background process,
no open port.

DSH is silent by default. The agent stops and waits for you, a question card appears,
a background job settles, a subagent hands results back — none of that makes a sound,
so you miss it the moment you look away. This plugin covers that gap.

> **Platform**: Windows only. Playback uses the built-in `powershell.exe` +
> `System.Media.SoundPlayer` — no audio library, no resident process.

## When it chimes

| Sound | Moment | Signal |
|---|---|---|
| `alert` | The agent asks a question | `session/event` → `tool/call` with `name === 'ask_user_question'` |
| `alert` | A tool call waits for approval | `tools/pre-execute` settling on `ask` |
| `alert` | Sign-in / credentials expired | `deepseek-account/session-expired`, `model-sign-in-required` |
| `done` | A turn finished | `session/event` → `turn/end`, `reason.kind === 'completed'` |
| `done` | A subagent finished | `subagent/end` |
| `done` | A background job settled | `jobs.events` → `settled` |
| `done` | A goal completed | `goal/changed`, `operation === 'complete'` |
| `error` | The turn errored or hit max-tokens | `turn/end`, `reason.kind === 'error' \| 'max-tokens'` |
| `stopped` | A goal got blocked | `goal/changed`, `operation === 'block'` |
| `stopped` | A session stopped or was archived | `workspace/session-stop` |
| `stopped` | An externally interrupted turn | `turn/end`, `reason.kind === 'aborted'` |

### Deduplication and silence rules

- A subagent session's `turn/end` is skipped — `subagent/end` reports it instead, so one
  subagent never rings twice.
- Your own stop press (`aborted` with `cause.kind === 'user'`) stays silent: you did it.
- A background job you already awaited is not announced again (`settled.awaited`).
- Two cues of the same kind are at least `minGapMs` apart (600 ms by default).
- With `enabled` off, nothing rings at all.

## Install

### From GitHub (recommended)

Ask the agent to install it with `plugin_manager`:

```
plugin_manager  action=install_bundle  target=github:<your-github-account>/dsh-chime
```

### From a release tarball

Download `dsh-chime-<version>.tgz` from the Releases page, then:

```
plugin_manager  action=install_bundle  target=file:<absolute path to the tgz>
```

Keeping the tarball in `%USERPROFILE%\.dsh\bundles\` is a good idea: that is where DSH
stores bundles, and a profile dependency reinstall unpacks from there.

### From source

```powershell
pnpm pack --pack-destination dist
plugin_manager  action=install_bundle  target=file:<absolute path>\dist\dsh-chime-1.0.0.tgz
```

### Verify

Sidebar → **Plugins** → the list shows `dsh-chime`; expanding its row opens the settings form.

## Configuration

### In the UI (recommended)

**Plugins panel → the `dsh-chime` row** renders the form:

| Field | Meaning |
|---|---|
| `enabled` | Master switch; off silences everything |
| `volume` | 0–100; the 16-bit PCM samples are scaled before playback (`SoundPlayer` has no volume API) |
| `minGapMs` | Shortest interval between two cues of the same kind |
| `events.*` | One switch per signal (9 of them) |
| `sounds.*` | Absolute WAV path to replace a built-in sound; empty keeps the built-in |
| `debug` / `debugLog` | Log every cue; empty path writes `%TEMP%\dsh-chime.log` |

Every field is marked `.volatile()`, so **changes apply immediately** — no reinstall, no
restart. The plugin re-reads the configuration before each cue.

### In YAML (equivalent)

Defaults live in `export const Config` inside `index.js`, so the bundle-level `config` can
stay empty. To edit by hand, copy this into the profile patch layer:

```yaml
- id: dsh-chime
  name: dsh-chime
  config:
    enabled: true
    volume: 100
    minGapMs: 600
    debug: false
    debugLog: ''
    sounds:
      done: ''
      alert: ''
      error: ''
      stopped: ''
    events:
      question: true
      approval: true
      account: true
      turnEnd: true
      turnError: true
      subagentEnd: true
      jobEnd: true
      goalEnd: true
      sessionStop: true
```

### Custom sounds

Use **PCM WAV**: 44.1 kHz / 16-bit / mono is the safest, ideally under a second.

- At `volume: 100` the file plays untouched; below 100 the samples are scaled and the
  result is cached in `%TEMP%\dsh-chime\`.
- A WAV that is not 16-bit PCM (24-bit, float) ignores `volume` but still plays.
- A missing or unreadable file falls back to the system beep (`[console]::beep`) instead
  of failing silently.

Regenerate the bundled sounds (standard library only, no dependencies):

```powershell
python tools\make_sounds.py
```

## Why a DSH update does not remove it

A DSH desktop update replaces the application itself (`resources/app.asar`), while this
plugin lives in the **profile**:

| Scenario | Outcome |
|---|---|
| DSH version update | ✅ plugin and settings survive |
| Deleting the clone of this repo | ✅ runtime unaffected (the profile holds a real copy) |
| Deleting `%USERPROFILE%\.dsh\bundles\*.tgz` | ✅ running install unaffected; a profile dependency reinstall would fail |
| Deleting the whole profile / reinstalling the OS | ❌ reinstall the plugin |
| Renaming the package or its row `id` | ❌ settings are keyed by id, so that counts as a new plugin |

Also: `engines` here constrains **Node only** (`>=20`) and deliberately does **not** pin
`engines.dsh`. Pinning it to one rc version makes DSH reject the plugin as incompatible
right after an upgrade — a common reason third-party plugins "disappear" on update.

## Troubleshooting

Turn `debug` on, then read the log:

```powershell
Get-Content "$env:TEMP\dsh-chime.log" -Tail 20
```

One line per cue, for example:

```
[2026-01-01T00:00:00.000Z] play done (turnEnd) — turn 3 completed
[2026-01-01T00:00:01.000Z] skip alert (question) — debounce
[2026-01-01T00:00:02.000Z] play beep (turnEnd) — missing done file: <path>
```

`play` means it rang; `skip ... debounce` means the minimum gap swallowed it;
`play beep ... missing` means the sound file was not found and the fallback fired.

## Known limits

- **Windows only**: it needs `powershell.exe`. macOS / Linux would need another backend
  (`afplay` / `paplay`); not implemented here.
- **No focus filtering**: an ended turn chimes even while you are watching the screen.
  That is intentional — "I can see it" is not the same as "I know it finished". Use the
  per-event switches if you want silence.
- **Playback is a subprocess**: each cue spawns a hidden `powershell.exe` (≈0.4–0.8 s),
  nothing stays resident.
- **Not implemented**: scheduled-task delivery (no public event), client disconnection
  (not reliably detectable host-side), context compaction (event name unconfirmed).

## Layout

```
dsh-chime/
├── index.js            host half: event listeners, playback, config parsing
├── client.js           browser half: the settings form (prebuilt __ModuleLoader__ factory)
├── cordis.patch.yml    bundle patch: inserts one row into the profile
├── package.json
├── assets/             bundled sounds: done / alert / error / stopped
├── locale/             panel title and description (zh / en)
├── icon.svg
└── tools/make_sounds.py sound generator (standard library only)
```

Both halves are plain JS with **no build step**: `client.js` is written directly in the
`__ModuleLoader__` factory format DSH ships with, so nothing needs a bundler.

## License

MIT, see [LICENSE](LICENSE).