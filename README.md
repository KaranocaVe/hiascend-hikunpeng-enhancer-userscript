# 昇腾 / 鲲鹏社区集成增强油猴脚本

这是一个固定名称的集成增强插件，仓库名为 `hiascend-hikunpeng-enhancer-userscript`，脚本名为 `hiascend-hikunpeng-enhancer.user.js`。

安装文件：[hiascend-hikunpeng-enhancer.user.js](./hiascend-hikunpeng-enhancer.user.js)

安装地址：<https://raw.githubusercontent.com/KaranocaVe/hiascend-hikunpeng-enhancer-userscript/main/hiascend-hikunpeng-enhancer.user.js>

支持 `www.hiascend.com` 和 `www.hikunpeng.com` 的社区页面。

## 功能

- 自动恢复登录：积分接口未登录时请求站点官方账号恢复端点；仍未恢复时，可在存在会话标记的情况下点击站点原生 SSO 登录入口。
- 每日自动签到：确认已登录后，每个中国标准时间自然日最多调用一次官方签到接口。
- 积分轮询与提醒：定期读取积分，首次读取只建立基线，之后积分增加时发送浏览器通知。
- 页头积分显示：保留“积分兑换”的原有链接，只把文字替换为当前积分。
- 无库存礼品过滤：过滤库存不足/库存为 0 的礼品，并重算列表总数和分页，让可兑换礼品向前补位。
- 设置面板与 Tampermonkey 菜单：可开关登录恢复、签到、通知、积分轮询、页头积分、库存过滤和协议勾选。
- 比赛提交页协议自动勾选：仅作用于 `/developer/contests/details/<比赛 ID>/submit`（含 `/zh/`）中的隐私协议控件，不会点击最终“提交”按钮。

比赛页使用 Vue/Nuxt 的异步渲染和 SPA 路由。脚本会等待真实的 `.footer-box .privacy-box .o-checkbox` 控件出现，操作其原生 checkbox 并派发 `input/change` 事件，确保组件状态同步。

## 行为边界

- 脚本不收集、上传或保存账号密码；设置、积分基线和签到日期只保存在 Tampermonkey 本地存储中。
- 礼品过滤只修改当前页面展示和列表响应，不调用兑换、下单或收货接口。
- 比赛协议功能只触发协议复选框；作品上传、报名和最终提交始终需要人工操作。

## 安装与更新

打开上面的 Raw 地址，在 Tampermonkey / Violentmonkey 中安装。仓库和脚本名称已固定，之后由脚本中的 `@updateURL` 自动更新。
