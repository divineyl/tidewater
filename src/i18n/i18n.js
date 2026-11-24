// Bilingual Simplified Chinese / English localization helper (no external dependencies).
// Safe in headless Node tests (checks typeof window / localStorage / navigator).

const LANG_KEY = 'tidewater.lang';

export const ZH = {
	// Loader & entry
	'An island fishing game': '热带海岛垂钓与探索游戏',
	'Take the boat out, work the reef and the deep water, and sell your catch to Joe before dark.': '驾驶渔船前往珊瑚礁或深海垂钓，趁天黑前把渔获卖给码头的乔（Joe）。',
	'Starting…': '正在启动…',
	'Starting WebGPU…': '正在初始化 WebGPU…',
	'Building the atmosphere…': '正在构建大气与云层…',
	'Shaping the island…': '正在生成海岛地形…',
	'Building the village…': '正在搭建渔村建筑…',
	'Planting the island…': '正在种植海岛植被…',
	'Rolling in the swell…': '正在计算海岸涌浪…',
	'Growing the reef…': '正在构建珊瑚礁生态…',
	'Simulating the ocean…': '正在启动 FFT 海浪模拟…',
	'Preparing the shaders…': '正在准备渲染着色器…',
	'Compiling shaders…': '正在编译 GPU 着色器管线…',
	'Warming up…': '正在预热画面…',
	'Ready': '准备就绪',
	'The first launch compiles the shaders and can take a minute or two. Later visits load much faster.': '首次启动需编译 WebGPU 着色器，可能需要几十秒，后续打开将快很多。',
	'Tip': '提示',
	'Reload': '重新加载',

	// Start overlay & HUD chrome
	'Settings': '系统设置',
	'Photo mode (P)': '拍照模式 (P)',
	'Controls (F1)': '操作说明 (F1)',
	'Collapse (H)': '收起面板 (H)',
	'Open settings': '打开设置',
	'Settings (H)': '系统设置 (H)',
	'Controls': '操作说明',
	'Close': '关闭',
	'Close (F1)': '关闭 (F1)',
	'Exit photo mode': '退出拍照模式',
	'Take photo': '拍照保存',
	'Click to explore': '点击画面开始探索',
	'Move': '移动 / 驾驶',
	'Look': '视角',
	'Look around': '环顾四周',
	'Click to capture': '点击画面锁定鼠标指针',
	'Interact': '交互',
	'All controls': '全部快捷键',
	'Hide': '收起',
	'Photo mode': '拍照模式',
	'Reset to default': '恢复默认',
	'Double-click to reset': '双击标签恢复默认',
	'Click to type a value': '点击输入数值',
	'Click to type a time': '点击输入时间',
	'Depth': '水深',
	'knots': '节',
	'km/h': 'km/h',

	// Tabs & Folders
	'Ocean': '海洋',
	'Shore': '海岸',
	'Sky': '天空',
	'Camera': '镜头',
	'Vehicles': '载具',
	'Effects': '后期',
	'Performance': '性能',
	'Sea state': '海况风浪',
	'Water': '水体光学',
	'Surf': '岸边碎浪',
	'Boat wake': '船只尾迹',
	'Caustics': '水底焦散',
	'Sun': '日照时间',
	'Weather': '动态天气',
	'Atmosphere': '大气云雾',
	'View': '视角设置',
	'Actions': '快捷操作',
	'Handling': '操控调校',
	'Post-processing': '后期画质',
	'Live': '实时性能',
	'Quality': '画质与渲染',
	'Audio': '音频设置',
	'General': '常规与语言',

	// Presets & Select options
	'Conditions': '预设情景',
	'Calm': '风平浪静',
	'Breezy': '微风轻拂',
	'Choppy': '浪涌明显',
	'Storm': '狂风暴雨',
	'Clear': '晴空万里',
	'Fair': '晴朗微云',
	'Partly Cloudy': '多云转晴',
	'Overcast': '阴云密布',
	'Shower': '阵雨',
	'Quality preset': '画质档位',
	'Graphics quality': '画质预设',
	'Graphics': '画质',
	'Smooth (Low-end)': '流畅 (低配)',
	'Smooth': '流畅',
	'Eco': '省电',
	'Balanced': '均衡',
	'High': '高清',
	'Ultra': '电影',
	'Custom': '自定义',
	'Volumetric clouds': '体积云画质',
	'Water caustics': '水底焦散',
	'Low': '低',
	'Medium': '中',
	'Coastal Realistic': '海岸拟真',
	'Arcade Drift': '娱乐漂移',
	'1st person': '第一人称',
	'3rd person': '第三人称',
	'1st': '第一',
	'3rd': '第三',
	'Off': '关闭',
	'Simplified Chinese': '简体中文',
	'Language': '界面语言',

	// Slider / Toggle / Button / Info labels
	'Wind speed': '风速',
	'Wind direction': '风向',
	'Fetch': '风区距离',
	'Choppiness': '波峰锐度',
	'Ocean swell': '远洋涌浪',
	'Whitecaps': '白沫浪花',
	'Clarity': '海水清澈度',
	'Wave height': '碎浪浪高',
	'Wave period': '涌浪周期',
	'Breaking depth ratio': '破浪水深比',
	'Curl': '卷浪强度',
	'Spray': '浪花飞沫',
	'Lip sheet': '水舌薄片',
	'Wake height': '尾浪高度',
	'Wake foam': '尾迹泡沫',
	'Intensity': '强度',
	'Time of day': '时间',
	'Sun azimuth': '太阳方位角',
	'Advance time': '自动流逝时间',
	'Time speed': '时间流速',
	'Auto weather': '自动天气演变',
	'Evolution speed': '演变速度',
	'Trigger lightning': '立即触发闪电',
	'Status': '当前天气',
	'Barometer': '气压计',
	'Rain': '降水强度',
	'Cloud cover': '云层覆盖度',
	'Cirrus': '高空卷云',
	'Haze': '空气薄雾',
	'Sun shafts': '丁达尔光柱',
	'Air particles': '空气浮尘',
	'Exposure': '画面曝光',
	'Boat camera': '载具默认视角',
	'Field of view': '视野角 (FOV)',
	'Free camera (F)': '自由视角 (F)',
	'Summon Motorcycle': '召唤摩托车到身旁',
	'Reset Upright (R)': '扶正摩托车 (R)',
	'Headlight (L)': '前照大灯 (L)',
	'Handling preset': '操控手感预设',
	'Top speed': '最高极速',
	'Show rider (3rd person)': '显示车手 (第三人称)',
	'Ambient occlusion': '环境光遮蔽 (AO)',
	'Bounce light': '地面反射补光',
	'Sharpen': '对比自适应锐化',
	'Motion blur': '动态模糊快门',
	'Bloom': '辉光泛光',
	'Lens flare': '镜头眩光',
	'Saturation': '色彩饱和度',
	'Contrast': '画面对比度',
	'Vignette': '边缘暗角',
	'Film grain': '胶片颗粒',
	'Frame rate': '实时帧率',
	'CPU per frame': 'CPU 耗时',
	'Render size': '内部分辨率',
	'Render scale': '渲染分辨率缩放',
	'Auto FPS boost': '智能稳帧 (防掉帧)',
	'Automatically nudges internal resolution between 75% and your target scale during heavy storm scenes to keep frame rate smooth without pixelation.': '复杂天气或高速场景下在 75%–目标缩放之间无感平滑微调分辨率稳住帧率，避免出现马赛克。',
	'Anti-aliasing': '时域抗锯齿 (TAA)',
	'Shadows': '太阳阴影',
	'Water reflections': '水面屏幕空间反射',
	'Master volume': '主音量',
	'Mute (M)': '静音 (M)',
	'Reset defaults': '恢复全部默认设置',
	'Switch UI language between Simplified Chinese and English.': '实时切换简体中文与英文界面。',

	// Tooltips
	'Wind 10 m above the sea. Drives the local wind waves, whitecaps and spray.': '海面 10 米高处的风速，驱动风浪、白沫与浪花飞沫。',
	'Distance the wind has blown over open water: longer fetch, longer and higher waves.': '风吹过开阔海面的有效距离：越长则浪长越大、浪峰越高。',
	'Horizontal displacement: sharp crests, wide troughs.': '海浪水平位移畸变度：形成更尖锐的波峰与宽阔波谷。',
	'Lower = more suspended sediment and plankton (greener, murkier).': '数值越低代表悬浮泥沙和浮游生物越多，海水更翠绿浑浊。',
	'Waves break when height exceeds this fraction of the depth.': '当波高超过水深的该比例时触发破碎卷浪。',
	'Droplets and mist thrown off breaking crests.': '浪峰破碎时飞溅出的水滴与水雾。',
	'The thin sheet of water thrown forward by plunging breakers.': '卷破浪向前抛出的薄水片。',
	'Turns the sun\'s path around the island (0 = the real path: rises in the east, sets in the west).': '旋转太阳在岛屿上空的轨迹方位（0° 为真实路径：东升西落）。',
	'Automatically evolves tropical weather across day/night cycles.': '随昼夜循环缓慢而自然地演变热带海岛天气。',
	'Aerial perspective and marine haze density (1 = about 20 km visibility at sea level, 0 = clear air).': '空气透视与海雾浓度（1 约等于海平面能见度 20 km，0 为完全通透）。',
	'Volumetric light shafts and crepuscular rays in the haze (shadows of palms, the pier, hills and clouds). 0 turns them off.': '薄雾中的体积丁达尔光束（受棕榈树、栈桥、山丘与云层遮挡），0 为关闭。',
	'Dust, pollen, salt haze, seed fluff and the odd gnat drifting in the air: they catch the light when backlit by the sun. 0 turns them off.': '空气中漂浮的微尘、花粉与海盐微粒，逆光下会闪烁，0 为关闭。',
	'Sunlight reflected off the ground (bright sand) onto undersides and shaded faces: pier, eaves, hulls, trunks. 0 = off.': '明亮沙滩与地面向上反射的暖色环境漫反射补光（0 为关闭）。',
	'Contrast-adaptive sharpening after the temporal anti-aliasing.': '在时域抗锯齿（TAAU）后执行的对比度自适应锐化。',
	'Camera and object motion blur, as a shutter angle (180° = film look). 0 turns it off.': '相机与物体运动模糊，以快门角度表示（180° 接近电影感，0 为关闭）。',
	'Internal resolution; the temporal upscaler reconstructs the full output resolution.': '内部场景渲染缩放比例，由时域超分重建至完整屏幕分辨率。',
	'Temporal anti-aliasing: each pixel averages this many sub-pixel sample positions over successive frames (it also smooths dithered fades and shadow noise). More samples cost nothing per frame but take a few more frames to settle.': 'TAA 时域抗锯齿采样数：跨帧累加多组子像素抖动，有效消除边缘锯齿与阴影噪点。',
	'Screen-space reflections of the pier, boats and hills on the water.': '开启栈桥、船只与山丘在水面上的屏幕空间倒影。',

	// Modes & Weather status
	'Walking': '步行探索',
	'Swimming': '海中游泳',
	'Diving': '深水潜泳',
	'On deck': '船只甲板',
	'Boat': '驾驶渔船',
	'Motorcycle': '海岛越野摩托',
	'Free camera': '自由航拍视角',
	'Stalled · R': '进水熄火 · 按 R 救援',
	'Drift': '侧滑漂移',
	'Auto': '自动',

	// Interactive prompts & Toasts
	'Walk': '返回步行',
	'Board boat': '登上渔船',
	'Take the helm': '掌舵驾驶渔船',
	'Step ashore': '踏上岸边/栈桥',
	'Jump overboard': '跳入海中',
	'Climb ladder': '攀爬梯子上岸',
	'Leave helm   ·   V  camera': '离开舵位   ·   V 切换视角',
	'Dismount   ·   V  camera   ·   L  light': '下车   ·   V 切换视角   ·   L 开关大灯',
	'Recover bike   ·   E  dismount': '按 R 岸边复位   ·   E 下车',
	'Recover vehicle   ·   E  dismount': '按 R 救援上岸   ·   E 下车',
	'Ride motorcycle': '骑上摩托车',
	'Ride coastal buggy': '驾驶海岸越野车',
	'Coastal Buggy': '海岸越野车',
	'Buggy': '越野车',
	'Talk to Joe': '与乔 (Joe) 交谈',
	'Talk to Marta': '与玛塔 (Marta) 交谈',
	'Take out the rod': '取出鱼竿',
	'Hold to wind up, release to cast   ·   R  put the rod away': '按住左键蓄力，松开抛竿   ·   R 收起鱼竿',
	'Release to cast (hold longer to cast farther)': '松开左键抛竿（按住越久抛得越远）',
	'Strike now!': '快按左键提竿！',
	'Something\'s nibbling · wait until the bobber is pulled under': '有鱼正在轻啄 · 等浮漂整个沉下水面再提竿',
	'Waiting for a bite · right-click to reel the line in': '正在等鱼咬钩 · 右键可提前收线',
	'Reeling in': '正在收线…',
	'Too much tension · let go!': '张力过高 · 快松手缓线！',
	'Hold to reel · let go when the tension goes red': '按住左键收线 · 指针变红时松手防断线',
	'Leave': '结束对话',
	'Time running': '时间开始流逝',
	'Time paused': '时间已暂停',
	'Headlight on': '车灯已开启',
	'Headlight off': '车灯已关闭',
	'Flashlight on': '手电筒已开启',
	'Flashlight off': '手电筒已关闭',
	'Sound on': '声音已开启',
	'Sound off': '已静音',
	'Lightning strike triggered': '已触发雷电',
	'Motorcycle brought nearby': '摩托车已召唤至身旁',
	'Motorcycle returned to beach road': '摩托车已复位至海滩路边',
	'Motorcycle reset': '摩托车已扶正复位',
	'Coastal Buggy brought nearby': '海岸越野车已召唤至身旁',
	'Coastal Buggy returned to beach road': '海岸越野车已复位至海滩路边',
	'Vehicle reset': '载具已扶正复位',
	'Summon Coastal Buggy': '召唤海岸越野车',
	'Reset active vehicle (R)': '扶正当前载具 (R)',
	'Garage upgrades': '载具改装状态',
	'Off-road tires': '全地形轮胎',
	'Land powertrain': '陆地动力套件',
	'Suspension & snorkel': '越野悬挂与涉水喉',
	'LED light bar': '车顶 LED 探照灯条',
	'Fishing gear': '垂钓装备',
	'Boat upgrades': '渔船改装',
	'Land vehicle garage': '陆地载具改装（摩托 / 越野车通用）',
	'Rod out · hold left mouse to cast': '已取出鱼竿 · 按住左键蓄力抛竿',
	'Rod away': '已收起鱼竿',
	'Landed on the sand': '抛到了岸上，未能落水',
	'It took the bait and ran': '错失时机，鱼咬走鱼饵跑了',
	'Not yet · wait for it to pull under': '还太早 · 等浮漂被拉沉再点左键',
	'Fish on!': '中鱼了！',
	'Snap! The line broke': '啪！鱼线承受不住断了',
	'It threw the hook': '可惜，鱼脱钩溜走了',
	'Lost it': '收线中断，鱼跑了',
	'Out of fuel · buy diesel at the chandlery by the boathouse': '燃油耗尽 · 请前往船屋旁的玛塔商店购买柴油',
	'Screenshot saved': '高清截图已保存到下载目录',
	'Screenshot failed': '截图生成失败',
	'Postcard: On': '明信片水印：开',
	'Postcard: Off': '明信片水印：关',
	'Mouse sensitivity': '视角灵敏度',
	'Invert Y axis': '反转鼠标 Y 轴',
	'Paint livery': '车身涂装配色',
	'Headlight tint': '大灯色温光源',
	'Stock coastal': '原厂海岸涂装',
	'Coral red': '珊瑚暖红',
	'Coastal teal': '潮汐海青',
	'Dune gold': '沙丘鎏金',
	'Obsidian black': '火山哑黑',
	'Sea pearl': '珍珠浅白',
	'Warm halogen': '经典暖黄卤素',
	'Ice white LED': '高流明冰白 LED',
	'Amber fog': '琥珀穿透雾灯',
	'Ambient & sea': '海浪与环境音',
	'Vehicles & boat': '载具与渔船引擎',
	'Fishing & UI': '钓鱼收线音效',
	'Rain & thunder': '风雨与雷暴音效',
	'Export save': '导出存档 JSON',
	'Import save': '导入存档 JSON',
	'Save exported': '完整存档已导出下载',
	'Save imported': '存档已成功导入并恢复状态',
	'Invalid save file': '存档格式无效，未改动当前进度',
	'Language switched to Chinese': '已切换为简体中文',
	'Settings reset to defaults': '已恢复全部默认设置',
	'Gamepad connected': '检测到手柄已连接',
	'Gamepad disconnected': '手柄已断开连接',

	// Multiplayer
	'Multiplayer': '多人联机',
	'Connecting': '连接中',
	'Your nickname': '玩家昵称',
	'Connection mode': '联机模式',
	'P2P Room Code': '房间码联机 (P2P)',
	'LAN / Virtual LAN': '局域网 / 虚拟局域网',
	'Create P2P Room': '创建房间码房间',
	'Join Room': '加入房间',
	'Enter room code (e.g. TW-4829)': '输入房间码（如 TW-4829）',
	'Start LAN Host': '开启桌面局域网房主',
	'Connect LAN Host': '连接局域网房主',
	'Enter host IP:port (e.g. 192.168.1.50:5195)': '输入房主 IP:端口（如 192.168.1.50:5195）',
	'Copy': '复制',
	'Copied': '已复制到剪贴板',
	'Share waypoint': '分享当前位置 / 标点',
	'Disconnect': '断开联机',
	'Room created': '已创建房间',
	'Connected to room': '已加入房间',
	'Disconnected from room': '与房主的连接已断开',
	'Left multiplayer room': '已退出多人联机',
	'LAN room listening': '局域网房主已开启，等待连接',
	'Invalid room code': '房间码格式无效（请输入 4 位字母/数字或 TW-XXXX）',
	'Invalid IP or address': 'IP 或地址格式无效',
	'Room not found or host offline': '未找到该房间或房主不在线',
	'Host closed connection': '房主已关闭连接',
	'Failed to connect to room host': '无法连接至房主（可能被严格 NAT/防火墙阻挡，建议改用局域网或 Tailscale/ZeroTier 虚拟局域网）',
	'Failed to connect to LAN host': '无法连接至局域网房主，请确认 IP、端口与防火墙设置',
	'Signaling server timed out': 'P2P 信令服务器响应超时，可尝试切换局域网/虚拟局域网模式',
	'Room connection timed out': '连接房间超时',
	'LAN connection timed out': '连接局域网房主超时',
	'P2P connection error': 'P2P 连接异常',
	'LAN hosting requires Desktop Edition': '开启局域网房主需使用桌面客户端（Tidewater.exe）',
	'HTTPS browser blocks ws:// LAN connections; use Desktop Edition or P2P room code': 'HTTPS 在线网页受浏览器安全限制无法直连 ws:// 局域网，请改用桌面客户端或 P2P 房间码',
	'Waypoint shared with room': '已向全房间分享坐标信标',
	'Type chat message…': '输入聊天消息，回车发送…',
	'Send': '发送',
	'P2P uses a 4-char room code without buying servers (works on Web & Desktop). If strict NAT blocks connection, switch to LAN mode with same Wi-Fi or Tailscale/ZeroTier.': 'P2P 模式只需分享 4 位房间码即可免服务器互联（网页/桌面版通用）；若受校园网/移动内网限制连不上，可改用“局域网/虚拟局域网”配合同一 Wi-Fi 或 Tailscale/ZeroTier 100% 稳定直连。',

	// GameHUD & Fishing
	'Cooler': '随身冰桶',
	'Hold': '船载鱼舱',
	'Fuel': '燃油',
	'Sonar': '声呐',
	'Fish': '鱼体力',
	'Reel in': '收线中',
	'Ease off!': '快松手！',
	'It\'s running!': '鱼在猛冲！',
	'Slack line!': '线松了！',
	'Good pressure': '张力极佳',
	'★ New record': '★ 新纪录',
	'New species': '首次解锁图鉴',
	'Catch': '成功捕获',
	'First one in your fish log.': '首次收录进你的海岛图鉴。',
	'Length': '体长',
	'Weight': '体重',
	'Value': '估价',
	'in the cooler': '已放入冰桶',
	'let go': '已放生',
	'Click': '左键点击',
	'to continue': '或按 E 继续',
	'Fish hold': '船载保温鱼舱',
	'Release': '放生',
	'Nothing yet. Cast from the pier, the beach or the boat.': '暂无渔获。试试在栈桥、沙滩或渔船上抛竿吧。',
	'Fish log': '图鉴与历史记录',
	'Sell at the fish stand by the pier': '可在栈桥旁的乔鱼摊出售渔获',
	'Close (I)': '关闭 (I)',
	'Sell': '单条出售',
	'Your cooler is empty.': '冰桶空空如也。',
	'Leave (E)': '离开 (E)',
	'Top of the line': '已达顶级配置',
	'Upgrades take effect at once': '购买后立即装配生效',
	'Full': '已加满',
	'record': '破纪录',

	// Vendors
	'Joe · Fish buyer': '乔 · 海鲜收购摊',
	'Marta · Chandlery': '玛塔 · 船具与车行百货',
	'Let\'s see what you caught. Fair prices, cash.': '让我看看今天钓到什么好货，童叟无欺、现结现金。',
	'Nothing to sell? The grunts are biting off the pier.': '手头还没有鱼？栈桥附近石鲈常常成群觅食。',
	'Line, reels, a bigger hold, diesel. What do you need?': '鱼线、绕线轮、更大鱼舱和柴油都在这，要来点什么？',
	'Fish buyer': '海鲜收购摊',

	// Help sheet
	'Click the view to capture the mouse. Esc releases it.': '点击游戏画面锁定视角（Esc 释放鼠标），也支持外接手柄直连游玩。',
	'Interaction & Tools': '交互与工具',
	'Interface': '界面与拍照',
	'Sprint, boat/bike boost': '冲刺 / 渔船与摩托加速',
	'Jump, swim up, bike drift/brake': '跳跃 / 上浮 / 摩托手刹漂移',
	'Crouch, dive': '下潜 / 蹲下',
	'Interact': '交互与上下载具',
	'Board, helm, ride bike, trade': '登船、掌舵、骑摩托车、商店对话',
	'Vehicle camera': '切换人称视角',
	'1st / 3rd person (boat & bike)': '第一 / 第三人称切换（船与摩托）',
	'Fishing rod / Recover bike': '取出鱼竿 / 救援扶正摩托',
	'Upright or rescue from water': '翻倒扶正或将落水摩托拖回岸边',
	'Cast, strike, reel': '抛竿、提竿、收线',
	'Hold to wind up / reel': '长按蓄力或收线，红区松手',
	'Reel in an empty line': '右键空线收回',
	'Cooler and fish log': '打开冰桶与钓鱼图鉴',
	'Free camera': '自由飞跃视角开关',
	'Pause time': '暂停 / 恢复昼夜时间',
	'Flashlight / Headlight': '手电筒 / 摩托车大灯',
	'Bike horn': '摩托车鸣笛',
	'Mute': '全局静音开关',
	'Settings panel': '展开 / 收起设置面板',
	'Hides all interface · F2 capture · [ ] zoom': '隐藏全部 HUD · F2 截图 · [ / ] 调焦距',
	'Photo capture & zoom': '截图与焦距缩放',
	'In photo mode: F2 save PNG, [ ] zoom FOV': '拍照模式下按 F2 保存图片，[ / ] 调节广角长焦',
	'This sheet': '打开本快捷键面板',
	'Release the mouse': '退出锁定视角 / 关闭弹窗',
	'Gamepad': '手柄操作说明',
	'LS / RS move & look · RT/LT gas/brake · X interact · Y camera': '左摇杆移动转向 · 右摇杆视角 · RT/LT 油门刹车 · X 交互 · Y 视角',
	'How to play:': '玩法指引：',
	'catch fish, sell them to Joe at the fish stand by the pier, and buy upgrades from Marta at the chandlery by the boathouse. Both are on the map (lower right).': '在岸边、栈桥或驾船出海钓鱼，卖给栈桥旁的乔换取金币，再向玛塔购买高强鱼线、大鱼舱或柴油。两人位置均在右下角小地图标出。',
	'Replay the guide': '重看新手引导',

	// Milestone 2: Island Map, Waypoints & Lighthouse
	'Island map': '海岛全图',
	'Expand map & set navigation waypoint': '展开全岛地图并标记导航信标',
	'Full island map (N)': '展开全岛地图 (N)',
	'Click anywhere to place a waypoint · Right-click to clear': '点击地图任意位置放置导航信标 · 右键或清除按钮取消',
	'Pin Lighthouse': '定位灯塔',
	'Clear waypoint': '清除信标',
	'Close (N)': '关闭 (N)',
	'Lighthouse': '东岬灯塔',
	'Waypoint': '导航信标',
	'Waypoint set': '已放置导航信标',
	'Waypoint cleared': '已清除导航信标',
	'Arrived at waypoint': '已到达导航信标',
	'Player': '玩家',
	'Motorcycle': '摩托车',
	'Boat': '渔船',
	'Joe': '乔的鱼摊',
	'Marta': '玛塔商店',

	// v1.3 Expansion: GPU, Audio, Desktop, Boat, Lures, Journal, Rally, Co-op & Tournaments
	'GPU': '当前显卡',
	'gpu_tier_high': '高性能独显',
	'gpu_tier_mid': '主流独显',
	'gpu_tier_entry': '入门独显',
	'gpu_tier_integrated': '集成核显',
	'gpu_tier_software': '软渲染',
	'Island ambient radio': '海岛轻音乐电台',
	'Soft tropical chill chords over the coastal ambiance while above water.': '在海浪与自然实录之余播放舒缓的热带轻音乐和弦，可随时开启或关闭。',
	'Create desktop shortcut': '创建桌面快捷方式',
	'Desktop shortcut created': '已将「Tidewater 潮汐湾」快捷方式创建到桌面（程序本体仍在原盘目录）',
	'Failed to create shortcut': '创建桌面快捷方式失败',
	'Boat appearance': '渔船外观涂装',
	'Boat hull paint': '船体涂装配色',
	'Boat name': '船尾船名',
	'Unnamed Vessel': '未命名渔船',
	'Rename boat': '修改自定义船名',
	'Enter custom boat name (max 18 chars)': '输入你的专属船名（最多 18 个字符）：',
	'Boat renamed': '已更新船名',
	'Boat name cleared': '已清除自定义船名',
	'Classic Cream': '经典米白',
	'Deep Navy': '深海海军蓝',
	'Coral Sunset': '珊瑚晚霞橙',
	'Lagoon Green': '泻湖翡翠绿',
	'Harbor Yellow': '渔港明黄',
	'Midnight Slate': '午夜曜石青',
	'All-Purpose Lure': '通用全能拟饵',
	'Balanced bite rate across all waters.': '适合全海域各类鱼群的均衡拟饵。',
	'Reef Metal Jig': '珊瑚礁铁板拟饵',
	'Attracts reef snappers, groupers & Golden Trevally.': '吸引珊瑚礁笛鲷、石斑以及黄金鲹鱼王。',
	'Offshore Live Bait': '深海鲜活诱饵',
	'Boosts trophy size and attracts pelagic predators & Sailfish.': '显著提高鱼体平均重量，吸引大洋洄游鱼与太平洋旗鱼。',
	'Heavy Storm Plug': '暴雨沉铅鱼王饵',
	'Cuts through rough swell to lure Blue Marlin & Sailfish.': '无视恶劣风浪深潜，专为挑战传奇蓝枪鱼与旗鱼设计。',
	'Journal': '手账',
	'Journal (J)': '海岛手账与委托 (J)',
	'New island bounties posted!': '已刷新一批新的海岛悬赏订单！',
	'Rally started! Follow the glowing gates to the lighthouse': '越野计时赛开始！沿着发光路线门冲向东岬灯塔！',
	'Rally cancelled (left vehicle)': '已下车，本次计时赛取消',
	'Drive a motorcycle or buggy first (press E near vehicle)': '请先靠近摩托车或越野车按 E 驾驶后再开始计时赛',
	'Board friend\'s boat': '登上好友渔船甲板',
	'Ride in friend\'s buggy': '乘上好友越野车副驾',
	'Leave friend\'s boat': '离开好友渔船',
	'Leave friend\'s buggy': '下车（离开副驾）',
	'Friend\'s boat': '好友渔船甲板',
	'Passenger seat': '越野车副驾',
	'Fishing tournament': '联机钓鱼赛',
	'tourney_totalKg': '总渔获重量榜',
	'tourney_biggestKg': '单条最重鱼王榜',
	'tourney_speciesCount': '解锁鱼种数量榜',
	'Start tournament': '开启限时钓鱼赛',
	'End tournament': '提前结算钓鱼赛',
	'Fishing tournament started!': '全房限时钓鱼赛已开启！快去抛竿吧！',
	'Waiting for host to start a fishing tournament.': '等待房主发起联机限时钓鱼赛…',
	'Board friend\'s boat or buggy (Multiplayer)': '联机共乘：登上好友渔船或越野车副驾',
	'Cycle fishing lures': '切换随身携带的拟饵（通用 / 铁板 / 活饵 / 鱼王饵）',
	'Horn / Wave emote': '载具或渔船鸣笛 · 步行时挥手打招呼',
	'Start East Headland rally (in vehicle)': '在陆地载具上快速开始/重开东岬越野计时赛',
	'Island Journal (Bounties / Lures / Rally)': '打开海岛手账（悬赏 / 拟饵鱼王 / 打卡 / 计时赛）',
};

