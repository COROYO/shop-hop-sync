import { supabase } from "@/integrations/supabase/client";

interface ShopifyProxyRequest {
  shopUrl: string;
  accessToken: string;
  endpoint?: string;
  method?: string;
  body?: unknown;
  graphql?: { query: string; variables?: Record<string, unknown> };
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

// Fetch metaobject definitions via GraphQL
export async function fetchMetaobjectDefinitions(shopUrl: string, accessToken: string) {
  const query = `{
    metaobjectDefinitions(first: 50) {
      edges {
        node {
          id
          name
          type
          fieldDefinitions {
            key
            name
            type { name }
            required
            description
          }
        }
      }
    }
  }`;

  const data = await shopifyProxy({
    shopUrl,
    accessToken,
    graphql: { query },
  });

  const definitions = data?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];
  // Fetch entry count for each definition
  const result: any[] = [];
  for (const def of definitions) {
    const countQuery = `{
      metaobjects(type: "${def.type}", first: 1) {
        edges { node { id } }
        pageInfo { hasNextPage }
      }
    }`;
    const countData = await shopifyProxy({
      shopUrl,
      accessToken,
      graphql: { query: countQuery },
    });
    const entryCount = countData?.data?.metaobjects?.edges?.length ?? 0;
    result.push({
      id: def.id,
      title: def.name,
      handle: def.type,
      name: def.name,
      type: def.type,
      fieldDefinitions: def.fieldDefinitions,
      _entryCount: entryCount > 0 ? "1+" : "0",
    });
  }
  return result;
}

export async function fetchMetaobjects(shopUrl: string, accessToken: string) {
  return fetchMetaobjectDefinitions(shopUrl, accessToken);
}
