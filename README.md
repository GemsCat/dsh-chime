# dsh-chime · DSH 提示音

DSH（DeepSeek Harness）的提示音插件：只在**该提醒的时候**响一声，不弹窗、不抢焦点。

纯 Host 半边实现——没有客户端代码、没有 UI、没有第三方依赖，用的全是 DSH 的公开
Event / Service，所以 DSH 升级时最不容易被带走。

## 什么时候响

| 声音 | 触发 | 信号 |
|---|---|---|
| `alert` | Agent 提问 | `session/event` → `tool/call` 且 `name === 'ask_user_question'` |
| `alert` | 工具审批 | `tools/pre-execute` 最终决策为 `ask` |
| `alert` | 登录/凭据过期 | `deepseek-account/session-expired`、`model-sign-in-required` |
| `done` | 一轮回答结束 | `session/event` → `turn/end`（`reason.kind === 'completed'`） |
| `done` | 子代理结束 | `subagent/end` |
| `done` | 后台作业结束 | `ctx.jobs.events.subscribe({ owners: 'all' })` → `settled` |
| `done` | 目标完成 | `goal/changed` → `operation === 'complete'` |
| `error` | 这一轮报错 / 超 max-tokens | `turn/end`（`error` / `max-tokens`） |
| `stopped` | 目标被阻塞 | `goal/changed` → `operation === 'block'` |
| `stopped` | 会话被停止/归档 | `workspace/session-stop` |
| `stopped` | 被外部中断 | `turn/end`（`aborted`，用户自己按的停止不响） |

去重：子代理会话的 `turn/end` 会被跳过（由 `subagent/end` 统一提醒）；
前台已经 `await` 到的后台作业不再补一声（`settled.awaited`）。

## 安装与形态

当前**已安装形态**（推荐，已与工作目录解耦）：

```powershell
pnpm pack --pack-destination dist
Copy-Item dist\local-dsh-chime-0.1.0.tgz C:\Users\郭GG\.dsh\bundles\ -Force
plugin_manager remove_bundle  target=@local/dsh-chime
plugin_manager install_bundle target=file:C:\Users\郭GG\.dsh\bundles\local-dsh-chime-0.1.0.tgz
```

profile 里记的是 `"@local/dsh-chime": "file:C:/Users/郭GG/.dsh/bundles/local-dsh-chime-0.1.0.tgz"`，
`node_modules/@local/dsh-chime` 是**实体目录**（不是快捷方式）。

> ⚠️ 开发期若用 `install_bundle target=<本地目录>`，装的是 `link:`。**移除它时
> pnpm 会把链接目标目录一起删掉**（本仓库就被这么清空过一次，靠 tarball 才救回来）。
> 想边改边试，请先备份，或改用 tarball 反复换装。

### 改完代码怎么生效

tarball 装法不跟随工作区，需要重打再换装：

```powershell
pnpm pack --pack-destination dist
Copy-Item dist\local-dsh-chime-0.1.0.tgz C:\Users\郭GG\.dsh\bundles\ -Force
plugin_manager remove_bundle  target=@local/dsh-chime
plugin_manager install_bundle target=file:C:\Users\郭GG\.dsh\bundles\local-dsh-chime-0.1.0.tgz
```

### 哪些"清理"会 / 不会弄丢它

| 场景 | 结果 |
|---|---|
| 删掉 `E:\DeskProject\fishplugin` | ✅ 运行不受影响（profile 里有实体副本） |
| 删掉 `~/.dsh/bundles/*.tgz` | ✅ 运行中的不受影响；但 profile 重装依赖时会失败 |
| profile 重装依赖（`pnpm install`） | ✅ 从 `~/.dsh/bundles` 的 tgz 重新解包 |
| 删掉整个 profile / 重装 DSH 桌面端 | ❌ 需要重新 `install_bundle` |
| **DSH 版本更新** | ✅ 不动 profile，插件保留 |

要真正做到"换台机器也不怕"，把仓库推到 GitHub 并用
`install_bundle target=github:<user>/<repo>` 安装——远端才是最后一份备份。

## 配置

改 `cordis.patch.yml` 里的 `config`，保存后重新加载插件即生效：

```yaml
- insert:
    - id: dsh-chime
      name: '@local/dsh-chime'
      config:
        enabled: true          # 总开关
        minGapMs: 600          # 同一种声音的最小间隔，防止连环响
        debug: false           # true 时把每次响动写进日志，便于排查
        debugLog: null         # 省略则写 %TEMP%\dsh-chime.log
        sounds:                # 想换音色就填 WAV 的绝对路径，null/省略用内置音
          done: null
          alert: null
          error: null
          stopped: null
        events:                # 逐项开关，false 即静音该类
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

自定义音色要求是 **PCM WAV**（44.1kHz / 16bit / 单声道最稳），时长建议 < 1 秒。
音量跟随系统音量，插件自身不做衰减。

重新生成内置音色：

```powershell
python tools\make_sounds.py
```

## 实现备忘

- **提问为什么读日志而不是听事件**：`user-questions/request` 是 agent scope 内的
  answerer waterfall。挂在 profile 根上收不到，挂到 `agent.ctx` 上同样收不到（两种
  都实测）。`session/event` 是广播的，稳定可收，`tool/call` 与提问卡片出现的时刻
  基本一致，所以走日志。
- **播放**：`powershell.exe -NoProfile -WindowStyle Hidden` +
  `System.Media.SoundPlayer.PlaySync()`，单次开销约 0.4–0.8 秒，无常驻进程。
- **升级兼容**：`engines` 只约束 Node（`>=20`），不写死 `engines.dsh`——写死会在
  DSH 升级后被判为不兼容而拒绝启用（本机 `dsh-oil-ui` 就是这么变成
  `incompatible-version` 的）。

## 自检

```powershell
# 1. 行是否活着
#    cordis_inspect_query → host / Config / listConfigs → name: "@local/dsh-chime"
# 2. 打开 debug: true 后，日志里应出现 "play done (turnEnd) — turn 3 completed"
Get-Content $env:TEMP\dsh-chime.log -Tail 20
```

## 验证状态

| 链路 | 状态 |
|---|---|
| 提问（A1） | ✅ 实机验证（听到 + 日志） |
| 每轮结束（B1） | ⏳ 逻辑已接，待下一轮结束确认 |
| 子代理结束（B3） | ✅ 实机验证 |
| 后台作业（B5） | ✅ 实机验证（含 `awaited` 去重） |
| 目标完成/阻塞（B6） | ⏳ 信号已确认，未实机触发 |
| 报错（C1） | ⏳ 未实机触发（无主动制造错误） |
| 会话停止（C3） | ⏳ 未实机触发（不做破坏性测试） |
| 审批（A2/A5） | ⚠️ 机制确认（决策 `ask`），本机审批策略为 never 未实机触发 |
| 登录过期（A4） | ⚠️ 未实机触发 |
| 定时任务（B7） | ❌ 无公开投递事件，未实现 |
| 连接断开（C4） | ❌ 客户端信号，Host 侧无法可靠判断，未实现 |
| 上下文压缩（C5） | ❌ 未确认事件名，未实现 |

## 已知边界

- 只在 Windows 上出声（依赖 `powershell.exe` + `System.Media.SoundPlayer`）。
- 不区分窗口是否聚焦：正在看屏幕时，每轮结束也会响（这是你选择的默认值）。