export const ZH_WEATHER = {
	clear: '晴空万里',
	fair: '晴朗微云',
	partlyCloudy: '多云转晴',
	overcast: '阴云密布',
	shower: '热带阵雨',
	storm: '海上雷暴',
};

export const ZH_FISH = {
	silverside: '硬头银汉鱼',
	mullet: '鲻鱼',
	needlefish: '鳄颌针鱼',
	sergeant: '五带豆娘鱼',
	grunt: '蓝纹石鲈',
	yellowtail: '黄尾笛鲷',
	chromis: '蓝光鳃鱼',
	tang: '大西洋蓝刺尾鱼',
	wrasse: '猪齿隆头鱼',
	parrot: '绿尾鹦嘴鱼',
	angel: '皇后刺盖鱼',
	jack: '马鲹',
	barracuda: '大梭鱼',
	grouper: '拿骚石斑鱼',
	redSnapper: '红笛鲷',
	tuna: '黑鳍金枪鱼',
	mahi: '鲯鳅（鬼头刀）',
	tarpon: '大西洋大海鲢',
	goldenTrevally: '黄金鲹 · 传奇',
	sailfish: '太平洋旗鱼 · 传奇',
	blueMarlin: '蓝枪鱼 · 霸主',
};

export const ZH_SURFACE = {
	sand: '沙滩',
	dirt: '土路',
	path: '土路',
	grass: '草地',
	rock: '礁石',
	shallow: '浅水涉滩',
	wetsand: '湿沙滩',
	wood: '木栈道',
	water: '水域',
};

