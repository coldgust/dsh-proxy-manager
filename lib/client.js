// dsh-proxy-manager browser half: one lazy factory in the shared module loader.
window.__ModuleLoader__.load({
  id: "dsh-proxy-manager",
  factory(require) {
    const module = { exports: {} };
    (function (module, exports, require) {
      "use strict";
      var __create = Object.create;
      var __defProp = Object.defineProperty;
      var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
      var __getOwnPropNames = Object.getOwnPropertyNames;
      var __getProtoOf = Object.getPrototypeOf;
      var __hasOwnProp = Object.prototype.hasOwnProperty;
      var __export = (target, all) => {
        for (var name in all)
          __defProp(target, name, { get: all[name], enumerable: true });
      };
      var __copyProps = (to, from, except, desc) => {
        if (from && typeof from === "object" || typeof from === "function") {
          for (let key of __getOwnPropNames(from))
            if (!__hasOwnProp.call(to, key) && key !== except)
              __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
        }
        return to;
      };
      var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
        // If the importer is in node compatibility mode or this is not an ESM
        // file that has been converted to a CommonJS file using a Babel-
        // compatible transform (i.e. "__esModule" has not been set), then set
        // "default" to the CommonJS "module.exports" for node compatibility.
        isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
        mod
      ));
      var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

      // src/client/index.tsx
      var index_exports = {};
      __export(index_exports, {
        apply: () => apply,
        inject: () => inject
      });
      module.exports = __toCommonJS(index_exports);
      var React2 = __toESM(require("react"), 1);

      // src/client/api.ts
      var CHANNEL = "/dsh-proxy-manager";
      function failure(message, code = "proxy-manager/transport") {
        return { ok: false, error: { code, message } };
      }
      function createRequest(doFetch = (input, init) => globalThis.fetch(input, init)) {
        return async (endpoint, payload = {}) => {
          let response;
          try {
            response = await doFetch(`${CHANNEL}/${endpoint}`, {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: JSON.stringify(payload)
            });
          } catch (error) {
            return failure(error instanceof Error ? error.message : String(error));
          }
          if (!response.ok) return failure(`transport failure for ${CHANNEL}/${endpoint}: HTTP ${String(response.status)}`);
          try {
            const value = await response.json();
            if (value === null || typeof value !== "object") return failure("malformed response");
            return value;
          } catch (error) {
            return failure(error instanceof Error ? error.message : "malformed response");
          }
        };
      }

      // src/client/ProxySection.tsx
      var React = __toESM(require("react"), 1);
      var import_react = require("react");

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

      // src/client/ProxySection.css
      var ProxySection_default = "/* Proxy manager page: one settings block, one toolbar, then the adapter list.\n   Every colour and border comes from a theme alias so light and dark both work. */\n\n.dshproxy-root {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  max-width: 760px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshproxy-heading {\n  margin: 0;\n  font-size: 18px;\n  line-height: 26px;\n  font-weight: 600;\n}\n\n.dshproxy-intro {\n  margin: 0;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-card {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 14px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.dshproxy-field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.dshproxy-label {\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-input {\n  width: 100%;\n  box-sizing: border-box;\n  padding: 7px 10px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.dshproxy-input:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));\n  outline-offset: 1px;\n}\n\n.dshproxy-hint {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));\n}\n\n.dshproxy-card-foot {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.dshproxy-suggested {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-toolbar {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n.dshproxy-spacer {\n  flex: 1;\n  min-width: 0;\n}\n\n.dshproxy-summary {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-button {\n  padding: 5px 12px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  cursor: pointer;\n}\n\n.dshproxy-button:hover:not(:disabled) {\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.dshproxy-button:disabled {\n  cursor: default;\n  opacity: 0.55;\n}\n\n.dshproxy-primary {\n  border-color: transparent;\n  background: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-bg-base);\n  font-weight: 600;\n}\n\n.dshproxy-primary:hover:not(:disabled) {\n  background: var(--dsw-alias-brand-primary);\n  filter: brightness(1.06);\n}\n\n.dshproxy-ghost {\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.dshproxy-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n}\n\n.dshproxy-row {\n  display: flex;\n  align-items: flex-start;\n  gap: 12px;\n  padding: 12px 2px;\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n.dshproxy-row-main {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  min-width: 0;\n  flex: 1;\n}\n\n.dshproxy-row-head {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.dshproxy-name {\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 600;\n}\n\n.dshproxy-tag {\n  padding: 0 6px;\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 17px;\n}\n\n.dshproxy-tag-warn {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.dshproxy-status {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  align-self: flex-start;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));\n  font: inherit;\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 12px;\n  line-height: 18px;\n  text-align: left;\n  word-break: break-all;\n}\n\n.dshproxy-status[data-on='true'] {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.dshproxy-dot {\n  flex: none;\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  background: currentColor;\n}\n\n.dshproxy-path-row {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 6px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-path {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  color: var(--dsw-alias-label-secondary);\n  word-break: break-all;\n}\n\n.dshproxy-note {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));\n}\n\n.dshproxy-error {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.dshproxy-alert {\n  margin: 0;\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.dshproxy-row-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n}\n\n.dshproxy-switch {\n  position: relative;\n  flex: none;\n  width: 38px;\n  height: 22px;\n  padding: 0;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 11px;\n  background: var(--dsw-alias-bg-layer-2);\n  cursor: pointer;\n}\n\n.dshproxy-switch[data-on='true'] {\n  border-color: transparent;\n  background: var(--dsw-alias-state-success-primary);\n}\n\n.dshproxy-switch:disabled {\n  cursor: default;\n  opacity: 0.55;\n}\n\n.dshproxy-switch:focus-visible {\n  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));\n  outline-offset: 2px;\n}\n\n.dshproxy-thumb {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: var(--dsw-alias-bg-base);\n  transition: transform 120ms ease;\n}\n\n.dshproxy-switch[data-on='true'] .dshproxy-thumb {\n  transform: translateX(16px);\n}\n\n.dshproxy-add-block {\n  border-top: 0.5px solid var(--dsw-alias-border-l2);\n  padding-top: 12px;\n}\n\n.dshproxy-add-summary {\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n.dshproxy-add-form {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n  gap: 10px;\n  margin-top: 10px;\n}\n\n.dshproxy-add-actions {\n  grid-column: 1 / -1;\n  display: flex;\n  gap: 8px;\n}\n\n.dshproxy-select {\n  width: 100%;\n  box-sizing: border-box;\n  padding: 7px 10px;\n  border: 0.5px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n}\n\n.dshproxy-footer {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));\n}\n\n.dshproxy-loading {\n  margin: 0;\n  font-size: 13px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshproxy-filters {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.dshproxy-filters > input {\n  flex: 1;\n  min-width: 0;\n}\n\n.dshproxy-pager {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 10px;\n  padding-top: 4px;\n}\n";

      // src/client/classes.ts
      var cls = {
        root: "dshproxy-root",
        heading: "dshproxy-heading",
        intro: "dshproxy-intro",
        card: "dshproxy-card",
        field: "dshproxy-field",
        label: "dshproxy-label",
        input: "dshproxy-input",
        hint: "dshproxy-hint",
        cardFoot: "dshproxy-card-foot",
        suggested: "dshproxy-suggested",
        toolbar: "dshproxy-toolbar",
        spacer: "dshproxy-spacer",
        summary: "dshproxy-summary",
        button: "dshproxy-button",
        primary: "dshproxy-primary",
        ghost: "dshproxy-ghost",
        list: "dshproxy-list",
        row: "dshproxy-row",
        rowMain: "dshproxy-row-main",
        rowHead: "dshproxy-row-head",
        name: "dshproxy-name",
        tag: "dshproxy-tag",
        tagWarn: "dshproxy-tag-warn",
        status: "dshproxy-status",
        dot: "dshproxy-dot",
        pathRow: "dshproxy-path-row",
        path: "dshproxy-path",
        note: "dshproxy-note",
        error: "dshproxy-error",
        alert: "dshproxy-alert",
        rowActions: "dshproxy-row-actions",
        switch: "dshproxy-switch",
        thumb: "dshproxy-thumb",
        addBlock: "dshproxy-add-block",
        addSummary: "dshproxy-add-summary",
        addForm: "dshproxy-add-form",
        addActions: "dshproxy-add-actions",
        select: "dshproxy-select",
        footer: "dshproxy-footer",
        filters: "dshproxy-filters",
        pager: "dshproxy-pager",
        loading: "dshproxy-loading"
      };

      // src/client/ProxySection.tsx
      var EMPTY_DRAFT = { name: "", kind: "props", path: "", section: "", key: "", part: "url" };
      var PAGE_SIZE = 10;
      var KIND_OPTIONS = ["ini", "props", "yaml", "toml", "json", "env", "shell", "xml"];
      var PART_KEYS = ["url", "noProxy", "host", "port", "scheme"];
      function ProxySection({ t, request }) {
        const [snapshot, setSnapshot] = (0, import_react.useState)();
        const [error, setError] = (0, import_react.useState)();
        const [busy, setBusy] = (0, import_react.useState)();
        const [url, setUrl] = (0, import_react.useState)("");
        const [noProxy, setNoProxy] = (0, import_react.useState)("");
        const [copied, setCopied] = (0, import_react.useState)();
        const [draft, setDraft] = (0, import_react.useState)(EMPTY_DRAFT);
        const [addError, setAddError] = (0, import_react.useState)();
        const [systemNotice, setSystemNotice] = (0, import_react.useState)();
        const [query, setQuery] = (0, import_react.useState)("");
        const [page, setPage] = (0, import_react.useState)(1);
        const seeded = (0, import_react.useRef)(false);
        const urlId = (0, import_react.useId)();
        const noProxyId = (0, import_react.useId)();
        const adopt = (0, import_react.useCallback)((next, reseed = false) => {
          setSnapshot(next);
          if (!seeded.current || reseed) {
            setUrl(next.settings.url !== "" ? next.settings.url : next.suggested);
            setNoProxy(next.settings.noProxy);
            seeded.current = true;
          }
        }, []);
        const run = (0, import_react.useCallback)(async (endpoint, payload) => {
          const outcome = await request(endpoint, payload);
          if (!outcome.ok) {
            setError(outcome.error.message);
            return void 0;
          }
          const value = outcome.value;
          adopt("results" in value ? value.snapshot : value);
          return value;
        }, [adopt, request]);
        (0, import_react.useEffect)(() => {
          setPage(1);
        }, [query]);
        (0, import_react.useEffect)(() => {
          void (async () => {
            const outcome = await request("snapshot");
            if (outcome.ok) adopt(outcome.value);
            else setError(outcome.error.message);
          })();
        }, [adopt, request]);
        (0, import_react.useEffect)(() => {
          if (copied === void 0) return void 0;
          const timer = setTimeout(() => {
            setCopied(void 0);
          }, 1600);
          return () => {
            clearTimeout(timer);
          };
        }, [copied]);
        const withBusy = async (key, work) => {
          if (busy !== void 0) return;
          setBusy(key);
          setError(void 0);
          try {
            await work();
          } finally {
            setBusy(void 0);
          }
        };
        const saveDrafts = async () => {
          if (snapshot !== void 0 && url.trim() === snapshot.settings.url && noProxy.trim() === snapshot.settings.noProxy) {
            return true;
          }
          const outcome = await request("saveSettings", { url: url.trim(), noProxy: noProxy.trim() });
          if (!outcome.ok) {
            setError(outcome.error.message);
            return false;
          }
          adopt(outcome.value);
          return true;
        };
        const change = (ids, action) => withBusy(action, async () => {
          if (action === "apply" && !await saveDrafts()) return;
          const payload = ids === void 0 ? {} : { tools: ids };
          if (action === "apply") {
            payload.url = url.trim();
            payload.noProxy = noProxy.trim();
          }
          const value = await run(action, payload);
          if (value !== void 0 && "results" in value) {
            const failed = value.results.filter((result) => !result.ok);
            if (failed.length > 0) {
              setError(failed.map((result) => `${result.name}: ${result.error ?? ""}`).join("\n"));
            }
          }
        });
        const useSystemProxy = () => withBusy("system", async () => {
          setSystemNotice(void 0);
          const outcome = await request("systemProxy");
          if (!outcome.ok) {
            setError(outcome.error.message);
            return;
          }
          const detected = outcome.value.proxy;
          if (detected === void 0) {
            setSystemNotice(void 0);
            setError(outcome.value.pacUrl === void 0 ? t("systemProxyMissing") : `${t("systemProxyPac")} ${outcome.value.pacUrl}`);
            return;
          }
          setUrl(detected.url);
          setNoProxy(detected.noProxy);
          setSystemNotice(`${t("systemProxyFrom")} ${detected.source}`);
          const saved = await request("saveSettings", { url: detected.url, noProxy: detected.noProxy });
          if (!saved.ok) {
            setError(saved.error.message);
            return;
          }
          adopt(saved.value);
        });
        const togglePin = (tool, pinned) => withBusy(`pin-${tool.id}`, async () => {
          await run("pin", { id: tool.id, pinned });
        });
        const openConfig = (tool) => withBusy(`open-${tool.id}`, async () => {
          const outcome = await request("openConfig", { id: tool.id });
          if (!outcome.ok) setError(`${tool.name}: ${outcome.error.message}`);
        });
        const copyPath = async (tool) => {
          try {
            await navigator.clipboard.writeText(tool.path);
            setCopied(tool.id);
          } catch {
            setCopied(void 0);
          }
        };
        const addAdapter = () => withBusy("add", async () => {
          setAddError(void 0);
          const spec = {
            id: draft.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""),
            name: draft.name.trim(),
            kind: draft.kind,
            path: draft.path.trim(),
            ...draft.section.trim() === "" ? {} : { section: draft.section.trim() },
            fields: [{ key: draft.key.trim(), part: draft.part }]
          };
          if (spec.id === "" || spec.name === "" || spec.path === "" || draft.key.trim() === "") {
            setAddError(t("invalid"));
            return;
          }
          const outcome = await request("addTool", { spec });
          if (!outcome.ok) {
            setAddError(outcome.error.message);
            return;
          }
          adopt(outcome.value);
          setDraft(EMPTY_DRAFT);
        });
        const removeAdapter = (tool) => withBusy(`remove-${tool.id}`, async () => {
          await run("removeTool", { id: tool.id });
        });
        const toggle = (tool) => {
          void change([tool.id], tool.enabled ? "clear" : "apply");
        };
        const pinnedIds = snapshot?.pinned ?? [];
        const ordered = snapshot === void 0 ? [] : orderTools(snapshot.tools, pinnedIds);
        const filtered = ordered.filter((tool) => matchesQuery(tool, query));
        const view = pageSlice(filtered, page, PAGE_SIZE);
        const enabledCount = snapshot?.enabled.length ?? 0;
        const total = snapshot?.tools.length ?? 0;
        const summary = t("summary").replace("{on}", String(enabledCount)).replace("{total}", String(total));
        const dirty = snapshot !== void 0 && (url.trim() !== snapshot.settings.url || noProxy.trim() !== snapshot.settings.noProxy);
        return /* @__PURE__ */ React.createElement("div", { className: cls.root }, /* @__PURE__ */ React.createElement("style", null, ProxySection_default), /* @__PURE__ */ React.createElement("h2", { className: cls.heading }, t("title")), /* @__PURE__ */ React.createElement("p", { className: cls.intro }, t("intro")), /* @__PURE__ */ React.createElement("section", { className: cls.card }, /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: urlId }, t("proxyUrl")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: urlId,
            className: cls.input,
            value: url,
            spellCheck: false,
            autoComplete: "off",
            placeholder: t("proxyUrlPlaceholder"),
            onChange: (event) => {
              setUrl(event.target.value);
            }
          }
        ), snapshot !== void 0 && snapshot.suggested !== "" && url.trim() === "" ? /* @__PURE__ */ React.createElement("span", { className: cls.suggested }, t("suggested"), " ", /* @__PURE__ */ React.createElement("code", null, snapshot.suggested), /* @__PURE__ */ React.createElement("button", { type: "button", className: cls.ghost, onClick: () => {
          setUrl(snapshot.suggested);
        } }, t("useSuggested"))) : null, /* @__PURE__ */ React.createElement("p", { className: cls.hint }, t("proxyUrlHint")), /* @__PURE__ */ React.createElement("span", { className: cls.suggested }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: busy !== void 0,
            onClick: () => {
              void useSystemProxy();
            }
          },
          t("useSystemProxy")
        ), systemNotice !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: cls.hint }, systemNotice) : null)), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: noProxyId }, t("noProxy")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: noProxyId,
            className: cls.input,
            value: noProxy,
            spellCheck: false,
            autoComplete: "off",
            placeholder: t("noProxyPlaceholder"),
            onChange: (event) => {
              setNoProxy(event.target.value);
            }
          }
        ), /* @__PURE__ */ React.createElement("p", { className: cls.hint }, t("noProxyHint"))), /* @__PURE__ */ React.createElement("div", { className: cls.cardFoot }, /* @__PURE__ */ React.createElement("span", { className: cls.hint }, dirty ? t("proxyUrlHint") : t("saved")), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: `${cls.button} ${cls.primary}`,
            disabled: busy !== void 0 || !dirty,
            onClick: () => {
              void withBusy("save", async () => {
                await saveDrafts();
              });
            }
          },
          t("save")
        ))), /* @__PURE__ */ React.createElement("div", { className: cls.filters }, /* @__PURE__ */ React.createElement(
          "input",
          {
            className: cls.input,
            value: query,
            spellCheck: false,
            autoComplete: "off",
            placeholder: t("searchPlaceholder"),
            "aria-label": t("search"),
            onChange: (event) => {
              setQuery(event.target.value);
            }
          }
        ), query !== "" ? /* @__PURE__ */ React.createElement("button", { type: "button", className: cls.ghost, onClick: () => {
          setQuery("");
        } }, t("cancel")) : null), /* @__PURE__ */ React.createElement("div", { className: cls.toolbar }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: busy !== void 0 || total === 0,
            onClick: () => {
              void change(void 0, "apply");
            }
          },
          t("applyAll")
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: busy !== void 0 || total === 0,
            onClick: () => {
              void change(void 0, "clear");
            }
          },
          t("clearAll")
        ), /* @__PURE__ */ React.createElement("span", { className: cls.spacer }), /* @__PURE__ */ React.createElement("span", { className: cls.summary }, summary), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: busy !== void 0,
            "aria-label": t("refresh"),
            title: t("refresh"),
            onClick: () => {
              void withBusy("refresh", async () => {
                await run("snapshot");
              });
            }
          },
          "\u21BB"
        )), error !== void 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.alert, role: "alert" }, error) : null, snapshot === void 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.loading }, t("loading")) : ordered.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.loading }, t("empty")) : view.items.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.loading }, t("noMatch")) : /* @__PURE__ */ React.createElement("ul", { className: cls.list }, view.items.map((tool) => /* @__PURE__ */ React.createElement("li", { key: tool.id, className: cls.row }, /* @__PURE__ */ React.createElement("div", { className: cls.rowMain }, /* @__PURE__ */ React.createElement("div", { className: cls.rowHead }, /* @__PURE__ */ React.createElement("span", { className: cls.name }, tool.name), pinnedIds.includes(tool.id) ? /* @__PURE__ */ React.createElement("span", { className: cls.tag }, t("pinned")) : null, tool.custom === true ? /* @__PURE__ */ React.createElement("span", { className: cls.tag }, t("custom")) : null, tool.installed === false ? /* @__PURE__ */ React.createElement("span", { className: `${cls.tag} ${cls.tagWarn}` }, t("notInstalled")) : null, tool.exists === false ? /* @__PURE__ */ React.createElement("span", { className: cls.tag }, t("missingFile")) : null), /* @__PURE__ */ React.createElement("span", { className: cls.status, "data-on": tool.enabled }, /* @__PURE__ */ React.createElement("span", { className: cls.dot, "aria-hidden": "true" }), tool.enabled ? tool.url ?? t("on") : t("off")), /* @__PURE__ */ React.createElement("span", { className: cls.pathRow }, /* @__PURE__ */ React.createElement("span", null, t("configPath")), /* @__PURE__ */ React.createElement("code", { className: cls.path }, tool.displayPath), /* @__PURE__ */ React.createElement("button", { type: "button", className: cls.ghost, onClick: () => {
          void copyPath(tool);
        } }, copied === tool.id ? t("copied") : t("copy")), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.ghost,
            title: tool.exists === false ? t("missingFile") : t("openHint"),
            disabled: busy !== void 0 || tool.exists === false,
            onClick: () => {
              void openConfig(tool);
            }
          },
          t("open")
        )), tool.note !== void 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.note }, t("note"), ": ", tool.note) : null, tool.error !== void 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.error }, tool.error) : null), /* @__PURE__ */ React.createElement("div", { className: cls.rowActions }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.ghost,
            "aria-pressed": pinnedIds.includes(tool.id),
            title: pinnedIds.includes(tool.id) ? t("unpin") : t("pin"),
            disabled: busy !== void 0,
            onClick: () => {
              void togglePin(tool, !pinnedIds.includes(tool.id));
            }
          },
          pinnedIds.includes(tool.id) ? "\u2605" : "\u2606"
        ), tool.custom === true ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.ghost,
            disabled: busy !== void 0,
            onClick: () => {
              void removeAdapter(tool);
            }
          },
          t("remove")
        ) : null, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.switch,
            role: "switch",
            "aria-checked": tool.enabled,
            "aria-label": `${tool.name}: ${tool.enabled ? t("on") : t("off")}`,
            "data-on": tool.enabled,
            disabled: busy !== void 0 || tool.error !== void 0,
            onClick: () => {
              toggle(tool);
            }
          },
          /* @__PURE__ */ React.createElement("span", { className: cls.thumb, "aria-hidden": "true" })
        ))))), filtered.length > PAGE_SIZE ? /* @__PURE__ */ React.createElement("div", { className: cls.pager }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: view.page <= 1,
            "aria-label": t("previous"),
            onClick: () => {
              setPage(view.page - 1);
            }
          },
          "\u2039"
        ), /* @__PURE__ */ React.createElement("span", { className: cls.summary }, t("page").replace("{page}", String(view.page)).replace("{pages}", String(view.pages)), " \xB7 ", t("pageTotal").replace("{total}", String(view.total))), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: view.page >= view.pages,
            "aria-label": t("next"),
            onClick: () => {
              setPage(view.page + 1);
            }
          },
          "\u203A"
        )) : null, /* @__PURE__ */ React.createElement("details", { className: cls.addBlock }, /* @__PURE__ */ React.createElement("summary", { className: cls.addSummary }, t("addTool")), /* @__PURE__ */ React.createElement("p", { className: cls.hint }, t("addToolIntro")), /* @__PURE__ */ React.createElement("div", { className: cls.addForm }, /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-name" }, t("fieldName")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "pm-draft-name",
            className: cls.input,
            value: draft.name,
            onChange: (event) => {
              setDraft({ ...draft, name: event.target.value });
            },
            placeholder: "Maven"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-kind" }, t("fieldKind")), /* @__PURE__ */ React.createElement(
          "select",
          {
            id: "pm-draft-kind",
            className: cls.select,
            value: draft.kind,
            onChange: (event) => {
              setDraft({ ...draft, kind: event.target.value });
            }
          },
          KIND_OPTIONS.map((kind) => /* @__PURE__ */ React.createElement("option", { key: kind, value: kind }, kind))
        )), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-path" }, t("fieldPath")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "pm-draft-path",
            className: cls.input,
            value: draft.path,
            spellCheck: false,
            onChange: (event) => {
              setDraft({ ...draft, path: event.target.value });
            },
            placeholder: "~/.m2/settings.xml"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-section" }, t("fieldSection")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "pm-draft-section",
            className: cls.input,
            value: draft.section,
            spellCheck: false,
            onChange: (event) => {
              setDraft({ ...draft, section: event.target.value });
            },
            placeholder: "http"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-key" }, t("fieldKey")), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "pm-draft-key",
            className: cls.input,
            value: draft.key,
            spellCheck: false,
            onChange: (event) => {
              setDraft({ ...draft, key: event.target.value });
            },
            placeholder: "proxy"
          }
        )), /* @__PURE__ */ React.createElement("div", { className: cls.field }, /* @__PURE__ */ React.createElement("label", { className: cls.label, htmlFor: "pm-draft-part" }, t("fieldPart")), /* @__PURE__ */ React.createElement(
          "select",
          {
            id: "pm-draft-part",
            className: cls.select,
            value: draft.part,
            onChange: (event) => {
              setDraft({ ...draft, part: event.target.value });
            }
          },
          PART_KEYS.map((part) => /* @__PURE__ */ React.createElement("option", { key: part, value: part }, t(`part${part.charAt(0).toUpperCase()}${part.slice(1)}`)))
        )), /* @__PURE__ */ React.createElement("div", { className: cls.addActions }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            disabled: busy !== void 0,
            onClick: () => {
              void addAdapter();
            }
          },
          t("add")
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: cls.button,
            onClick: () => {
              setDraft(EMPTY_DRAFT);
              setAddError(void 0);
            }
          },
          t("cancel")
        ), addError !== void 0 ? /* @__PURE__ */ React.createElement("p", { className: cls.error, role: "alert" }, addError) : null))), /* @__PURE__ */ React.createElement("p", { className: cls.footer }, t("restartHint")));
      }

      // src/client/locales.ts
      var en = {
        nav: "Proxy",
        title: "Proxy settings",
        intro: "Write one proxy address into the configuration files of the developer tools on this machine, or remove it again.",
        proxyUrl: "Proxy address",
        proxyUrlPlaceholder: "http://127.0.0.1:7890",
        proxyUrlHint: "Applied to every tool you enable. Change it here, save, then enable the tools.",
        noProxy: "Bypass hosts",
        noProxyPlaceholder: "localhost,127.0.0.1,::1",
        noProxyHint: "Comma-separated hosts that connect directly.",
        save: "Save",
        saved: "Saved",
        suggested: "Detected in this process:",
        useSuggested: "Use it",
        applyAll: "Enable for all",
        clearAll: "Clear for all",
        refresh: "Re-read configuration files",
        loading: "Reading configuration files\u2026",
        summary: "{on} of {total} tools use a proxy",
        configPath: "Configuration file",
        copy: "Copy path",
        copied: "Copied",
        on: "Enabled",
        off: "Not set",
        missingFile: "file not created yet",
        notInstalled: "not on PATH",
        custom: "added by you",
        note: "Note",
        remove: "Remove adapter",
        addTool: "Add software",
        addToolIntro: "Describe a tool the list does not cover yet. Nothing becomes a built-in; this adapter lives in this plugin\u2019s own state file.",
        fieldName: "Display name",
        fieldKind: "File format",
        fieldPath: "Configuration file",
        fieldSection: "Section (optional)",
        fieldKey: "Proxy key",
        fieldPart: "Holds",
        add: "Add",
        cancel: "Cancel",
        invalid: "Check the fields and try again.",
        partUrl: "the whole URL",
        partHost: "the host",
        partPort: "the port",
        partScheme: "the scheme",
        partNoProxy: "bypass hosts",
        restartHint: "A running program keeps the proxy it read at start-up: restart the tool (or open a new terminal) after a change. DeepSeek Harness itself applies the change on its next start.",
        useSystemProxy: "Use system proxy",
        systemProxyFrom: "Using the system proxy:",
        systemProxyMissing: "No system proxy is configured on this machine.",
        systemProxyPac: "This machine uses an automatic proxy configuration script; no fixed address can be read from it:",
        open: "Open",
        search: "Search",
        searchPlaceholder: "Search name, path or proxy",
        noMatch: "Nothing matches this search.",
        pin: "Pin to top",
        unpin: "Unpin",
        pinned: "Pinned",
        page: "Page {page} / {pages}",
        pageTotal: "{total} entries",
        previous: "Previous page",
        next: "Next page",
        openHint: "Open this configuration file in the default app",
        empty: "No adapters yet.",
        retry: "Retry"
      };
      var zh = {
        nav: "\u4EE3\u7406",
        title: "\u4EE3\u7406\u8BBE\u7F6E",
        intro: "\u628A\u540C\u4E00\u4E2A\u4EE3\u7406\u5730\u5740\u5199\u5165\u8FD9\u53F0\u673A\u5668\u4E0A\u5404\u4E2A\u5F00\u53D1\u5DE5\u5177\u7684\u914D\u7F6E\u6587\u4EF6\uFF0C\u6216\u8005\u518D\u6B21\u79FB\u9664\u3002",
        proxyUrl: "\u4EE3\u7406\u5730\u5740",
        proxyUrlPlaceholder: "http://127.0.0.1:7890",
        proxyUrlHint: "\u542F\u7528\u5DE5\u5177\u65F6\u4F1A\u5199\u5165\u8FD9\u4E2A\u5730\u5740\u3002\u5148\u5728\u8FD9\u91CC\u4FEE\u6539\u5E76\u4FDD\u5B58\uFF0C\u518D\u542F\u7528\u9700\u8981\u4EE3\u7406\u7684\u5DE5\u5177\u3002",
        noProxy: "\u76F4\u8FDE\u5730\u5740",
        noProxyPlaceholder: "localhost,127.0.0.1,::1",
        noProxyHint: "\u7528\u9017\u53F7\u5206\u9694\uFF0C\u8FD9\u4E9B\u5730\u5740\u4E0D\u7ECF\u8FC7\u4EE3\u7406\u3002",
        save: "\u4FDD\u5B58",
        saved: "\u5DF2\u4FDD\u5B58",
        suggested: "\u5F53\u524D\u8FDB\u7A0B\u68C0\u6D4B\u5230\uFF1A",
        useSuggested: "\u586B\u5165",
        applyAll: "\u5168\u90E8\u542F\u7528",
        clearAll: "\u5168\u90E8\u53D6\u6D88",
        refresh: "\u91CD\u65B0\u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6",
        loading: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u6587\u4EF6\u2026",
        summary: "{total} \u4E2A\u5DE5\u5177\u4E2D\u6709 {on} \u4E2A\u5DF2\u4F7F\u7528\u4EE3\u7406",
        configPath: "\u914D\u7F6E\u6587\u4EF6",
        copy: "\u590D\u5236\u8DEF\u5F84",
        copied: "\u5DF2\u590D\u5236",
        on: "\u5DF2\u542F\u7528",
        off: "\u672A\u8BBE\u7F6E",
        missingFile: "\u6587\u4EF6\u5C1A\u672A\u521B\u5EFA",
        notInstalled: "\u672A\u5728 PATH \u4E2D",
        custom: "\u81EA\u5B9A\u4E49",
        note: "\u8BF4\u660E",
        remove: "\u5220\u9664\u9002\u914D\u5668",
        addTool: "\u6DFB\u52A0\u8F6F\u4EF6",
        addToolIntro: "\u4E3A\u5217\u8868\u5C1A\u672A\u8986\u76D6\u7684\u5DE5\u5177\u6DFB\u52A0\u4E00\u4E2A\u9002\u914D\u5668\u3002\u5B83\u4E0D\u4F1A\u53D8\u6210\u5185\u7F6E\u9879\uFF0C\u53EA\u4FDD\u5B58\u5728\u672C\u63D2\u4EF6\u81EA\u5DF1\u7684\u72B6\u6001\u6587\u4EF6\u91CC\u3002",
        fieldName: "\u663E\u793A\u540D\u79F0",
        fieldKind: "\u6587\u4EF6\u683C\u5F0F",
        fieldPath: "\u914D\u7F6E\u6587\u4EF6",
        fieldSection: "\u8282 / \u8868\u540D\uFF08\u53EF\u9009\uFF09",
        fieldKey: "\u4EE3\u7406\u952E\u540D",
        fieldPart: "\u5B58\u50A8\u5185\u5BB9",
        add: "\u6DFB\u52A0",
        cancel: "\u53D6\u6D88",
        invalid: "\u8BF7\u68C0\u67E5\u586B\u5199\u7684\u5B57\u6BB5\u540E\u91CD\u8BD5\u3002",
        partUrl: "\u5B8C\u6574\u5730\u5740",
        partHost: "\u4E3B\u673A",
        partPort: "\u7AEF\u53E3",
        partScheme: "\u534F\u8BAE",
        partNoProxy: "\u76F4\u8FDE\u5730\u5740",
        restartHint: "\u6B63\u5728\u8FD0\u884C\u7684\u7A0B\u5E8F\u53EA\u4F1A\u5728\u542F\u52A8\u65F6\u8BFB\u53D6\u914D\u7F6E\uFF1A\u4FEE\u6539\u540E\u8BF7\u91CD\u542F\u8BE5\u5DE5\u5177\u6216\u6253\u5F00\u65B0\u7684\u7EC8\u7AEF\u3002DeepSeek Harness \u672C\u8EAB\u4F1A\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u751F\u6548\u3002",
        useSystemProxy: "\u4F7F\u7528\u7CFB\u7EDF\u4EE3\u7406",
        systemProxyFrom: "\u5DF2\u4F7F\u7528\u7CFB\u7EDF\u4EE3\u7406\uFF1A",
        systemProxyMissing: "\u672A\u68C0\u6D4B\u5230\u7CFB\u7EDF\u4EE3\u7406\u8BBE\u7F6E\u3002",
        systemProxyPac: "\u7CFB\u7EDF\u4F7F\u7528\u7684\u662F\u81EA\u52A8\u4EE3\u7406\u914D\u7F6E\u811A\u672C\uFF08PAC\uFF09\uFF0C\u65E0\u6CD5\u8BFB\u51FA\u56FA\u5B9A\u5730\u5740\uFF1A",
        open: "\u6253\u5F00",
        search: "\u641C\u7D22",
        searchPlaceholder: "\u6309\u540D\u79F0\u3001\u8DEF\u5F84\u6216\u4EE3\u7406\u641C\u7D22",
        noMatch: "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE\u3002",
        pin: "\u7F6E\u9876",
        unpin: "\u53D6\u6D88\u7F6E\u9876",
        pinned: "\u5DF2\u7F6E\u9876",
        page: "\u7B2C {page} / {pages} \u9875",
        pageTotal: "\u5171 {total} \u9879",
        previous: "\u4E0A\u4E00\u9875",
        next: "\u4E0B\u4E00\u9875",
        openHint: "\u7528\u7CFB\u7EDF\u9ED8\u8BA4\u7A0B\u5E8F\u6253\u5F00\u8BE5\u914D\u7F6E\u6587\u4EF6",
        empty: "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u9002\u914D\u5668\u3002",
        retry: "\u91CD\u8BD5"
      };

      // src/client/index.tsx
      var NS = "dsh-proxy-manager";
      var SECTION_ID = "proxy-manager";
      var inject = ["slots", "locale"];
      function NavIcon({ size = 16 }) {
        return /* @__PURE__ */ React2.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ React2.createElement("circle", { cx: "8", cy: "8", r: "5.75", stroke: "currentColor", strokeWidth: "1.4" }), /* @__PURE__ */ React2.createElement("path", { d: "M8 2.25v5.5l3.4 2.1", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }));
      }
      function apply(ctx) {
        const t = ctx.locale.bind(NS);
        const request = createRequest();
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), "proxy-manager: dictionaries");
        ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: SECTION_ID,
          order: 24,
          label: () => t("nav"),
          locale: NS,
          inject: () => ({ request })
        }, ProxySection));
        ctx.slots.inject("settings.section.icon", () => ctx.slots.register({
          name: "settings.section.icon",
          id: SECTION_ID,
          order: 24
        }, NavIcon));
      }

    })(module, module.exports, require);
    return module.exports;
  },
});
