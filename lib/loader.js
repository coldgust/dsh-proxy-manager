// dsh-proxy-manager: package entry.
//
// The Host bundle is imported with a cache-busting query on every activation.
// Node caches evaluated ES modules by URL, so importing the plain file name
// again would keep running the code from before a rebuild; a changing query
// makes each activation evaluate the current `host.js`.
export const inject = ['connection', 'webServer']

export async function apply(ctx, config) {
  const module = await import(new URL(`./host.js?v=${Date.now()}`, import.meta.url).href)
  await module.apply(ctx, config)
}
