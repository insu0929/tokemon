// Shared by the Electron main process and the sandboxed renderer.
// Pokémon names: PokeAPI pokemon_species_names.csv (bundled for offline use).
(function (root) {
  'use strict';
  const messages = {
  "m0": {
    "ko": "활발",
    "en": "Lively",
    "ja": "元気",
    "zh-CN": "活泼"
  },
  "m1": {
    "ko": "피카피카!",
    "en": "Pika pika!",
    "ja": "ピカピカ！",
    "zh-CN": "皮卡皮卡！"
  },
  "m2": {
    "ko": "정상",
    "en": "Normal",
    "ja": "普通",
    "zh-CN": "正常"
  },
  "m3": {
    "ko": "피카!",
    "en": "Pika!",
    "ja": "ピカ！",
    "zh-CN": "皮卡！"
  },
  "m4": {
    "ko": "약해짐",
    "en": "Weak",
    "ja": "弱っている",
    "zh-CN": "虚弱"
  },
  "m5": {
    "ko": "피…카…",
    "en": "Pi…ka…",
    "ja": "ピ…カ…",
    "zh-CN": "皮…卡…"
  },
  "m6": {
    "ko": "기절",
    "en": "Fainted",
    "ja": "ひんし",
    "zh-CN": "濒死"
  },
  "m7": {
    "ko": "잠깐 쉬어야겠어요…",
    "en": "I need a little rest…",
    "ja": "少し休みます…",
    "zh-CN": "我需要休息一下…"
  },
  "m8": {
    "ko": "볼에서 휴식 중",
    "en": "Resting in ball",
    "ja": "ボールで休憩中",
    "zh-CN": "在球中休息"
  },
  "m9": {
    "ko": "사용 한도 소진 · 포켓볼에서 휴식 중. 드래그로 이동",
    "en": "Usage limit reached. Resting in the Poké Ball. Drag to move.",
    "ja": "利用上限に達しました。ボールで休憩中。ドラッグで移動",
    "zh-CN": "已达使用上限，正在精灵球中休息。拖动可移动"
  },
  "m10": {
    "ko": "{0}: 클릭하면 울음소리, 드래그하면 이동",
    "en": "{0}: click to hear its cry, drag to move",
    "ja": "{0}：クリックで鳴き声、ドラッグで移動",
    "zh-CN": "{0}：点击听叫声，拖动可移动"
  },
  "m11": {
    "ko": "지금 쓸 수 있는 한도를 다 썼어요.\n포켓볼에서 쉬어 갈게요.",
    "en": "Usage limit reached.\nTime to rest in the Poké Ball.",
    "ja": "利用上限に達しました。\nボールで休みます。",
    "zh-CN": "已达使用上限。\n去精灵球里休息一下。"
  },
  "m12": {
    "ko": "다시 사용할 수 있어요!\n함께해요.",
    "en": "Ready again!\nLet's go!",
    "ja": "また使えます！\n一緒に行こう。",
    "zh-CN": "又可以使用了！\n一起出发吧。"
  },
  "m13": {
    "ko": "{0} · 레벨 진화 없음",
    "en": "{0} · No level evolution",
    "ja": "{0} · レベル進化なし",
    "zh-CN": "{0} · 无等级进化"
  },
  "m14": {
    "ko": "가방",
    "en": "Bag",
    "ja": "バッグ",
    "zh-CN": "背包"
  },
  "m15": {
    "ko": "상점",
    "en": "Shop",
    "ja": "ショップ",
    "zh-CN": "商店"
  },
  "m16": {
    "ko": "{0}에게 사용할 아이템을 골라 주세요. 사용하면 1개가 소모돼요.",
    "en": "Choose an item for {0}. One item is consumed per use.",
    "ja": "{0}に使う道具を選んでください。使うと1個消費します。",
    "zh-CN": "选择给{0}使用的道具。每次消耗1个。"
  },
  "m17": {
    "ko": "진화 아이템을 구입해 가방에 담으세요.",
    "en": "Buy evolution items for your bag.",
    "ja": "進化の道具を買ってバッグに入れましょう。",
    "zh-CN": "购买进化道具并放入背包。"
  },
  "m18": {
    "ko": "가방이 비어 있어요. 상점에서 진화 아이템을 구입해 보세요.",
    "en": "Your bag is empty. Buy evolution items in the shop.",
    "ja": "バッグは空です。ショップで進化の道具を買いましょう。",
    "zh-CN": "背包为空。去商店购买进化道具吧。"
  },
  "m19": {
    "ko": "보유 {0}개",
    "en": "Owned: {0}",
    "ja": "所持数：{0}個",
    "zh-CN": "持有：{0}个"
  },
  "m20": {
    "ko": "{0} 토큰 · 구매",
    "en": "{0} tokens · Buy",
    "ja": "{0}トークン · 購入",
    "zh-CN": "{0} token · 购买"
  },
  "m21": {
    "ko": "{0} {1} 토큰으로 구매",
    "en": "Buy {0} for {1} tokens",
    "ja": "{0}を{1}トークンで購入",
    "zh-CN": "用{1} token购买{0}"
  },
  "m22": {
    "ko": " · {0} 토큰 부족",
    "en": " · Need {0} more tokens",
    "ja": " · あと{0}トークン必要",
    "zh-CN": " · 还差{0} token"
  },
  "m23": {
    "ko": "{0}(으)로 진화",
    "en": "Evolve into {0}",
    "ja": "{0}に進化",
    "zh-CN": "进化为{0}"
  },
  "m24": {
    "ko": "현재 포켓몬에게 사용 불가",
    "en": "Cannot use on this Pokémon",
    "ja": "このポケモンには使えません",
    "zh-CN": "无法对当前宝可梦使用"
  },
  "m25": {
    "ko": "{0} 사용: {1}",
    "en": "Use {0}: {1}",
    "ja": "{0}を使う：{1}",
    "zh-CN": "使用{0}：{1}"
  },
  "m26": {
    "ko": "{0} 1개를 가방에 담았어요.",
    "en": "Added one {0} to your bag.",
    "ja": "{0}を1個バッグに入れました。",
    "zh-CN": "已将1个{0}放入背包。"
  },
  "m27": {
    "ko": "{0}을 사용했어요.",
    "en": "Used {0}.",
    "ja": "{0}を使いました。",
    "zh-CN": "使用了{0}。"
  },
  "m28": {
    "ko": "체험 잔액을 설정했어요. 상점에서 아이템을 구입해 보세요.",
    "en": "Demo balance set. Try buying an item.",
    "ja": "体験用の残高を設定しました。道具を買ってみましょう。",
    "zh-CN": "已设置体验余额。试着购买道具吧。"
  },
  "m29": {
    "ko": "+{0} EXP · {1} 토큰",
    "en": "+{0} EXP · {1} tokens",
    "ja": "+{0} EXP · {1}トークン",
    "zh-CN": "+{0} EXP · {1} token"
  },
  "m30": {
    "ko": "레벨 업! Lv.{0} → Lv.{1}",
    "en": "Level up! Lv.{0} → Lv.{1}",
    "ja": "レベルアップ！ Lv.{0} → Lv.{1}",
    "zh-CN": "升级了！ Lv.{0} → Lv.{1}"
  },
  "m31": {
    "ko": "어라? {0}의 모습이…!",
    "en": "What? {0} is changing…!",
    "ja": "おや？ {0}の様子が…！",
    "zh-CN": "咦？{0}的样子…！"
  },
  "m32": {
    "ko": "축하해요! {0}(으)로 진화했어요!",
    "en": "Congratulations! Evolved into {0}!",
    "ja": "おめでとう！ {0}に進化しました！",
    "zh-CN": "恭喜！进化成{0}了！"
  },
  "m33": {
    "ko": "아이템 처리에 실패했어요. 잔액과 사용 가능한 포켓몬을 확인해 주세요.",
    "en": "Item action failed. Check your balance and eligible Pokémon.",
    "ja": "道具の処理に失敗しました。残高と対象のポケモンを確認してください。",
    "zh-CN": "道具操作失败。请检查余额及适用的宝可梦。"
  },
  "m34": {
    "ko": "경험치 저장 또는 표시 실패. 몬스터를 눌러 다시 불러와 주세요.",
    "en": "Could not save or display EXP. Click your Pokémon to reload.",
    "ja": "経験値の保存・表示に失敗しました。ポケモンをクリックして再読み込みしてください。",
    "zh-CN": "经验值保存或显示失败。点击宝可梦重新加载。"
  },
  "m35": {
    "ko": "+{0} EXP · {1} {2} 토큰",
    "en": "+{0} EXP · {1} {2} tokens",
    "ja": "+{0} EXP · {1} {2}トークン",
    "zh-CN": "+{0} EXP · {1} {2} token"
  },
  "m36": {
    "ko": "실제 토큰 미연동",
    "en": "Usage not linked",
    "ja": "実際の使用量は未連携",
    "zh-CN": "未关联实际用量"
  },
  "m37": {
    "ko": "토큰 잔여량 연동 전의 예시입니다",
    "en": "Demo health before linking usage limits",
    "ja": "残量を連携する前の体験用HPです",
    "zh-CN": "关联剩余用量前的体验生命值"
  },
  "m38": {
    "ko": "{0} 연동 중\n{1}토큰 = 1 EXP",
    "en": "{0} linked\n{1} tokens = 1 EXP",
    "ja": "{0} 連携中\n{1}トークン = 1 EXP",
    "zh-CN": "已关联{0}\n{1} token = 1 EXP"
  },
  "m39": {
    "ko": "{0} {1}시간 한도의 남은 비율입니다",
    "en": "Remaining {0} {1}-hour allowance",
    "ja": "{0}の{1}時間枠の残量です",
    "zh-CN": "{0}的{1}小时额度剩余比例"
  },
  "m40": {
    "ko": "{0} 잔여량은 아직 연동하지 않아 체험 슬라이더로 조절합니다",
    "en": "{0} limits are not linked. Use the demo slider.",
    "ja": "{0}の残量は未連携です。体験スライダーで調整できます。",
    "zh-CN": "尚未关联{0}的剩余额度。请使用体验滑块调整。"
  },
  "m41": {
    "ko": " · {0} 초기화",
    "en": " · Resets {0}",
    "ja": " · {0} リセット",
    "zh-CN": " · {0}重置"
  },
  "m42": {
    "ko": " (초기화 예상)",
    "en": " (estimated reset)",
    "ja": "（リセット推定）",
    "zh-CN": "（预计重置）"
  },
  "m43": {
    "ko": "{0} {1}시간 한도\n{2}% 남음{3}{4}",
    "en": "{0} {1}-hour limit\n{2}% left{3}{4}",
    "ja": "{0} {1}時間枠\n残り{2}%{3}{4}",
    "zh-CN": "{0} {1}小时额度\n剩余{2}%{3}{4}"
  },
  "m44": {
    "ko": "Codex 한도 정보가 아직 없어요",
    "en": "Codex limits not available yet",
    "ja": "Codexの上限情報はまだありません",
    "zh-CN": "暂无Codex额度信息"
  },
  "m45": {
    "ko": "5h 미확인",
    "en": "5h unknown",
    "ja": "5h 未確認",
    "zh-CN": "5h 未知"
  },
  "m46": {
    "ko": "주간 {0}%",
    "en": "Week {0}%",
    "ja": "週間 {0}%",
    "zh-CN": "每周 {0}%"
  },
  "m47": {
    "ko": "주간 미확인",
    "en": "Week unknown",
    "ja": "週間 未確認",
    "zh-CN": "每周 未知"
  },
  "m48": {
    "ko": "5시간 잔여량",
    "en": "5-hour allowance remaining",
    "ja": "5時間枠の残量",
    "zh-CN": "5小时剩余额度"
  },
  "m49": {
    "ko": "체험 잔여량",
    "en": "Demo allowance remaining",
    "ja": "体験用の残量",
    "zh-CN": "体验剩余额度"
  },
  "m50": {
    "ko": "주간 한도 소진 · 볼에서 휴식",
    "en": "Weekly limit reached · Resting in ball",
    "ja": "週間上限に到達 · ボールで休憩",
    "zh-CN": "已达每周上限 · 在球中休息"
  },
  "m51": {
    "ko": "주간 {0}% 남음{1}",
    "en": "Week: {0}% left{1}",
    "ja": "週間 残り{0}%{1}",
    "zh-CN": "每周剩余{0}%{1}"
  },
  "m52": {
    "ko": "\n{0} 초기화",
    "en": "\nResets {0}",
    "ja": "\n{0} リセット",
    "zh-CN": "\n{0}重置"
  },
  "m53": {
    "ko": ", {0} 초기화",
    "en": ", resets {0}",
    "ja": "、{0} リセット",
    "zh-CN": "，{0}重置"
  },
  "m54": {
    "ko": "\n마지막 확인: {0}\n로그 기준이며 실제 잔여량과 차이가 날 수 있어요.",
    "en": "\nLast checked: {0}\nBased on logs; actual allowance may differ.",
    "ja": "\n最終確認：{0}\nログに基づくため実際の残量と異なる場合があります。",
    "zh-CN": "\n上次检查：{0}\n基于日志，可能与实际剩余额度不同。"
  },
  "m55": {
    "ko": "체험 모드로 바꿨어요.",
    "en": "Switched to demo mode.",
    "ja": "体験モードに切り替えました。",
    "zh-CN": "已切换到体验模式。"
  },
  "m56": {
    "ko": "{0} 사용 기록을 확인하고 있어요. 누적 사용량을 반영합니다.",
    "en": "Checking {0} logs and crediting accumulated usage.",
    "ja": "{0}のログを確認し、累積使用量を反映しています。",
    "zh-CN": "正在检查{0}日志并计入累计用量。"
  },
  "m57": {
    "ko": "Lv.1 {0}(으)로 초기화했어요!",
    "en": "Reset to Lv.1 {0}!",
    "ja": "Lv.1の{0}にリセットしました！",
    "zh-CN": "已重置为Lv.1的{0}！"
  },
  "m58": {
    "ko": "초기화하지 못했어요. 몬스터를 눌러 다시 불러와 주세요.",
    "en": "Reset failed. Click your Pokémon to reload.",
    "ja": "リセットできませんでした。ポケモンをクリックして再読み込みしてください。",
    "zh-CN": "重置失败。点击宝可梦重新加载。"
  },
  "m59": {
    "ko": "진행 중인 동작이 끝난 뒤 다시 선택해 주세요.",
    "en": "Please wait for the current action to finish.",
    "ja": "現在の動作が終わってから選んでください。",
    "zh-CN": "请等待当前动作完成后再选择。"
  },
  "m60": {
    "ko": "{0}와 함께해요!",
    "en": "Let's go, {0}!",
    "ja": "{0}と一緒に！",
    "zh-CN": "和{0}一起出发！"
  },
  "m61": {
    "ko": "포켓몬을 불러오지 못했어요. 눌러서 다시 시도해 주세요.",
    "en": "Could not load Pokémon. Click to retry.",
    "ja": "ポケモンを読み込めませんでした。クリックして再試行してください。",
    "zh-CN": "无法加载宝可梦。点击重试。"
  },
  "m62": {
    "ko": "포켓몬을 데려오는 중…",
    "en": "Loading Pokémon…",
    "ja": "ポケモンを呼んでいます…",
    "zh-CN": "正在加载宝可梦…"
  },
  "m63": {
    "ko": "사용 한도를 다 써서\n포켓볼에서 쉬고 있어요.",
    "en": "Usage limit reached.\nResting in the Poké Ball.",
    "ja": "利用上限に達したため\nボールで休んでいます。",
    "zh-CN": "已达使用上限。\n正在精灵球中休息。"
  },
  "m64": {
    "ko": "드래그로 이동 · 클릭하면 울어요",
    "en": "Drag to move · Click for cry",
    "ja": "ドラッグで移動 · クリックで鳴き声",
    "zh-CN": "拖动可移动 · 点击听叫声"
  },
  "m65": {
    "ko": "몬스터나 성장 기록을 불러오지 못했어요. 눌러서 다시 시도해 주세요.",
    "en": "Could not load Pokémon or progress. Click to retry.",
    "ja": "ポケモンか成長記録を読み込めませんでした。クリックして再試行してください。",
    "zh-CN": "无法加载宝可梦或成长记录。点击重试。"
  },
  "m66": {
    "ko": "다시 사용할 수 있을 때까지\n포켓볼에서 쉬고 있어요.",
    "en": "Resting in the Poké Ball\nuntil usage is available again.",
    "ja": "また使えるようになるまで\nボールで休んでいます。",
    "zh-CN": "正在精灵球中休息，\n等待额度恢复。"
  },
  "m67": {
    "ko": "음소거 중 · 스피커 버튼으로 해제",
    "en": "Muted · Click speaker to unmute",
    "ja": "ミュート中 · スピーカーで解除",
    "zh-CN": "已静音 · 点击扬声器取消"
  },
  "m68": {
    "ko": "쉬는 중… 잔여량을 올려 주세요",
    "en": "Resting… Increase the allowance",
    "ja": "休憩中… 残量を増やしてください",
    "zh-CN": "休息中… 请提高剩余额度"
  },
  "m69": {
    "ko": "소리를 재생하지 못했어요. 다시 눌러 주세요.",
    "en": "Could not play sound. Click to retry.",
    "ja": "音を再生できませんでした。もう一度クリックしてください。",
    "zh-CN": "无法播放声音。请再次点击。"
  },
  "m70": {
    "ko": "다시 힘이 나요!",
    "en": "Feeling better!",
    "ja": "また元気になった！",
    "zh-CN": "又有精神了！"
  },
  "m71": {
    "ko": "포켓몬",
    "en": "Pokémon",
    "ja": "ポケモン",
    "zh-CN": "宝可梦"
  },
  "m72": {
    "ko": "음소거 해제",
    "en": "Unmute",
    "ja": "ミュート解除",
    "zh-CN": "取消静音"
  },
  "m73": {
    "ko": "음소거",
    "en": "Mute",
    "ja": "ミュート",
    "zh-CN": "静音"
  },
  "m74": {
    "ko": "이미지·소리를 받지 못했어요. 인터넷 연결 후 다시 눌러 주세요.",
    "en": "Could not load image or audio. Connect to the internet and retry.",
    "ja": "画像・音声を取得できませんでした。ネット接続後に再試行してください。",
    "zh-CN": "无法加载图像或声音。请连接网络后重试。"
  },
  "m75": {
    "ko": "Tokemon · 피카츄",
    "en": "Tokemon · Pikachu",
    "ja": "Tokemon · ピカチュウ",
    "zh-CN": "Tokemon · 皮卡丘"
  },
  "m76": {
    "ko": "잔액 설정은 체험 모드에서만 가능해요.",
    "en": "Balance can only be set in demo mode.",
    "ja": "残高の設定は体験モードのみ可能です。",
    "zh-CN": "仅可在体验模式中设置余额。"
  },
  "m77": {
    "ko": "Tokemon · 드래그로 이동 / 클릭하면 울음소리",
    "en": "Tokemon · Drag to move / Click for cry",
    "ja": "Tokemon · ドラッグで移動 / クリックで鳴き声",
    "zh-CN": "Tokemon · 拖动可移动 / 点击听叫声"
  },
  "m78": {
    "ko": "포켓몬 선택 · 1세대",
    "en": "Choose Pokémon · Generation I",
    "ja": "ポケモン選択 · 第1世代",
    "zh-CN": "选择宝可梦 · 第一世代"
  },
  "m79": {
    "ko": "사용량 연동",
    "en": "Link usage",
    "ja": "使用量の連携",
    "zh-CN": "关联用量"
  },
  "m80": {
    "ko": "체험 (수동 입력)",
    "en": "Demo (manual input)",
    "ja": "体験（手動入力）",
    "zh-CN": "体验（手动输入）"
  },
  "m81": {
    "ko": "위치 초기화",
    "en": "Reset position",
    "ja": "位置をリセット",
    "zh-CN": "重置位置"
  },
  "m82": {
    "ko": "현재 선택한 포켓몬 성장 초기화 · Lv.1",
    "en": "Reset this Pokémon's growth · Lv.1",
    "ja": "選択中のポケモンの成長をリセット · Lv.1",
    "zh-CN": "重置当前宝可梦的成长 · Lv.1"
  },
  "m83": {
    "ko": "종료",
    "en": "Quit",
    "ja": "終了",
    "zh-CN": "退出"
  },
  "m84": {
    "ko": "피카츄: 클릭하면 울음소리, 드래그하면 이동, 오른쪽 클릭하면 메뉴",
    "en": "Pikachu: click for cry, drag to move, right-click for menu",
    "ja": "ピカチュウ：クリックで鳴き声、ドラッグで移動、右クリックでメニュー",
    "zh-CN": "皮卡丘：点击听叫声，拖动可移动，右键打开菜单"
  },
  "m85": {
    "ko": "드래그로 이동 · 클릭하면 울음소리 · 우클릭 메뉴",
    "en": "Drag to move · Click for cry · Right-click for menu",
    "ja": "ドラッグで移動 · クリックで鳴き声 · 右クリックでメニュー",
    "zh-CN": "拖动可移动 · 点击听叫声 · 右键菜单"
  },
  "m86": {
    "ko": "볼륨",
    "en": "Volume",
    "ja": "音量",
    "zh-CN": "音量"
  },
  "m87": {
    "ko": "클릭: 음소거 · 길게 누르기: 볼륨",
    "en": "Click: mute · Hold: volume",
    "ja": "クリック：ミュート · 長押し：音量",
    "zh-CN": "点击：静音 · 长按：音量"
  },
  "m88": {
    "ko": "토큰 잔여량 미연동, 예시 체력 바",
    "en": "Demo HP; usage limits not linked",
    "ja": "残量未連携・体験用HPバー",
    "zh-CN": "未关联剩余额度，体验生命值条"
  },
  "m89": {
    "ko": "예시 잔여량",
    "en": "Demo remaining",
    "ja": "体験用の残量",
    "zh-CN": "体验剩余量"
  },
  "m90": {
    "ko": "주간 잔여량",
    "en": "Weekly remaining",
    "ja": "週間の残量",
    "zh-CN": "每周剩余量"
  },
  "m91": {
    "ko": "다음 레벨까지 경험치",
    "en": "EXP toward next level",
    "ja": "次のレベルまでの経験値",
    "zh-CN": "升至下一级的经验值"
  },
  "m92": {
    "ko": "아이템 메뉴",
    "en": "Item menu",
    "ja": "道具メニュー",
    "zh-CN": "道具菜单"
  },
  "m93": {
    "ko": "토큰 미연동 상태 체험",
    "en": "Try without linking usage",
    "ja": "使用量未連携の体験",
    "zh-CN": "未关联用量的体验"
  },
  "m94": {
    "ko": "체험용 잔여 토큰 비율",
    "en": "Demo token allowance percentage",
    "ja": "体験用の残量比率",
    "zh-CN": "体验剩余额度百分比"
  },
  "m95": {
    "ko": "추가할 체험용 토큰 수",
    "en": "Demo tokens to add",
    "ja": "追加する体験用トークン数",
    "zh-CN": "要添加的体验token数"
  },
  "m96": {
    "ko": "닫기",
    "en": "Close",
    "ja": "閉じる",
    "zh-CN": "关闭"
  },
  "m97": {
    "ko": "가방과 상점",
    "en": "Bag and shop",
    "ja": "バッグとショップ",
    "zh-CN": "背包和商店"
  },
  "m98": {
    "ko": "잔여량 체험",
    "en": "Try HP",
    "ja": "残量の体験",
    "zh-CN": "体验剩余量"
  },
  "m99": {
    "ko": "사용 토큰 체험",
    "en": "Try token usage",
    "ja": "トークン使用の体験",
    "zh-CN": "体验token用量"
  },
  "m100": {
    "ko": "추가",
    "en": "Add",
    "ja": "追加",
    "zh-CN": "添加"
  },
  "m101": {
    "ko": "우클릭 → 포켓몬 선택",
    "en": "Right-click → Choose Pokémon",
    "ja": "右クリック → ポケモン選択",
    "zh-CN": "右键 → 选择宝可梦"
  },
  "m102": {
    "ko": "보유 토큰",
    "en": "Token balance",
    "ja": "所持トークン",
    "zh-CN": "token余额"
  },
  "m103": {
    "ko": "체험용 잔액 설정",
    "en": "Set demo balance",
    "ja": "体験用残高を設定",
    "zh-CN": "设置体验余额"
  },
  "m104": {
    "ko": "체험용 보유 토큰 설정",
    "en": "Demo token balance",
    "ja": "体験用の所持トークン数",
    "zh-CN": "体验token余额"
  },
  "m105": {
    "ko": "잔액 설정",
    "en": "Set balance",
    "ja": "残高を設定",
    "zh-CN": "设置余额"
  },
  "m106": {
    "ko": "EXP 변화 없이 잔액만 바뀌어요.",
    "en": "Changes balance only; EXP stays the same.",
    "ja": "残高のみ変更し、EXPは変わりません。",
    "zh-CN": "仅改变余额，EXP保持不变。"
  },
  "m107": {
    "ko": "사용 토큰 1개 = 보유 토큰 1개",
    "en": "1 token used = 1 token earned",
    "ja": "使用1トークン = 所持1トークン",
    "zh-CN": "使用1 token = 获得1 token"
  },
  "m108": {
    "ko": "구매해도 EXP는 유지돼요.",
    "en": "Purchases do not reduce EXP.",
    "ja": "購入してもEXPは減りません。",
    "zh-CN": "购买不会减少EXP。"
  },
  "language": {
    "ko": "언어",
    "en": "Language",
    "ja": "言語",
    "zh-CN": "语言"
  }
};
  const names = {
  "이상해씨": {
    "ko": "이상해씨",
    "en": "Bulbasaur",
    "ja": "フシギダネ",
    "zh-CN": "妙蛙种子"
  },
  "이상해풀": {
    "ko": "이상해풀",
    "en": "Ivysaur",
    "ja": "フシギソウ",
    "zh-CN": "妙蛙草"
  },
  "이상해꽃": {
    "ko": "이상해꽃",
    "en": "Venusaur",
    "ja": "フシギバナ",
    "zh-CN": "妙蛙花"
  },
  "파이리": {
    "ko": "파이리",
    "en": "Charmander",
    "ja": "ヒトカゲ",
    "zh-CN": "小火龙"
  },
  "리자드": {
    "ko": "리자드",
    "en": "Charmeleon",
    "ja": "リザード",
    "zh-CN": "火恐龙"
  },
  "리자몽": {
    "ko": "리자몽",
    "en": "Charizard",
    "ja": "リザードン",
    "zh-CN": "喷火龙"
  },
  "꼬부기": {
    "ko": "꼬부기",
    "en": "Squirtle",
    "ja": "ゼニガメ",
    "zh-CN": "杰尼龟"
  },
  "어니부기": {
    "ko": "어니부기",
    "en": "Wartortle",
    "ja": "カメール",
    "zh-CN": "卡咪龟"
  },
  "거북왕": {
    "ko": "거북왕",
    "en": "Blastoise",
    "ja": "カメックス",
    "zh-CN": "水箭龟"
  },
  "캐터피": {
    "ko": "캐터피",
    "en": "Caterpie",
    "ja": "キャタピー",
    "zh-CN": "绿毛虫"
  },
  "단데기": {
    "ko": "단데기",
    "en": "Metapod",
    "ja": "トランセル",
    "zh-CN": "铁甲蛹"
  },
  "버터플": {
    "ko": "버터플",
    "en": "Butterfree",
    "ja": "バタフリー",
    "zh-CN": "巴大蝶"
  },
  "뿔충이": {
    "ko": "뿔충이",
    "en": "Weedle",
    "ja": "ビードル",
    "zh-CN": "独角虫"
  },
  "딱충이": {
    "ko": "딱충이",
    "en": "Kakuna",
    "ja": "コクーン",
    "zh-CN": "铁壳蛹"
  },
  "독침붕": {
    "ko": "독침붕",
    "en": "Beedrill",
    "ja": "スピアー",
    "zh-CN": "大针蜂"
  },
  "구구": {
    "ko": "구구",
    "en": "Pidgey",
    "ja": "ポッポ",
    "zh-CN": "波波"
  },
  "피죤": {
    "ko": "피죤",
    "en": "Pidgeotto",
    "ja": "ピジョン",
    "zh-CN": "比比鸟"
  },
  "피죤투": {
    "ko": "피죤투",
    "en": "Pidgeot",
    "ja": "ピジョット",
    "zh-CN": "大比鸟"
  },
  "꼬렛": {
    "ko": "꼬렛",
    "en": "Rattata",
    "ja": "コラッタ",
    "zh-CN": "小拉达"
  },
  "레트라": {
    "ko": "레트라",
    "en": "Raticate",
    "ja": "ラッタ",
    "zh-CN": "拉达"
  },
  "깨비참": {
    "ko": "깨비참",
    "en": "Spearow",
    "ja": "オニスズメ",
    "zh-CN": "烈雀"
  },
  "깨비드릴조": {
    "ko": "깨비드릴조",
    "en": "Fearow",
    "ja": "オニドリル",
    "zh-CN": "大嘴雀"
  },
  "아보": {
    "ko": "아보",
    "en": "Ekans",
    "ja": "アーボ",
    "zh-CN": "阿柏蛇"
  },
  "아보크": {
    "ko": "아보크",
    "en": "Arbok",
    "ja": "アーボック",
    "zh-CN": "阿柏怪"
  },
  "피카츄": {
    "ko": "피카츄",
    "en": "Pikachu",
    "ja": "ピカチュウ",
    "zh-CN": "皮卡丘"
  },
  "라이츄": {
    "ko": "라이츄",
    "en": "Raichu",
    "ja": "ライチュウ",
    "zh-CN": "雷丘"
  },
  "모래두지": {
    "ko": "모래두지",
    "en": "Sandshrew",
    "ja": "サンド",
    "zh-CN": "穿山鼠"
  },
  "고지": {
    "ko": "고지",
    "en": "Sandslash",
    "ja": "サンドパン",
    "zh-CN": "穿山王"
  },
  "니드런♀": {
    "ko": "니드런♀",
    "en": "Nidoran♀",
    "ja": "ニドラン♀",
    "zh-CN": "尼多兰"
  },
  "니드리나": {
    "ko": "니드리나",
    "en": "Nidorina",
    "ja": "ニドリーナ",
    "zh-CN": "尼多娜"
  },
  "니드퀸": {
    "ko": "니드퀸",
    "en": "Nidoqueen",
    "ja": "ニドクイン",
    "zh-CN": "尼多后"
  },
  "니드런♂": {
    "ko": "니드런♂",
    "en": "Nidoran♂",
    "ja": "ニドラン♂",
    "zh-CN": "尼多朗"
  },
  "니드리노": {
    "ko": "니드리노",
    "en": "Nidorino",
    "ja": "ニドリーノ",
    "zh-CN": "尼多力诺"
  },
  "니드킹": {
    "ko": "니드킹",
    "en": "Nidoking",
    "ja": "ニドキング",
    "zh-CN": "尼多王"
  },
  "삐삐": {
    "ko": "삐삐",
    "en": "Clefairy",
    "ja": "ピッピ",
    "zh-CN": "皮皮"
  },
  "픽시": {
    "ko": "픽시",
    "en": "Clefable",
    "ja": "ピクシー",
    "zh-CN": "皮可西"
  },
  "식스테일": {
    "ko": "식스테일",
    "en": "Vulpix",
    "ja": "ロコン",
    "zh-CN": "六尾"
  },
  "나인테일": {
    "ko": "나인테일",
    "en": "Ninetales",
    "ja": "キュウコン",
    "zh-CN": "九尾"
  },
  "푸린": {
    "ko": "푸린",
    "en": "Jigglypuff",
    "ja": "プリン",
    "zh-CN": "胖丁"
  },
  "푸크린": {
    "ko": "푸크린",
    "en": "Wigglytuff",
    "ja": "プクリン",
    "zh-CN": "胖可丁"
  },
  "주뱃": {
    "ko": "주뱃",
    "en": "Zubat",
    "ja": "ズバット",
    "zh-CN": "超音蝠"
  },
  "골뱃": {
    "ko": "골뱃",
    "en": "Golbat",
    "ja": "ゴルバット",
    "zh-CN": "大嘴蝠"
  },
  "뚜벅쵸": {
    "ko": "뚜벅쵸",
    "en": "Oddish",
    "ja": "ナゾノクサ",
    "zh-CN": "走路草"
  },
  "냄새꼬": {
    "ko": "냄새꼬",
    "en": "Gloom",
    "ja": "クサイハナ",
    "zh-CN": "臭臭花"
  },
  "라플레시아": {
    "ko": "라플레시아",
    "en": "Vileplume",
    "ja": "ラフレシア",
    "zh-CN": "霸王花"
  },
  "파라스": {
    "ko": "파라스",
    "en": "Paras",
    "ja": "パラス",
    "zh-CN": "派拉斯"
  },
  "파라섹트": {
    "ko": "파라섹트",
    "en": "Parasect",
    "ja": "パラセクト",
    "zh-CN": "派拉斯特"
  },
  "콘팡": {
    "ko": "콘팡",
    "en": "Venonat",
    "ja": "コンパン",
    "zh-CN": "毛球"
  },
  "도나리": {
    "ko": "도나리",
    "en": "Venomoth",
    "ja": "モルフォン",
    "zh-CN": "摩鲁蛾"
  },
  "디그다": {
    "ko": "디그다",
    "en": "Diglett",
    "ja": "ディグダ",
    "zh-CN": "地鼠"
  },
  "닥트리오": {
    "ko": "닥트리오",
    "en": "Dugtrio",
    "ja": "ダグトリオ",
    "zh-CN": "三地鼠"
  },
  "나옹": {
    "ko": "나옹",
    "en": "Meowth",
    "ja": "ニャース",
    "zh-CN": "喵喵"
  },
  "페르시온": {
    "ko": "페르시온",
    "en": "Persian",
    "ja": "ペルシアン",
    "zh-CN": "猫老大"
  },
  "고라파덕": {
    "ko": "고라파덕",
    "en": "Psyduck",
    "ja": "コダック",
    "zh-CN": "可达鸭"
  },
  "골덕": {
    "ko": "골덕",
    "en": "Golduck",
    "ja": "ゴルダック",
    "zh-CN": "哥达鸭"
  },
  "망키": {
    "ko": "망키",
    "en": "Mankey",
    "ja": "マンキー",
    "zh-CN": "猴怪"
  },
  "성원숭": {
    "ko": "성원숭",
    "en": "Primeape",
    "ja": "オコリザル",
    "zh-CN": "火暴猴"
  },
  "가디": {
    "ko": "가디",
    "en": "Growlithe",
    "ja": "ガーディ",
    "zh-CN": "卡蒂狗"
  },
  "윈디": {
    "ko": "윈디",
    "en": "Arcanine",
    "ja": "ウインディ",
    "zh-CN": "风速狗"
  },
  "발챙이": {
    "ko": "발챙이",
    "en": "Poliwag",
    "ja": "ニョロモ",
    "zh-CN": "蚊香蝌蚪"
  },
  "슈륙챙이": {
    "ko": "슈륙챙이",
    "en": "Poliwhirl",
    "ja": "ニョロゾ",
    "zh-CN": "蚊香君"
  },
  "강챙이": {
    "ko": "강챙이",
    "en": "Poliwrath",
    "ja": "ニョロボン",
    "zh-CN": "蚊香泳士"
  },
  "캐이시": {
    "ko": "캐이시",
    "en": "Abra",
    "ja": "ケーシィ",
    "zh-CN": "凯西"
  },
  "윤겔라": {
    "ko": "윤겔라",
    "en": "Kadabra",
    "ja": "ユンゲラー",
    "zh-CN": "勇基拉"
  },
  "후딘": {
    "ko": "후딘",
    "en": "Alakazam",
    "ja": "フーディン",
    "zh-CN": "胡地"
  },
  "알통몬": {
    "ko": "알통몬",
    "en": "Machop",
    "ja": "ワンリキー",
    "zh-CN": "腕力"
  },
  "근육몬": {
    "ko": "근육몬",
    "en": "Machoke",
    "ja": "ゴーリキー",
    "zh-CN": "豪力"
  },
  "괴력몬": {
    "ko": "괴력몬",
    "en": "Machamp",
    "ja": "カイリキー",
    "zh-CN": "怪力"
  },
  "모다피": {
    "ko": "모다피",
    "en": "Bellsprout",
    "ja": "マダツボミ",
    "zh-CN": "喇叭芽"
  },
  "우츠동": {
    "ko": "우츠동",
    "en": "Weepinbell",
    "ja": "ウツドン",
    "zh-CN": "口呆花"
  },
  "우츠보트": {
    "ko": "우츠보트",
    "en": "Victreebel",
    "ja": "ウツボット",
    "zh-CN": "大食花"
  },
  "왕눈해": {
    "ko": "왕눈해",
    "en": "Tentacool",
    "ja": "メノクラゲ",
    "zh-CN": "玛瑙水母"
  },
  "독파리": {
    "ko": "독파리",
    "en": "Tentacruel",
    "ja": "ドククラゲ",
    "zh-CN": "毒刺水母"
  },
  "꼬마돌": {
    "ko": "꼬마돌",
    "en": "Geodude",
    "ja": "イシツブテ",
    "zh-CN": "小拳石"
  },
  "데구리": {
    "ko": "데구리",
    "en": "Graveler",
    "ja": "ゴローン",
    "zh-CN": "隆隆石"
  },
  "딱구리": {
    "ko": "딱구리",
    "en": "Golem",
    "ja": "ゴローニャ",
    "zh-CN": "隆隆岩"
  },
  "포니타": {
    "ko": "포니타",
    "en": "Ponyta",
    "ja": "ポニータ",
    "zh-CN": "小火马"
  },
  "날쌩마": {
    "ko": "날쌩마",
    "en": "Rapidash",
    "ja": "ギャロップ",
    "zh-CN": "烈焰马"
  },
  "야돈": {
    "ko": "야돈",
    "en": "Slowpoke",
    "ja": "ヤドン",
    "zh-CN": "呆呆兽"
  },
  "야도란": {
    "ko": "야도란",
    "en": "Slowbro",
    "ja": "ヤドラン",
    "zh-CN": "呆壳兽"
  },
  "코일": {
    "ko": "코일",
    "en": "Magnemite",
    "ja": "コイル",
    "zh-CN": "小磁怪"
  },
  "레어코일": {
    "ko": "레어코일",
    "en": "Magneton",
    "ja": "レアコイル",
    "zh-CN": "三合一磁怪"
  },
  "파오리": {
    "ko": "파오리",
    "en": "Farfetch’d",
    "ja": "カモネギ",
    "zh-CN": "大葱鸭"
  },
  "두두": {
    "ko": "두두",
    "en": "Doduo",
    "ja": "ドードー",
    "zh-CN": "嘟嘟"
  },
  "두트리오": {
    "ko": "두트리오",
    "en": "Dodrio",
    "ja": "ドードリオ",
    "zh-CN": "嘟嘟利"
  },
  "쥬쥬": {
    "ko": "쥬쥬",
    "en": "Seel",
    "ja": "パウワウ",
    "zh-CN": "小海狮"
  },
  "쥬레곤": {
    "ko": "쥬레곤",
    "en": "Dewgong",
    "ja": "ジュゴン",
    "zh-CN": "白海狮"
  },
  "질퍽이": {
    "ko": "질퍽이",
    "en": "Grimer",
    "ja": "ベトベター",
    "zh-CN": "臭泥"
  },
  "질뻐기": {
    "ko": "질뻐기",
    "en": "Muk",
    "ja": "ベトベトン",
    "zh-CN": "臭臭泥"
  },
  "셀러": {
    "ko": "셀러",
    "en": "Shellder",
    "ja": "シェルダー",
    "zh-CN": "大舌贝"
  },
  "파르셀": {
    "ko": "파르셀",
    "en": "Cloyster",
    "ja": "パルシェン",
    "zh-CN": "刺甲贝"
  },
  "고오스": {
    "ko": "고오스",
    "en": "Gastly",
    "ja": "ゴース",
    "zh-CN": "鬼斯"
  },
  "고우스트": {
    "ko": "고우스트",
    "en": "Haunter",
    "ja": "ゴースト",
    "zh-CN": "鬼斯通"
  },
  "팬텀": {
    "ko": "팬텀",
    "en": "Gengar",
    "ja": "ゲンガー",
    "zh-CN": "耿鬼"
  },
  "롱스톤": {
    "ko": "롱스톤",
    "en": "Onix",
    "ja": "イワーク",
    "zh-CN": "大岩蛇"
  },
  "슬리프": {
    "ko": "슬리프",
    "en": "Drowzee",
    "ja": "スリープ",
    "zh-CN": "催眠貘"
  },
  "슬리퍼": {
    "ko": "슬리퍼",
    "en": "Hypno",
    "ja": "スリーパー",
    "zh-CN": "引梦貘人"
  },
  "크랩": {
    "ko": "크랩",
    "en": "Krabby",
    "ja": "クラブ",
    "zh-CN": "大钳蟹"
  },
  "킹크랩": {
    "ko": "킹크랩",
    "en": "Kingler",
    "ja": "キングラー",
    "zh-CN": "巨钳蟹"
  },
  "찌리리공": {
    "ko": "찌리리공",
    "en": "Voltorb",
    "ja": "ビリリダマ",
    "zh-CN": "霹雳电球"
  },
  "붐볼": {
    "ko": "붐볼",
    "en": "Electrode",
    "ja": "マルマイン",
    "zh-CN": "顽皮雷弹"
  },
  "아라리": {
    "ko": "아라리",
    "en": "Exeggcute",
    "ja": "タマタマ",
    "zh-CN": "蛋蛋"
  },
  "나시": {
    "ko": "나시",
    "en": "Exeggutor",
    "ja": "ナッシー",
    "zh-CN": "椰蛋树"
  },
  "탕구리": {
    "ko": "탕구리",
    "en": "Cubone",
    "ja": "カラカラ",
    "zh-CN": "卡拉卡拉"
  },
  "텅구리": {
    "ko": "텅구리",
    "en": "Marowak",
    "ja": "ガラガラ",
    "zh-CN": "嘎啦嘎啦"
  },
  "시라소몬": {
    "ko": "시라소몬",
    "en": "Hitmonlee",
    "ja": "サワムラー",
    "zh-CN": "飞腿郎"
  },
  "홍수몬": {
    "ko": "홍수몬",
    "en": "Hitmonchan",
    "ja": "エビワラー",
    "zh-CN": "快拳郎"
  },
  "내루미": {
    "ko": "내루미",
    "en": "Lickitung",
    "ja": "ベロリンガ",
    "zh-CN": "大舌头"
  },
  "또가스": {
    "ko": "또가스",
    "en": "Koffing",
    "ja": "ドガース",
    "zh-CN": "瓦斯弹"
  },
  "또도가스": {
    "ko": "또도가스",
    "en": "Weezing",
    "ja": "マタドガス",
    "zh-CN": "双弹瓦斯"
  },
  "뿔카노": {
    "ko": "뿔카노",
    "en": "Rhyhorn",
    "ja": "サイホーン",
    "zh-CN": "独角犀牛"
  },
  "코뿌리": {
    "ko": "코뿌리",
    "en": "Rhydon",
    "ja": "サイドン",
    "zh-CN": "钻角犀兽"
  },
  "럭키": {
    "ko": "럭키",
    "en": "Chansey",
    "ja": "ラッキー",
    "zh-CN": "吉利蛋"
  },
  "덩쿠리": {
    "ko": "덩쿠리",
    "en": "Tangela",
    "ja": "モンジャラ",
    "zh-CN": "蔓藤怪"
  },
  "캥카": {
    "ko": "캥카",
    "en": "Kangaskhan",
    "ja": "ガルーラ",
    "zh-CN": "袋兽"
  },
  "쏘드라": {
    "ko": "쏘드라",
    "en": "Horsea",
    "ja": "タッツー",
    "zh-CN": "墨海马"
  },
  "시드라": {
    "ko": "시드라",
    "en": "Seadra",
    "ja": "シードラ",
    "zh-CN": "海刺龙"
  },
  "콘치": {
    "ko": "콘치",
    "en": "Goldeen",
    "ja": "トサキント",
    "zh-CN": "角金鱼"
  },
  "왕콘치": {
    "ko": "왕콘치",
    "en": "Seaking",
    "ja": "アズマオウ",
    "zh-CN": "金鱼王"
  },
  "별가사리": {
    "ko": "별가사리",
    "en": "Staryu",
    "ja": "ヒトデマン",
    "zh-CN": "海星星"
  },
  "아쿠스타": {
    "ko": "아쿠스타",
    "en": "Starmie",
    "ja": "スターミー",
    "zh-CN": "宝石海星"
  },
  "마임맨": {
    "ko": "마임맨",
    "en": "Mr. Mime",
    "ja": "バリヤード",
    "zh-CN": "魔墙人偶"
  },
  "스라크": {
    "ko": "스라크",
    "en": "Scyther",
    "ja": "ストライク",
    "zh-CN": "飞天螳螂"
  },
  "루주라": {
    "ko": "루주라",
    "en": "Jynx",
    "ja": "ルージュラ",
    "zh-CN": "迷唇姐"
  },
  "에레브": {
    "ko": "에레브",
    "en": "Electabuzz",
    "ja": "エレブー",
    "zh-CN": "电击兽"
  },
  "마그마": {
    "ko": "마그마",
    "en": "Magmar",
    "ja": "ブーバー",
    "zh-CN": "鸭嘴火兽"
  },
  "쁘사이저": {
    "ko": "쁘사이저",
    "en": "Pinsir",
    "ja": "カイロス",
    "zh-CN": "凯罗斯"
  },
  "켄타로스": {
    "ko": "켄타로스",
    "en": "Tauros",
    "ja": "ケンタロス",
    "zh-CN": "肯泰罗"
  },
  "잉어킹": {
    "ko": "잉어킹",
    "en": "Magikarp",
    "ja": "コイキング",
    "zh-CN": "鲤鱼王"
  },
  "갸라도스": {
    "ko": "갸라도스",
    "en": "Gyarados",
    "ja": "ギャラドス",
    "zh-CN": "暴鲤龙"
  },
  "라프라스": {
    "ko": "라프라스",
    "en": "Lapras",
    "ja": "ラプラス",
    "zh-CN": "拉普拉斯"
  },
  "메타몽": {
    "ko": "메타몽",
    "en": "Ditto",
    "ja": "メタモン",
    "zh-CN": "百变怪"
  },
  "이브이": {
    "ko": "이브이",
    "en": "Eevee",
    "ja": "イーブイ",
    "zh-CN": "伊布"
  },
  "샤미드": {
    "ko": "샤미드",
    "en": "Vaporeon",
    "ja": "シャワーズ",
    "zh-CN": "水伊布"
  },
  "쥬피썬더": {
    "ko": "쥬피썬더",
    "en": "Jolteon",
    "ja": "サンダース",
    "zh-CN": "雷伊布"
  },
  "부스터": {
    "ko": "부스터",
    "en": "Flareon",
    "ja": "ブースター",
    "zh-CN": "火伊布"
  },
  "폴리곤": {
    "ko": "폴리곤",
    "en": "Porygon",
    "ja": "ポリゴン",
    "zh-CN": "多边兽"
  },
  "암나이트": {
    "ko": "암나이트",
    "en": "Omanyte",
    "ja": "オムナイト",
    "zh-CN": "菊石兽"
  },
  "암스타": {
    "ko": "암스타",
    "en": "Omastar",
    "ja": "オムスター",
    "zh-CN": "多刺菊石兽"
  },
  "투구": {
    "ko": "투구",
    "en": "Kabuto",
    "ja": "カブト",
    "zh-CN": "化石盔"
  },
  "투구푸스": {
    "ko": "투구푸스",
    "en": "Kabutops",
    "ja": "カブトプス",
    "zh-CN": "镰刀盔"
  },
  "프테라": {
    "ko": "프테라",
    "en": "Aerodactyl",
    "ja": "プテラ",
    "zh-CN": "化石翼龙"
  },
  "잠만보": {
    "ko": "잠만보",
    "en": "Snorlax",
    "ja": "カビゴン",
    "zh-CN": "卡比兽"
  },
  "프리져": {
    "ko": "프리져",
    "en": "Articuno",
    "ja": "フリーザー",
    "zh-CN": "急冻鸟"
  },
  "썬더": {
    "ko": "썬더",
    "en": "Zapdos",
    "ja": "サンダー",
    "zh-CN": "闪电鸟"
  },
  "파이어": {
    "ko": "파이어",
    "en": "Moltres",
    "ja": "ファイヤー",
    "zh-CN": "火焰鸟"
  },
  "미뇽": {
    "ko": "미뇽",
    "en": "Dratini",
    "ja": "ミニリュウ",
    "zh-CN": "迷你龙"
  },
  "신뇽": {
    "ko": "신뇽",
    "en": "Dragonair",
    "ja": "ハクリュー",
    "zh-CN": "哈克龙"
  },
  "망나뇽": {
    "ko": "망나뇽",
    "en": "Dragonite",
    "ja": "カイリュー",
    "zh-CN": "快龙"
  },
  "뮤츠": {
    "ko": "뮤츠",
    "en": "Mewtwo",
    "ja": "ミュウツー",
    "zh-CN": "超梦"
  },
  "뮤": {
    "ko": "뮤",
    "en": "Mew",
    "ja": "ミュウ",
    "zh-CN": "梦幻"
  },
  "불꽃의돌": {
    "ko": "불꽃의돌",
    "en": "Fire Stone",
    "ja": "ほのおのいし",
    "zh-CN": "火之石"
  },
  "물의돌": {
    "ko": "물의돌",
    "en": "Water Stone",
    "ja": "みずのいし",
    "zh-CN": "水之石"
  },
  "천둥의돌": {
    "ko": "천둥의돌",
    "en": "Thunder Stone",
    "ja": "かみなりのいし",
    "zh-CN": "雷之石"
  },
  "리프의돌": {
    "ko": "리프의돌",
    "en": "Leaf Stone",
    "ja": "リーフのいし",
    "zh-CN": "叶之石"
  },
  "달의돌": {
    "ko": "달의돌",
    "en": "Moon Stone",
    "ja": "つきのいし",
    "zh-CN": "月之石"
  },
  "연결의끈": {
    "ko": "연결의끈",
    "en": "Linking Cord",
    "ja": "つながりのヒモ",
    "zh-CN": "联系绳"
  },
  "불": {
    "ko": "불",
    "en": "Fire",
    "ja": "炎",
    "zh-CN": "火"
  },
  "물": {
    "ko": "물",
    "en": "Water",
    "ja": "水",
    "zh-CN": "水"
  },
  "번개": {
    "ko": "번개",
    "en": "Electric",
    "ja": "電気",
    "zh-CN": "电"
  },
  "풀": {
    "ko": "풀",
    "en": "Grass",
    "ja": "草",
    "zh-CN": "草"
  },
  "달": {
    "ko": "달",
    "en": "Moon",
    "ja": "月",
    "zh-CN": "月"
  },
  "끈": {
    "ko": "끈",
    "en": "Cord",
    "ja": "紐",
    "zh-CN": "绳"
  }
};

  const languages = { ko: '한국어', en: 'English', ja: '日本語', 'zh-CN': '简体中文' };
  let language = 'ko';
  const normalize = value => Object.hasOwn(languages, value) ? value : 'ko';
  const api = {
    languages, messages, names,
    normalize,
    get language() { return language; },
    setLanguage(value) { language = normalize(value); },
    t(key, ...args) {
      const text = messages[key]?.[language] ?? messages[key]?.ko ?? key;
      return text.replace(/\{(\d+)\}/g, (_, index) => String(args[index] ?? ''));
    },
    name(value) { return names[value]?.[language] ?? value; },
    number(value) { return Number(value).toLocaleString(language); },
    apply(root = document) {
      root.documentElement.lang = language;
      for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = api.t(node.dataset.i18n);
      for (const attr of ['title', 'aria-label']) {
        for (const node of root.querySelectorAll('[data-i18n-' + attr + ']')) node.setAttribute(attr, api.t(node.getAttribute('data-i18n-' + attr)));
      }
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18n = api;
})(globalThis);