export const ZH_PHASE = {
	'Night': '深夜',
	'Dawn': '黎明',
	'Sunrise': '日出',
	'Golden hour': '金色时刻',
	'Morning': '上午',
	'Midday': '正午',
	'Afternoon': '午后',
	'Sunset': '日落',
	'Dusk': '黄昏',
};

export const ZH_COMPASS = {
	'north': '正北方向',
	'north-east': '东北方向',
	'east': '正东方向',
	'south-east': '东南方向',
	'south': '正南方向',
	'south-west': '西南方向',
	'west': '正西方向',
	'north-west': '西北方向',
};

export const ZH_UPGRADES = {
	line: {
		name: '鱼线',
		levels: [ '8 磅尼龙线', '15 磅尼龙线', '30 磅编织PE线', '60 磅重型大力马线' ],
	},
	reel: {
		name: '绕线轮',
		levels: [ '旧纺车轮', '顺滑金属纺车轮', '鼓式海钓轮' ],
	},
	rod: {
		name: '鱼竿',
		levels: [ '旧手竿', '7 尺碳素路亚竿', '9 尺远投海竿' ],
	},
	hold: {
		name: '储鱼空间',
		levels: [ '随身冰桶 (30 kg)', '车载大冰柜 (70 kg)', '船载保温鱼舱 (160 kg)' ],
	},
	fuel: {
		name: '船用油箱',
		levels: [ '40 L 标准油箱', '80 L 扩容油箱', '150 L 远航油箱' ],
	},
	engine: {
		name: '船外引擎',
		levels: [ '老旧柴油机', '翻新柴油引擎', '涡轮增压柴油机' ],
	},
	fishFinder: {
		name: '探鱼声呐',
		levels: [ '未安装', 'HUD 探鱼声呐（实时显示水深与鱼群密度）' ],
	},
	lights: {
		name: '甲板照明',
		levels: [ '仅航行灯', '甲板探照大灯（夜间出海照亮周围水域）' ],
	},
	vehTires: {
		name: '全地形轮胎',
		levels: [ '原厂海滩胎', '深齿沙地越野胎（大幅减轻沙地阻力）', 'Baja 竞技泥地胎（顶级抓地与抗湿滑）' ],
	},
	vehEngine: {
		name: '陆地动力套件',
		levels: [ '原厂引擎调校', '高流量进排气（极速 +12 km/h）', '涡轮增压海岸调校（极速 +26 km/h）' ],
	},
	vehSuspension: {
		name: '越野悬挂与涉水喉',
		levels: [ '原厂弹簧悬挂', '长行程绞牙减震（爬坡加强 + 涉水 +0.25m）', 'Rally 氮气减震+高位涉水喉（涉水 +0.55m）' ],
	},
	vehLights: {
		name: '车顶 LED 探照灯条',
		levels: [ '标准卤素大灯', '双排 Rally LED 强光射灯（亮度与射程大幅提升）' ],
	},
};

