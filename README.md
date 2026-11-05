# dsh-chime

DSH（DeepSeek Harness）的提示音插件：在**需要你出手**和**一轮收尾**的时刻响一声。
不弹窗、不抢焦点、不常驻后台、不占端口。

DSH 默认是安静的。Agent 停下来等你说话、提问卡片弹出来、后台作业跑完、子代理交回结果
—— 这些时刻都没有声音，人一离开屏幕就会漏掉。这个插件补的就是这一层。

> **平台**：仅 Windows。播放走系统自带的 `powershell.exe` + `System.Media.SoundPlayer`，
> 不装任何音频库，也不常驻进程。

## 什么时候响

| 声音 | 触发场景 | 监听的信号 |
|---|---|---|
| `alert` | Agent 提问 | `session/event` → `tool/call` 且 `name === 'ask_user_question'` |
| `alert` | 工具审批等待你点允许 | `tools/pre-execute` 最终决策为 `ask` |
| `alert` | 登录 / 凭据过期 | `deepseek-account/session-expired`、`model-sign-in-required` |
| `done` | 一轮回答结束 | `session/event` → `turn/end`，`reason.kind === 'completed'` |
| `done` | 子代理结束 | `subagent/end` |
| `done` | 后台作业结束 | `jobs.events` → `settled` |
| `done` | 目标完成 | `goal/changed`，`operation === 'complete'` |
| `error` | 这一轮报错 / 撞上 max-tokens | `turn/end`，`reason.kind === 'error' \| 'max-tokens'` |
| `stopped` | 目标被阻塞 | `goal/changed`，`operation === 'block'` |
| `stopped` | 会话被停止或归档 | `workspace/session-stop` |
| `stopped` | 被外部中断 | `turn/end`，`reason.kind === 'aborted'` |

### 去重与静音规则

- 子代理会话的 `turn/end` 会被跳过 —— 由 `subagent/end` 统一提醒，否则一次子代理响两声。
- 你自己按下的停止（`aborted` 且 `cause.kind === 'user'`）不响：那是你干的，不用通知你。
- 前台已经 `await` 到结果的后台作业不补响（`settled.awaited`），避免响两次。
- 同一种声音两次之间至少间隔 `minGapMs`（默认 600ms），防止连环响。
- 总开关 `enabled` 关掉后，任何事件都不出声。

## 安装

### 把本页交给 Agent（推荐）

把**这个 GitHub 页面的地址**发给你的 DSH Agent，再说一句「装这个插件」就行。
Agent 会拿仓库地址调 `plugin_manager`，从源码装成 bundle —— 不用你自己敲命令，
也不用关心包名、版本或 tarball。

想说得更明确，直接粘贴：

> 用 plugin_manager 安装这个插件：<粘贴浏览器地址栏里的本页链接>

安装器认这几种来源：

| 你给的地址 | 安装器怎么处理 |
|---|---|
| `https://github.com/<owner>/<repo>`（本页地址） | 从 git 仓库取源码，装成 bundle |
| `github:<owner>/<repo>` | 同上，简写形式 |
| `https://…/dsh-chime-<版本>.tgz` | 按 tarball 安装 |

> 仓库 URL 里的子路径要去掉：`/tree/main`、`/blob/main/...` 这类后缀会被拒绝，
> 它只认 `https://host/owner/repo` 这一段。

### 从 Release 的 tgz 安装（不想走 git 时）

下载 Release 附件 `dsh-chime-<版本>.tgz`，然后让 Agent：

> 用 plugin_manager 安装这个 tarball：<tgz 的绝对路径>

