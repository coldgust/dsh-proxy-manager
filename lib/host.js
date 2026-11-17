// src/host/core/env.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function currentEnv(env = process.env, platform = process.platform) {
  const home = platform === "win32" ? env.USERPROFILE?.trim() || env.HOME?.trim() || os.homedir() : env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
  const dshHome = env.DSH_HOME?.trim() || path.join(home, ".dsh");
  return { home, dshHome, platform, env };
}
function unifiedSlashes(value) {
  return value.replace(/\\/g, "/");
}
function expandPath(raw, env) {
  const unified = unifiedSlashes(raw.trim());
  let value = unified === "~" ? env.home : unified.startsWith("~/") ? path.join(env.home, unified.slice(2)) : unified;
  value = value.replace(/\$\{DSH_HOME\}|\$DSH_HOME\b/g, env.dshHome);
  value = value.replace(/\$\{HOME\}|\$HOME\b/g, env.home);
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (match, name) => env.env[name] ?? match);
  return path.isAbsolute(value) ? path.normalize(value) : path.join(env.home, value);
}
function shorten(absolute, root, label) {
  const prefix = unifiedSlashes(root).replace(/\/+$/, "");
  if (prefix === "") return void 0;
  const target = unifiedSlashes(absolute);
  if (target === prefix) return label;
  if (!target.startsWith(`${prefix}/`)) return void 0;
  return `${label}${absolute.slice(prefix.length)}`;
}
function displayPath(absolute, env) {
  return shorten(absolute, env.dshHome, "$DSH_HOME") ?? shorten(absolute, env.home, "~") ?? absolute;
}
function resolvePathSpec(spec, env) {
  const platformEntry = Array.isArray(spec) ? void 0 : typeof spec === "string" ? spec : spec[env.platform] ?? spec.darwin ?? spec.linux ?? spec.win32;
  const raw = platformEntry ?? spec;
  const candidates = (Array.isArray(raw) ? raw : [raw]).filter((entry) => typeof entry === "string" && entry.trim() !== "").map((entry) => expandPath(entry, env));
  if (candidates.length === 0) throw new Error(`no configuration path for platform ${env.platform}`);
  const existing = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
  return existing ?? candidates[0];
}
function isOnPath(binary, env) {
  if (binary.includes("/") || binary.includes("\\")) return false;
  const pathValue = env.env.PATH ?? "";
  if (pathValue === "") return false;
  const suffixes = env.platform === "win32" ? (env.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  return pathValue.split(path.delimiter).some((dir) => dir !== "" && suffixes.some((ext) => {
    try {
      fs.accessSync(path.join(dir, `${binary}${ext}`), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }));
}

// src/host/service.ts
import { stat } from "node:fs/promises";

// src/host/adapters/cargo.ts
var cargo = {
  id: "cargo",
  name: "Cargo",
  category: "rust",
  kind: "toml",
  section: "http",
  path: "~/.cargo/config.toml",
  binary: "cargo",
  fields: [{ key: "proxy", part: "url" }]
};

// src/host/adapters/curl.ts
var curl = {
  id: "curl",
  name: "curl",
  category: "network",
  kind: "props",
  path: ["~/.curlrc", "~/_curlrc"],
  binary: "curl",
  fields: [
    { key: "proxy", part: "url" },
    { key: "noproxy", part: "noProxy" }
  ]
};

// src/host/adapters/docker.ts
var docker = {
  id: "docker",
  name: "Docker",
  category: "containers",
  kind: "json",
  path: "~/.docker/config.json",
  binary: "docker",
  fields: [
    { key: "proxies.default.httpProxy", part: "url" },
    { key: "proxies.default.httpsProxy", part: "url" },
    { key: "proxies.default.noProxy", part: "noProxy" }
  ]
};

// src/host/adapters/dsh.ts
var dsh = {
  id: "dsh",
  name: "DeepSeek Harness",
  category: "dsh",
  kind: "env",
  path: "$DSH_HOME/.env",
  binary: "dsh",
  note: "applied the next time DSH starts",
  fields: [
    { key: "HTTP_PROXY", part: "url" },
    { key: "HTTPS_PROXY", part: "url" },
    { key: "NO_PROXY", part: "noProxy" }
  ]
};

// src/host/adapters/git.ts
var git = {
  id: "git",
  name: "Git",
  category: "version-control",
  kind: "ini",
  path: "~/.gitconfig",
  binary: "git",
  fields: [
    { section: "http", key: "proxy", part: "url" },
    { section: "https", key: "proxy", part: "url" }
  ]
};

// src/host/adapters/gradle.ts
var gradle = {
  id: "gradle",
  name: "Gradle",
  category: "jvm",
  kind: "props",
  path: "~/.gradle/gradle.properties",
  binary: "gradle",
  fields: [
    { key: "systemProp.http.proxyHost", part: "host" },
    { key: "systemProp.http.proxyPort", part: "port" },
    { key: "systemProp.https.proxyHost", part: "host" },
    { key: "systemProp.https.proxyPort", part: "port" },
    { key: "systemProp.http.nonProxyHosts", part: "noProxy", transform: "jvmNoProxy" }
  ]
};

// src/host/adapters/maven.ts
var maven = {
  id: "maven",
  name: "Maven",
  category: "jvm",
  kind: "xml",
  path: "~/.m2/settings.xml",
  binary: "mvn",
  note: "active only while no other proxy element overrides it",
  fields: [
    { key: "host", part: "host" },
    { key: "port", part: "port" },
    { key: "protocol", part: "scheme" },
    { key: "nonProxyHosts", part: "noProxy", transform: "jvmNoProxy" }
  ]
};

// src/host/adapters/npm.ts
var npm = {
  id: "npm",
  name: "npm",
  category: "javascript",
  kind: "props",
  path: "~/.npmrc",
  binary: "npm",
  fields: [
    { key: "proxy", part: "url" },
    { key: "https-proxy", part: "url" }
  ]
};

// src/host/adapters/pip.ts
var pip = {
  id: "pip",
  name: "pip",
  category: "python",
  kind: "ini",
  section: "global",
  path: {
    // pip's documented user config on macOS lives under Application Support;
    // the XDG and legacy locations stay as fallbacks for existing setups.
    darwin: [
      "~/Library/Application Support/pip/pip.conf",
      "~/.config/pip/pip.conf",
      "~/.pip/pip.conf"
    ],
    linux: ["~/.config/pip/pip.conf", "~/.pip/pip.conf"],
    win32: ["%APPDATA%/pip/pip.ini", "%APPDATA%/pip/pip.conf"]
  },
  binary: "pip3",
  fields: [{ key: "proxy", part: "url" }]
};

// src/host/adapters/pnpm.ts
var pnpm = {
  id: "pnpm",
  name: "pnpm",
  category: "javascript",
  kind: "props",
  path: "~/.npmrc",
  binary: "pnpm",
  note: "shares ~/.npmrc with npm",
  fields: [
    { key: "proxy", part: "url" },
    { key: "https-proxy", part: "url" }
  ]
};

// src/host/adapters/shell.ts
var shell = {
  id: "shell",
  name: "Shell environment",
  category: "environment",
  kind: "shell",
  path: {
    darwin: ["~/.zshrc", "~/.bashrc"],
    linux: ["~/.bashrc", "~/.zshrc"],
    win32: "~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1"
  },
  note: "applies to newly opened terminals",
  fields: [
    { key: "HTTP_PROXY", part: "url" },
    { key: "HTTPS_PROXY", part: "url" },
    { key: "NO_PROXY", part: "noProxy" }
  ]
};

// src/host/adapters/wget.ts
var wget = {
  id: "wget",
  name: "wget",
  category: "network",
  kind: "props",
  path: ["~/.wgetrc", "~/_wgetrc"],
  binary: "wget",
  fields: [
    { key: "http_proxy", part: "url" },
    { key: "https_proxy", part: "url" },
    { key: "no_proxy", part: "noProxy" }
  ]
};

// src/host/adapters/yarn.ts
var yarn = {
  id: "yarn",
  name: "Yarn",
  category: "javascript",
  kind: "yaml",
  path: "~/.yarnrc.yml",
  binary: "yarn",
  fields: [
    { key: "httpProxy", part: "url" },
    { key: "httpsProxy", part: "url" }
  ]
};

// src/host/adapters/index.ts
var builtinAdapters = [
  git,
  npm,
  pnpm,
  yarn,
  cargo,
  pip,
  maven,
  gradle,
  dsh,
  docker,
  shell,
  curl,
  wget
];

// src/host/core/engine.ts
import fs2 from "node:fs/promises";
import path2 from "node:path";

// src/host/core/blocks.ts
var SHELL_START = "# >>> dsh-proxy-manager >>>";
var SHELL_END = "# <<< dsh-proxy-manager <<<";
function readShellBlock(text) {
  const start = text.indexOf(SHELL_START);
  if (start === -1) return void 0;
  const end = text.indexOf(SHELL_END, start);
  if (end === -1) return void 0;
  const values = {};
  for (const line of text.slice(start, end).split("\n")) {
    const match = /^\s*(?:export\s+|\$env:)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    const raw = (match[2] ?? "").replace(/^["']|["';]\s*$/g, "");
    if (key !== void 0 && raw !== "") values[key] = raw;
  }
  return Object.keys(values).length === 0 ? void 0 : values;
}
function writeShellBlock(text, values, syntax = "posix") {
  const body = Object.entries(values).filter(([, value]) => value !== "").map(([key, value]) => syntax === "powershell" ? `$env:${key} = "${value}"` : `export ${key}="${value}"`);
  if (body.length === 0) return clearShellBlock(text);
  const block = [SHELL_START, ...body, SHELL_END].join("\n");
  const start = text.indexOf(SHELL_START);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (start !== -1) {
    const end = text.indexOf(SHELL_END, start);
    if (end !== -1) {
      const after = text.slice(end + SHELL_END.length).replace(/^\r?\n/, "");
      return `${text.slice(0, start)}${block.split("\n").join(eol)}${eol}${after}`;
    }
  }
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed === "" ? "" : `${trimmed}${eol}${eol}`}${block.split("\n").join(eol)}${eol}`;
}
function clearShellBlock(text) {
  const start = text.indexOf(SHELL_START);
  if (start === -1) return text;
  const end = text.indexOf(SHELL_END, start);
  if (end === -1) return text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const before = text.slice(0, start).replace(/(\r?\n){2}$/, eol);
  const after = text.slice(end + SHELL_END.length).replace(/^\r?\n/, "");
  return `${before}${after}`;
}
var XML_PROXY_ID = "dsh-proxy-manager";
var PROXY_ELEMENT = /<proxy>[\s\S]*?<\/proxy>/g;
function ownProxyElement(text) {
  for (const match of text.matchAll(PROXY_ELEMENT)) {
    if (match[0].includes(`<id>${XML_PROXY_ID}</id>`)) return match[0];
  }
  return void 0;
}
function elementValue(block, name) {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(block);
  const value = match?.[1]?.trim();
  return value === void 0 || value === "" ? void 0 : value;
}
function readXmlProxy(text) {
  const block = ownProxyElement(text);
  if (block === void 0) return void 0;
  const values = {};
  for (const name of ["host", "port", "protocol", "nonProxyHosts"]) {
    const value = elementValue(block, name);
    if (value !== void 0) values[name] = value;
  }
  return Object.keys(values).length === 0 ? void 0 : values;
}
function renderProxyElement(values, indent) {
  const inner = indent + "  ";
  const lines = [
    `${indent}<proxy>`,
    `${inner}<id>${XML_PROXY_ID}</id>`,
    `${inner}<active>true</active>`,
    `${inner}<protocol>${values.protocol ?? "http"}</protocol>`,
    `${inner}<host>${values.host ?? ""}</host>`,
    `${inner}<port>${values.port ?? ""}</port>`
  ];
  if (values.nonProxyHosts !== void 0 && values.nonProxyHosts !== "") {
    lines.push(`${inner}<nonProxyHosts>${values.nonProxyHosts}</nonProxyHosts>`);
  }
  lines.push(`${indent}</proxy>`);
  return lines.join("\n");
}
function writeXmlProxy(text, values) {
  const existing = ownProxyElement(text);
  if (existing !== void 0) {
    const indentMatch = /\n([ \t]*)<proxy>/.exec(text);
    const indent = indentMatch?.[1] ?? "    ";
    const rendered = renderProxyElement(values, indent);
    return text.replace(existing, rendered);
  }
  const element = renderProxyElement(values, "    ");
  if (text.includes("</proxies>")) {
    const head = text.replace(/([ \t]*)<\/proxies>/, (match) => `${element}
${match}`);
    return head;
  }
  if (text.includes("</settings>")) {
    return text.replace(/([ \t]*)<\/settings>/, (match) => `  <proxies>
${element}
  </proxies>
${match}`);
  }
  if (text.trim() === "") {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">',
      "  <proxies>",
      element,
      "  </proxies>",
      "</settings>",
      ""
    ].join("\n");
  }
  throw new Error("settings.xml has no </settings> close tag; refusing to rewrite it");
}
function clearXmlProxy(text) {
  const existing = ownProxyElement(text);
  if (existing === void 0) return text;
  return text.replace(existing, "").replace(/\n{3,}/g, "\n\n");
}

// src/host/core/formats.ts
var SECTION_LINE = /^\s*\[([^\]]+)\]\s*$/;
var INI_KEY = /^\s*([^=:#;[\]\s][^=:]*?)\s*[=:]\s*(.*)$/;
var PROPS_KEY = /^\s*([^=:#;\s][^=:]*?)\s*[=:]\s*(.*)$/;
var TOML_KEY = /^\s*([A-Za-z0-9_."'[\]-]+)\s*=\s*(.*)$/;
var YAML_KEY = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/;
var ENV_KEY = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
function isComment(line, kind) {
  const trimmed = line.trimStart();
  if (trimmed === "") return true;
  if (kind === "yaml" || kind === "env") return trimmed.startsWith("#");
  return trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed.startsWith("//");
}
function splitText(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (text === "") return { lines: [], eol, trailing: false };
  const lines = text.split(/\r?\n/);
  const trailing = lines.length > 0 && lines[lines.length - 1] === "";
  if (trailing) lines.pop();
  return { lines, eol, trailing };
}
function joinText(lines, eol, trailing) {
  if (lines.length === 0) return "";
  return lines.join(eol) + (trailing ? eol : "");
}
function normalizeValue(raw) {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1);
  }
  const comment = value.search(/\s[#;]/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}
function scan(text, kind) {
  const { lines } = splitText(text);
  let section;
  return lines.map((line) => {
    if (isComment(line, kind)) return section === void 0 ? {} : { section };
    if (kind === "ini" || kind === "toml") {
      const header = SECTION_LINE.exec(line);
      if (header !== null) {
        section = header[1]?.trim().replace(/^"|"$/g, "");
        return { section };
      }
    }
    const pattern = kind === "ini" ? INI_KEY : kind === "toml" ? TOML_KEY : kind === "yaml" ? YAML_KEY : kind === "env" ? ENV_KEY : PROPS_KEY;
    const match = pattern.exec(line);
    if (match === null) return section === void 0 ? {} : { section };
    return {
      ...section === void 0 ? {} : { section },
      key: match[1]?.trim(),
      value: match[2] ?? ""
    };
  });
}
function sameKey(a, b, kind) {
  if (a === void 0) return false;
  return kind === "ini" || kind === "env" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function formatAssignment(target, value) {
  switch (target.kind) {
    case "toml":
      return `${target.key} = ${JSON.stringify(value)}`;
    case "yaml":
      return `${target.key}: ${/[:#]/.test(value) ? JSON.stringify(value) : value}`;
    case "ini":
      return `${target.key} = ${value}`;
    default:
      return `${target.key}=${value}`;
  }
}
function matchesTarget(line, target) {
  if (!sameKey(line.key, target.key, target.kind)) return false;
  if (target.section === void 0) return true;
  return (line.section ?? "").toLowerCase() === target.section.toLowerCase();
}
function sectionInsertIndex(scanned, section) {
  let last;
  for (const [index, line] of scanned.entries()) {
    if ((line.section ?? "").toLowerCase() !== section.toLowerCase()) continue;
    last = index;
  }
  return last === void 0 ? void 0 : last + 1;
}
function readValue(text, target) {
  if (target.kind === "json") return readJsonValue(text, target.key);
  const scanned = scan(text, target.kind);
  for (const line of scanned) {
    if (matchesTarget(line, target)) {
      const normalized = normalizeValue(line.value ?? "");
      return normalized === "" ? void 0 : normalized;
    }
  }
  return void 0;
}
function writeValue(text, target, value) {
  if (target.kind === "json") return writeJsonValue(text, target.key, value);
  const { lines, eol, trailing } = splitText(text);
  const scanned = scan(text, target.kind);
  for (const [index, line] of scanned.entries()) {
    if (matchesTarget(line, target)) {
      lines[index] = formatAssignment(target, value);
      return joinText(lines, eol, trailing);
    }
  }
  const assignment = formatAssignment(target, value);
  if (target.section !== void 0) {
    const insertAt = sectionInsertIndex(scanned, target.section);
    if (insertAt !== void 0) {
      lines.splice(insertAt, 0, assignment);
      return joinText(lines, eol, true);
    }
    if (lines.length > 0 && lines[lines.length - 1]?.trim() !== "") lines.push("");
    lines.push(`[${target.section}]`, assignment);
    return joinText(lines, eol, true);
  }
  lines.push(assignment);
  return joinText(lines, eol, true);
}
function removeValue(text, target) {
  if (target.kind === "json") return removeJsonValue(text, target.key);
  const { lines, eol, trailing } = splitText(text);
  const scanned = scan(text, target.kind);
  const kept = lines.filter((_, index) => {
    const line = scanned[index];
    return line === void 0 || !matchesTarget(line, target);
  });
  return joinText(kept, eol, trailing);
}
function parseJson(text) {
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "configuration root is not a JSON object" };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}
function nest(root, path4, create) {
  let cursor = root;
  for (const segment of path4.slice(0, -1)) {
    const next = cursor[segment];
    if (next === void 0) {
      if (!create) return void 0;
      const created = {};
      cursor[segment] = created;
      cursor = created;
      continue;
    }
    if (next === null || typeof next !== "object" || Array.isArray(next)) return void 0;
    cursor = next;
  }
  return cursor;
}
function assertParseable(text, kind) {
  if (kind !== "json") return;
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(parsed.error);
}
function readJsonValue(text, path4) {
  const parsed = parseJson(text);
  if (!parsed.ok) return void 0;
  const segments = path4.split(".");
  const parent = nest(parsed.value, segments, false);
  const leaf = segments[segments.length - 1];
  if (parent === void 0 || leaf === void 0) return void 0;
  const value = parent[leaf];
  if (typeof value === "string") return value.trim() === "" ? void 0 : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return void 0;
}
function writeJsonValue(text, path4, value) {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const segments = path4.split(".");
  const leaf = segments[segments.length - 1];
  const parent = nest(parsed.value, segments, true);
  if (parent === void 0 || leaf === void 0) throw new Error(`cannot write ${path4} into this configuration`);
  parent[leaf] = value;
  return `${JSON.stringify(parsed.value, null, 2)}
`;
}
function removeJsonValue(text, path4) {
  const parsed = parseJson(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const segments = path4.split(".");
  const leaf = segments[segments.length - 1];
  const parent = nest(parsed.value, segments, false);
  if (parent === void 0 || leaf === void 0) return text;
  delete parent[leaf];
  return `${JSON.stringify(parsed.value, null, 2)}
`;
}

// src/host/core/proxy.ts
var DEFAULT_PORTS = { "http:": "80", "https:": "443", "socks4:": "1080", "socks5:": "1080" };
function parseProxy(input) {
  const trimmed = input.trim();
  if (trimmed === "") return void 0;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return void 0;
  }
  if (parsed.hostname === "") return void 0;
  const scheme = parsed.protocol.replace(/:$/, "");
  const port = parsed.port === "" ? DEFAULT_PORTS[parsed.protocol] ?? "" : parsed.port;
  const credentials = parsed.username === "" ? "" : `${parsed.username}${parsed.password === "" ? "" : `:${parsed.password}`}@`;
  return {
    url: `${scheme}://${credentials}${parsed.host}`,
    scheme,
    host: parsed.hostname.includes(":") ? `[${parsed.hostname}]` : parsed.hostname,
    port
  };
}
function requireProxy(input) {
  const parsed = parseProxy(input);
  if (parsed === void 0) {
    throw new Error(`"${input}" is not a valid proxy address (expected something like http://127.0.0.1:7890)`);
  }
  return parsed;
}
function suggestedProxy(env) {
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"]) {
    const value = env[name]?.trim();
    if (value !== void 0 && value !== "") return value;
  }
  return "";
}

// src/host/core/engine.ts
async function readConfig(absolute) {
  try {
    const text = await fs2.readFile(absolute, "utf8");
    return { text, exists: true };
  } catch (error) {
    if (error.code === "ENOENT") return { text: "", exists: false };
    throw error;
  }
}
async function writeConfig(absolute, text) {
  await fs2.mkdir(path2.dirname(absolute), { recursive: true });
  await fs2.writeFile(absolute, text, "utf8");
}
function targetOf(spec, field) {
  const section = field.section ?? spec.section;
  return { kind: spec.kind, ...section === void 0 ? {} : { section }, key: field.key };
}
function readingFromValues(spec, values) {
  const parts = {};
  let noProxy;
  for (const field of spec.fields) {
    const value = values[field.key];
    if (value === void 0) continue;
    if (field.part === "noProxy") noProxy = readField(field, value);
    else parts[field.part] = value;
  }
  return composeReading(parts, noProxy);
}
function composeReading(parts, noProxy) {
  let url;
  if (parts.url !== void 0) {
    const parsed = parseProxy(parts.url);
    url = parsed === void 0 ? parts.url : parsed.url;
  } else if (parts.host !== void 0) {
    url = `${parts.scheme ?? "http"}://${parts.host}${parts.port === void 0 ? "" : `:${parts.port}`}`;
  }
  const present = Object.keys(parts).length > 0 || noProxy !== void 0;
  return {
    ...url === void 0 ? {} : { url },
    ...noProxy === void 0 ? {} : { noProxy },
    present
  };
}
function blockValues(spec, settings) {
  const values = {};
  for (const field of spec.fields) {
    const value = fieldValue(field, settings);
    if (value !== "") values[field.key] = value;
  }
  return values;
}
function readToolConfig(text, spec) {
  assertParseable(text, spec.kind);
  if (spec.kind === "shell") return readingFromValues(spec, readShellBlock(text) ?? {});
  if (spec.kind === "xml") return readingFromValues(spec, readXmlProxy(text) ?? {});
  const parts = {};
  let noProxy;
  for (const field of spec.fields) {
    const value = readValue(text, targetOf(spec, field));
    if (value === void 0) continue;
    if (field.part === "noProxy") noProxy = readField(field, value);
    else parts[field.part] = value;
  }
  return composeReading(parts, noProxy);
}
function readField(field, value) {
  if (field.transform === "jvmNoProxy") return value.split("|").map((entry) => entry.trim()).filter(Boolean).join(",");
  return value;
}
function writeField(field, value) {
  if (field.transform === "jvmNoProxy") return value.split(",").map((entry) => entry.trim()).filter(Boolean).join("|");
  return value;
}
function fieldValue(field, settings) {
  const part = field.part;
  if (part === "noProxy") return writeField(field, settings.noProxy.trim());
  const proxy = requireProxy(settings.url);
  switch (part) {
    case "url":
      return proxy.url;
    case "scheme":
      return proxy.scheme;
    case "host":
      return proxy.host;
    case "port":
      return proxy.port;
  }
}
function writeToolConfig(text, spec, settings, syntax = "posix") {
  if (spec.kind === "shell") return writeShellBlock(text, blockValues(spec, settings), syntax);
  if (spec.kind === "xml") return writeXmlProxy(text, blockValues(spec, settings));
  let next = text;
  for (const field of spec.fields) {
    const value = fieldValue(field, settings);
    const target = targetOf(spec, field);
    next = value === "" ? removeValue(next, target) : writeValue(next, target, value);
  }
  return next;
}
function clearToolConfig(text, spec) {
  if (spec.kind === "shell") return clearShellBlock(text);
  if (spec.kind === "xml") return clearXmlProxy(text);
  let next = text;
  for (const field of spec.fields) next = removeValue(next, targetOf(spec, field));
  return next;
}
function describe(spec, absolute, env) {
  return {
    id: spec.id,
    name: spec.name,
    ...spec.category === void 0 ? {} : { category: spec.category },
    kind: spec.kind,
    path: absolute,
    displayPath: displayPath(absolute, env),
    ...spec.binary === void 0 ? {} : { installed: isOnPath(spec.binary, env) },
    ...spec.note === void 0 ? {} : { note: spec.note },
    ...spec.custom === true ? { custom: true } : {}
  };
}
function failedStatus(spec, absolute, env, error) {
  return {
    ...describe(spec, absolute, env),
    exists: false,
    enabled: false,
    error: error instanceof Error ? error.message : String(error)
  };
}
async function inspectTool(spec, env) {
  const absolute = resolvePathSpec(spec.path, env);
  try {
    const { text, exists } = await readConfig(absolute);
    if (!exists) return { ...describe(spec, absolute, env), exists: false, enabled: false };
    const reading = readToolConfig(text, spec);
    return {
      ...describe(spec, absolute, env),
      exists: true,
      enabled: reading.url !== void 0,
      ...reading.url === void 0 ? {} : { url: reading.url },
      ...reading.noProxy === void 0 ? {} : { noProxy: reading.noProxy }
    };
  } catch (error) {
    return failedStatus(spec, absolute, env, error);
  }
}
async function applyTool(spec, settings, env) {
  const absolute = resolvePathSpec(spec.path, env);
  try {
    const { text } = await readConfig(absolute);
    const syntax = spec.syntax ?? (env.platform === "win32" ? "powershell" : "posix");
    await writeConfig(absolute, writeToolConfig(text, spec, settings, syntax));
    return await inspectTool(spec, env);
  } catch (error) {
    return failedStatus(spec, absolute, env, error);
  }
}
async function clearTool(spec, env) {
  const absolute = resolvePathSpec(spec.path, env);
  try {
    const { text, exists } = await readConfig(absolute);
    if (!exists) return { ...describe(spec, absolute, env), exists: false, enabled: false };
    await writeConfig(absolute, clearToolConfig(text, spec));
    return await inspectTool(spec, env);
  } catch (error) {
    return failedStatus(spec, absolute, env, error);
  }
}

// src/host/core/state.ts
import fs3 from "node:fs/promises";
import path3 from "node:path";
var STATE_VERSION = 1;
var EMPTY_SETTINGS = { url: "", noProxy: "localhost,127.0.0.1,::1" };
var KINDS = ["json", "ini", "props", "yaml", "toml", "env", "shell", "xml"];
var PARTS = ["url", "scheme", "host", "port", "noProxy"];
var ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
function readString(value, field, fallback) {
  if (value === void 0 && fallback !== void 0) return fallback;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}
function optionalString(value, field) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.trim() === "" ? void 0 : value.trim();
}
function sanitizeToolSpec(input) {
  if (input === null || typeof input !== "object") throw new Error("adapter must be an object");
  const record = input;
  const id = readString(record.id, "id").trim();
  if (!ID_PATTERN.test(id)) throw new Error("id must be lowercase letters, digits, dot, dash or underscore");
  const name = readString(record.name, "name").trim();
  if (name === "") throw new Error("name cannot be empty");
  const kind = readString(record.kind, "kind");
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  const rawPath = record.path;
  const isPathList = (value) => Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim() !== "");
  const configPath = typeof rawPath === "string" && rawPath.trim() !== "" ? rawPath : isPathList(rawPath) ? rawPath : rawPath !== null && typeof rawPath === "object" ? rawPath : void 0;
  if (configPath === void 0) throw new Error("path must be a string or a list of paths");
  const rawFields = record.fields;
  if (!Array.isArray(rawFields) || rawFields.length === 0) throw new Error("fields must list at least one key");
  const fields = rawFields.map((entry, index) => {
    if (entry === null || typeof entry !== "object") throw new Error(`fields[${index}] must be an object`);
    const field = entry;
    const key = readString(field.key, `fields[${index}].key`).trim();
    if (key === "") throw new Error(`fields[${index}].key cannot be empty`);
    const part = readString(field.part, `fields[${index}].part`);
    if (!PARTS.includes(part)) throw new Error(`fields[${index}].part must be one of ${PARTS.join(", ")}`);
    const section2 = optionalString(field.section, `fields[${index}].section`);
    return { key, part, ...section2 === void 0 ? {} : { section: section2 } };
  });
  const section = optionalString(record.section, "section");
  const binary = optionalString(record.binary, "binary");
  const note = optionalString(record.note, "note");
  const category = optionalString(record.category, "category");
  const syntax = optionalString(record.syntax, "syntax");
  return {
    id,
    name,
    kind,
    path: configPath,
    fields,
    ...section === void 0 ? {} : { section },
    ...binary === void 0 ? {} : { binary },
    ...note === void 0 ? {} : { note },
    ...category === void 0 ? {} : { category },
    ...syntax === "posix" || syntax === "powershell" ? { syntax } : {},
    custom: true
  };
}
var StateStore = class {
  constructor(env) {
    this.env = env;
  }
  /** Directory holding the state document. */
  get directory() {
    return path3.join(this.env.dshHome, "proxy-manager");
  }
  /** Path of the state document. */
  get file() {
    return path3.join(this.directory, "state.json");
  }
  /**
   * Load the document, falling back to defaults for a missing or unreadable one.
   * @returns settings and user adapters.
   */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs3.readFile(this.file, "utf8"));
    } catch {
      return { version: STATE_VERSION, settings: { ...EMPTY_SETTINGS }, tools: [], pinned: [] };
    }
    const record = parsed !== null && typeof parsed === "object" ? parsed : {};
    const settingsRecord = record.settings !== null && typeof record.settings === "object" ? record.settings : {};
    const settings = {
      url: typeof settingsRecord.url === "string" ? settingsRecord.url : EMPTY_SETTINGS.url,
      noProxy: typeof settingsRecord.noProxy === "string" ? settingsRecord.noProxy : EMPTY_SETTINGS.noProxy
    };
    const tools = [];
    if (Array.isArray(record.tools)) {
      for (const entry of record.tools) {
        try {
          tools.push(sanitizeToolSpec(entry));
        } catch {
        }
      }
    }
    const pinned = Array.isArray(record.pinned) ? record.pinned.filter((entry) => typeof entry === "string") : [];
    return { version: STATE_VERSION, settings, tools, pinned };
  }
  /**
   * Persist the document atomically.
   * @param state - settings and user adapters.
   */
  async save(state) {
    await fs3.mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs3.writeFile(temporary, `${JSON.stringify(state, null, 2)}
`, "utf8");
    await fs3.rename(temporary, this.file);
  }
};

