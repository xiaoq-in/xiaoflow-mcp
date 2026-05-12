/**
 * Xiaoflow Worker routes under `/api/etsy` (+ linked `/api/user/etsy`).
 * Keep in sync with `backend/src/routes/etsy.ts` and `backend/src/routes/user/etsy.ts`.
 */
export interface RouteCatalogEntry {
    /** HTTP method */
    method: 'GET' | 'POST';
    /** Path segment after `/api/etsy/` (omit leading slash). */
    path: string;
    /** Human-readable summary */
    description: string;
    /** Typical query-string keys */
    queryParams?: string[];
    /** POST JSON body keys when applicable */
    bodyKeys?: string[];
    /** Extra auth / usage notes */
    notes?: string;
}

export const ETSY_ROUTE_CATALOG: RouteCatalogEntry[] = [
    {
        method: 'GET',
        path: 'admin/sync-taxonomy',
        description: 'One-off taxonomy sync to MySQL (internal secret)',
        queryParams: ['secret'],
        notes: 'Must match INTERNAL_API_SECRET, or send x-internal-secret header.',
    },
    {
        method: 'GET',
        path: 'debug-listing',
        description: 'Debug raw Etsy listing payload (no auth middleware in practice — dev only)',
        queryParams: ['listing_id'],
        notes: 'May be absent in production; prefer GET listing.',
    },
    {
        method: 'GET',
        path: 'shop',
        description: 'Shop overview + listings from DB or live enqueue',
        queryParams: ['query', 'refresh', 'page', 'per_page', 'search'],
        notes: 'Costs credits when cold-fetching live; respects 24h sync cooldown.',
    },
    {
        method: 'POST',
        path: 'shop/fetch-listings',
        description: 'Queue background full listings sync for a shop_id',
        bodyKeys: ['shop_id'],
        notes: 'Usage / credits enforced; rate limits.',
    },
    {
        method: 'GET',
        path: 'listing',
        description: 'Single listing from DB or live Etsy fetch',
        queryParams: ['query', 'refresh'],
    },
    {
        method: 'GET',
        path: 'shops',
        description: 'Paginated Etsy shops registry (MySQL)',
        queryParams: ['page', 'per_page', 'search'],
    },
    {
        method: 'GET',
        path: 'listings',
        description: 'Paginated Etsy listings intelligence (filters, joins)',
        queryParams: [
            'page',
            'per_page',
            'search',
            'shop_id',
            'min_sales',
            'max_sales',
            'min_revenue',
            'max_revenue',
            'min_price',
            'max_price',
            'min_rating',
            'min_reviews',
            'category',
            'categories',
            'tags',
            'shop_name',
            'shop_names',
        ],
    },
    {
        method: 'GET',
        path: 'listing/reviews',
        description: 'Listing reviews (DB cache → Etsy)',
        queryParams: ['listing_id', 'limit', 'offset', 'refresh'],
    },
    {
        method: 'GET',
        path: 'shop/reviews',
        description: 'Shop-level reviews (indexed listing reviews → Etsy shop reviews API)',
        queryParams: ['query', 'limit', 'offset', 'refresh'],
    },
    {
        method: 'GET',
        path: 'buyer/{userId}',
        description: 'Cached buyer profile + recent reviews ({userId} = integer path segment)',
        queryParams: [],
        notes: 'Call with path e.g. `buyer/12345` — no curly braces in real URL.',
    },
    {
        method: 'GET',
        path: 'trend',
        description: 'Historical daily stats for shop or listing',
        queryParams: ['type', 'id'],
        notes: '`type`: shop | listing; `id`: string id used in daily_stats.',
    },
    {
        method: 'GET',
        path: 'buyer-search',
        description: 'Search buyer_profiles by numeric id or name substring',
        queryParams: ['query'],
    },
    {
        method: 'GET',
        path: 'category',
        description: 'Category metadata by id / name / slug',
        queryParams: ['id', 'name', 'slug'],
    },
    {
        method: 'GET',
        path: 'categories',
        description: 'List taxonomy categories',
        queryParams: ['parent_id', 'search', 'limit', 'offset'],
    },
    {
        method: 'POST',
        path: 'system/sync-taxonomy',
        description: 'Force taxonomy tree sync via Etsy seller-taxonomy',
        notes: 'Requires authenticated user.',
    },
    {
        method: 'GET',
        path: 'category/listings',
        description: 'Listings within a taxonomy id ( subtree )',
        queryParams: ['category_id', 'limit', 'offset'],
    },
    {
        method: 'GET',
        path: 'shop/tags',
        description: 'Aggregated tags across shop listings',
        queryParams: ['shop_id'],
    },
    {
        method: 'POST',
        path: 'tools/generate',
        description: 'AI helper: tags/title/description for Etsy SEO',
        bodyKeys: ['type', 'keywords', 'category', 'features'],
        notes: 'type: tags | title | description; costs credits.',
    },
];
