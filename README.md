# 昇腾 / 鲲鹏积分兑换中心库存过滤油猴脚本

油猴脚本：[hiascend-rewards-stock-filter.user.js](./hiascend-rewards-stock-filter.user.js)

支持页面：

- https://www.hiascend.com/developer/rewards
- https://www.hikunpeng.com/developer/rewards
- https://www.hiascend.com/developer/contests/details/<id>/submit
- https://www.hikunpeng.com/developer/contests/details/<id>/submit

功能：

- 隐藏接口标记为库存不足（exchangeStatus=1）或库存为 0 的礼品。
- 重新计算礼品总数和页数，让后续页的可兑换礼品自动向前补位。
- 保留原站兑换按钮和分页交互；脚本只改变当前页面展示，不修改兑换接口。
- 在昇腾社区和鲲鹏社区的比赛作品提交页自动勾选隐私协议；只操作协议复选框，不会点击最终提交按钮。

比赛提交页路径为 `/developer/contests/details/<比赛 ID>/submit`（含 `/zh/` 变体）。脚本也处理从比赛详情页进入提交页时的 SPA 路由切换。

安装：打开脚本文件，点击 Raw，然后在 Tampermonkey / Violentmonkey 中安装。
