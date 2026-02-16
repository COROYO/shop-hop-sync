import { supabase } from "@/integrations/supabase/client";

interface ShopifyProxyRequest {
  shopUrl: string;
  accessToken: string;
  endpoint: string;
  method?: string;
  body?: unknown;
}

export async function shopifyProxy(req: ShopifyProxyRequest) {
  const { data, error } = await supabase.functions.invoke("shopify-proxy", {
    body: req,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function testConnection(shopUrl: string, accessToken: string) {
  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/shop.json",
  });
  return data?.shop;
}

export async function fetchProducts(shopUrl: string, accessToken: string) {
  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/products.json?limit=250",
  });
  return data?.products ?? [];
}

export async function fetchCollections(shopUrl: string, accessToken: string) {
  const [custom, smart] = await Promise.all([
    shopifyProxy({ shopUrl, accessToken, endpoint: "/admin/api/2024-01/custom_collections.json?limit=250" }),
    shopifyProxy({ shopUrl, accessToken, endpoint: "/admin/api/2024-01/smart_collections.json?limit=250" }),
  ]);
  return [
    ...(custom?.custom_collections ?? []).map((c: any) => ({ ...c, type: "custom" })),
    ...(smart?.smart_collections ?? []).map((c: any) => ({ ...c, type: "smart" })),
  ];
}

export async function fetchPages(shopUrl: string, accessToken: string) {
  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/pages.json?limit=250",
  });
  return data?.pages ?? [];
}

export async function fetchBlogs(shopUrl: string, accessToken: string) {
  const blogsData = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/blogs.json",
  });
  const blogs = blogsData?.blogs ?? [];
  const result: any[] = [];
  for (const blog of blogs) {
    const articlesData = await shopifyProxy({
      shopUrl,
      accessToken,
      endpoint: `/admin/api/2024-01/blogs/${blog.id}/articles.json?limit=250`,
    });
    result.push({ ...blog, articles: articlesData?.articles ?? [] });
  }
  return result;
}

export async function fetchMetaobjects(shopUrl: string, accessToken: string) {
  // Metaobjects require GraphQL - we'll use a simplified REST approach
  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    endpoint: "/admin/api/2024-01/metaobjects.json?limit=250",
    method: "GET",
  });
  return data?.metaobjects ?? [];
}