export const ZH_GUIDE_CARDS = [
	{
		eyebrow: '欢迎来到潮汐湾 Tidewater',
		title: '海岛垂钓，满载而归',
		body: `<p>你可以在<b>沙滩</b>、<b>木栈桥</b>或驾着<b>渔船</b>出海钓鱼。浅滩、栈桥桩柱旁、珊瑚礁区和远海深水区栖息着截然不同的鱼类，它们还会随昼夜时间变化出没。</p>
			<p>将渔获卖给栈桥旁的 <b>乔 (Joe)</b> 赚取金币，再到船屋旁的 <b>玛塔 (Marta)</b> 商店升级更结实的鱼线、鱼轮、大鱼舱、探鱼声呐与夜间甲板探照灯。</p>`,
	},
	{
		eyebrow: '垂钓技巧',
		title: '抛竿、提竿、控线遛鱼',
		body: `<div class="gm-guide-list">
			<div class="gm-guide-row"><span class="k"><kbd>R</kbd></span><span>在水边或渔船甲板上拿出 / 收起鱼竿</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>按住</kbd><kbd>左键</kbd></span><span>蓄力后松开抛竿，按住越久抛得越远</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>左键</kbd></span><span>浮漂被整个<b>拉沉入水（出现 ! ）</b>时立刻点击提竿（轻微点动只是咬钩试探）</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>按住</kbd><kbd>左键</kbd></span><span>收线遛鱼；<b>当张力指针进入红色险区时松手</b>，否则会断线！</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>右键</kbd></span><span>未中鱼时直接收线回竿</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>I</kbd></span><span>查看冰桶渔获与鱼类图鉴</span></div>
		</div>`,
	},
	{
		eyebrow: '探索海岛',
		title: '拜访乔与玛塔 · 骑车与出海',
		body: `<div class="gm-guide-list">
			<div class="gm-guide-row"><span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>移动，鼠标控制视角，<kbd>Shift</kbd> 奔跑 / 加速</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>E</kbd></span><span>登船掌舵、骑上海岛摩托车、与乔和玛塔对话</span></div>
			<div class="gm-guide-row"><span class="k"><kbd>F1</kbd></span><span>随时打开全部按键说明，或重看本指南</span></div>
		</div>
		<div class="gm-guide-where">
			<div class="is-joe"><i></i><span><b>乔 (Joe)</b> · 栈桥旁海鲜收购摊</span><em data-where="joe"></em></div>
			<div class="is-marta"><i></i><span><b>玛塔 (Marta)</b> · 船屋旁船具与升级店</span><em data-where="marta"></em></div>
		</div>
		<p style="margin:0;color:var(--tw-ink-3);font-size:var(--tw-fs-sm)">两处摊位及你的摩托车/渔船都已实时标记在右下角小地图上。</p>`,
	},
];

