import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MigrateRequest {
  sourceShop: { url: string; token: string };
  targetShop: { url: string; token: string };
  dataType: string;
  itemIds: string[];
  conflictMode: "overwrite" | "skip" | "ask";
  dryRun: boolean;
  metafieldsOwnerType?: string;
}

type Result = { id: string; title: string; status: "created" | "updated" | "skipped" | "error" | "conflict"; message?: string; sourceData?: any; targetData?: any };

function clean(shopUrl: string) {
  return shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function shopGet(url: string, token: string, ep: string) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`GET ${ep} (${res.status}): ${t}`); }
  return res.json();
}

async function shopPost(url: string, token: string, ep: string, body: unknown) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`POST ${ep} (${res.status}): ${JSON.stringify(d)}`);
  return d;
}

async function shopPut(url: string, token: string, ep: string, body: unknown) {
  const res = await fetch(`https://${clean(url)}${ep}`, {
    method: "PUT", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(`PUT ${ep} (${res.status}): ${JSON.stringify(d)}`);
  return d;
}

async function gql(url: string, token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${clean(url)}/admin/api/2024-01/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const d = await res.json();
  if (d.errors) throw new Error(`GraphQL: ${JSON.stringify(d.errors)}`);
  return d;
}

const V = "2024-01";
const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanProduct(p: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, ...rest } = p;
  if (rest.variants) rest.variants = rest.variants.map((v: any) => {
    const { id: vid, product_id, admin_graphql_api_id: vg, created_at: vc, updated_at: vu, inventory_item_id, image_id, ...vr } = v;
    return vr;
  });
  if (rest.images) rest.images = rest.images.map((i: any) => ({ src: i.src, alt: i.alt, position: i.position }));
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}
function cleanCollection(c: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, type, ...rest } = c;
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}
function cleanPage(p: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, shop_id, ...rest } = p;
  return rest;
}
function cleanArticle(a: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, blog_id, user_id, ...rest } = a;
  if (rest.image) rest.image = { src: rest.image.src, alt: rest.image.alt };
  return rest;
}

