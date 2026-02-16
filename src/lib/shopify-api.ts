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
  // Check for GraphQL-level errors
  if (req.graphql && data?.errors?.length > 0) {
    const msg = data.errors.map((e: any) => e.message).join("; ");
    throw new Error(msg);
  }
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
export async function fetchMetaobjects(shopUrl: string, accessToken: string) {
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
          }
        }
      }
    }
  }`;

  const data = await shopifyProxy({ shopUrl, accessToken, graphql: { query } });

  const definitions = data?.data?.metaobjectDefinitions?.edges?.map((e: any) => e.node) ?? [];
  
  if (definitions.length === 0) return [];

  // Fetch entry counts
  const result: any[] = [];
  for (const def of definitions) {
    let entryInfo = "0 Einträge";
    try {
      const countQuery = `{
        metaobjects(type: "${def.type}", first: 250) {
          edges { node { id } }
        }
      }`;
      const countData = await shopifyProxy({ shopUrl, accessToken, graphql: { query: countQuery } });
      const count = countData?.data?.metaobjects?.edges?.length ?? 0;
      entryInfo = `${count} Einträge`;
    } catch { /* ignore */ }

    result.push({
      id: def.id,
      title: def.name,
      handle: def.type,
      name: `${def.name} (${entryInfo})`,
      type: def.type,
      fieldDefinitions: def.fieldDefinitions,
    });
  }
  return result;
}

// Fetch metafield definitions for a specific owner type via GraphQL
export async function fetchMetafieldDefinitions(shopUrl: string, accessToken: string, ownerType: string) {
  const query = `{
    metafieldDefinitions(ownerType: ${ownerType}, first: 100) {
      edges {
        node {
          id
          name
          namespace
          key
          type { name }
          description
          ownerType
        }
      }
    }
  }`;

  const data = await shopifyProxy({ shopUrl, accessToken, graphql: { query } });
  
  return data?.data?.metafieldDefinitions?.edges?.map((e: any) => ({
    id: `${e.node.namespace}.${e.node.key}`,
    title: e.node.name,
    name: e.node.name,
    handle: `${e.node.namespace}.${e.node.key}`,
    namespace: e.node.namespace,
    key: e.node.key,
    typeName: e.node.type?.name,
    description: e.node.description,
    ownerType: e.node.ownerType,
  })) ?? [];
}
