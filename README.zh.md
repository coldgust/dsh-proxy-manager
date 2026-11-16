[English](README.md) | 中文

# dsh-proxy-manager

在 **设置 → 代理** 一个页面里管理本机开发工具的代理：内置 13 个工具，也可以自己添加；一键为全部工具设置或取消代理。

## 功能

- **一个列表看全**：每行显示是否已启用、当前代理地址、以及保存它的配置文件。
- **一键启用 / 取消**：`全部启用` / `全部取消`，或单行开关。就地改写配置文件，注释、顺序与其他键都保留。
- **使用系统代理**：读取操作系统当前的手动代理，连同直连地址一起填入。
- **打开配置文件**：用默认文本编辑器打开；文件尚未创建的行会标记出来，不能打开。
- **置顶、搜索、分页**：置顶的排最前，已启用的排在未启用之前，配置文件缺失的排最后；搜索按名称、id、路径、类别、地址过滤；每页 10 行。
- **三种扩展方式**：页面里添加软件、代码里加内置适配器、其他插件运行时注册。
- **Agent 可用**：`proxy_manager` 工具读同一份状态、做同样的操作。

## 安装

仓库已包含构建产物 `lib/`，直接使用无需自行构建。

1. 在 **插件** 页点 **添加插件**，选择本仓库目录（`dsh-proxy-manager`），会以本地链接的方式装进当前 profile。
2. 确认 `Proxy manager` 一行处于启用状态。
3. **重启一次 DeepSeek Harness** —— Host 模块与浏览器 bundle 需要新进程才加载；之后改代码只需在插件行切一次开关。
4. 打开 **设置 → 代理**。

## 支持的工具

| 工具 | 配置文件 | 写入的键 |
| --- | --- | --- |
| Git | `~/.gitconfig` | `[http] proxy`、`[https] proxy` |
| npm | `~/.npmrc` | `proxy`、`https-proxy` |
| pnpm | `~/.npmrc`（与 npm 共用） | `proxy`、`https-proxy` |
| Yarn | `~/.yarnrc.yml` | `httpProxy`、`httpsProxy` |
| Cargo | `~/.cargo/config.toml` | `[http] proxy` |
| pip | macOS `~/Library/Application Support/pip/pip.conf`、Linux `~/.config/pip/pip.conf`、Windows `%APPDATA%\pip\pip.ini` | `[global] proxy` |
| Maven | `~/.m2/settings.xml` | 一个 `<proxy>` 元素（id 为 `dsh-proxy-manager`） |
| Gradle | `~/.gradle/gradle.properties` | `systemProp.http(s).proxyHost/proxyPort/nonProxyHosts` |
| DeepSeek Harness | `$DSH_HOME/.env` | `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` |
| Docker | `~/.docker/config.json` | `proxies.default.httpProxy/httpsProxy/noProxy` |
| Shell 环境 | `~/.zshrc` / `~/.bashrc`（Windows 为 PowerShell profile） | `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` |
| curl | `~/.curlrc` | `proxy`、`noproxy` |
| wget | `~/.wgetrc` | `http_proxy`、`https_proxy`、`no_proxy` |

其中「Shell 环境」覆盖所有只读环境变量的工具：Go、kubectl、Helm、Terraform、aws、uv、Poetry、Bundler、Homebrew。

## 使用

1. 打开 **设置 → 代理**。
2. 填写代理地址（如 `http://127.0.0.1:7890`），或点 **使用系统代理** 自动填入，再填直连地址。
3. 点 **保存**，然后点 **全部启用**，或打开需要代理的那几行开关。
4. 取消时点 **全部取消**，或关闭对应开关。

已经运行的程序只会在启动时读取配置：修改后请重启该工具或打开新终端；DeepSeek Harness 自身在下次启动时生效。

## 添加软件

**页面里添加**：列表底部的 **添加软件**，填写显示名称、文件格式、配置文件、节名、键名，以及该键保存的内容（完整地址 / 主机 / 端口 / 直连地址）。适配器保存在本插件自己的状态文件里。

**代码里添加**：新建 `src/host/adapters/<tool>.ts`：

```ts
import type { ToolSpec } from '../core/types.ts'

export const bun: ToolSpec = {
  id: 'bun',
  name: 'Bun',
  category: 'javascript',
  kind: 'toml',
  path: '~/.bunfig.toml',
  section: 'install',
  fields: [{ key: 'proxy', part: 'url' }],
}
```

然后在 `src/host/adapters/index.ts` 的 `builtinAdapters` 里加一行。页面、HTTP 接口与 Agent 工具都读这一张表。

**其他插件注册**：

```ts
const dispose = ctx.proxyManager.registerTool({ id: 'my-tool', name: 'My tool', kind: 'json', path: '~/.my-tool/config.json', fields: [{ key: 'proxy.url', part: 'url' }] })
```

## 适配器字段

| 字段 | 含义 |
| --- | --- |
| `kind` | 文件方言：`ini`（`[section]` + `key = value`）、`props`（`key=value`）、`yaml`（顶层 `key: value`）、`toml`（`[table]` + `key = "value"`）、`json`（点分路径）、`env`（`KEY=VALUE`）、`shell`（受管的导出块）、`xml`（受管的 `<proxy>` 元素） |
| `path` | 单个路径、候选路径列表（存在者优先），或按平台的表；支持 `~`、`$DSH_HOME`、`%APPDATA%` |
| `section` | `ini` / `toml` 的节名，字段可覆盖 |
| `fields[].key` | 键名、JSON 点分路径，或受管块内的元素名 |
| `fields[].part` | `url`（完整地址）、`scheme` / `host` / `port`（分开存储）、`noProxy` |
| `fields[].transform` | `jvmNoProxy` 把直连列表转成 JVM 的 `\|` 形式 |
| `binary` | 用于「未安装」提示的 PATH 检查 |

## Agent 工具

`proxy_manager` 的 `action`：

- `status` —— 列出每个工具、代理地址与配置文件
- `enable` —— 写入代理（`tools` 限定 id，`proxy` 仅对本次调用覆盖地址）
- `disable` —— 移除代理（可用 `tools` 限定）
- `system` —— 系统当前代理

## 说明

- `使用系统代理` 读取的是系统的手动代理（macOS `scutil --proxy`、Windows Internet Settings、GNOME `gsettings`）。自动配置脚本（PAC）或 TUN/VPN 方式没有固定地址，页面会明确提示而不是猜。
- pnpm 与 npm 共用 `~/.npmrc`，启用其一另一行也会显示已启用，这是真实状态。
- Windows / Linux 的路径、注册表 / GNOME 探测与 `explorer` / `xdg-open` 都已实现并有单测，但只在 macOS 上做过端到端验证。

## 开发

项目用 pnpm 12（`package.json` 的 `packageManager` 已钉住）；`pnpm-workspace.yaml` 显式允许开发所需的唯一构建脚本（esbuild）。

```bash
pnpm install
pnpm typecheck
pnpm build     # lib/loader.js、lib/host.js、lib/client.js
pnpm test
```

`pnpm build` 生成入库的 `lib/` 产物；改完在插件行切一次开关即可加载（首次安装需重启一次）。