// --- Metaobjects ---
async function migrateMetaobjects(src: any, tgt: any, defIds: string[], cm: string, dry: boolean): Promise<Result[]> {
  const results: Result[] = [];
  const dq = `{ metaobjectDefinitions(first: 50) { edges { node { id name type fieldDefinitions { key name type { name } required description validations { name value } } } } } }`;
  const srcDefs = (await gql(src.url, src.token, dq))?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];
  const tgtDefs = (await gql(tgt.url, tgt.token, dq))?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];
  const selected = srcDefs.filter((d: any) => defIds.includes(d.id));

  for (const def of selected) {
    const existing = tgtDefs.find((t: any) => t.type === def.type);
    if (existing) {
      if (cm === "skip") { results.push({ id: def.id, title: `Def: ${def.name}`, status: "skipped", message: "Bereits vorhanden" }); }
      else if (cm === "ask") { results.push({ id: def.id, title: `Def: ${def.name}`, status: "conflict", message: "Bereits vorhanden", sourceData: def, targetData: existing }); }
      else if (!dry) {
        // overwrite — skip definition update for metaobjects for now
        results.push({ id: def.id, title: `Def: ${def.name}`, status: "skipped", message: "Bereits vorhanden" });
      } else {
        results.push({ id: def.id, title: `Def: ${def.name}`, status: "updated", message: "Testlauf" });
      }
    } else {
      if (dry) { results.push({ id: def.id, title: `Def: ${def.name}`, status: "created", message: "Testlauf" }); }
      else {
        try {
          const m = `mutation($d: MetaobjectDefinitionCreateInput!) { metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message } } }`;
          const fd = def.fieldDefinitions.map((f: any) => ({ key: f.key, name: f.name, type: f.type.name, required: f.required, description: f.description || undefined, validations: f.validations?.length > 0 ? f.validations : undefined }));
          const r = await gql(tgt.url, tgt.token, m, { d: { type: def.type, name: def.name, fieldDefinitions: fd, access: { storefront: "PUBLIC_READ" } } });
          const ue = r?.data?.metaobjectDefinitionCreate?.userErrors;
          if (ue?.length > 0) { results.push({ id: def.id, title: `Def: ${def.name}`, status: "error", message: ue.map((e: any) => e.message).join(", ") }); }
          else { results.push({ id: def.id, title: `Def: ${def.name}`, status: "created" }); }
        } catch (e: any) { results.push({ id: def.id, title: `Def: ${def.name}`, status: "error", message: e.message }); }
      }
    }

    // Entries
    let cursor: string | null = null; let hasNext = true; const entries: any[] = [];
    while (hasNext) {
      const eq = `{ metaobjects(type: "${def.type}", first: 50${cursor ? `, after: "${cursor}"` : ""}) { edges { node { id handle fields { key value } } cursor } pageInfo { hasNextPage } } }`;
      const ed = await gql(src.url, src.token, eq);
      const edges = ed?.data?.metaobjects?.edges ?? [];
      entries.push(...edges.map((e: any) => e.node));
      hasNext = ed?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
      cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    }

    let tgtEntries: any[] = []; let tc: string | null = null; let th = true;
    while (th) {
      try {
        const tq = `{ metaobjects(type: "${def.type}", first: 50${tc ? `, after: "${tc}"` : ""}) { edges { node { id handle } cursor } pageInfo { hasNextPage } } }`;
        const td = await gql(tgt.url, tgt.token, tq);
        const te = td?.data?.metaobjects?.edges ?? [];
        tgtEntries.push(...te.map((e: any) => e.node));
        th = td?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
        tc = te.length > 0 ? te[te.length - 1].cursor : null;
      } catch { th = false; }
    }

    for (let _i = 0; _i < entries.length; _i++) {
      if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
      const entry = entries[_i];
      const title = `${def.name}: ${entry.handle || entry.id}`;
      const ex = tgtEntries.find((t: any) => t.handle === entry.handle);
      if (ex && cm === "skip") { results.push({ id: entry.id, title, status: "skipped", message: "Bereits vorhanden" }); continue; }
      if (ex && cm === "ask") { results.push({ id: entry.id, title, status: "conflict", message: "Bereits vorhanden", sourceData: entry, targetData: ex }); continue; }
      if (dry) { results.push({ id: entry.id, title, status: ex ? "updated" : "created", message: "Testlauf" }); continue; }
      const fields = entry.fields?.filter((f: any) => f.value != null && f.value !== "").map((f: any) => ({ key: f.key, value: f.value })) ?? [];
      try {
        if (ex && cm === "overwrite") {
          const um = `mutation($id: ID!, $m: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $m) { metaobject { id } userErrors { field message } } }`;
          const ur = await gql(tgt.url, tgt.token, um, { id: ex.id, m: { fields } });
          const ue = ur?.data?.metaobjectUpdate?.userErrors;
          results.push({ id: entry.id, title, status: ue?.length > 0 ? "error" : "updated", message: ue?.length > 0 ? ue.map((e: any) => e.message).join(", ") : undefined });
        } else if (!ex) {
          const cm2 = `mutation($m: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $m) { metaobject { id } userErrors { field message } } }`;
          const cr = await gql(tgt.url, tgt.token, cm2, { m: { type: def.type, handle: entry.handle, fields } });
          const ce = cr?.data?.metaobjectCreate?.userErrors;
          results.push({ id: entry.id, title, status: ce?.length > 0 ? "error" : "created", message: ce?.length > 0 ? ce.map((e: any) => e.message).join(", ") : undefined });
        }
      } catch (e: any) { results.push({ id: entry.id, title, status: "error", message: e.message }); }
    }
  }
  return results;
}

