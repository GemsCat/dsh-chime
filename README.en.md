# dsh-chime

Sound cues for DSH. A short chime when the agent asks you something, waits for approval, finishes a
turn, or errors — and when a subagent, background job, goal, or session settles.

Sound only: no popups, no focus stealing. Windows only.

## Install

Send this line to your DSH agent:

> Install this plugin for me: plugin_manager action=install_bundle target=https://github.com/GemsCat/dsh-chime

Once it finishes, `dsh-chime` appears in the **Plugins** panel on the left; expand its row to adjust settings.

Prefer not to use git? Download the tgz from [Releases](https://github.com/GemsCat/dsh-chime/releases/latest)
and hand it to the agent the same way:

> Install this plugin for me: plugin_manager action=install_bundle target=path-to-the-tgz

## When it chimes

| Moment | Sound |
|---|---|
| The agent asks you a question, waits for approval, or needs a sign-in | `alert` |
| A turn finished and it is your turn again | `done` |
| A subagent reports back, a background job ends, a goal completes | `done` |
| The turn errored or hit the length limit | `error` |
| A goal got blocked, a session stopped, a turn was interrupted | `stopped` |

The same sound never repeats within 600 ms; a subagent does not ring twice; your own stop press stays silent.

## Settings

Plugins panel → `dsh-chime` → the form: master switch, volume, minimum gap, per-event switches,
custom sounds, debug log. Changes apply immediately and survive reinstalls and upgrades.

To swap a sound, give an absolute path to a PCM WAV (44.1 kHz / 16-bit / mono is safest); leave it empty for the built-in.

## When nothing rings

Turn on the debug log and read `%TEMP%\dsh-chime.log` — one line per cue, enough to tell whether the
event never fired, the minimum gap swallowed it, or the sound file was missing.

## Notes

- Playback uses the built-in PowerShell: no dependencies, nothing resident, no open port.
- No focus filtering: it chimes while you are watching the screen. Turn off the cue you find noisy.
- Scheduled-task delivery, reconnects, and context compaction stay silent — DSH exposes no reliable signal for them.
- The plugin lives in the DSH profile, so a DSH version update does not remove it.

## License

MIT, see [LICENSE](LICENSE).