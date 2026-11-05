# dsh-chime

DSH 的提示音插件。Agent 提问、等你审批、一轮说完、出错，以及子代理、后台作业、目标、会话收尾时，响一声。

只出声，不弹窗，不抢焦点。仅 Windows。

## 安装

把下面这句直接发给你的 DSH Agent：

> 帮我装这个插件：plugin_manager action=install_bundle target=https://github.com/GemsCat/dsh-chime

装完左侧边栏「插件」面板里就有 `dsh-chime`，点开它的行就能调设置。

不想用 git 的话，下载 [Release](https://github.com/GemsCat/dsh-chime/releases/latest) 里的 tgz，同样交给 Agent：

> 帮我装这个插件：plugin_manager action=install_bundle target=把 tgz 的完整路径粘在这里

## 什么时候响

| 场景 | 声音 |
|---|---|
| Agent 向你提问、等你审批、要你重新登录 | `alert` |
| 一轮说完，轮到你了 | `done` |
| 子代理交回结果、后台作业结束、目标完成 | `done` |
| 这一轮报错，或回答超出长度 | `error` |
| 目标被阻塞、会话停止、被外部中断 | `stopped` |

同一种声音 600 毫秒内不重复；子代理不会再多响一次；你自己按下的停止不响。

## 调整

插件面板 → `dsh-chime` → 表单里改：总开关、音量、最小间隔、逐项开关、自定义音色、调试日志。
改完立即生效，重装或升级插件都不会丢。

想换音色：填 PCM WAV 的绝对路径（44.1kHz / 16bit / 单声道最稳），留空就用内置音。

## 不响的时候

打开「写调试日志」，然后看 `%TEMP%\dsh-chime.log`。一次响动一行，能看出是没触发、
被最小间隔挡了、还是音色文件找不到。

## 顺带说明

- 播放用的是系统自带的 PowerShell，不装任何依赖，不常驻内存，不占端口。
- 不区分窗口是否聚焦：你正盯着屏幕时也会响。嫌吵就关掉对应项。
- 定时任务投递、断线重连、上下文压缩这三种情况目前不响——DSH 没有可靠的信号。
- 插件装在 DSH 的 profile 里，DSH 版本升级不会把它清掉。

## 许可

MIT，见 [LICENSE](LICENSE)。