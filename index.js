/**
 * dsh-chime — DSH 提示音插件（Host 半边）。
 *
 * 监听 DSH 的公开 Event / Service，在本机播放 WAV：
 *   question / approval / account                        → alert
 *   turn/end(completed) / subagent / job / goal(complete) → done
 *   turn/end(error|max-tokens)                            → error
 *   goal(block) / session-stop / 外部中断                 → stopped
 *
 * 播放走 Windows 自带的 powershell.exe + System.Media.SoundPlayer，
 * 不引入任何第三方依赖，也不占用端口或常驻进程。
 *
 * 浏览器半边在 client.js（插件面板里的配置表单），两半互不依赖。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

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

/**
 * 设置页表单：DSH 只把标了 `.volatile()` 的字段渲染成可编辑项，
 * 所以每一项都要标；改了立即生效（Cordis 就地更新 ctx.config，不重跑 apply）。
 */
export const Config = z.object({
  enabled: z.boolean().default(true).description('总开关。关掉后所有提示音静音。').volatile(),
  volume: z.number().min(0).max(100).step(5).default(100).description('音量百分比，相对音源；100 为原始音量。').volatile(),
  minGapMs: z.number().min(0).max(10000).step(50).default(600).description('同一种声音的最小间隔（毫秒），防止连环响。').volatile(),
  events: z.object({
    question: z.boolean().default(true).description('Agent 提问'),
    approval: z.boolean().default(true).description('工具审批'),
    account: z.boolean().default(true).description('登录 / 凭据过期'),
    turnEnd: z.boolean().default(true).description('一轮回答结束'),
    turnError: z.boolean().default(true).description('这一轮报错 / 超 max-tokens'),
    subagentEnd: z.boolean().default(true).description('子代理结束'),
    jobEnd: z.boolean().default(true).description('后台作业结束'),
    goalEnd: z.boolean().default(true).description('目标完成 / 被阻塞'),
    sessionStop: z.boolean().default(true).description('会话被停止 / 归档'),
  }).default({}).description('逐项开关。').volatile(),
  sounds: z.object({
    done: z.string().default('').description('done 音色：WAV 绝对路径，留空用内置'),
    alert: z.string().default('').description('alert 音色：WAV 绝对路径，留空用内置'),
    error: z.string().default('').description('error 音色：WAV 绝对路径，留空用内置'),
    stopped: z.string().default('').description('stopped 音色：WAV 绝对路径，留空用内置'),
  }).default({}).description('自定义音色（可选）。').volatile(),
  debug: z.boolean().default(false).description('把每次响动写进日志，排查用。').volatile(),
  debugLog: z.string().default('').description('调试日志路径；留空写 %TEMP%\\dsh-chime.log。').volatile(),
})

