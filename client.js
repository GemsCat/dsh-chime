/* dsh-chime 浏览器半边：给 插件面板 → dsh-chime 行 渲染配置表单。
 *
 * 预编译的 ModuleLoader 工厂（与 DSH 自带 UI 包同格式，零构建）。
 * 版式沿用插件页自身的度量：区块间距 32、行 padding 12/2、
 * 行分割线 .5px var(--dsw-alias-border-l2)、标题 14/500、说明 12 次级色。
 * 状态来自页面传入的 form（configForms 投影 + mutate），写入走
 * remote.settings.mutate → profile patch → Host 热更新。
 */
window.__ModuleLoader__.load({
	id: "dsh-chime",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let jsx = require("react/jsx-runtime");
		let React = require("react");

		const ROW_KEY = "dsh-chime#dsh-chime";
		const zh = (navigator.language || "").toLowerCase().startsWith("zh");

		const T = {
			label: "var(--dsw-alias-label-primary)",
			label2: "var(--dsw-alias-label-secondary)",
			border: "var(--dsw-alias-border-l2)",
			bg1: "var(--dsw-alias-bg-layer-1)",
			brand: "var(--dsw-alias-brand-primary)",
		};

		const S = {
			loading: zh ? "正在读取设置…" : "Loading settings…",
			groupSwitch: zh ? "开关" : "Switches",
			groupSwitchHint: zh ? "总闸关掉后所有提示音静音" : "Master off silences every cue",
			master: zh ? "启用提示音" : "Enable chimes",
			masterDesc: zh ? "关掉后不再播放任何声音，下面的逐项配置会保留。" : "Turns every cue off while keeping the per-event setup below.",
			groupAudio: zh ? "音量与节奏" : "Volume and pacing",
			volume: zh ? "音量" : "Volume",
			volumeDesc: zh ? "按比例缩放内置 WAV 采样，100 为原始音量。" : "Scales the WAV samples themselves; 100 is the original level.",
			gap: zh ? "最小间隔" : "Minimum gap",
			gapDesc: zh ? "同一种声音两次之间的最短间隔，避免连环响。" : "Shortest interval between two cues of the same kind.",
			groupEvents: zh ? "逐项开关" : "Per-event switches",
			groupEventsHint: zh ? "关掉哪条就不会响哪种声音" : "Turn a cue off by turning its trigger off",
			groupSounds: zh ? "自定义音色" : "Custom sounds",
			groupSoundsHint: zh ? "留空即用内置音" : "Empty means the built-in sound",
			soundPath: zh ? "WAV 绝对路径" : "Absolute WAV path",
			groupDebug: zh ? "排查" : "Troubleshooting",
			debug: zh ? "写调试日志" : "Write a debug log",
			debugDesc: zh ? "每次响动记一行，排查「为什么没响」时用。" : "One line per cue, for diagnosing silent moments.",
			debugLog: zh ? "日志路径" : "Log path",
			debugLogDesc: zh ? "留空写 %TEMP%\\dsh-chime.log" : "Empty writes %TEMP%\\dsh-chime.log",
			footer: zh
				? "改动即时生效：值写进 profile 的 patch 层，重装或升级插件都不会被覆盖。"
				: "Changes apply immediately and live in the profile patch layer, so reinstalling the plugin keeps them.",
			ms: "ms",
			pct: "%",
			ev: {
				question: [zh ? "Agent 提问" : "Agent asks a question", zh ? "提问卡片一出现就响" : "Fires the moment a question card appears"],
				approval: [zh ? "工具审批" : "Tool approval", zh ? "与批准弹窗同一时刻" : "Same moment as the approval prompt"],
				account: [zh ? "登录 / 凭据过期" : "Sign-in / credential expiry", zh ? "需要重新登录时" : "When a sign-in is required again"],
				turnEnd: [zh ? "每轮回答结束" : "Turn end", zh ? "我开始等你说话的时候" : "When I stop and wait for you"],
				turnError: [zh ? "回答报错" : "Turn error", zh ? "报错或撞上 max-tokens" : "An error or a max-tokens stop"],
				subagentEnd: [zh ? "子代理结束" : "Subagent end", zh ? "子代理交回结果时" : "A subagent hands results back"],
				jobEnd: [zh ? "后台作业结束" : "Background job end", zh ? "非前台等待的作业收尾时" : "A job you were not awaiting settles"],
				goalEnd: [zh ? "目标完成 / 阻塞" : "Goal complete / blocked", zh ? "目标收束，声音不同" : "A goal finishes or gets blocked"],
				sessionStop: [zh ? "会话停止" : "Session stop", zh ? "会话被停止或归档" : "A session stops or gets archived"],
			},
			snd: {
				done: "done",
				alert: "alert",
				error: "error",
				stopped: "stopped",
			},
		};

		const textBlock = { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0, flex: 1 };

		function Row(props) {
			return jsx.jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "16px",
					padding: "12px 2px",
					minWidth: 0,
					borderBottom: props.last ? "0" : `0.5px solid ${T.border}`,
				},
				children: [
					jsx.jsxs("div", {
						style: textBlock,
						children: [
							jsx.jsx("div", { style: { fontSize: "14px", lineHeight: "22px", color: T.label }, children: props.title }),
							props.desc
								? jsx.jsx("div", { style: { fontSize: "12px", lineHeight: "18px", color: T.label2 }, children: props.desc })
								: null,
						],
					}),
					props.children,
				],
			});
		}

		function Section(props) {
			return jsx.jsxs("section", {
				style: { marginTop: "32px" },
				children: [
					jsx.jsxs("div", {
						style: { display: "flex", alignItems: "baseline", gap: "10px" },
						children: [
							jsx.jsx("h3", {
								style: { margin: 0, fontSize: "14px", fontWeight: 500, lineHeight: "20px", color: T.label },
								children: props.title,
							}),
							props.hint
								? jsx.jsx("span", { style: { fontSize: "12px", lineHeight: "18px", color: T.label2 }, children: props.hint })
								: null,
						],
					}),
					jsx.jsx("div", { style: { marginTop: "4px" }, children: props.children }),
				],
			});
		}

		function Switch(props) {
			const on = !!props.checked;
			return jsx.jsx("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": props.label,
				onClick: () => props.onChange(!on),
				style: {
					position: "relative",
					flex: "none",
					width: "36px",
					height: "20px",
					padding: 0,
					border: "0",
					borderRadius: "999px",
					cursor: "pointer",
					background: on ? T.brand : T.border,
					transition: "background 120ms ease",
				},
				children: jsx.jsx("span", {
					style: {
						position: "absolute",
						top: "2px",
						left: on ? "18px" : "2px",
						width: "16px",
						height: "16px",
						borderRadius: "999px",
						background: "#fff",
						boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
						transition: "left 120ms ease",
					},
				}),
			});
		}

		/** 输入框基础样式；聚焦时品牌色描边 + 光晕。 */
		function useField(focused) {
			return {
				font: "inherit",
				fontSize: "13px",
				lineHeight: "20px",
				color: T.label,
				background: T.bg1,
				border: `1px solid ${focused ? T.brand : T.border}`,
				boxShadow: focused ? `0 0 0 3px color-mix(in srgb, ${T.brand} 18%, transparent)` : "none",
				borderRadius: "8px",
				padding: "6px 10px",
				outline: "none",
				transition: "border-color 120ms ease, box-shadow 120ms ease",
			};
		}

		function NumberField(props) {
			const [draft, setDraft] = React.useState(String(props.value ?? ""));
			const [focused, setFocused] = React.useState(false);
			React.useEffect(() => setDraft(String(props.value ?? "")), [props.value]);
			const commit = () => {
				const n = Number(draft);
				if (!Number.isFinite(n)) setDraft(String(props.value ?? ""));
				else if (n !== props.value) props.onChange(n);
			};
			return jsx.jsxs("div", {
				style: { display: "flex", alignItems: "center", gap: "8px", flex: "none" },
				children: [
					jsx.jsx("input", {
						type: "number",
						min: props.min,
						max: props.max,
						step: props.step,
						value: draft,
						style: { ...useField(focused), width: "92px", boxSizing: "border-box", textAlign: "right" },
						onFocus: () => setFocused(true),
						onChange: (e) => setDraft(e.target.value),
						onBlur: () => {
							setFocused(false);
							commit();
						},
						onKeyDown: (e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						},
					}),
					jsx.jsx("span", { style: { fontSize: "12px", color: T.label2 }, children: props.unit }),
				],
			});
		}

		function Slider(props) {
			return jsx.jsxs("div", {
				style: { display: "flex", alignItems: "center", gap: "12px", flex: "0 1 260px", minWidth: "160px" },
				children: [
					jsx.jsx("input", {
						type: "range",
						min: props.min,
						max: props.max,
						step: props.step,
						value: props.value,
						onChange: (e) => props.onChange(Number(e.target.value)),
						style: { flex: 1, minWidth: 0, margin: 0, accentColor: T.brand },
					}),
					jsx.jsx("span", {
						style: {
							fontSize: "12px",
							lineHeight: "18px",
							color: T.label2,
							minWidth: "34px",
							textAlign: "right",
							fontVariantNumeric: "tabular-nums",
						},
						children: `${props.value}${props.unit || ""}`,
					}),
				],
			});
		}

		function TextField(props) {
			const [draft, setDraft] = React.useState(props.value ?? "");
			const [focused, setFocused] = React.useState(false);
			React.useEffect(() => setDraft(props.value ?? ""), [props.value]);
			const commit = () => {
				if (draft !== (props.value ?? "")) props.onChange(draft);
			};
			return jsx.jsx("input", {
				type: "text",
				spellCheck: false,
				placeholder: props.placeholder || "",
				value: draft,
				style: { ...useField(focused), width: "100%", boxSizing: "border-box" },
				onFocus: () => setFocused(true),
				onChange: (e) => setDraft(e.target.value),
				onBlur: () => {
					setFocused(false);
					commit();
				},
				onKeyDown: (e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				},
			});
		}

		function ChimeConfig(props) {
			if (props.view !== "page") return null; // 行内摘要不占位
			const form = props.form;
			const state = form && form.state;
			if (!state || state.status !== "ready" || !state.value) {
				return jsx.jsx("p", { style: { margin: 0, fontSize: "13px", color: T.label2 }, children: S.loading });
			}
			const v = state.value;
			const events = v.events || {};
			const sounds = v.sounds || {};
			const set = (path, value) => form.mutate([{ op: "set", path, value }]);
			const eventKeys = ["question", "approval", "account", "turnEnd", "turnError", "subagentEnd", "jobEnd", "goalEnd", "sessionStop"];
			const soundKeys = ["done", "alert", "error", "stopped"];
			const narrow = { flex: "0 1 320px", minWidth: "180px", display: "flex" };

			return jsx.jsxs("div", {
				style: { display: "flex", flexDirection: "column", maxWidth: "720px" },
				children: [
					jsx.jsx(Section, {
						title: S.groupSwitch,
						hint: S.groupSwitchHint,
						children: jsx.jsx(Row, {
							title: S.master,
							desc: S.masterDesc,
							last: true,
							children: jsx.jsx(Switch, { checked: v.enabled !== false, label: S.master, onChange: (on) => set(["enabled"], on) }),
						}),
					}),
					jsx.jsxs(Section, {
						title: S.groupAudio,
						children: [
							jsx.jsx(Row, {
								title: S.volume,
								desc: S.volumeDesc,
								children: jsx.jsx(Slider, {
									value: Number(v.volume) || 0,
									min: 0,
									max: 100,
									step: 5,
									unit: S.pct,
									onChange: (n) => set(["volume"], n),
								}),
							}),
							jsx.jsx(Row, {
								title: S.gap,
								desc: S.gapDesc,
								last: true,
								children: jsx.jsx(NumberField, {
									value: Number(v.minGapMs) || 0,
									min: 0,
									max: 10000,
									step: 50,
									unit: S.ms,
									onChange: (n) => set(["minGapMs"], n),
								}),
							}),
						],
					}),
					jsx.jsx(Section, {
						title: S.groupEvents,
						hint: S.groupEventsHint,
						children: eventKeys.map((key, index) =>
							jsx.jsx(
								Row,
								{
									title: S.ev[key][0],
									desc: S.ev[key][1],
									last: index === eventKeys.length - 1,
									children: jsx.jsx(Switch, {
										checked: events[key] !== false,
										label: S.ev[key][0],
										onChange: (on) => set(["events", key], on),
									}),
								},
								key,
							),
						),
					}),
					jsx.jsx(Section, {
						title: S.groupSounds,
						hint: S.groupSoundsHint,
						children: soundKeys.map((key, index) =>
							jsx.jsx(
								Row,
								{
									title: S.snd[key],
									desc: S.soundPath,
									last: index === soundKeys.length - 1,
									children: jsx.jsx("div", {
										style: narrow,
										children: jsx.jsx(TextField, {
											value: sounds[key],
											placeholder: `%USERPROFILE%\\Music\\${key}.wav`,
											onChange: (next) => set(["sounds", key], next),
										}),
									}),
								},
								key,
							),
						),
					}),
					jsx.jsxs(Section, {
						title: S.groupDebug,
						children: [
							jsx.jsx(Row, {
								title: S.debug,
								desc: S.debugDesc,
								children: jsx.jsx(Switch, { checked: v.debug === true, label: S.debug, onChange: (on) => set(["debug"], on) }),
							}),
							jsx.jsx(Row, {
								title: S.debugLog,
								desc: S.debugLogDesc,
								last: true,
								children: jsx.jsx("div", {
									style: narrow,
									children: jsx.jsx(TextField, {
										value: v.debugLog,
										placeholder: "%TEMP%\\dsh-chime.log",
										onChange: (next) => set(["debugLog"], next),
									}),
								}),
							}),
						],
					}),
					jsx.jsx("p", {
						style: { margin: "24px 0 0", fontSize: "12px", lineHeight: "18px", color: T.label2 },
						children: S.footer,
					}),
				],
			});
		}

		function apply(ctx) {
			ctx.effect(() =>
				ctx.slots.inject("plugins.row.config", () =>
					ctx.slots.register(
						{
							name: "plugins.row.config",
							key: ROW_KEY,
							label: () => (zh ? "提示音" : "Chime"),
						},
						ChimeConfig,
					),
				),
			);
		}
		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	},
});