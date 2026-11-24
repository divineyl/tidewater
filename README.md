# Tidewater · 潮汐湾

基于 **WebGPU & WGSL** 从零构建的实时热带海岛垂钓与越野探索游戏（无第三方渲染框架），Fork 扩展自 [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater)（MIT 开源协议）。

> **在线试玩 / Play Online:** https://divineyl.github.io/tidewater/
> **离线便携版下载 / Portable Download:** [GitHub Releases](https://github.com/divineyl/tidewater/releases/latest)
> **上游原版仓库 / Upstream:** [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater)

![Fishing off the pier at golden hour](docs/screenshot.jpg)

![The beach in the late afternoon](docs/screenshot-beach.jpg)

---

## 运行环境要求 / Requirements

- **浏览器 / Browser:** 支持 WebGPU 的现代桌面浏览器（Chrome / Edge 113+ 或 Safari），请在浏览器设置中开启「图形/硬件加速」。
- **桌面客户端 / Windows Desktop:** 提供免配置独立版 `Tidewater-Win64`（基于 Electron，开箱支持 WebGPU、本地存档目录与局域网开房）。
- **显卡 / GPU:** 推荐独立显卡或较新的集成显卡；内置 `流畅 / 省电 / 均衡 / 高清 / 电影` 5 档“零马赛克”画质预设、动态分辨率与启动显卡自动识别（防双显卡误跑核显提醒）。
- **首次加载 / First Load:** 首次启动需编译数百个 WGSL 着色器，可能需要 30 秒～2 分钟；后续访问将由浏览器缓存加速。

---

## 简体中文特性总览

### 原版核心世界与垂钓玩法
- **拟真海况与大气渲染：** 四级联 FFT 海浪模拟（Tessendorf 波谱）、破浪碎波与泡沫蕾丝、浅滩水波互动 Simulation、座头鲸跃水与渔船尾迹，搭配物理大气散射与体积积雨云/卷云。
- **完整海岛与生态：** 渔村木栈桥、灯塔、珊瑚礁鱼群、多种热带植被、海鸥与沙滩蟹、昼夜动态光源与水下潜游。
- **海钓经济系统：** 在浅滩、栈桥、礁石或驾驶渔船去深海垂钓 18 种加勒比鱼类；把鱼卖给栈桥旁的 **乔 (Joe)** 换取金币，再到船屋旁的 **玛塔 (Marta)** 升级鱼线、鱼轮、鱼竿、冰桶鱼舱、柴油油箱、柴油机、探鱼声呐与甲板大灯。

### 扩展增强功能（本仓库新增）
- **实时动态天气系统（6 档天候）：** `晴空万里 / 晴朗微云 / 多云转晴 / 阴云密布 / 热带阵雨 / 海上雷暴`，支持自动昼夜天气循环与手动调节，动态联动风浪、暴雨、云内闪电、雷声延迟、镜头雨滴/水花与鱼群咬钩概率。
- **双陆地载具探索系统：**
  - **海岸越野摩托车（Motorcycle）：** 五速升降挡、两轮离心压弯、手刹甩尾飘沙、驻车侧撑脚架、第 1/3 人称及车头转向随动 LED 车灯。
  - **四轮海岸越野车（Coastal Buggy）：** 珊瑚红钢管防滚架、木条货斗+冰桶+备胎、车顶 Rally LED 灯条、四角地形高度探测独立悬挂与专属 4 缸引擎及低音双音喇叭。
- **钓鱼经济 × 载具改装联动：** 玛塔商店新增 `陆地载具改装` 区块，可将海钓收入用于升级 **全地形轮胎**（大幅减沙地阻力、增强湿滑抓地）、**陆地动力套件**（极速与扭矩暴涨）、**越野悬挂与涉水喉**（加强爬坡并显著提升深水耐受防熄火）、**车顶 LED 探照灯条**（夜间与暴风雨亮度/射程强化）。
- **东岬景区公路 & 观景灯塔：** 新增通往东岬高地的平缓海景砂土盘山路与宏伟海边灯塔（含楼梯平台可攀爬、旋转菲涅尔透镜与双侧体积光柱）。
- **地面脚印/车辙交互与 3D 信标地图导航：** 实时动态记录人物脚印、四轮沙土车辙与草地倒伏；按 `N` 展开全岛高德风导航地图点击标注目标，场景天际升起高空青色导航光柱并伴随方位测距。
- **双语本地化、便捷设置与手柄支持：** 完整简体中文 / English 实时切换；支持鼠标视角灵敏度、Y 轴反转、4 路音频分轨音量 + **海岛轻音乐电台**、一键导出/导入 JSON 完整存档；支持 **6 款陆地车身涂装 + 6 款渔船船体涂装与自定义船名**、**3 种车灯色温与体积光锥**及**沙丘飞跃滞空特技播报**；纯净拍照模式新增**明信片水印开关**（叠加时间/天气/破纪录渔获）；内置在线贴图减重 **18 MB+**、纯离线系统字体启动与 Vite 分包提速，支持 Xbox / PlayStation 手柄即插即用。
- **独立 Windows 桌面端（`desktop/`）：** 基于 Electron 原生封装 `Tidewater.exe`，程序目录自带 `save-data/` 便携存档，裁剪冗余语言包立省 47 MB+，支持一键在桌面生成快捷方式（本体仍留在非系统盘）。
- **双模式多人联机与共乘钓鱼赛（`src/net/`）：** 支持 **4 位房间码 P2P 直连（网页/桌面互通）** 与 **桌面端内建 WebSocket 局域网 / Tailscale / ZeroTier 房主**；实时同步 3D 人物与载具外观/车灯/渔船涂装、远端抛竿浮漂鱼线与获鱼展示、地图好友坐标、昼夜天气、房间聊天、快捷互动表情（挥手/欢呼/鸣笛/集合），支持 **按 `X` 登上好友渔船甲板或越野车副驾**，并内置 **房主可控限时联机钓鱼赛排行榜**。
- **低配“零马赛克”深度优化（针对 GTX 1050 Ti / 核显）：** 修正 TAAU 放大抖动相位与缩放尺度（低配保持 85%+ 清晰度与 8× TAA），配合硬件 5-tap PCF 级联交错阴影、6+2 步 Fast SSR 水面反射、低配体积云抽帧、隔帧水下光照、距离自适应岸边浪场抽样及近距植物阴影剔除，告别方块马赛克同时流畅运行。
- **海岛手账、每日悬赏、拟饵鱼王与越野计时赛（`J`）：**
  - **乔的每日悬赏订单：** 实时追踪珊瑚礁订单、大鱼悬赏、深海急单与风雨传奇挑战，完成即自动发奖金；
  - **4 种拟饵（`B`）与 3 条传奇鱼王：** 在原本 18 种加勒比鱼类之外新增 `黄金鲹`、`太平洋旗鱼` 与风暴霸主 `蓝枪鱼`；
  - **8 处海岛明信片打卡点 & 东岬越野计时赛（`U`）：** 沿东岬盘山公路设 10 个发光检查点与金/银/铜牌圈速榜，并记录拍照打卡与地标探索奖励。

---

## 操作键位 / Controls

| 按键 / Key | 说明 / Action |
|---|---|
| `W` `A` `S` `D` | 步行 / 游泳 / 开船 / 骑摩托与开越野车转向油门 |
| `Mouse`（鼠标） | 转动视角（点击画面锁定鼠标，按 `Esc` 释放） |
| `Shift` | 奔跑 / 船只与载具氮气冲刺加速 |
| `Space`（空格） | 跳跃 / 潜水上浮 / 陆地载具手刹漂移 |
| `C` | 下潜（游泳状态） |
| `E` | 交互：登船、掌舵、上岸、骑摩托/开越野车、与乔或玛塔对话 |
| `X` | 多人联机共乘：登上好友渔船甲板一起海钓，或乘上好友越野车副驾 |
| `V` | 切换第 1 / 第 3 人称视角（驾驶渔船或陆地载具时） |
| `R` | 掏出/收起鱼竿；载具涉水熄火后救援复位至干地（或在车辆面板扶正） |
| `B` | 切换随身拟饵（通用拟饵 / 礁石铁板 / 深海活饵 / 暴雨鱼王饵） |
| `左键 LMB` | 按住蓄力松开抛竿 · 浮漂沉水（`!`）时点击提竿 · 按住收线 |
| `右键 RMB` | 空钩收线 |
| `L` | 开关载具前灯/车顶 LED 灯条，或开关随身手电筒 |
| `G` | 陆地载具或渔船鸣笛 · 步行时挥手打招呼（联机广播） |
| `U` | 驾驶陆地载具时快速开启/重开东岬越野计时赛 |
| `J` | 打开 / 关闭海岛手账（悬赏订单 · 拟饵鱼王 · 打卡点 · 越野计时赛） |
| `N` | 打开 / 关闭全岛大地图并点击放置/取消导航信标 |
| `I` / `Tab` | 打开冰桶鱼舱与鱼类图鉴 |
| `H` | 展开 / 收起系统设置面板（天气、海况、画质、载具、语言切换） |
| `P` | 纯净拍照模式（`[` / `]` 调节焦距，`F2` 或点击快门保存高清截图） |
| `F` / `T` / `M` | 自由飞行调试相机 / 暂停或流动时间 / 全局静音 |
| `F1` / `?` | 打开全功能按键说明与重看新手引导 |

---

## 本地运行、测试与打包 / Running Locally, Testing & Packaging

```sh
# 安装依赖 / Install dependencies
npm install

# 启动本地开发服务器 / Start Vite dev server (http://127.0.0.1:5189)
npm run dev

# 运行全套 Node 自动化测试 / Run all 9 automated test suites
npm test

# 构建生产静态包 / Build static site into dist/
npm run build

# 构建带启动脚本的离线便携目录与 ZIP（默认输出至 exports/，可通过环境变量 EXPORT_DIR 自定义）
# Build portable bundle & ZIP (outputs to exports/ by default, or set EXPORT_DIR)
npm run pack

# 构建精简版独立 Windows 桌面端目录与 ZIP（Tidewater-Win64）
# Build standalone Windows Desktop Edition & ZIP
npm run pack:desktop
```

---

## URL 启动参数 / URL Options

可在网址后拼接参数用于调试或低配精简运行，例如 `?fly&noAudio`：

| 参数 / Option | 作用 / Effect |
|---|---|
| `fly` | 以自由飞行相机启动 / Start in the free camera |
| `lang=en` / `lang=zh` | 指定默认语言 / Force English or Simplified Chinese |
| `noAudio` | 关闭音频 / Disable sound |
| `noClouds` | 跳过体积云 / Skip volumetric clouds |
| `noHaze` | 跳过大气雾与体积光柱 / Skip haze and sun shafts |
| `noCaustics` | 跳过水底焦散 / Skip caustics |
| `noVeg` | 跳过植被 / Skip vegetation |
| `noSim` | 跳过浅水波浪模拟 / Skip swash simulation |

---

## English Overview

An island fishing and coastal exploration game for the browser running directly on **WebGPU and WGSL** with a custom engine. This fork builds upon [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater) and adds:

- **Dynamic Weather System (`src/weather/`):** 6 weather presets with rain (`src/fx/Rain.js`), cloud lightning & delayed thunder (`src/fx/Lightning.js`), camera lens rain droplets (`src/post/LensDroplets.js`), and weather-responsive fish bite models (`src/game/Bites.js`).
- **Dual Land Vehicles (`src/vehicles/`) & Economy Upgrades (`src/game/Gear.js`):** Procedural Coastal Scrambler Motorcycle and 4-Wheel Coastal Buggy with multi-terrain suspension/tire/water physics, particle spray/dust (`src/fx/VehicleFX.js`), wheel ground tracks & grass trampling (`src/fx/GroundInteraction.js`), plus four purchasable garage upgrade tracks at Marta's Chandlery.
- **East Headland Road, Lighthouse & Waypoints (`src/world/Lighthouse.js`, `src/game/Minimap.js`, `src/fx/WaypointBeacon.js`):** Graded coastal road to East Headland Lighthouse, expandable full-island map (`N`), and 3D cyan light-pillar waypoint navigation.
- **Bilingual UI, Gamepad, Liveries, Presets & Camera Fixes:** Simplified Chinese / English localization (`src/i18n/`), `localStorage` persistence + JSON save export/import (`src/core/Prefs.js`), mouse sensitivity & Y-axis invert, 4-bus audio mixer, customizable vehicle paint liveries & volumetric headlight cones, jump-airtime stunt telemetry, photo postcard watermarks, ~18 MB lighter compressed online textures (`scripts/optimize-assets.mjs`), pointer-lock spike filtering (`src/core/Input.js`), and GitHub Pages + portable bundle packaging (`scripts/pack-portable.mjs`).

- **Desktop Client & Dual-Mode Co-op Multiplayer (`desktop/`, `src/net/`):** Standalone Windows `Tidewater.exe` with portable `save-data/` & locale pruning; P2P room codes + built-in LAN WebSocket relay, 3D remote avatars & boat/vehicle liveries, remote casting lines/bobbers, co-op boarding (`X`), quick emotes (`G`), and host-managed timed fishing tournaments.
- **Zero-Mosaic Low-Spec Optimizations & GPU Smart Detect:** Scaled TAAU jitter phases/resolution (85%+ crisp internal res), fast PCF cascaded shadows, Fast SSR water, tiered clouds, staggered underwater lighting, automatic GPU classification, and discrete-GPU advisory prompts.
- **Gameplay Expansion:** Boat hull liveries & custom boat name, 4 fishing lures (`B`), 3 legendary boss fish (`goldenTrevally`, `sailfish`, `blueMarlin`), daily fishing bounties, 8 scenic postcard viewpoints, East Headland 10-gate rally time trial (`U`), Island Journal (`J`), and optional Island Ambient Radio.

Every push to `main` runs `npm test && npm run build` and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

---

## 目录结构 / Project Layout

| 目录 / Folder | 说明 / Contents |
|---|---|
| `src/game/` | 钓鱼核心、鱼群咬钩与图鉴、乔的鱼摊与玛塔商店、全岛地图与引导 HUD |
| `src/vehicles/` | 摩托车与四轮海岸越野车物理模型、程序化几何生成与多载具管理器 |
| `src/weather/` | 动态天气系统、预设平滑插值与天气状态导出 |
| `src/fx/` | 雨滴、闪电、浪花、地面车辙草地交互、载具沙尘、高空导航信标 |
| `src/engine/` | 自研 WebGPU + WGSL 轻量级渲染引擎（数学库、场景图、GPU 资源、阴影） |
| `src/ocean/` | 四级联 FFT 海浪、碎波、浅水 Swash、尾迹模拟、水底焦散与水下光照 |
| `src/sky/` | 物理大气散射、体积云、天空盒与环境光照 |
| `src/world/` | 地形生成、渔村栈桥、东岬灯塔、珊瑚礁、植被、动物与座头鲸 |
| `src/post/` | 后处理管线（GTAO、水下混合、空气透视雾、TAAU 时序超分、动态模糊、镜面水滴） |
| `src/materials/` | 共享光照着色、阴影滤波、地面反弹光与局部分组动态灯光（含载具大灯） |
| `src/player/` | 第一/三人称步行、游泳、渔船掌舵、陆地载具驾驶与自由相机控制 |
| `src/audio/` | 基于 Web Audio 与实录采样/合成的立体声效与车辆/雷雨声场 |
| `src/i18n/` | 简体中文 / English 完整词典与实时语言切换系统 |
| `src/ui/` | 毛玻璃设置面板、载屏、快捷帮助、拍照模式与双语 HUD |
| `src/net/` | 双模式多人联机协议、P2P/局域网连接管理、远端三维形象与联机钓鱼赛 |
| `desktop/` | Windows 独立 Electron 桌面端入口、预加载桥接与内建 WebSocket 服务器 |
| `scripts/` | `optimize-assets.mjs` 贴图压缩、`pack-portable.mjs` 便携打包与 `pack-desktop.mjs` 桌面打包 |
| `test/` | 9 组 Node 无头自动化单元测试（钓鱼、载具、联机、显卡分类、悬赏、计时赛等） |
| `tools/` | 角色、摊位扫描资源与音频拉取转换工具 |

---

## 开源致谢与协议 / Credits & License

- 本项目源码以 **MIT License** 开源，详见 [LICENSE](LICENSE)。
- 原始海岛、WebGPU 引擎、海洋渲染、钓鱼基础机制与场景艺术资产均源自原作者 **Daniel Greenheck / DRG Software Solutions LLC** 的 [dgreenheck/tidewater](https://github.com/dgreenheck/tidewater)；第三方 CC0 / MIT / OFL 资产与学术参考文献完整列表请参阅 [CREDITS.md](CREDITS.md)。