export const ZH_GUIDE_TIPS = {
	rodOut: '按住<b>鼠标左键</b>蓄力，松开即可抛竿。试试在深水区、栈桥下或珊瑚礁附近作钓。',
	nibble: '浮漂正在轻微点动，说明有鱼在<b>试探鱼饵</b>；请耐心等待浮漂<b>猛然沉水（出现 !）</b>再点左键提竿。',
	fishOn: '<b>按住左键</b>持续收线；看到底部张力条冲向<b>红色危险区</b>时松开左键缓一缓，回落后再继续收线！',
	caught: '渔获已收入冰桶（按 <kbd>I</kbd> 查看）。可以带回栈桥旁找 <b>乔 (Joe)</b> 卖掉换钱。',
	full: '你的冰桶快<b>装满了</b>！记得找乔卖出渔获，或找玛塔购买更大的鱼舱。',
	boat: '这是你的渔船！按 <kbd>E</kbd> 登船，在舵轮前再按 <kbd>E</kbd> 驾驶（<kbd>W</kbd>/<kbd>S</kbd> 油门倒挡，<kbd>A</kbd>/<kbd>D</kbd> 舵向）。柴油可向玛塔购买。',
	joe: '<b>乔 (Joe)</b> 会按鱼种与重量现金收购你的全部渔获。按 <kbd>E</kbd> 看看能卖多少钱。',
	marta: '<b>玛塔 (Marta)</b> 出售各类强力钓具、鱼舱扩容、探鱼声呐与柴油。按 <kbd>E</kbd> 选购。',
};

