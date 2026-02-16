import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MigrateRequest {
  sourceShop: { url: string; token: string };
  targetShop: { url: string; token: string };
  dataType: "products" | "collections" | "pages" | "blogs" | "metaobjects" | "metafields";
  itemIds: string[];
  conflictMode: "overwrite" | "skip" | "ask";
  dryRun: boolean;
  metafieldsOwnerType?: string; // e.g. "products", "collections", "pages", "blogs"
}

type Result = { id: string; title: string; status: "created" | "updated" | "skipped" | "error"; message?: string };

function cleanUrl(shopUrl: string) {
  return shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function shopifyGet(shopUrl: string, token: string, endpoint: string) {
  const res = await fetch(`https://${cleanUrl(shopUrl)}${endpoint}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function shopifyPost(shopUrl: string, token: string, endpoint: string, body: unknown) {
  const res = await fetch(`https://${cleanUrl(shopUrl)}${endpoint}`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${endpoint} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function shopifyPut(shopUrl: string, token: string, endpoint: string, body: unknown) {
  const res = await fetch(`https://${cleanUrl(shopUrl)}${endpoint}`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PUT ${endpoint} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function shopifyGraphQL(shopUrl: string, token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${cleanUrl(shopUrl)}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  return data;
}

// --- Cleaning helpers ---
function cleanProduct(p: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, ...rest } = p;
  if (rest.variants) {
    rest.variants = rest.variants.map((v: any) => {
      const { id: vid, product_id, admin_graphql_api_id: vgql, created_at: vc, updated_at: vu, inventory_item_id, image_id, ...vrest } = v;
      return vrest;
    });
  }
  if (rest.images) {
    rest.images = rest.images.map((img: any) => ({ src: img.src, alt: img.alt, position: img.position }));
  }
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

// --- Metaobjects migration ---
async function migrateMetaobjects(
  src: { url: string; token: string },
  tgt: { url: string; token: string },
  definitionIds: string[],
  conflictMode: string,
  dryRun: boolean,
): Promise<Result[]> {
  const results: Result[] = [];

  // Fetch definitions from source
  const defQuery = `{
    metaobjectDefinitions(first: 50) {
      edges { node { id name type fieldDefinitions { key name type { name } required description validations { name value } } } }
    }
  }`;
  const defData = await shopifyGraphQL(src.url, src.token, defQuery);
  const allDefs = defData?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];
  const selectedDefs = allDefs.filter((d: any) => definitionIds.includes(d.id));

  // Fetch target definitions
  const tgtDefData = await shopifyGraphQL(tgt.url, tgt.token, defQuery);
  const tgtDefs = tgtDefData?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];

  for (const def of selectedDefs) {
    const existingDef = tgtDefs.find((td: any) => td.type === def.type);

    // Create definition if not exists on target
    let targetDefType = def.type;
    if (!existingDef) {
      if (dryRun) {
        results.push({ id: def.id, title: `Definition: ${def.name}`, status: "created", message: "Testlauf" });
      } else {
        try {
          const createDefMutation = `mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
            metaobjectDefinitionCreate(definition: $definition) {
              metaobjectDefinition { id type }
              userErrors { field message }
            }
          }`;
          const fieldDefs = def.fieldDefinitions.map((f: any) => ({
            key: f.key,
            name: f.name,
            type: f.type.name,
            required: f.required,
            description: f.description || undefined,
            validations: f.validations?.length > 0 ? f.validations : undefined,
          }));
          const createRes = await shopifyGraphQL(tgt.url, tgt.token, createDefMutation, {
            definition: { type: def.type, name: def.name, fieldDefinitions: fieldDefs, access: { storefront: "PUBLIC_READ" } },
          });
          const errors = createRes?.data?.metaobjectDefinitionCreate?.userErrors;
          if (errors?.length > 0) {
            results.push({ id: def.id, title: `Definition: ${def.name}`, status: "error", message: errors.map((e: any) => e.message).join(", ") });
            continue;
          }
          results.push({ id: def.id, title: `Definition: ${def.name}`, status: "created" });
        } catch (e: any) {
          results.push({ id: def.id, title: `Definition: ${def.name}`, status: "error", message: e.message });
          continue;
        }
      }
    } else {
      results.push({ id: def.id, title: `Definition: ${def.name}`, status: "skipped", message: "Bereits vorhanden" });
    }

    // Fetch entries from source
    let cursor: string | null = null;
    let hasNext = true;
    const entries: any[] = [];
    while (hasNext) {
      const entriesQuery = `{
        metaobjects(type: "${def.type}", first: 50${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            node {
              id handle type
              fields { key value type }
            }
            cursor
          }
          pageInfo { hasNextPage }
        }
      }`;
      const eData = await shopifyGraphQL(src.url, src.token, entriesQuery);
      const edges = eData?.data?.metaobjects?.edges ?? [];
      entries.push(...edges.map((e: any) => e.node));
      hasNext = eData?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
      cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    }

    // Fetch target entries for conflict detection
    const tgtEntries: any[] = [];
    let tCursor: string | null = null;
    let tHasNext = true;
    while (tHasNext) {
      const tQuery = `{
        metaobjects(type: "${targetDefType}", first: 50${tCursor ? `, after: "${tCursor}"` : ""}) {
          edges { node { id handle fields { key value type } } cursor }
          pageInfo { hasNextPage }
        }
      }`;
      try {
        const tData = await shopifyGraphQL(tgt.url, tgt.token, tQuery);
        const tEdges = tData?.data?.metaobjects?.edges ?? [];
        tgtEntries.push(...tEdges.map((e: any) => e.node));
        tHasNext = tData?.data?.metaobjects?.pageInfo?.hasNextPage ?? false;
        tCursor = tEdges.length > 0 ? tEdges[tEdges.length - 1].cursor : null;
      } catch {
        tHasNext = false;
      }
    }

    // Migrate each entry
    for (const entry of entries) {
      const entryTitle = entry.handle || entry.id;
      const existing = tgtEntries.find((te: any) => te.handle === entry.handle);

      if (existing && conflictMode === "skip") {
        results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "skipped", message: "Bereits vorhanden" });
        continue;
      }

      if (dryRun) {
        results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: existing ? "updated" : "created", message: "Testlauf" });
        continue;
      }

      const fields = entry.fields
        ?.filter((f: any) => f.value !== null && f.value !== "")
        .map((f: any) => ({ key: f.key, value: f.value })) ?? [];

      try {
        if (existing && conflictMode === "overwrite") {
          const updateMutation = `mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject { id }
              userErrors { field message }
            }
          }`;
          const upRes = await shopifyGraphQL(tgt.url, tgt.token, updateMutation, {
            id: existing.id, metaobject: { fields },
          });
          const ue = upRes?.data?.metaobjectUpdate?.userErrors;
          if (ue?.length > 0) {
            results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "error", message: ue.map((e: any) => e.message).join(", ") });
          } else {
            results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "updated" });
          }
        } else if (!existing) {
          const createMutation = `mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
            metaobjectCreate(metaobject: $metaobject) {
              metaobject { id }
              userErrors { field message }
            }
          }`;
          const crRes = await shopifyGraphQL(tgt.url, tgt.token, createMutation, {
            metaobject: { type: def.type, handle: entry.handle, fields },
          });
          const ce = crRes?.data?.metaobjectCreate?.userErrors;
          if (ce?.length > 0) {
            results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "error", message: ce.map((e: any) => e.message).join(", ") });
          } else {
            results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "created" });
          }
        }
      } catch (e: any) {
        results.push({ id: entry.id, title: `${def.name}: ${entryTitle}`, status: "error", message: e.message });
      }
    }
  }

  return results;
}

