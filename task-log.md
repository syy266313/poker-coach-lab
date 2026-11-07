# Feltwise Task Log

## [2026-10-24 19:00] 任务：修复 handId 协调、混合类型链路与筹码守恒误报
- 状态：打回后修复
- 涉及文件：js/app.js；js/careerStore.js；js/careerPage.js；career.html；js/shared/handId.js；js/shared/conservation.js；js/shared/exportContract.js；js/careerContract.test.js；dist/；tmp/审查记录
- 主要改动：IndexedDB 同源事务分配 handId；统一 canonical 比较；严格 endStacks unknown 校验；正式导出契约测试；重建 dist。
- 架构审查：通过，保留离线数学唯一性边界和 endStacks 时序遗留问题
- 打回原因：上一轮随机 ID 跨标签页无协调，守恒字段缺失可被静默归零
- 遗留问题：无 Git 元数据/Actions 无法确认线上发布；服务端唯一约束仍是跨环境权威方案
- 关键文件：
  - tmp/arch-review-request-20261024-190000.txt
  - tmp/arch-review-result-20261024-190000.txt

## [2026-10-03 16:34:46] 任务：修复导出数据（handId、playerId、won、pots、守恒校验）
- 状态：未审查
- 涉及文件：js/app.js；js/careerStore.js；js/careerPage.js
- 主要改动：统一 handId/playerId 数据关联，结构化 pots，summary 缺失告警，筹码守恒校验，摘要和 Markdown/JSON canonical 导出。
- 架构审查：未审查
- 打回原因：无
- 遗留问题：js/gameEngine.test.js 有 1 项因工作树既有 gameEngine.js reveal 改动失败；本轮未修改 gameEngine.js。
- 关键文件：
  - tmp/arch-review-request-20261003-163446.txt
  - tmp/arch-review-result-<timestamp>.txt

## [2026-10-18 06:47] 任务：修复导出数据（架构审查）
- 状态：打回
- 涉及文件：js/app.js；js/careerStore.js；js/careerPage.js
- 主要改动：完成材料复核，发现 handId 并发碰撞窗口和缺 summary 时守恒误报通过。
- 架构审查：打回
- 打回原因：全局唯一 handId 未可靠保证；守恒未知状态未写 dataError。
- 遗留问题：gameEngine.test.js 仍有 1 项既有 reveal 行为失败。
- 关键文件：
  - tmp/arch-review-request-20261003-163446.txt
  - tmp/arch-review-result-20261018-064751.txt

## [2026-10-18 07:03] 任务：修复 handId 严格唯一性和 summary 缺失守恒状态
- 状态：打回后修复
- 涉及文件：js/app.js；js/careerStore.js；js/careerPage.js；js/gameEngine.test.js
- 主要改动：handId 改为 Web Crypto UUID；守恒改为 unknown/failed/passed；UUID 收藏兼容；同步 reveal 基线断言。
- 架构审查：打回后修复，待复审
- 打回原因：修复前存在 localStorage handId 并发碰撞和缺 summary 误报 passed:true。
- 遗留问题：endStacks 结算时序、遗留 playerNames/stacks 未扩大处理；共享目录无 Git 元数据。
- 关键文件：
  - tmp/arch-review-request-20261018-070334.txt
  - tmp/arch-review-result-20261018-064751.txt

## [2026-10-24 20:56] 任务：复核并补齐 handId、筹码守恒和导出契约
- 状态：通过
- 涉及文件：js/shared/conservation.js；js/shared/exportContract.js；js/careerStore.js；js/careerPage.js；js/careerContract.test.js；js/careerContractSetup.js；dist/
- 主要改动：补齐 canonical playerId/handId 回退与旧页面记录迁移；增加真实 careerStore 生命周期契约测试；严格拒绝重复 roster 和未知 payout；由 tools/build.mjs 重建 dist。
- 架构审查：通过
- 打回原因：无；曾有构建环境阻断，后已用可运行原生 esbuild 完成构建
- 遗留问题：endStacks 结算时序；IndexedDB 异常生命周期浏览器级覆盖不足；fallback 非数学绝对唯一
- 关键文件：
  - tmp/arch-review-request-20261024-205654.txt
  - tmp/arch-review-result-20261024-205654.txt

## [2026-10-24 22:37] 任务：完成 dist 重建与最终验收
- 状态：通过
- 涉及文件：dist/；tmp/arch-review-result-20261024-205654.txt
- 主要改动：原始 tools/build.mjs 已成功执行，dist 由构建脚本重建；71 项测试通过。
- 架构审查：通过
- 遗留问题：endStacks 结算时序；IndexedDB 异常生命周期覆盖不足；fallback 非数学绝对唯一
- 关键文件：tmp/arch-review-request-20261024-205654.txt；tmp/arch-review-result-20261024-205654.txt

