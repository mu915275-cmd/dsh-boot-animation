# 发布与投稿（本分支）

本仓库是 **[NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation) 的分支**，
上游 BSD-3-Clause，`LICENSE` 原样保留。上游能力全部保留，本分支新增**工作区皮肤**
（选中那段的画面铺在工作区画布后面：静帧或循环片尾，皮肤与侧边栏各有独立透明度，三档模糊）。

代码侧已就绪（照 [市场闸门](#二四道自动闸门) 逐条对过）：

- `lib/` 构建产物**已提交**，`package.json` 里**没有** `prepare` / `postinstall`
  ⇒ 别人 `dsh plugin add github:mu915275-cmd/dsh-boot-animation` 不触发编译，绕开 pnpm `allowBuilds`
- `package.json` 声明了 **`dsh.bundle`**（`{"patch":"./cordis.patch.yml"}`）—— 这是市场闸门 1 的硬要求

---

## 一、先推上 GitHub —— **不要用 Fork 按钮**

市场闸门 3 明确要求「**非 fork**」。GitHub 的 **Fork** 按钮会永久给仓库打上 fork 标记，
带着这个标记投稿会被直接拒掉。正确做法是**新建空仓库、把这份目录 push 上去**：

```sh
cd <本目录>
git init -b main                     # 若尚未初始化
git add -A && git commit -m "dsh-boot-animation 1.0.0 (workspace-skin fork)"
git remote add origin https://github.com/mu915275-cmd/dsh-boot-animation.git
git push -u origin main
```

> 不建议用「网页拖拽上传这个文件夹」：`node_modules/` 有 4 万多个小文件（虽然 `.gitignore`
> 会挡掉它，但网页上传走的是 git add，仍然会很慢）。用 git 命令行最省事。

顺手做（非必需）：仓库 **Settings → General → Topics** 加 `dsh-plugin`，便于别人按 topic 发现。

---

## 二、市场是什么

- **DSH 本体没有应用商店**。界面里那个「插件」页是**管理器**（按 spec 安装/停用/删除），不是目录。
- 社区**插件市场** = 精选列表仓库 `awesome-dsh-plugin/awesome-dsh-plugin`；
  市场前端读的注册表是 `awesome-dsh-plugin.com/plugins.json`，由 CI 每日从 `data/plugins/*.yml` 重新生成。
- **一次投稿 = 往那个列表仓库加一个文件**：`data/plugins/<owner>__<repo>.yml`。

因果链：**PR 被合并 → 列表 `main` 更新 → CI 重生成 `plugins.json` → 市场里能搜到并一键安装**
（通常一天内生效）。

---

## 三、四道自动闸门

脚本在列表仓库里：`scripts/check-submission.mjs`。它只查这四件事：

| # | 要求 | 本仓库状态 |
|---|---|---|
| 1 | 仓库内**任意** `package.json` 声明 `dsh.bundle` | ✅ `{"patch":"./cordis.patch.yml"}` |
| 2 | 仓库创建**满 24 小时** | ⏳ 新仓库会先红一下，**会自己重跑变绿**，不需要重新提交/推送/关掉重开 |
| 3 | 存在、公开、未归档、**非 fork** | ⚠️ 见上一节：必须新建仓库，不能是 fork |
| 4 | 不是 DSH 本体 | ✅ |

闸门 1 的报错文案是 `declares only \`dsh.client\` — that alone is not installable` ——
**只声明 `dsh.client` 的插件会被直接拒掉**，这是最常见的被拒原因。

---

## 四、投稿步骤

**方式 A — 网页，约 1 分钟**

1. 打开 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/fork> → **Create fork**
2. 在你的 fork 里 **Add file → Create new file**
3. 文件名填：`data/plugins/mu915275-cmd__dsh-boot-animation.yml`（**只能一层**，
   写成 `data/<...>.yml` 或 `data/plugins/data/plugins/...` 都会被**静默忽略**：不报错、合并了什么也没发生）
4. 内容原样粘贴 `submission/data/plugins/mu915275-cmd__dsh-boot-animation.yml`
5. **Commit changes** → 回 fork 首页 → **Contribute → Open pull request**

**方式 B — 用 git**

```sh
git clone https://github.com/<你的用户名>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
cp <本项目>/submission/data/plugins/mu915275-cmd__dsh-boot-animation.yml data/plugins/
git add data/plugins/mu915275-cmd__dsh-boot-animation.yml
git commit -m "Add mu915275-cmd/dsh-boot-animation"
git push
```

> ⚠️ **只交这一个 `.yml`**。不要手改 `README.md` / `README.zh.md` —— 它们由 `data/plugins/*.yml`
> 生成；只交条目文件也最不容易和别人冲突。

---

## 五、条目字段规则（都踩过）

来自列表仓库的 `scripts/lib/entries.mjs` `validateEntries()`：

- **只允许 6 个键**：`url` / `name` / `category` / `description` / `tarball` / `file`（`file` 由脚本加）。
  **多一个键就判不合格**；`npm:` 是禁止的（npm 映射由脚本从仓库自动解析）。
- 文件名必须**恰好** `owner__repo`，且位于 `data/plugins/` 下**恰好一层**。
- `name` 写成 `owner/repo` 形式时，**必须与 url 指向同一个仓库**。
- `description.en` **必填**、**单行**、**以英文句号结尾**；`description.zh` 可选。
- 描述里出现 `: `（英文冒号+空格）**必须加引号**（本条目两个值都是单引号，安全）。
- `category` 只能取白名单 23 个之一；动画/splash 类**都在 `ui`**（`fun` 里是宠物/桌宠/游戏那类）。
- 一个 PR 最多加 3 条。

本地已用真校验器（`yaml` 解析 + 逐条规则）跑过本条目：**零问题**。

---

## 六、发布后自测（很重要）

**换一个干净的 profile**，按文档那样装一次：

```sh
dsh --profile smoketest --from-default-profile web
dsh plugin --profile smoketest add github:mu915275-cmd/dsh-boot-animation
```

启动后**硬刷新 Ctrl+Shift+R**，确认侧边栏页脚出现 🎞 / 🎛。
这一步验证的是本地测不到的东西：**bundle patch 是否真把插件挂进了层栈**。

---

## 七、版本迭代

改完客户端 bundle 请**同时升版本号**：

```sh
npm version patch   # 或 minor / major
git push --follow-tags
```

因为客户端 bundle 的 URL `rev` 是**进程 nonce、不随内容变化**，
**用户升级后必须重启 DSH 服务 + 硬刷新**才能看到新版（README 里已写明）。

---

## 八、许可与署名

- 上游 BSD-3-Clause：**保留版权声明与许可全文**（`LICENSE` 原样保留即可满足），
  署名与差异说明写在两个 README 顶部（已写好），**不要写成原创**。
- `package.json` 的 `author` 仍是上游作者 `NativeDog1`，本分支以 `contributors` 形式加入。
- `media/*.mp4` 与内嵌片源按同条款分发（上游 LICENSE 的 Note 段已声明）。
  若不想随仓库分发这些 mp4：**删掉 `media/` 也能正常安装运行** ——
  内嵌片源在 `lib/clips.data.js` 里，`media/` 只是 `scripts/embed-clips.mjs` 的输入。

---

## 九、与上游的差异

| 能力 | 上游 | 本分支 |
|---|---|---|
| 片头播放 / 钉住会话 / 片库 / 自带四段内嵌片源 | ✅ | ✅（未改动） |
| 工作区皮肤（尾帧铺在画布后） | — | ✅ |
| 静帧 / 动态（只循环片尾 N 秒） | — | ✅ |
| 皮肤透明度 / 侧边栏透明度（互相独立） | — | ✅ |
| 模糊三档 | — | ✅ |

逐行改动见仓库根目录的补丁文件；也可以直接看 git 历史。