const ZH_LOADER_TIPS = [
	'按 <kbd>R</kbd> 取出鱼竿。按住鼠标左键蓄力并松开抛竿，按住越久抛得越远。',
	'紧盯水中的浮漂：试探轻啄不用急，等到浮漂被整个拉入水中出现感叹号时再点左键刺鱼。',
	'中鱼搏斗时按住左键收线，同时让张力保持在绿区；大鱼猛冲发力时及时松手，避免断线。',
	'浅滩、栈桥桩底、珊瑚礁与深海各有不同鱼群，昼夜交替与天气变化也会影响咬钩概率。',
	'栈桥旁的乔 (Joe) 会按重量收购你钓到的鱼；鱼越肥大，单价越高。',
	'船屋旁的玛塔 (Marta) 出售高强鱼线、顺滑绕线轮、大鱼舱、探鱼声呐与甲板大灯升级。',
	'靠近海滩路边停着的越野摩托车或栈桥边的渔船，按 <kbd>E</kbd> 即可骑乘或登船；驾驶中按 <kbd>V</kbd> 切换人称视角。',
	'按 <kbd>H</kbd> 展开设置面板实时调节天气、海浪、画质与语言，按 <kbd>P</kbd> 进入纯净拍照模式。',
];

function safeGetStorage( k ) {

	try {

		return typeof localStorage !== 'undefined' ? localStorage.getItem( k ) : null;

	} catch {

		return null;

	}

}

