/**
 * The `/embed?…` URL contract shared by the iframe (web) and the `<webview>`
 * (desktop) — both load the same surface, so the param shape is one source of
 * truth. Pure + unit-tested.
 */
export interface EmbedSrcParams {
  app: string;
  entity?: string;
  mode: string;
  threadId?: string;
  accountId: string;
}

export function buildEmbedSrc(params: EmbedSrcParams): string {
  const query = new URLSearchParams({ mode: params.mode, account: params.accountId });
  if (params.app) query.set("app", params.app);
  if (params.entity) query.set("entity", params.entity);
  if (params.threadId) query.set("thread", params.threadId);
  return `/embed?${query.toString()}`;
}