// --- Metafield definitions migration (creates the DEFINITIONS in target shop) ---
async function migrateMetafieldDefs(src: any, tgt: any, defKeys: string[], ownerType: string, cm: string, dry: boolean): Promise<Result[]> {
  const results: Result[] = [];

  // Fetch source definitions for this owner type
  const srcQuery = `{
    metafieldDefinitions(ownerType: ${ownerType}, first: 100) {
      edges {
        node {
          id name namespace key
          type { name }
          description
          ownerType
          pinnedPosition
          validations { name value }
        }
      }
    }
  }`;
  const srcData = await gql(src.url, src.token, srcQuery);
  const srcDefs = srcData?.data?.metafieldDefinitions?.edges?.map((e: any) => e.node) ?? [];

  // Fetch target definitions to check for existing
  const tgtData = await gql(tgt.url, tgt.token, srcQuery);
  const tgtDefs = tgtData?.data?.metafieldDefinitions?.edges?.map((e: any) => e.node) ?? [];

  // Filter to selected keys (namespace.key format)
  const selected = srcDefs.filter((d: any) => defKeys.includes(`${d.namespace}.${d.key}`));

  if (selected.length === 0) {
    results.push({ id: ownerType, title: `Metafeld-Definitionen (${ownerType})`, status: "skipped", message: "Keine passenden Definitionen gefunden" });
    return results;
  }

  for (let _i = 0; _i < selected.length; _i++) {
    if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
    const def = selected[_i];
    const title = `${def.namespace}.${def.key} (${def.name})`;
    const existing = tgtDefs.find((t: any) => t.namespace === def.namespace && t.key === def.key);

    if (existing && cm === "skip") {
      results.push({ id: def.id, title, status: "skipped", message: "Bereits vorhanden" });
      continue;
    }

    if (existing && cm === "ask") {
      results.push({ id: def.id, title, status: "conflict", message: "Bereits vorhanden", sourceData: def, targetData: existing });
      continue;
    }

    if (existing && cm === "overwrite") {
      // Update existing definition
      if (dry) {
        results.push({ id: def.id, title, status: "updated", message: "Testlauf" });
        continue;
      }
      try {
        const updateMutation = `mutation($definition: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $definition) {
            updatedDefinition { id }
            userErrors { field message }
          }
        }`;
        const updateInput: any = {
          namespace: def.namespace,
          key: def.key,
          ownerType: def.ownerType,
          name: def.name,
          description: def.description || undefined,
        };
        if (def.pinnedPosition != null) updateInput.pin = true;
        const ur = await gql(tgt.url, tgt.token, updateMutation, { definition: updateInput });
        const ue = ur?.data?.metafieldDefinitionUpdate?.userErrors;
        if (ue?.length > 0) {
          results.push({ id: def.id, title, status: "error", message: ue.map((e: any) => e.message).join(", ") });
        } else {
          results.push({ id: def.id, title, status: "updated" });
        }
      } catch (e: any) {
        results.push({ id: def.id, title, status: "error", message: e.message });
      }
      continue;
    }

    if (existing) {
      results.push({ id: def.id, title, status: "skipped", message: "Bereits vorhanden" });
      continue;
    }

    // Create new definition
    if (dry) {
      results.push({ id: def.id, title, status: "created", message: "Testlauf" });
      continue;
    }

    try {
      const createMutation = `mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message }
        }
      }`;
      const createInput: any = {
        name: def.name,
        namespace: def.namespace,
        key: def.key,
        type: def.type.name,
        ownerType: def.ownerType,
        description: def.description || undefined,
        pin: def.pinnedPosition != null,
      };
      if (def.validations?.length > 0) {
        createInput.validations = def.validations.map((v: any) => ({ name: v.name, value: v.value }));
      }
      const cr = await gql(tgt.url, tgt.token, createMutation, { definition: createInput });
      const ce = cr?.data?.metafieldDefinitionCreate?.userErrors;
      if (ce?.length > 0) {
        results.push({ id: def.id, title, status: "error", message: ce.map((e: any) => e.message).join(", ") });
      } else {
        results.push({ id: def.id, title, status: "created" });
      }
    } catch (e: any) {
      results.push({ id: def.id, title, status: "error", message: e.message });
    }
  }

  return results;
}