function safeSetStorage( k, v ) {

	try {

		if ( typeof localStorage !== 'undefined' ) localStorage.setItem( k, v );

	} catch { /* ignore storage restrictions */ }

}

function detectInitialLang() {

	if ( typeof location !== 'undefined' && location.search ) {

		try {

			const p = new URLSearchParams( location.search ).get( 'lang' );
			if ( p === 'zh' || p === 'en' ) {

				safeSetStorage( LANG_KEY, p );
				return p;

			}

		} catch { /* ignore */ }

	}

	const saved = safeGetStorage( LANG_KEY );
	if ( saved === 'zh' || saved === 'en' ) return saved;
	if ( typeof navigator !== 'undefined' && typeof navigator.language === 'string' && /^zh\b/i.test( navigator.language ) ) {

		return 'zh';

	}

	return 'zh'; // default to Simplified Chinese when no browser pref overrides

}

let currentLang = detectInitialLang();
const listeners = new Set();

export function getLang() {

	return currentLang;

}

export function setLang( lang ) {

	const next = lang === 'en' ? 'en' : 'zh';
	if ( next === currentLang ) return currentLang;
	currentLang = next;
	safeSetStorage( LANG_KEY, currentLang );
	if ( typeof document !== 'undefined' && document.documentElement ) {

		document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

	}

	for ( const fn of [ ...listeners ] ) {

		try {

			fn( currentLang );

		} catch ( e ) {

			console.error( '[i18n] listener failed', e );

		}

	}

	return currentLang;

}

