/**
 * dsh-chime — DSH 提示音插件（Host 半边，无 UI）。
 *
 * 监听 DSH 的公开 Event / Service，在本机播放 WAV：
 *   question / approval / account          → alert
 *   turn/end(completed) / subagent / job / goal(complete) → done
 *   turn/end(error|max-tokens)             → error
 *   goal(block) / session-stop             → stopped
 *
 * 播放走 Windows 自带的 powershell.exe + System.Media.SoundPlayer，
 * 不引入任何第三方依赖，也不占用端口或常驻进程。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(HERE, 'assets')

/** 内置音色文件名（可用 config.sounds 覆盖为任意 WAV 绝对路径）。 */
const BUNDLED = {
  done: 'done.wav',
  alert: 'alert.wav',
  error: 'error.wav',
  stopped: 'stopped.wav',
}

/** 默认全部启用；config.events 里可逐项关闭。 */
const EVENT_FLAGS = {
  question: true,
  approval: true,
  account: true,
  turnEnd: true,
  turnError: true,
  subagentEnd: true,
  jobEnd: true,
  goalEnd: true,
  sessionStop: true,
}

export function apply(ctx, rawConfig) {
  const cfg = normalize(rawConfig)
  const lastAt = new Map()
  let debugSink = null

  const debug = (message) => {
    if (!cfg.debug) return
    const line = `[${new Date().toISOString()}] ${message}\n`
    try {
      const file = cfg.debugLog || (debugSink ??= join(process.env.TEMP || HERE, 'dsh-chime.log'))
      appendFileSync(file, line)
    } catch {
      /* 调试日志失败不影响播放 */
    }
  }

  const say = (sound, flag, label) => {
    try {
      if (cfg.events[flag] === false) return
      const now = Date.now()
      if (now - (lastAt.get(sound) ?? 0) < cfg.minGapMs) {
        debug(`skip ${sound} (${flag}) — debounce`)
        return
      }
      lastAt.set(sound, now)

      const file = soundPath(cfg, sound)
      if (file && existsSync(file)) {
        runPowerShell(
          `(New-Object System.Media.SoundPlayer -ArgumentList '${escapePowerShell(file)}').PlaySync()`,
        )
        debug(`play ${sound} (${flag})${label ? ` — ${label}` : ''}`)
      } else {
        runPowerShell('[console]::beep(880, 120)')
        debug(`play beep (${flag}) — missing ${sound} file: ${file}`)
      }
    } catch (error) {
      debug(`error ${String(error)}`)
    }
  }

  debug(`ready: ${JSON.stringify({ sounds: BUNDLED, events: cfg.events, minGapMs: cfg.minGapMs })}`)

  // ---- A. 需要你出手 -------------------------------------------------------
  //
  // `user-questions/request` 是 agent scope 内的 answerer waterfall：profile 根上挂
  // 收不到，挂到 agent.ctx 也收不到（两种都实测过）。改读会话日志里的 `tool/call`
  // —— 它由 `session/event` 广播，稳定，且与提问卡片出现基本同一时刻。

  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'tool/call') return
    if (event.data?.name === 'ask_user_question') {
      say('alert', 'question', 'ask_user_question')
    }
  })

  // 审批：pre-execute 的最终决策是 ask，说明这条工具调用正在等用户点允许/拒绝。
  ctx.on('tools/pre-execute', async (payload, next) => {
    const decision = await next()
    const kind = typeof decision === 'string' ? decision : decision?.kind
    if (kind === 'ask') say('alert', 'approval', `approval ${payload?.call?.name ?? ''}`)
    return decision
  })

  ctx.on('deepseek-account/session-expired', () => say('alert', 'account', 'session expired'))
  ctx.on('deepseek-account/model-sign-in-required', () => say('alert', 'account', 'sign-in required'))

  // ---- B / C. 结束与异常 ----------------------------------------------------

  ctx.on('session/event', (session, event) => {
    if (!event || event.type !== 'turn/end') return
    // 子代理会话的轮次由 subagent/end 统一提醒，这里跳过避免双响。
    if (session?.header?.origin === 'subagent') return

    const data = event.data ?? event
    const turn = data?.turn
    const reason = data?.reason ?? event.reason
    switch (reason?.kind) {
      case 'completed':
        say('done', 'turnEnd', `turn ${turn} completed`)
        break
      case 'error':
        say('error', 'turnError', `turn ${turn} error`)
        break
      case 'max-tokens':
        say('error', 'turnError', `turn ${turn} max-tokens`)
        break
      case 'aborted': {
        const cause = reason?.reason?.kind
        if (cause === 'user') return // 用户自己按的停止，不用再提醒
        say('stopped', 'sessionStop', `turn ${turn} aborted: ${cause ?? 'unknown'}`)
        break
      }
      default:
        break
    }
  })

  ctx.on('subagent/end', (info) => say('done', 'subagentEnd', `subagent ${info?.status ?? ''}`))

  ctx.on('goal/changed', (payload) => {
    const operation = payload?.change?.operation
    if (operation === 'complete') say('done', 'goalEnd', 'goal complete')
    else if (operation === 'block') say('stopped', 'goalEnd', 'goal blocked')
  })

  ctx.on('workspace/session-stop', () => say('stopped', 'sessionStop', 'session stopped'))

  // ---- B5. 后台作业 ---------------------------------------------------------

  const jobsNow = typeof ctx.get === 'function' ? ctx.get('jobs') : undefined
  debug(
    `jobs probe: get=${jobsNow ? 'hit' : 'miss'} inject=${typeof ctx.inject} ` +
      `subscribe=${typeof jobsNow?.events?.subscribe}`,
  )

  ctx.effect(() => {
    const jobs = typeof ctx.get === 'function' ? ctx.get('jobs') : undefined
    if (!jobs?.events?.subscribe) return () => {}
    const dispose = jobs.events.subscribe({ owners: 'all' }, (event) => {
      debug(`job event: ${event?.type}${event?.awaited ? ' (awaited)' : ''}`)
      if (event?.type !== 'settled') return
      if (event.cause === 'teardown') return
      if (event.awaited) return // 前台已收集过结果，不再重复提醒
      say('done', 'jobEnd', `job ${event.job?.label ?? event.job?.id ?? ''}`)
    })
    return () => {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  })
}

// ---------------------------------------------------------------------------

function normalize(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: input.enabled !== false,
    minGapMs: Number.isFinite(input.minGapMs) ? Math.max(0, input.minGapMs) : 600,
    debug: input.debug === true,
    debugLog: typeof input.debugLog === 'string' && input.debugLog ? input.debugLog : null,
    sounds: input.sounds && typeof input.sounds === 'object' ? input.sounds : {},
    events: { ...EVENT_FLAGS, ...(input.events && typeof input.events === 'object' ? input.events : {}) },
  }
}

function soundPath(cfg, sound) {
  const custom = cfg.sounds?.[sound]
  if (typeof custom === 'string' && custom) return isAbsolute(custom) ? custom : join(HERE, custom)
  const bundled = BUNDLED[sound]
  return bundled ? join(ASSETS, bundled) : null
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''")
}

function runPowerShell(command) {
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      { windowsHide: true, stdio: 'ignore', detached: false },
    )
    child.on('error', () => {})
    child.unref?.()
  } catch {
    /* 播放失败静默 */
  }
}