// src/host/core/system-proxy.ts
import { execFile } from "node:child_process";
var runCommand = (command, args) => new Promise((resolve) => {
  execFile(command, [...args], { timeout: 3e3, windowsHide: true }, (error, stdout) => {
    resolve(error === null ? stdout : void 0);
  });
});
function readField2(text, key) {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "m").exec(text);
  return match?.[1]?.trim();
}
function scutilExceptions(text) {
  const start = text.indexOf("ExceptionsList");
  if (start === -1) return [];
  const entries = [];
  for (const line of text.slice(start).split("\n").slice(1)) {
    const entry = /^\s*\d+\s*:\s*(.+)$/.exec(line);
    if (entry !== null) {
      const value = entry[1]?.trim();
      if (value !== void 0 && value !== "") entries.push(value);
      continue;
    }
    if (line.includes("}") || /^\s*[A-Za-z]+\s*:/.test(line)) break;
  }
  return entries;
}
function endpoint(scheme, host, port) {
  if (host === void 0 || host === "") return void 0;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return port === void 0 || port === "" ? `${scheme}://${normalizedHost}` : `${scheme}://${normalizedHost}:${port}`;
}
function splitHostPort(value) {
  const trimmed = value.trim();
  const ipv6 = /^\[(.+)\]:(\d+)$/.exec(trimmed);
  if (ipv6 !== null) return [ipv6[1], ipv6[2]];
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return [trimmed, void 0];
  const host = trimmed.slice(0, lastColon);
  const port = trimmed.slice(lastColon + 1);
  return [host === "" ? void 0 : host, /^\d+$/.test(port) ? port : void 0];
}
function parseScutilProxy(text) {
  const on = (key) => readField2(text, key) === "1";
  const candidates = [
    [on("HTTPSEnable"), "http", readField2(text, "HTTPSProxy"), readField2(text, "HTTPSPort")],
    [on("HTTPEnable"), "http", readField2(text, "HTTPProxy"), readField2(text, "HTTPPort")],
    [on("SOCKSEnable"), "socks5", readField2(text, "SOCKSProxy"), readField2(text, "SOCKSPort")]
  ];
  for (const [enabled, scheme, host, port] of candidates) {
    if (!enabled) continue;
    const url = endpoint(scheme, host, port);
    if (url === void 0) continue;
    return { url, noProxy: scutilExceptions(text).join(","), source: "macOS \xB7 scutil --proxy" };
  }
  return void 0;
}
function parseWindowsProxy(text) {
  const enabled = /ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(text);
  if (enabled === null || Number.parseInt(enabled[1] ?? "0", 16) === 0) return void 0;
  const server = /ProxyServer\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim();
  if (server === void 0 || server === "") return void 0;
  let url;
  if (server.includes("=")) {
    const byScheme = /* @__PURE__ */ new Map();
    for (const part of server.split(";")) {
      const [scheme, value] = part.split("=", 2);
      if (scheme !== void 0 && value !== void 0) byScheme.set(scheme.trim().toLowerCase(), value.trim());
    }
    const chosen = byScheme.get("https") ?? byScheme.get("http") ?? [...byScheme.values()][0];
    if (chosen !== void 0) {
      const [host, port] = splitHostPort(chosen);
      url = endpoint("http", host, port);
    }
  } else {
    const [host, port] = splitHostPort(server);
    url = endpoint("http", host, port);
  }
  if (url === void 0) return void 0;
  const bypass = /ProxyOverride\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim() ?? "";
  return {
    url,
    noProxy: bypass.split(";").filter((entry) => entry !== "" && entry !== "<local>").join(","),
    source: "Windows \xB7 Internet Settings"
  };
}
function parseGnomeProxy(mode, host, port, ignoreHosts) {
  const read = (value) => (value ?? "").trim().replace(/^'|'$/g, "");
  if (read(mode) !== "manual") return void 0;
  const url = endpoint("http", read(host), read(port));
  if (url === void 0) return void 0;
  const bypass = read(ignoreHosts).replace(/^\[|\]$/g, "");
  return {
    url,
    noProxy: bypass.split(",").map((entry) => entry.trim().replace(/^'|'$/g, "")).filter((entry) => entry !== "").join(","),
    source: "GNOME \xB7 gsettings"
  };
}
function scutilPacUrl(text) {
  if (readField2(text, "ProxyAutoConfigEnable") !== "1") return void 0;
  const url = readField2(text, "ProxyAutoConfigURLString");
  return url === void 0 || url === "" ? void 0 : url;
}
function windowsPacUrl(text) {
  const url = /AutoConfigURL\s+REG_SZ\s+(.+)/.exec(text)?.[1]?.trim();
  return url === void 0 || url === "" ? void 0 : url;
}
async function detectSystemProxy(env, run = runCommand) {
  try {
    if (env.platform === "darwin") {
      const text = await run("scutil", ["--proxy"]);
      if (text === void 0) return {};
      const proxy2 = parseScutilProxy(text);
      if (proxy2 !== void 0) return { proxy: proxy2 };
      const pacUrl = scutilPacUrl(text);
      return pacUrl === void 0 ? {} : { pacUrl };
    }
    if (env.platform === "win32") {
      const text = await run("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"]);
      if (text === void 0) return {};
      const proxy2 = parseWindowsProxy(text);
      if (proxy2 !== void 0) return { proxy: proxy2 };
      const pacUrl = windowsPacUrl(text);
      return pacUrl === void 0 ? {} : { pacUrl };
    }
    const mode = await run("gsettings", ["get", "org.gnome.system.proxy", "mode"]);
    if (mode === void 0) return {};
    const read = (value) => (value ?? "").trim().replace(/^'|'$/g, "");
    if (read(mode) === "auto") {
      const pacUrl = read(await run("gsettings", ["get", "org.gnome.system.proxy", "autoconfig-url"]));
      return pacUrl === "" ? {} : { pacUrl };
    }
    const [host, port, ignore] = await Promise.all([
      run("gsettings", ["get", "org.gnome.system.proxy.http", "host"]),
      run("gsettings", ["get", "org.gnome.system.proxy.http", "port"]),
      run("gsettings", ["get", "org.gnome.system.proxy", "ignore-hosts"])
    ]);
    const proxy = parseGnomeProxy(mode, host, port, ignore);
    return proxy === void 0 ? {} : { proxy };
  } catch {
    return {};
  }
}
function openerAttempts(file, platform, env = process.env) {
  if (platform === "darwin") {
    return [
      { command: "open", args: ["-t", file], strict: true },
      { command: "open", args: [file], strict: true },
      { command: "open", args: ["-R", file], strict: true }
    ];
  }
  if (platform === "win32") {
    return [
      { command: "explorer", args: [file], strict: false },
      { command: "cmd", args: ["/c", "start", "", file], strict: false }
    ];
  }
  const editor = env.EDITOR?.trim() ?? "";
  return [
    { command: "xdg-open", args: [file], strict: false },
    ...editor === "" ? [] : [{ command: editor, args: [file], strict: false }],
    { command: "sensible-editor", args: [file], strict: false }
  ];
}
function runAttempt(attempt) {
  return new Promise((resolve, reject) => {
    execFile(attempt.command, attempt.args, { timeout: 5e3, windowsHide: true }, (error, _stdout, stderr) => {
      if (error === null) {
        resolve();
        return;
      }
      const code = error.code;
      if (!attempt.strict && code !== "ENOENT") {
        resolve();
        return;
      }
      reject(new Error(code === "ENOENT" ? `${attempt.command} is not on PATH` : stderr.trim() === "" ? error.message : stderr.trim()));
    });
  });
}
async function openInEditor(file, platform, env = process.env) {
  const failures = [];
  for (const attempt of openerAttempts(file, platform, env)) {
    try {
      await runAttempt(attempt);
      return;
    } catch (error) {
      failures.push(`${attempt.command} ${attempt.args.slice(0, -1).join(" ")}: ${error instanceof Error ? error.message : String(error)}`.trim());
    }
  }
  throw new Error(`cannot open ${file}: ${failures.join(" | ")}`);
}

