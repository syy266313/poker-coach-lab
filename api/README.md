# Feltwise Multiplayer Sync

这是 Feltwise 的多人联机同步后端，复用牌桌已有的 `/state` 和 `/action` 协议。

## 本地运行

需要安装 Deno：

```bash
deno task dev
```

默认服务端口由 Deno 使用本地监听配置决定；部署到 Deno Deploy 后，服务地址形如：

```text
https://YOUR-DENO-PROJECT.deno.dev
```

## Deno Deploy

1. 在 Deno Deploy 创建一个项目。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：
   - `DENO_PROJECT`：Deno Deploy 项目名
   - `DENO_DEPLOY_TOKEN`：Deno Deploy token
3. 运行 `Deploy multiplayer sync backend` workflow。
4. 将前端 `js/app.js` 中的 `STATE_SYNC_ENDPOINT` 和 `ACTION_SYNC_ENDPOINT` 改为新域名：

```js
const SYNC_BASE_URL = "https://YOUR-DENO-PROJECT.deno.dev";
const STATE_SYNC_ENDPOINT = `${SYNC_BASE_URL}/state`;
const ACTION_SYNC_ENDPOINT = `${SYNC_BASE_URL}/action`;
```

## 安全边界

当前协议是教育/朋友局原型同步服务。后端保存的是主桌生成的投影视图，正式真钱或不受信任的线上游戏还需要把发牌、下注验证和底牌权限全部移到服务端。
