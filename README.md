# 昇腾 / 鲲鹏积分兑换中心库存过滤油猴脚本

油猴脚本：[hiascend-rewards-stock-filter.user.js](./hiascend-rewards-stock-filter.user.js)

支持页面：

- https://www.hiascend.com/developer/rewards
- https://www.hikunpeng.com/developer/rewards

功能：

- 隐藏接口标记为库存不足（exchangeStatus=1）或库存为 0 的礼品。
- 重新计算礼品总数和页数，让后续页的可兑换礼品自动向前补位。
- 保留原站兑换按钮和分页交互；脚本只改变当前页面展示，不修改兑换接口。

安装：打开脚本文件，点击 Raw，然后在 Tampermonkey / Violentmonkey 中安装。