export function apply(ctx, rawConfig) {
  const lastAt = new Map()
  let debugSink = null

  // 配置怎么保持"活"的：
  // · 设置页里的字段都标了 .volatile()，DSH 不会因此重跑 apply；
  // · `ctx.config` 在插件上下文里是受保护属性（会抛 "cannot get property config
  //   without inject"），所以改从 settings 服务读当前投影值；
  // · 平时用 apply 拿到的 rawConfig，收到 settings/document-updated 再刷新一次，
  //   这样每次响动都能看到最新设置，而不用每次去 describe() 全量投影。
  const ENTRY_ID = 'dsh-chime'
  const settings = typeof ctx.get === 'function' ? ctx.get('settings') : undefined
  let live = rawConfig
  const readConfig = () => normalize(live)

  const refresh = () => {
    try {
      const row = settings?.describe?.()?.find?.((item) => item.ns === ENTRY_ID)
      if (row?.value) live = row.value
    } catch {
      /* 读不到就沿用手上这份 */
    }
  }
  if (settings && typeof settings.describe === 'function') {
    ctx.on('settings/document-updated', (ns) => {
      if (ns === ENTRY_ID) refresh()
    })
  }

  const debug = (message) => {
    const cfg = readConfig()
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
      const cfg = readConfig()
      if (!cfg.enabled) return
      if (cfg.events[flag] === false) return
      const now = Date.now()
      if (now - (lastAt.get(sound) ?? 0) < cfg.minGapMs) {
        debug(`skip ${sound} (${flag}) — debounce`)
        return
      }
      lastAt.set(sound, now)

      const file = soundPath(cfg, sound)
      if (file && existsSync(file)) {
        const target = scaledWavPath(file, cfg.volume)
        runPowerShell(
          `(New-Object System.Media.SoundPlayer -ArgumentList '${escapePowerShell(target)}').PlaySync()`,
        )
        const gain = cfg.volume < 100 ? ` @${cfg.volume}%` : ''
        debug(`play ${sound} (${flag})${gain}${label ? ` — ${label}` : ''}`)
      } else {
        runPowerShell('[console]::beep(880, 120)')
        debug(`play beep (${flag}) — missing ${sound} file: ${file}`)
      }
    } catch (error) {
      debug(`error ${String(error)}`)
    }
  }

  // 把这一行标记给 settings 服务：宿主才会把 .volatile() 字段投影出来，
  // client.js 的配置表单读的就是这份投影。
  if (settings && typeof settings.configure === 'function') {
    try {
      ctx.effect(() => settings.configure({ auto: true }))
      debug('settings: configured')
    } catch (error) {
      debug(`settings configure failed: ${String(error)}`)
    }
  }

  refresh()
  const initial = readConfig()
  debug(`ready: ${JSON.stringify({ volume: initial.volume, events: initial.events, minGapMs: initial.minGapMs })}`)

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

/**
 * `.volatile()` 字段解析出来是 cosmokit 的 ref（.get()/.set()），读值前要拆开；
 * 普通字段原样返回。
 */
function valueOf(input) {
  return input && typeof input.get === 'function' ? input.get() : input
}

function normalize(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const volume = Number(valueOf(input.volume))
  const sounds = valueOf(input.sounds)
  const events = valueOf(input.events)
  const debugLog = valueOf(input.debugLog)
  const minGapMs = Number(valueOf(input.minGapMs))
  return {
    enabled: valueOf(input.enabled) !== false,
    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100,
    minGapMs: Number.isFinite(minGapMs) ? Math.max(0, minGapMs) : 600,
    debug: valueOf(input.debug) === true,
    debugLog: typeof debugLog === 'string' && debugLog ? debugLog : null,
    sounds: sounds && typeof sounds === 'object' ? sounds : {},
    events: { ...EVENT_FLAGS, ...(events && typeof events === 'object' ? events : {}) },
  }
}

function soundPath(cfg, sound) {
  const custom = cfg.sounds?.[sound]
  if (typeof custom === 'string' && custom) return isAbsolute(custom) ? custom : join(HERE, custom)
  const bundled = BUNDLED[sound]
  return bundled ? join(ASSETS, bundled) : null
}

/**
 * 音量：SoundPlayer 没有音量参数，所以按比例缩放 16bit PCM 采样，
 * 把结果缓存成临时 WAV 再播。解析不了就原样播放，绝不因为音量失败而静音。
 */
function scaledWavPath(file, volume) {
  if (!(volume < 100)) return file
  try {
    const scaled = scaleWav16(readFileSync(file), volume / 100)
    if (!scaled) return file
    const dir = join(process.env.TEMP || HERE, 'dsh-chime')
    mkdirSync(dir, { recursive: true })
    const target = join(dir, `${basename(file, extname(file))}-${volume}.wav`)
    writeFileSync(target, scaled)
    return target
  } catch {
    return file
  }
}

function scaleWav16(buffer, factor) {
  if (buffer.length < 44) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null
  let offset = 12
  let dataStart = -1
  let dataLength = 0
  let bits = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      bits = buffer.readUInt16LE(offset + 22)
    } else if (id === 'data') {
      dataStart = offset + 8
      dataLength = Math.min(size, buffer.length - dataStart)
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataStart < 0 || bits !== 16) return null
  const out = Buffer.from(buffer)
  for (let i = 0; i + 1 < dataLength; i += 2) {
    const at = dataStart + i
    const value = Math.round(out.readInt16LE(at) * factor)
    out.writeInt16LE(Math.min(32767, Math.max(-32768, value)), at)
  }
  return out
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