// src/host/service.ts
var ProxyManager = class {
  constructor(env) {
    this.env = env;
    this.store = new StateStore(env);
  }
  store;
  runtimeAdapters = [];
  state;
  queue = Promise.resolve();
  /** Run one operation after the previous one settled, so writes never interleave. */
  serialize(operation) {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => void 0);
    return next;
  }
  async loaded() {
    this.state ??= await this.store.load();
    return this.state;
  }
  /** Built-in adapters first, then user-added and plugin-registered ones. */
  specs(state) {
    const byId = /* @__PURE__ */ new Map();
    for (const spec of builtinAdapters) byId.set(spec.id, spec);
    for (const spec of state.tools) byId.set(spec.id, spec);
    for (const spec of this.runtimeAdapters) byId.set(spec.id, spec);
    return [...byId.values()];
  }
  registerTool(input) {
    const spec = sanitizeToolSpec({ ...input, custom: true });
    const index = this.runtimeAdapters.findIndex((entry) => entry.id === spec.id);
    if (index === -1) this.runtimeAdapters.push(spec);
    else this.runtimeAdapters[index] = spec;
    return () => {
      const at = this.runtimeAdapters.findIndex((entry) => entry.id === spec.id);
      if (at !== -1) this.runtimeAdapters.splice(at, 1);
    };
  }
  async settings() {
    return (await this.loaded()).settings;
  }
  async systemProxy() {
    return await detectSystemProxy(this.env);
  }
  async openConfig(id) {
    const state = await this.loaded();
    const spec = this.specs(state).find((entry) => entry.id === id);
    if (spec === void 0) throw new Error(`unknown tool id: ${id}`);
    const absolute = resolvePathSpec(spec.path, this.env);
    try {
      await stat(absolute);
    } catch {
      throw new Error(`${displayPath(absolute, this.env)} does not exist yet; enable this tool first`);
    }
    await openInEditor(absolute, this.env.platform);
    return { path: absolute, displayPath: displayPath(absolute, this.env) };
  }
  async pinTool(id, pinned) {
    return await this.serialize(async () => {
      const state = await this.loaded();
      if (!this.specs(state).some((spec) => spec.id === id)) throw new Error(`unknown tool id: ${id}`);
      const without = state.pinned.filter((entry) => entry !== id);
      state.pinned = pinned ? [...without, id] : without;
      await this.store.save(state);
      return await this.snapshot();
    });
  }
  async snapshot() {
    const state = await this.loaded();
    const specs = this.specs(state);
    const tools = await Promise.all(specs.map((spec) => inspectTool(spec, this.env)));
    const known = new Set(tools.map((tool) => tool.id));
    return {
      settings: { ...state.settings },
      suggested: suggestedProxy(this.env.env),
      tools,
      enabled: tools.filter((tool) => tool.enabled).map((tool) => tool.id),
      pinned: state.pinned.filter((id) => known.has(id)),
      platform: this.env.platform
    };
  }
  /** Resolve the proxy one call writes, without persisting an override. */
  resolveSettings(request, base) {
    const candidate = request.url?.trim() || base.url.trim() || suggestedProxy(this.env.env);
    if (candidate === "") {
      throw new Error("no proxy URL configured: save a proxy address such as http://127.0.0.1:7890 first");
    }
    return { url: requireProxy(candidate).url, noProxy: request.noProxy === void 0 ? base.noProxy : request.noProxy.trim() };
  }
  async select(request) {
    const state = await this.loaded();
    const specs = this.specs(state);
    const requested = request.tools;
    if (requested === void 0) return specs;
    const known = new Map(specs.map((spec) => [spec.id, spec]));
    const unknown = requested.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new Error(`unknown tool id: ${unknown.join(", ")}`);
    return requested.map((id) => known.get(id));
  }
  toResult(status) {
    return {
      id: status.id,
      name: status.name,
      ok: status.error === void 0,
      ...status.error === void 0 ? {} : { error: status.error },
      status
    };
  }
  async apply(request = {}) {
    return await this.serialize(async () => {
      const specs = await this.select(request);
      const base = await this.settings();
      const settings = this.resolveSettings(request, base);
      const results = await Promise.all(specs.map(async (spec) => this.toResult(await applyTool(spec, settings, this.env))));
      return { snapshot: await this.snapshot(), results };
    });
  }
  async clear(request = {}) {
    return await this.serialize(async () => {
      const specs = await this.select(request);
      const results = await Promise.all(specs.map(async (spec) => this.toResult(await clearTool(spec, this.env))));
      return { snapshot: await this.snapshot(), results };
    });
  }
  async saveSettings(patch) {
    return await this.serialize(async () => {
      const state = await this.loaded();
      const url = patch.url === void 0 ? state.settings.url : patch.url.trim();
      if (url !== "") requireProxy(url);
      const noProxy = patch.noProxy === void 0 ? state.settings.noProxy : patch.noProxy.trim();
      state.settings = { url: url === "" ? "" : requireProxy(url).url, noProxy };
      await this.store.save(state);
      return await this.snapshot();
    });
  }
  async addTool(input) {
    return await this.serialize(async () => {
      const state = await this.loaded();
      const spec = sanitizeToolSpec(input);
      if (builtinAdapters.some((entry) => entry.id === spec.id)) {
        throw new Error(`"${spec.id}" is a built-in adapter id; choose another id`);
      }
      state.tools = [...state.tools.filter((entry) => entry.id !== spec.id), spec];
      await this.store.save(state);
      return await this.snapshot();
    });
  }
  async removeTool(id) {
    return await this.serialize(async () => {
      const state = await this.loaded();
      const remaining = state.tools.filter((entry) => entry.id !== id);
      if (remaining.length === state.tools.length) throw new Error(`"${id}" is not a user-added adapter`);
      state.tools = remaining;
      state.pinned = state.pinned.filter((entry) => entry !== id);
      await this.store.save(state);
      return await this.snapshot();
    });
  }
};