// --- Products, Collections, Pages, Blogs (unchanged logic, inline) ---
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: MigrateRequest = await req.json();
    const { sourceShop: src, targetShop: tgt, dataType, itemIds, conflictMode: cm, dryRun: dry, metafieldsOwnerType } = body;
    let results: Result[] = [];

    if (dataType === "metaobjects") {
      results = await migrateMetaobjects(src, tgt, itemIds, cm, dry);
    } else if (dataType === "metafield_definitions") {
      results = await migrateMetafieldDefs(src, tgt, itemIds, metafieldsOwnerType || "PRODUCT", cm, dry);
    } else if (dataType === "products") {
      const all = (await shopGet(src.url, src.token, `/admin/api/${V}/products.json?limit=250`))?.products ?? [];
      const sel = all.filter((p: any) => itemIds.includes(String(p.id)));
      let tgtAll: any[] = [];
      try { tgtAll = (await shopGet(tgt.url, tgt.token, `/admin/api/${V}/products.json?limit=250`))?.products ?? []; } catch {}
      for (let _i = 0; _i < sel.length; _i++) {
        if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
        const p = sel[_i];
        const t = p.title || String(p.id);
        try {
          const ex = tgtAll.find((tp: any) => tp.handle === p.handle);
          if (ex && cm === "skip") { results.push({ id: String(p.id), title: t, status: "skipped", message: "Bereits vorhanden" }); continue; }
          if (ex && cm === "ask") { results.push({ id: String(p.id), title: t, status: "conflict", message: "Bereits vorhanden", sourceData: { title: p.title, handle: p.handle, vendor: p.vendor, product_type: p.product_type, variants: p.variants?.length ?? 0, images: p.images?.length ?? 0 }, targetData: { title: ex.title, handle: ex.handle, vendor: ex.vendor, product_type: ex.product_type, variants: ex.variants?.length ?? 0, images: ex.images?.length ?? 0 } }); continue; }
          if (dry) { results.push({ id: String(p.id), title: t, status: ex ? "updated" : "created", message: "Testlauf" }); continue; }
          const c = cleanProduct(p);
          if (ex && cm === "overwrite") { await shopPut(tgt.url, tgt.token, `/admin/api/${V}/products/${ex.id}.json`, { product: c }); results.push({ id: String(p.id), title: t, status: "updated" }); }
          else if (!ex) { await shopPost(tgt.url, tgt.token, `/admin/api/${V}/products.json`, { product: c }); results.push({ id: String(p.id), title: t, status: "created" }); }
        } catch (e: any) { results.push({ id: String(p.id), title: t, status: "error", message: e.message }); }
      }
    } else if (dataType === "collections") {
      const [cs, ss] = await Promise.all([
        shopGet(src.url, src.token, `/admin/api/${V}/custom_collections.json?limit=250`).catch(() => ({ custom_collections: [] })),
        shopGet(src.url, src.token, `/admin/api/${V}/smart_collections.json?limit=250`).catch(() => ({ smart_collections: [] })),
      ]);
      const all = [...(cs?.custom_collections ?? []).map((c: any) => ({ ...c, _type: "custom" })), ...(ss?.smart_collections ?? []).map((c: any) => ({ ...c, _type: "smart" }))];
      const sel = all.filter((c: any) => itemIds.includes(String(c.id)));
      let tc: any[] = [], ts: any[] = [];
      try { tc = (await shopGet(tgt.url, tgt.token, `/admin/api/${V}/custom_collections.json?limit=250`))?.custom_collections ?? []; } catch {}
      try { ts = (await shopGet(tgt.url, tgt.token, `/admin/api/${V}/smart_collections.json?limit=250`))?.smart_collections ?? []; } catch {}
      const allTgt = [...tc, ...ts];
      for (let _i = 0; _i < sel.length; _i++) {
        if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
        const col = sel[_i];
        const t = col.title || String(col.id); const ct = col._type;
        try {
          const ex = allTgt.find((tc: any) => tc.handle === col.handle);
          if (ex && cm === "skip") { results.push({ id: String(col.id), title: t, status: "skipped", message: "Bereits vorhanden" }); continue; }
          if (ex && cm === "ask") { results.push({ id: String(col.id), title: t, status: "conflict", message: "Bereits vorhanden", sourceData: { title: col.title, handle: col.handle }, targetData: { title: ex.title, handle: ex.handle } }); continue; }
          if (dry) { results.push({ id: String(col.id), title: t, status: ex ? "updated" : "created", message: "Testlauf" }); continue; }
          const cl = cleanCollection(col);
          const ep = ct === "smart" ? "smart_collections" : "custom_collections";
          const wr = ct === "smart" ? "smart_collection" : "custom_collection";
          if (ex && cm === "overwrite") { await shopPut(tgt.url, tgt.token, `/admin/api/${V}/${ep}/${ex.id}.json`, { [wr]: cl }); results.push({ id: String(col.id), title: t, status: "updated" }); }
          else if (!ex) { await shopPost(tgt.url, tgt.token, `/admin/api/${V}/${ep}.json`, { [wr]: cl }); results.push({ id: String(col.id), title: t, status: "created" }); }
        } catch (e: any) { results.push({ id: String(col.id), title: t, status: "error", message: e.message }); }
      }
    } else if (dataType === "pages") {
      const all = (await shopGet(src.url, src.token, `/admin/api/${V}/pages.json?limit=250`))?.pages ?? [];
      const sel = all.filter((p: any) => itemIds.includes(String(p.id)));
      let tgtAll: any[] = [];
      try { tgtAll = (await shopGet(tgt.url, tgt.token, `/admin/api/${V}/pages.json?limit=250`))?.pages ?? []; } catch {}
      for (let _i = 0; _i < sel.length; _i++) {
        if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
        const p = sel[_i];
        const t = p.title || String(p.id);
        try {
          const ex = tgtAll.find((tp: any) => tp.handle === p.handle);
          if (ex && cm === "skip") { results.push({ id: String(p.id), title: t, status: "skipped", message: "Bereits vorhanden" }); continue; }
          if (ex && cm === "ask") { results.push({ id: String(p.id), title: t, status: "conflict", message: "Bereits vorhanden", sourceData: { title: p.title, handle: p.handle, body_html: p.body_html?.substring(0, 200) }, targetData: { title: ex.title, handle: ex.handle, body_html: ex.body_html?.substring(0, 200) } }); continue; }
          if (dry) { results.push({ id: String(p.id), title: t, status: ex ? "updated" : "created", message: "Testlauf" }); continue; }
          const cl = cleanPage(p);
          if (ex && cm === "overwrite") { await shopPut(tgt.url, tgt.token, `/admin/api/${V}/pages/${ex.id}.json`, { page: cl }); results.push({ id: String(p.id), title: t, status: "updated" }); }
          else if (!ex) { await shopPost(tgt.url, tgt.token, `/admin/api/${V}/pages.json`, { page: cl }); results.push({ id: String(p.id), title: t, status: "created" }); }
        } catch (e: any) { results.push({ id: String(p.id), title: t, status: "error", message: e.message }); }
      }
    } else if (dataType === "blogs") {
      const srcBlogs = (await shopGet(src.url, src.token, `/admin/api/${V}/blogs.json`))?.blogs ?? [];
      const sel = srcBlogs.filter((b: any) => itemIds.includes(String(b.id)));
      let tgtBlogs: any[] = [];
      try { tgtBlogs = (await shopGet(tgt.url, tgt.token, `/admin/api/${V}/blogs.json`))?.blogs ?? []; } catch {}
      for (let _i = 0; _i < sel.length; _i++) {
        if (_i > 0 && _i % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
        const blog = sel[_i];
        const t = blog.title || String(blog.id);
        try {
          const ex = tgtBlogs.find((tb: any) => tb.handle === blog.handle);
          if (dry) { results.push({ id: String(blog.id), title: t, status: ex ? "updated" : "created", message: "Testlauf" }); continue; }
          if (ex && cm === "ask") { results.push({ id: String(blog.id), title: t, status: "conflict", message: "Bereits vorhanden", sourceData: { title: blog.title, handle: blog.handle }, targetData: { title: ex.title, handle: ex.handle } }); continue; }
          if (ex && cm === "skip") { results.push({ id: String(blog.id), title: t, status: "skipped", message: "Bereits vorhanden" }); continue; }
          let targetBlogId: number;
          if (ex) { targetBlogId = ex.id; results.push({ id: String(blog.id), title: t, status: "updated" }); }
          else {
            const cr = await shopPost(tgt.url, tgt.token, `/admin/api/${V}/blogs.json`, { blog: { title: blog.title, handle: blog.handle, commentable: blog.commentable } });
            targetBlogId = cr?.blog?.id; results.push({ id: String(blog.id), title: t, status: "created" });
          }
          if (targetBlogId) {
            const arts = (await shopGet(src.url, src.token, `/admin/api/${V}/blogs/${blog.id}/articles.json?limit=250`))?.articles ?? [];
            for (let _j = 0; _j < arts.length; _j++) {
              if (_j > 0 && _j % BATCH_SIZE === 0) await sleep(BATCH_DELAY_MS);
              const a = arts[_j];
              try { await shopPost(tgt.url, tgt.token, `/admin/api/${V}/blogs/${targetBlogId}/articles.json`, { article: cleanArticle(a) }); results.push({ id: String(a.id), title: `Artikel: ${a.title}`, status: "created" }); }
              catch (e: any) { results.push({ id: String(a.id), title: `Artikel: ${a.title}`, status: "error", message: e.message }); }
            }
          }
        } catch (e: any) { results.push({ id: String(blog.id), title: t, status: "error", message: e.message }); }
      }
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.status === "created").length,
      updated: results.filter(r => r.status === "updated").length,
      skipped: results.filter(r => r.status === "skipped").length,
      errors: results.filter(r => r.status === "error").length,
      conflicts: results.filter(r => r.status === "conflict").length,
    };

    return new Response(JSON.stringify({ results, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
