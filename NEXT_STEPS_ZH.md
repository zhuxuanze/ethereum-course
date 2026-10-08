# Assignment 2：按老师要求补齐 React

本更新包已完成 React、Babel、webpack 前端，并包含本次构建得到的 `dist/build.js`。构建、10 项交互逻辑测试、模拟钱包的 DOM 检查和 Solidity 0.4.22 编译通过。

**这些验证不是你的真实 Sepolia 交易记录。旧报告先不要提交，等新网页测试和 IPFS 发布后再更新。**

## 现在这一步：在 Mac 上运行 React

下载 `Assignment2_React_Update.zip` 到“下载”文件夹。打开 VS Code 终端，逐条执行：

```sh
unzip -o "$HOME/Downloads/Assignment2_React_Update.zip" -d "/Users/zhuxuanze/Documents/ethereum-assignment2"
cd "/Users/zhuxuanze/Documents/ethereum-assignment2"
npm ci --no-audit --no-fund
npm run build
npm start
```

`unzip -o` 会将更新文件合并到原项目并覆盖同名文件，保留 `.git` 和其他未包含在更新包中的文件。原先已推送的代码仍在 GitHub 历史中。

如果下载文件名带 `(1)` 等后缀，请按实际名称改第一条命令。如果 8080 端口已被旧服务占用，到旧服务的终端按 Control+C 停止它，再运行 `npm start`。

在 Edge 打开 http://127.0.0.1:8080 ，MetaMask 选择 Sepolia，点击 Connect MetaMask。

记录这两项实际结果：

1. `Max amount of bets` 显示多少？作业描述为 100，页面从合约读取真实值。
2. 页面是否显示钱包地址、Number of bets、Minimum bet、Total ether bet、Last number winner？

先不重复下注。原钱包之前已成功下注，若页面提示已经记录过投注，这是合约限制。后续需要新测试账户来验证 React 页面的一笔新投注。

## 此后继续完成的步骤

1. 根据合约真实状态判断是否需要用阈值 100 重新部署。若需要，不能只改网页的数字。
2. 用尚未下注且有 Sepolia 测试 ETH 的钱包完成一次真实投注，记录成功回执及 React 网页截图。
3. 将本次 `dist` 文件夹内容整体上传 IPFS：`npx pinme upload ./dist`。原来的 `ipfs-site` 是旧版，不再上传它。
4. 打开新返回的公开网址，连接钱包，截图保留网址栏和合约状态。
5. 完成自定义域名/IPFS 学习部分。当前没有自有域名，不能写成已配置了个人域名；作业没有另行要求购买付费域名。
6. 推送本次源代码到原课程仓库：

```sh
git add .gitignore README.md NEXT_STEPS_ZH.md THIRD_PARTY_NOTICES.md app.js casino.sol contracts dist/index.html index.html package.json package-lock.json src tests webpack.config.js
git commit -m "Follow Assignment 2 React webpack workflow"
git push origin main
```

本次自动写 GitHub 被 403 权限错误拒绝，尚未替你推送。不要先执行 `git pull` 来期待获得本更新包。

7. 使用老师和助教的真实 GitHub 用户名添加 Collaborators；目前还没有他们的用户名。
8. 更新 Word 报告：所有理论题、真实实现说明、交易和截图、GitHub 与最终 IPFS 地址、老师封面、Letter 排版、本人真实签署的独立完成声明。
9. 向 Univ.AI LMS 提交报告。截止时间以老师安排的下一次上课开始时间和 LMS 时钟为准。

## 已知测试边界

100 次投注后的真实随机数回调、开奖和派奖尚未验证。老师的题目描述了 100 次阈值，但没有单独要求学生手工创建 100 个账户并提交 100 张交易回执。不能把未跑过的完整流程写成测试通过。

当前保留教程的合约核心逻辑，因此也保留它的旧代码局限，包括派奖后没有清除玩家映射、零中奖者的情况未处理。若需要验证完整生命周期，应先处理和测试这些问题，再部署新合约。