export function toggleLang() {

	return setLang( currentLang === 'zh' ? 'en' : 'zh' );

}

export function onLangChange( fn ) {

	if ( typeof fn !== 'function' ) return () => {};
	listeners.add( fn );
	return () => listeners.delete( fn );

}

const hasOwn = ( o, k ) => typeof k === 'string' && Object.prototype.hasOwnProperty.call( o, k );

export function tr( enText, zhOverride ) {

	if ( enText == null ) return '';
	const s = String( enText );
	if ( currentLang !== 'zh' ) return s;
	if ( zhOverride !== undefined ) return zhOverride;
	return hasOwn( ZH, s ) ? ZH[ s ] : s;

}

export function trWeather( id, fallback ) {

	if ( currentLang !== 'zh' ) return fallback || id;
	return hasOwn( ZH_WEATHER, id ) ? ZH_WEATHER[ id ] : tr( fallback || id );

}

export function trFish( id, fallback ) {

	if ( currentLang !== 'zh' ) return fallback || id;
	return hasOwn( ZH_FISH, id ) ? ZH_FISH[ id ] : ( fallback || id );

}

export function trSurface( name ) {

	if ( ! name ) return currentLang === 'zh' ? '沙滩' : 'Sand';
	const low = String( name ).toLowerCase();
	if ( currentLang !== 'zh' ) return low.charAt( 0 ).toUpperCase() + low.slice( 1 );
	return hasOwn( ZH_SURFACE, low ) ? ZH_SURFACE[ low ] : name;

}

export function trPhase( enPhase ) {

	if ( currentLang !== 'zh' ) return enPhase;
	return hasOwn( ZH_PHASE, enPhase ) ? ZH_PHASE[ enPhase ] : enPhase;

}

export function trCompass( enWord ) {

	if ( currentLang !== 'zh' ) return enWord;
	return hasOwn( ZH_COMPASS, enWord ) ? ZH_COMPASS[ enWord ] : enWord;

}

export function trUpgradeName( key, fallback ) {

	if ( currentLang !== 'zh' ) return fallback;
	return hasOwn( ZH_UPGRADES, key ) && ZH_UPGRADES[ key ]?.name ? ZH_UPGRADES[ key ].name : fallback;

}

export function trUpgradeLabel( key, index, fallback ) {

	if ( currentLang !== 'zh' ) return fallback;
	const idx = Number.isInteger( index ) && index >= 0 ? index : - 1;
	return hasOwn( ZH_UPGRADES, key ) && idx >= 0 ? ( ZH_UPGRADES[ key ]?.levels?.[ idx ] || fallback ) : fallback;

}

export function localizeLoader() {

	if ( typeof document === 'undefined' ) return;
	const L = document.getElementById( 'loader' );
	if ( ! L ) return;
	document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
	if ( currentLang !== 'zh' ) return;

	const set = ( sel, text ) => {

		const el = L.querySelector( sel );
		if ( el ) el.textContent = text;

	};

	set( '.loader-kicker', tr( 'An island fishing game' ) );
	set( '.loader-tagline', tr( 'Take the boat out, work the reef and the deep water, and sell your catch to Joe before dark.' ) );
	set( '.loader-status', tr( 'Starting…' ) );
	set( '.loader-note', tr( 'The first launch compiles the shaders and can take a minute or two. Later visits load much faster.' ) );
	set( '.loader-tip-label', tr( 'Tip' ) );
	const tips = L.querySelectorAll( '.loader-tip' );
	tips.forEach( ( el, i ) => {

		if ( ZH_LOADER_TIPS[ i ] ) el.innerHTML = ZH_LOADER_TIPS[ i ];

	} );

}