// src/host/core/order.ts
function rankOf(tool, pinned) {
  if (pinned.includes(tool.id)) return 0;
  if (!tool.exists) return 3;
  return tool.enabled ? 1 : 2;
}
function orderTools(tools, pinned) {
  return tools.map((tool, index) => ({ tool, index, rank: rankOf(tool, pinned) })).sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    if (left.rank === 0) {
      const leftPin = pinned.indexOf(left.tool.id);
      const rightPin = pinned.indexOf(right.tool.id);
      if (leftPin !== rightPin) return leftPin - rightPin;
    }
    return left.index - right.index;
  }).map((entry) => entry.tool);
}
function matchesQuery(tool, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return [tool.name, tool.id, tool.category, tool.displayPath, tool.path, tool.url, tool.note].some((value) => value !== void 0 && value.toLowerCase().includes(needle));
}
function pageSlice(items, page, size) {
  const perPage = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (current - 1) * perPage;
  return { items: items.slice(start, start + perPage), page: current, pages, total: items.length };
}

// src/host/index.ts
var CHANNEL = "/dsh-proxy-manager";
var MAX_BODY_BYTES = 1024 * 1024;
var TOOL_NAME = "proxy_manager";
var inject = ["connection", "webServer"];
function payloadRecord(payload) {
  return payload !== null && typeof payload === "object" ? payload : {};
}
function payloadIds(payload) {
  const value = payload.tools ?? payload.ids;
  if (value === void 0 || value === null) return void 0;
  if (!Array.isArray(value)) throw new Error("tools must be an array of adapter ids");
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error("tools must be an array of adapter ids");
    return entry;
  });
}
function payloadString(payload, key) {
  const value = payload[key];
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value;
}
function summarize(action, snapshot, results) {
  const failures = results?.filter((result) => result.error !== void 0) ?? [];
  const enabled = snapshot.tools.filter((tool) => tool.enabled);
  const lines = [
    `${action}: ${enabled.length}/${snapshot.tools.length} tools use a proxy${snapshot.settings.url === "" ? "" : ` (${snapshot.settings.url})`}.`
  ];
  for (const tool of snapshot.tools) {
    const state = tool.error !== void 0 ? `error: ${tool.error}` : tool.enabled ? `on ${tool.url ?? ""}`.trim() : "off";
    lines.push(`- ${tool.name} [${tool.id}]: ${state} \u2014 ${tool.displayPath}`);
  }
  if (failures.length > 0) lines.push(`${failures.length} tool(s) reported a failure; see the list above.`);
  return lines.join("\n");
}
function toolDefinition(manager) {
  return {
    name: TOOL_NAME,
    description: [
      "Read or change the proxy configuration of the developer tools installed on this machine",
      "(git, npm, pnpm, yarn, DeepSeek Harness, Docker, Gradle, Cargo, pip) plus any adapter the user added.",
      'Use action "status" before telling the user what is configured; it returns every tool, its proxy URL and its configuration file.'
    ].join(" "),
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["status", "enable", "disable", "system"],
          description: "status reads every adapter; enable writes the proxy; disable removes it; system reads the operating system proxy."
        },
        tools: {
          type: "array",
          items: { type: "string" },
          description: "Adapter ids to change; omit for every adapter."
        },
        proxy: {
          type: "string",
          description: "Proxy URL for this call only, for example http://127.0.0.1:7890. Defaults to the saved setting."
        }
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          summary: { type: "string" },
          action: { type: "string" }
        },
        required: ["summary", "action"]
      },
      render: (_args, value) => {
        const summary = value.summary;
        return [{ type: "text", text: typeof summary === "string" ? summary : "proxy_manager finished." }];
      }
    },
    async execute(args, exec) {
      const request = payloadRecord(args);
      const action = payloadString(request, "action") ?? "status";
      const tools = payloadIds(request);
      if (exec.signal?.aborted === true) throw new Error("cancelled");
      if (action === "status") {
        const snapshot = await manager.snapshot();
        return { action, summary: summarize("status", snapshot), snapshot };
      }
      if (action === "enable") {
        const url = payloadString(request, "proxy");
        const result = await manager.apply({ tools, ...url === void 0 ? {} : { url } });
        return { action, summary: summarize("enable", result.snapshot, result.results), snapshot: result.snapshot };
      }
      if (action === "system") {
        const detected = await manager.systemProxy();
        const summary = detected.proxy !== void 0 ? `system: ${detected.proxy.url}${detected.proxy.noProxy === "" ? "" : ` (bypass ${detected.proxy.noProxy})`} from ${detected.proxy.source}.` : detected.pacUrl !== void 0 ? `system: this machine uses an automatic configuration script (${detected.pacUrl}); no fixed proxy address can be read from it.` : "system: the operating system configures no manual proxy.";
        return { action, summary, system: detected };
      }
      if (action === "disable") {
        const result = await manager.clear({ tools });
        return { action, summary: summarize("disable", result.snapshot, result.results), snapshot: result.snapshot };
      }
      throw new Error(`unknown action ${JSON.stringify(action)}; use status, enable, disable or system`);
    }
  };
}
async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  response.end(body);
}
function apply(ctx) {
  const manager = new ProxyManager(currentEnv());
  ctx.provide("proxyManager", {
    snapshot: () => manager.snapshot(),
    apply: (request = {}) => manager.apply(request),
    clear: (request = {}) => manager.clear(request),
    saveSettings: (patch) => manager.saveSettings(patch),
    addTool: (input) => manager.addTool(input),
    removeTool: (id) => manager.removeTool(id),
    registerTool: (spec) => manager.registerTool(spec),
    systemProxy: () => manager.systemProxy(),
    openConfig: (id) => manager.openConfig(id),
    pinTool: (id, pinned) => manager.pinTool(id, pinned)
  });
  const handler = async (endpoint2, payload) => {
    const request = payloadRecord(payload);
    try {
      switch (endpoint2) {
        case "snapshot":
          return { ok: true, value: await manager.snapshot() };
        case "apply": {
          const url = payloadString(request, "url");
          const noProxy = payloadString(request, "noProxy");
          const tools = payloadIds(request);
          return {
            ok: true,
            value: await manager.apply({
              ...tools === void 0 ? {} : { tools },
              ...url === void 0 ? {} : { url },
              ...noProxy === void 0 ? {} : { noProxy }
            })
          };
        }
        case "clear": {
          const tools = payloadIds(request);
          return { ok: true, value: await manager.clear({ ...tools === void 0 ? {} : { tools } }) };
        }
        case "saveSettings": {
          const url = payloadString(request, "url");
          const noProxy = payloadString(request, "noProxy");
          return {
            ok: true,
            value: await manager.saveSettings({
              ...url === void 0 ? {} : { url },
              ...noProxy === void 0 ? {} : { noProxy }
            })
          };
        }
        case "addTool":
          return { ok: true, value: await manager.addTool(request.spec) };
        case "systemProxy":
          return { ok: true, value: await manager.systemProxy() };
        case "pin": {
          const id = payloadString(request, "id");
          if (id === void 0) throw new Error("id is required");
          return { ok: true, value: await manager.pinTool(id, request.pinned === true) };
        }
        case "openConfig": {
          const id = payloadString(request, "id");
          if (id === void 0) throw new Error("id is required");
          return { ok: true, value: await manager.openConfig(id) };
        }
        case "removeTool": {
          const id = payloadString(request, "id");
          if (id === void 0) throw new Error("id is required");
          return { ok: true, value: await manager.removeTool(id) };
        }
        default:
          return { ok: false, error: { code: "proxy-manager/unknown-endpoint", message: `unknown endpoint ${endpoint2}`, details: {} } };
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "proxy-manager/failed",
          message: error instanceof Error ? error.message : String(error),
          details: {}
        }
      };
    }
  };
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: CHANNEL,
    handler: async (request, response) => {
      const rejection = ctx.connection.requestRejection(request);
      if (rejection !== void 0) {
        response.writeHead(rejection);
        response.end(rejection === 401 ? "unauthorized" : "forbidden");
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405, { allow: "POST" });
        response.end();
        return;
      }
      const endpoint2 = new URL(request.url ?? "/", "http://127.0.0.1").pathname.slice(CHANNEL.length + 1);
      let payload;
      try {
        payload = JSON.parse(await readBody(request));
      } catch (error) {
        writeJson(response, 400, {
          ok: false,
          error: { code: "proxy-manager/bad-request", message: error instanceof Error ? error.message : "body is not JSON", details: {} }
        });
        return;
      }
      writeJson(response, 200, await handler(endpoint2, payload));
    }
  }), "proxy-manager: http channel");
  ctx.inject(["tools"], (scope) => {
    scope.effect(() => scope.tools.register(toolDefinition(manager)), "proxy-manager: agent tool");
  });
}
export {
  CHANNEL,
  ProxyManager,
  TOOL_NAME,
  apply,
  applyTool,
  builtinAdapters,
  clearTool,
  clearToolConfig,
  currentEnv,
  detectSystemProxy,
  displayPath,
  expandPath,
  inject,
  inspectTool,
  isOnPath,
  matchesQuery,
  openerAttempts,
  orderTools,
  pageSlice,
  parseGnomeProxy,
  parseProxy,
  parseScutilProxy,
  parseWindowsProxy,
  readToolConfig,
  readValue,
  removeValue,
  requireProxy,
  resolvePathSpec,
  writeToolConfig,
  writeValue
};