// --- Metafields migration ---
const OWNER_TYPE_MAP: Record<string, { restResource: string; gqlOwnerType: string }> = {
  products: { restResource: "products", gqlOwnerType: "PRODUCT" },
  collections: { restResource: "collections", gqlOwnerType: "COLLECTION" },
  pages: { restResource: "pages", gqlOwnerType: "PAGE" },
  blogs: { restResource: "blogs", gqlOwnerType: "BLOG" },
};

async function migrateMetafields(
  src: { url: string; token: string },
  tgt: { url: string; token: string },
  ownerType: string,
  itemIds: string[],
  conflictMode: string,
  dryRun: boolean,
): Promise<Result[]> {
  const results: Result[] = [];
  const apiVersion = "2024-01";
  const config = OWNER_TYPE_MAP[ownerType];
  if (!config) {
    results.push({ id: "0", title: "Metafelder", status: "error", message: `Unbekannter Typ: ${ownerType}` });
    return results;
  }

  // For each selected item, fetch its metafields and write to target
  for (const itemId of itemIds) {
    try {
      // Fetch source metafields
      const srcMf = await shopifyGet(src.url, src.token, `/admin/api/${apiVersion}/${config.restResource}/${itemId}/metafields.json`);
      const metafields = srcMf?.metafields ?? [];

      if (metafields.length === 0) {
        results.push({ id: itemId, title: `Metafelder (${ownerType} #${itemId})`, status: "skipped", message: "Keine Metafelder" });
        continue;
      }

      // Find matching target resource by handle
      // First get source item handle
      const srcItem = await shopifyGet(src.url, src.token, `/admin/api/${apiVersion}/${config.restResource}/${itemId}.json`);
      const srcResource = srcItem?.[config.restResource.replace(/s$/, "")] ?? srcItem?.[Object.keys(srcItem)[0]];
      const handle = srcResource?.handle;
      const srcTitle = srcResource?.title || srcResource?.name || handle || itemId;

      if (!handle) {
        results.push({ id: itemId, title: `Metafelder (${srcTitle})`, status: "error", message: "Kein Handle gefunden" });
        continue;
      }

      // Find target item by handle
      let targetItemId: string | null = null;
      try {
        const tgtItems = await shopifyGet(tgt.url, tgt.token, `/admin/api/${apiVersion}/${config.restResource}.json?handle=${handle}&limit=1`);
        const tgtArr = tgtItems?.[config.restResource] ?? [];
        if (tgtArr.length > 0) {
          targetItemId = String(tgtArr[0].id);
        }
      } catch {
        // try fetching all and filtering
        const tgtItems = await shopifyGet(tgt.url, tgt.token, `/admin/api/${apiVersion}/${config.restResource}.json?limit=250`);
        const tgtArr = tgtItems?.[config.restResource] ?? [];
        const match = tgtArr.find((t: any) => t.handle === handle);
        if (match) targetItemId = String(match.id);
      }

      if (!targetItemId) {
        results.push({ id: itemId, title: `Metafelder (${srcTitle})`, status: "error", message: "Ziel-Ressource nicht gefunden" });
        continue;
      }

      if (dryRun) {
        results.push({ id: itemId, title: `Metafelder (${srcTitle})`, status: "created", message: `Testlauf — ${metafields.length} Metafelder` });
        continue;
      }

      // Get existing target metafields for conflict detection
      let tgtMf: any[] = [];
      try {
        const tgtMfData = await shopifyGet(tgt.url, tgt.token, `/admin/api/${apiVersion}/${config.restResource}/${targetItemId}/metafields.json`);
        tgtMf = tgtMfData?.metafields ?? [];
      } catch { /* */ }

      let mfCreated = 0, mfUpdated = 0, mfSkipped = 0, mfErrors = 0;

      for (const mf of metafields) {
        const existingMf = tgtMf.find((t: any) => t.namespace === mf.namespace && t.key === mf.key);

        if (existingMf && conflictMode === "skip") {
          mfSkipped++;
          continue;
        }

        try {
          if (existingMf && conflictMode === "overwrite") {
            await shopifyPut(tgt.url, tgt.token, `/admin/api/${apiVersion}/${config.restResource}/${targetItemId}/metafields/${existingMf.id}.json`, {
              metafield: { id: existingMf.id, value: mf.value, type: mf.type },
            });
            mfUpdated++;
          } else if (!existingMf) {
            await shopifyPost(tgt.url, tgt.token, `/admin/api/${apiVersion}/${config.restResource}/${targetItemId}/metafields.json`, {
              metafield: { namespace: mf.namespace, key: mf.key, value: mf.value, type: mf.type },
            });
            mfCreated++;
          }
        } catch {
          mfErrors++;
        }
      }

      const statusMsg = `${mfCreated} erstellt, ${mfUpdated} aktualisiert, ${mfSkipped} übersprungen, ${mfErrors} Fehler`;
      results.push({
        id: itemId,
        title: `Metafelder (${srcTitle})`,
        status: mfErrors > 0 ? "error" : "created",
        message: statusMsg,
      });
    } catch (e: any) {
      results.push({ id: itemId, title: `Metafelder (#${itemId})`, status: "error", message: e.message });
    }
  }

  return results;
}