把 tgz 放在 `%USERPROFILE%\.dsh\bundles\` 下更稳妥 —— 那是 DSH 存放 bundle 的位置，
profile 重装依赖时会从这里重新解包。

### 从源码打包

```powershell
pnpm pack --pack-destination dist
```

产物是 `dist\dsh-chime-<版本>.tgz`，按上一节的 tarball 方式安装。

### 装完确认

左侧边栏 → **插件**（Plugins）→ 列表里出现 `dsh-chime`，点开它的行能看到配置表单。

## 配置

### 在界面里改（推荐）

**插件面板 → `dsh-chime` 行** 展开后就是表单：

| 字段 | 作用 |
|---|---|
| `enabled` | 总开关，关掉后全部静音 |
| `volume` | 0–100，按比例缩放 16bit PCM 采样后播放（`SoundPlayer` 本身没有音量参数） |
| `minGapMs` | 同一种声音的最小间隔，防连环响 |
| `events.*` | 9 条信号各自的独立开关 |
| `sounds.*` | 填 WAV 绝对路径替换内置音；留空用内置 |
| `debug` / `debugLog` | 把每次响动写进日志；路径留空则写 `%TEMP%\dsh-chime.log` |

表单里的字段都标了 `.volatile()`，**改完立即生效**，不用重装也不用重启 —— 插件每次响动前
都会重读一遍配置。

### 直接改 YAML（等价）

默认值定义在 `index.js` 的 `export const Config` 里，所以 bundle 层的 `config` 留空即可。
想手改就照抄到 profile 的 patch 层：

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

### 自定义音色

要求是 **PCM WAV**：44.1kHz / 16bit / 单声道最稳，时长建议 1 秒以内。

- `volume` 为 100 时原样播放；低于 100 才缩放采样，缩放结果缓存在 `%TEMP%\dsh-chime\`。
- WAV 不是 16bit PCM（比如 24bit 或浮点）时，音量不生效但仍会照常播放。
- 路径解析不了、文件不存在时，退化成系统提示音（`[console]::beep`），不会静默失败。

重新生成内置音色（纯标准库，不需要任何依赖）：

```powershell
python tools\make_sounds.py
```

## 为什么 DSH 升级不会把它清掉

DSH 桌面端升级时替换的是应用自身（`resources/app.asar`），而插件装在 **profile** 里：

| 场景 | 结果 |
|---|---|
| DSH 版本更新 | ✅ 插件与配置都保留 |
| 删掉本仓库的克隆目录 | ✅ 运行不受影响（profile 里是实体副本） |
| 删掉 `%USERPROFILE%\.dsh\bundles\*.tgz` | ✅ 正在运行的照旧；但 profile 重装依赖时会失败 |
| 删掉整个 profile / 重装系统 | ❌ 需要重新安装插件 |
| 改了插件包名或行 `id` | ❌ 配置按 id 记，改了等于换新插件，要重填 |

另外：本插件的 `engines` **只约束 Node 版本**（`>=20`），不写 `engines.dsh`。
把 `engines.dsh` 钉死到某个 rc 版本，会在 DSH 升级后被判为不兼容而直接拒绝启用 ——
那是不少第三方插件"更新后消失"的真实原因。

## 排查

把 `debug` 打开，然后看日志：

```powershell
Get-Content "$env:TEMP\dsh-chime.log" -Tail 20
```

每次响动会留一行，例如：

```
[2026-01-01T00:00:00.000Z] play done (turnEnd) — turn 3 completed
[2026-01-01T00:00:01.000Z] skip alert (question) — debounce
[2026-01-01T00:00:02.000Z] play beep (turnEnd) — missing done file: <路径>
```

三层意思对上号就知道了：`play` = 正常响；`skip ... debounce` = 被最小间隔挡了；
`play beep ... missing` = 音色文件找不到，退化成了系统提示音。

## 已知边界

- **仅 Windows**：依赖 `powershell.exe`。macOS / Linux 需要换播放后端（`afplay` / `paplay`），
  本仓库暂未实现。
- **不做焦点过滤**：你正盯着屏幕时，每轮结束同样会响。这是刻意的默认值——"我看得见"和
  "我知道它说完了"是两回事。真要静音请用逐项开关。
- **播放是子进程**：每次响动拉起一个隐藏的 `powershell.exe`，开销约 0.4–0.8 秒，不常驻。
- **未实现的信号**：定时任务投递（没有公开事件）、客户端连接断开（Host 侧无法可靠判断）、
  上下文压缩（事件名未确认）。这些情况目前不会响。

## 目录结构

```
dsh-chime/
├── index.js             Host 半边：事件监听 + 播放 + 配置解析
├── client.js            浏览器半边：插件面板里的配置表单（预编译的 ModuleLoader 工厂）
├── cordis.patch.yml     bundle 补丁：往 profile 插入一行
├── package.json
├── assets/              内置音色 done / alert / error / stopped
├── locale/              面板标题与描述（zh / en）
├── icon.svg
└── tools/make_sounds.py 音色生成器（纯标准库）
```

两半都是**零构建**的纯 JS：`client.js` 直接以 DSH 自带的 `__ModuleLoader__` 工厂格式写成，
改完不需要打包器。

## 许可

MIT，见 [LICENSE](LICENSE)。