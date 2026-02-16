import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MigrateRequest {
  sourceShop: { url: string; token: string };
  targetShop: { url: string; token: string };
  dataType: "products" | "collections" | "pages" | "blogs";
  itemIds: string[];
  conflictMode: "overwrite" | "skip" | "ask";
  dryRun: boolean;
}

async function shopifyGet(shopUrl: string, token: string, endpoint: string) {
  const cleanUrl = shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await fetch(`https://${cleanUrl}${endpoint}`, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${endpoint} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function shopifyPost(shopUrl: string, token: string, endpoint: string, body: unknown) {
  const cleanUrl = shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await fetch(`https://${cleanUrl}${endpoint}`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`POST ${endpoint} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function shopifyPut(shopUrl: string, token: string, endpoint: string, body: unknown) {
  const cleanUrl = shopUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await fetch(`https://${cleanUrl}${endpoint}`, {
    method: "PUT",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PUT ${endpoint} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Strip fields that should not be sent to target
function cleanProduct(p: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, ...rest } = p;
  // Clean variants
  if (rest.variants) {
    rest.variants = rest.variants.map((v: any) => {
      const { id: vid, product_id, admin_graphql_api_id: vgql, created_at: vc, updated_at: vu, inventory_item_id, image_id, ...vrest } = v;
      return vrest;
    });
  }
  // Clean images
  if (rest.images) {
    rest.images = rest.images.map((img: any) => ({
      src: img.src,
      alt: img.alt,
      position: img.position,
    }));
  }
  if (rest.image) {
    rest.image = { src: rest.image.src, alt: rest.image.alt };
  }
  return rest;
}

function cleanCollection(c: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, type, ...rest } = c;
  if (rest.image) {
    rest.image = { src: rest.image.src, alt: rest.image.alt };
  }
  return rest;
}

function cleanPage(p: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, published_at, shop_id, ...rest } = p;
  return rest;
}

function cleanArticle(a: any) {
  const { id, admin_graphql_api_id, created_at, updated_at, blog_id, user_id, ...rest } = a;
  if (rest.image) {
    rest.image = { src: rest.image.src, alt: rest.image.alt };
  }
  return rest;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: MigrateRequest = await req.json();
    const { sourceShop, targetShop, dataType, itemIds, conflictMode, dryRun } = body;

    const results: { id: string; title: string; status: "created" | "updated" | "skipped" | "error"; message?: string }[] = [];
    const apiVersion = "2024-01";

    if (dataType === "products") {
      // Fetch all source products
      const srcData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/products.json?limit=250`);
      const allProducts = srcData?.products ?? [];
      const selected = allProducts.filter((p: any) => itemIds.includes(String(p.id)));

      // Get target products for conflict detection
      let targetProducts: any[] = [];
      if (conflictMode !== "overwrite" || !dryRun) {
        try {
          const tgtData = await shopifyGet(targetShop.url, targetShop.token, `/admin/api/${apiVersion}/products.json?limit=250`);
          targetProducts = tgtData?.products ?? [];
        } catch { /* ignore */ }
      }

      for (const product of selected) {
        const title = product.title || String(product.id);
        try {
          const existing = targetProducts.find((tp: any) => tp.handle === product.handle);
          
          if (existing && conflictMode === "skip") {
            results.push({ id: String(product.id), title, status: "skipped", message: "Bereits vorhanden" });
            continue;
          }

          if (dryRun) {
            results.push({ id: String(product.id), title, status: existing ? "updated" : "created", message: "Testlauf — keine Änderung" });
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
    }

    if (dataType === "collections") {
      // Fetch custom + smart collections
      const [customSrc, smartSrc] = await Promise.all([
        shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/custom_collections.json?limit=250`).catch(() => ({ custom_collections: [] })),
        shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/smart_collections.json?limit=250`).catch(() => ({ smart_collections: [] })),
      ]);
      const allCollections = [
        ...(customSrc?.custom_collections ?? []).map((c: any) => ({ ...c, _type: "custom" })),
        ...(smartSrc?.smart_collections ?? []).map((c: any) => ({ ...c, _type: "smart" })),
      ];
      const selected = allCollections.filter((c: any) => itemIds.includes(String(c.id)));

      // Target collections for conflict
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
    }

    if (dataType === "pages") {
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
    }

    if (dataType === "blogs") {
      const blogsData = await shopifyGet(sourceShop.url, sourceShop.token, `/admin/api/${apiVersion}/blogs.json`);
      const srcBlogs = blogsData?.blogs ?? [];
      const selected = srcBlogs.filter((b: any) => itemIds.includes(String(b.id)));

      // Get target blogs
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

            // Migrate articles
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