// --- Main handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: MigrateRequest = await req.json();
    const { sourceShop, targetShop, dataType, itemIds, conflictMode, dryRun, metafieldsOwnerType } = body;

    let results: Result[] = [];
    const apiVersion = "2024-01";

    if (dataType === "metaobjects") {
      results = await migrateMetaobjects(sourceShop, targetShop, itemIds, conflictMode, dryRun);
    } else if (dataType === "metafields") {
      results = await migrateMetafields(sourceShop, targetShop, metafieldsOwnerType || "products", itemIds, conflictMode, dryRun);
    } else if (dataType === "products") {
      const srcData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/products.json?limit=250`);
      const allProducts = srcData?.products ?? [];
      const selected = allProducts.filter((p: any) => itemIds.includes(String(p.id)));

      let targetProducts: any[] = [];
      try {
        const tgtData = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/products.json?limit=250`);
        targetProducts = tgtData?.products ?? [];
      } catch { /* */ }

      for (const product of selected) {
        const title = product.title || String(product.id);
        try {
          const existing = targetProducts.find((tp: any) => tp.handle === product.handle);
          if (existing && conflictMode === "skip") {
            results.push({ id: String(product.id), title, status: "skipped", message: "Bereits vorhanden" });
            continue;
          }
          if (dryRun) {
            results.push({ id: String(product.id), title, status: existing ? "updated" : "created", message: "Testlauf" });
            continue;
          }
          const cleaned = cleanProduct(product);
          if (existing && conflictMode === "overwrite") {
            await shopifyPut(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/products/${existing.id}.json`, { product: cleaned });
            results.push({ id: String(product.id), title, status: "updated" });
          } else if (!existing) {
            await shopifyPost(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/products.json`, { product: cleaned });
            results.push({ id: String(product.id), title, status: "created" });
          }
        } catch (e: any) {
          results.push({ id: String(product.id), title, status: "error", message: e.message });
        }
      }
    } else if (dataType === "collections") {
      const [customSrc, smartSrc] = await Promise.all([
        shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/custom_collections.json?limit=250`).catch(() => ({ custom_collections: [] })),
        shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/smart_collections.json?limit=250`).catch(() => ({ smart_collections: [] })),
      ]);
      const allCollections = [
        ...(customSrc?.custom_collections ?? []).map((c: any) => ({ ...c, _type: "custom" })),
        ...(smartSrc?.smart_collections ?? []).map((c: any) => ({ ...c, _type: "smart" })),
      ];
      const selected = allCollections.filter((c: any) => itemIds.includes(String(c.id)));

      let targetCustom: any[] = [];
      let targetSmart: any[] = [];
      try {
        const tc = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/custom_collections.json?limit=250`);
        targetCustom = tc?.custom_collections ?? [];
      } catch { /* */ }
      try {
        const ts = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/smart_collections.json?limit=250`);
        targetSmart = ts?.smart_collections ?? [];
      } catch { /* */ }
      const allTarget = [...targetCustom, ...targetSmart];

      for (const col of selected) {
        const title = col.title || String(col.id);
        const colType = col._type;
        try {
          const existing = allTarget.find((tc: any) => tc.handle === col.handle);
          if (existing && conflictMode === "skip") {
            results.push({ id: String(col.id), title, status: "skipped", message: "Bereits vorhanden" });
            continue;
          }
          if (dryRun) {
            results.push({ id: String(col.id), title, status: existing ? "updated" : "created", message: "Testlauf" });
            continue;
          }
          const cleaned = cleanCollection(col);
          const endpoint = colType === "smart" ? "smart_collections" : "custom_collections";
          const wrapper = colType === "smart" ? "smart_collection" : "custom_collection";
          if (existing && conflictMode === "overwrite") {
            await shopifyPut(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/${endpoint}/${existing.id}.json`, { [wrapper]: cleaned });
            results.push({ id: String(col.id), title, status: "updated" });
          } else if (!existing) {
            await shopifyPost(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/${endpoint}.json`, { [wrapper]: cleaned });
            results.push({ id: String(col.id), title, status: "created" });
          }
        } catch (e: any) {
          results.push({ id: String(col.id), title, status: "error", message: e.message });
        }
      }
    } else if (dataType === "pages") {
      const srcData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/pages.json?limit=250`);
      const allPages = srcData?.pages ?? [];
      const selected = allPages.filter((p: any) => itemIds.includes(String(p.id)));

      let targetPages: any[] = [];
      try {
        const tp = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/pages.json?limit=250`);
        targetPages = tp?.pages ?? [];
      } catch { /* */ }

      for (const page of selected) {
        const title = page.title || String(page.id);
        try {
          const existing = targetPages.find((tp: any) => tp.handle === page.handle);
          if (existing && conflictMode === "skip") {
            results.push({ id: String(page.id), title, status: "skipped", message: "Bereits vorhanden" });
            continue;
          }
          if (dryRun) {
            results.push({ id: String(page.id), title, status: existing ? "updated" : "created", message: "Testlauf" });
            continue;
          }
          const cleaned = cleanPage(page);
          if (existing && conflictMode === "overwrite") {
            await shopifyPut(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/pages/${existing.id}.json`, { page: cleaned });
            results.push({ id: String(page.id), title, status: "updated" });
          } else if (!existing) {
            await shopifyPost(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/pages.json`, { page: cleaned });
            results.push({ id: String(page.id), title, status: "created" });
          }
        } catch (e: any) {
          results.push({ id: String(page.id), title, status: "error", message: e.message });
        }
      }
    } else if (dataType === "blogs") {
      const blogsData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/blogs.json`);
      const srcBlogs = blogsData?.blogs ?? [];
      const selected = srcBlogs.filter((b: any) => itemIds.includes(String(b.id)));

      let targetBlogs: any[] = [];
      try {
        const tb = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/blogs.json`);
        targetBlogs = tb?.blogs ?? [];
      } catch { /* */ }

      for (const blog of selected) {
        const title = blog.title || String(blog.id);
        try {
          const existingBlog = targetBlogs.find((tb: any) => tb.handle === blog.handle);
          if (dryRun) {
            results.push({ id: String(blog.id), title, status: existingBlog ? "updated" : "created", message: "Testlauf" });
          } else if (existingBlog && conflictMode === "skip") {
            results.push({ id: String(blog.id), title, status: "skipped", message: "Bereits vorhanden" });
          } else {
            let targetBlogId: number;
            if (existingBlog) {
              targetBlogId = existingBlog.id;
              results.push({ id: String(blog.id), title, status: "updated" });
            } else {
              const created = await shopifyPost(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/blogs.json`, {
                blog: { title: blog.title, handle: blog.handle, commentable: blog.commentable },
              });
              targetBlogId = created?.blog?.id;
              results.push({ id: String(blog.id), title, status: "created" });
            }
            if (targetBlogId) {
              const articlesData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/blogs/${blog.id}/articles.json?limit=250`);
              const articles = articlesData?.articles ?? [];
              for (const article of articles) {
                try {
                  const cleaned = cleanArticle(article);
                  await shopifyPost(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/blogs/${targetBlogId}/articles.json`, { article: cleaned });
                  results.push({ id: String(article.id), title: `Artikel: ${article.title}`, status: "created" });
                } catch (e: any) {
                  results.push({ id: String(article.id), title: `Artikel: ${article.title}`, status: "error", message: e.message });
                }
              }
            }
          }
        } catch (e: any) {
          results.push({ id: String(blog.id), title, status: "error", message: e.message });
        }
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    return new Response(JSON.stringify({ results, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