## [2026-10-24 22:56] 任务：修复玩家名字遮挡筹码
- 状态：通过
- 涉及文件：css/style.css；dist/；tmp/审查记录
- 主要改动：手机端名字单行省略并裁剪；由 tools/build.mjs 重建 dist。
- 架构审查：通过
- 打回原因：无
- 遗留问题：需要在真实 iPhone Safari 上确认字形效果；挂载目录无 Git 元数据
- 关键文件：tmp/arch-review-request-20261024-225645.txt；tmp/arch-review-result-20261024-225645.txt

## [2026-10-24 23:16] 任务：收尾名字遮挡修复并审阅两手牌谱
- 状态：通过
- 涉及文件：css/style.css；dist/；tmp/审计记录
- 主要改动：移动座位名字单行省略并增加筹码间距；dist 已重建；审阅用户牌谱并发现赔率字段缺陷。
- 架构审查：通过
- 遗留问题：action amount=1190 但 needToCall/potOdds=0，转入下一独立任务；样本仅 2 手
- 关键文件：tmp/arch-review-request-20261024-231639.txt；tmp/arch-review-result-20261024-231639.txt

## [2026-10-24 23:48] 任务：修复 actionHistory call 赔率字段时序
- 状态：通过
- 涉及文件：js/app.js；js/shared/actionPricing.js；js/careerContract.test.js；dist/；task-log.md；tmp/arch-review-request-20261024-234428.txt；tmp/arch-review-result-20261024-234428.txt
- 主要改动：在状态 patch 前捕获真实 needToCall/potOdds，保留 amount 与 potAfter 语义，补齐 call/raise/allin、旧导出和 handId 兼容测试。
- 架构审查：通过
- 遗留问题：旧牌局缺失赔率不回填；未运行真实 iOS Safari；共享目录无 Git 元数据
- 关键文件：tmp/arch-review-request-20261024-234428.txt；tmp/arch-review-result-20261024-234428.txt

## [2026-10-31 22:36] 任务：使用当前会话模型只读审计 Career 渲染
- 状态：未审查
- 涉及文件：只读检查 js/careerPage.js、js/careerStore.js、js/shared/exportContract.js、js/careerContract.test.js；新增 tmp/arch-review-request-20261031-223500.txt
- 主要改动：未改应用代码；发现玩家可编辑名称进入 innerHTML 的潜在 XSS sink。
- 架构审查：未审查
- 打回原因：无；修复方案待用户确认。
- 遗留问题：未做 payload 执行验证；Career 输出需统一转义或改用 textContent。
- 关键文件：tmp/arch-review-request-20261031-223615.txt；tmp/arch-review-result-20261031-223615.txt

## [2026-11-01 01:15] 任务：连续收尾牌局记录安全与复盘遗留问题
- 状态：通过
- 涉及文件：js/shared/htmlEscape.js；js/careerPage.js；js/app.js；js/careerStore.js；js/shared/handId.js；js/shared/tableViewRenderer.js；js/advisorPage.js；js/inlineAdvisor.js；js/coach.js；js/careerContract.test.js；js/careerContractSetup.js；js/handId.test.js；dist/；task-log.md；tmp/审查记录
- 主要改动：统一 HTML 转义消除 stored XSS；结算摘要改为派奖后最终快照并兼容旧格式；handId 增加 blocked/versionchange 处理；新增转义与结算契约测试。
- 架构审查：通过
- 遗留问题：真实 iOS Safari 与 IndexedDB 异常生命周期未做真机验收；旧牌局缺失赔率不回填；挂载目录无 Git 元数据
- 关键文件：tmp/arch-review-request-20261031-234500.txt；tmp/arch-review-result-20261101-011548.txt

## [2026-11-07 21:48] 任务：继续完成牌局复盘浏览器验收与旧数据显示收尾
- 状态：通过
- 涉及文件：js/careerPage.js；dist/；tmp/arch-review-result-20261107-214817.txt；task-log.md
- 主要改动：修复旧牌局缺少 netBB 时显示 undefined bb；浏览器验证 XSS、JSON/Markdown 赔率字段和空数据恢复；重建 dist。
- 架构审查：通过
- 遗留问题：未在真实 iOS 13 真机验收；旧牌局缺失赔率不回填；挂载目录无 Git 元数据
- 关键文件：tmp/arch-review-result-20261107-214817.txt

## [2026-11-07 23:33] 任务：修复移动端姓名遮挡筹码
- 状态：通过
- 涉及文件：css/style.css；dist/；tmp/arch-review-request-20261107-233300.txt；tmp/arch-review-result-20261107-233300.txt
- 主要改动：移动端座位高度改为自适应，姓名徽标使用 border-box/较低行高，筹码上间距调整为 5px；重建 dist。
- 架构审查：通过
- 打回原因：无
- 遗留问题：真实 iPhone 部署后需强制刷新确认新 CSS；挂载目录无 Git 元数据
- 关键文件：
  - tmp/arch-review-request-20261107-233300.txt
  - tmp/arch-review-result-20261107-233300.txt
