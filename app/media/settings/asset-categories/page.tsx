import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  updateAssetCategoryAction,
  createCategoryAction,
  renameCategoryAction,
  toggleCategoryActiveAction,
  deleteCategoryAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  supplier?: string;
  category?: string;
  page?: string;
  error?: string;
  notice?: string;
}

export default async function AssetCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMediaUser("settings");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const category = params.category ?? "ALL";

  const allCategories = await prisma.assetCategory.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { assets: true } } },
  });

  const where: Prisma.AssetWhereInput = {};
  if (category !== "ALL") where.mediaCategoryId = category;
  if (params.supplier) where.supplierId = params.supplier;
  if (params.q) {
    where.OR = [
      { assetName: { contains: params.q, mode: "insensitive" } },
      { assetCode: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const [suppliers, total, assets] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: [{ supplier: { name: "asc" } }, { assetName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const activeCategoriesForAssignment = allCategories.filter((c) => c.isActive);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAssets = allCategories.reduce((s, c) => s + c._count.assets, 0);

  const buildHref = (overrides: Partial<SearchParams>) => {
    const merged = { ...params, ...overrides };
    const qs = new URLSearchParams();
    if (merged.q) qs.set("q", merged.q);
    if (merged.supplier) qs.set("supplier", merged.supplier);
    if (merged.category) qs.set("category", merged.category);
    if (merged.page) qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/media/settings/asset-categories?${s}` : "/media/settings/asset-categories";
  };
  const returnTo = buildHref({ category, page: String(page) });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Asset Categories"
        subtitle={
          <>
            Categories are managed here, not fixed in code — add, rename, deactivate, or delete one below. Every
            asset migrated from Excel — and most rate-card ingestions since — defaults to &quot;Other&quot;;
            assign the real category using the filter and table further down.
          </>
        }
      />

      {params.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{params.error}</div>
      )}
      {params.notice && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{params.notice}</div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Manage categories</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium text-right">Assets</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {allCategories.map((c) => (
              <tr key={c.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <form action={renameCategoryAction} className="inline-flex items-center gap-1.5">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input
                      type="text"
                      name="name"
                      defaultValue={c.name}
                      className="text-sm rounded border border-border bg-background px-1.5 py-0.5 w-48"
                    />
                    <button type="submit" className="text-xs text-accent underline shrink-0">
                      Rename
                    </button>
                  </form>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{c._count.assets}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border ${
                      c.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}
                  >
                    {c.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3 justify-end">
                    <form action={toggleCategoryActiveAction}>
                      <input type="hidden" name="categoryId" value={c.id} />
                      <button type="submit" className="text-xs text-accent underline">
                        {c.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                    <form action={deleteCategoryAction}>
                      <input type="hidden" name="categoryId" value={c.id} />
                      <button
                        type="submit"
                        disabled={c._count.assets > 0}
                        className="text-xs text-[var(--danger)] underline disabled:text-gray-300 disabled:no-underline disabled:cursor-not-allowed"
                        title={c._count.assets > 0 ? "Reassign or remove its assets first" : "Delete permanently"}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form action={createCategoryAction} className="flex items-end gap-3 mt-4 max-w-md">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">New category</label>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Digital Billboard"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium shrink-0">
            Add Category
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-foreground mb-3">Assign categories to assets</h2>

        <div className="flex flex-wrap gap-2">
          <a
            href={buildHref({ category: "ALL", page: "1" })}
            className={`text-xs px-2 py-1 rounded border ${
              category === "ALL" ? "bg-accent text-accent-foreground border-accent" : "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            ALL ({totalAssets})
          </a>
          {allCategories.map((c) => (
            <a
              key={c.id}
              href={buildHref({ category: c.id, page: "1" })}
              className={`text-xs px-2 py-1 rounded border ${
                category === c.id ? "bg-accent text-accent-foreground border-accent" : "bg-gray-50 text-gray-700 border-gray-200"
              }`}
            >
              {c.name} ({c._count.assets})
            </a>
          ))}
        </div>

        <form className="flex flex-wrap items-center gap-3 mt-4" action="/media/settings/asset-categories">
          <input type="hidden" name="category" value={category} />
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search asset name or code…"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm w-64"
          />
          <select name="supplier" defaultValue={params.supplier ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
            Filter
          </button>
        </form>

        <p className="text-xs text-muted mt-3">{total.toLocaleString()} assets</p>

        <table className="w-full text-sm border-collapse mt-2">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Asset</th>
              <th className="py-2 pr-4 font-medium">Supplier</th>
              <th className="py-2 pr-4 font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <div className="text-foreground">{a.assetName}</div>
                  <div className="text-xs text-muted font-mono">{a.assetCode}</div>
                </td>
                <td className="py-2 pr-4 text-muted">{a.supplier.name}</td>
                <td className="py-2 pr-4">
                  <form action={updateAssetCategoryAction} className="inline-flex items-center gap-1.5">
                    <input type="hidden" name="assetId" value={a.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <select
                      name="mediaCategoryId"
                      defaultValue={a.mediaCategoryId}
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5"
                    >
                      {activeCategoriesForAssignment.some((c) => c.id === a.mediaCategoryId)
                        ? null
                        : (() => {
                            const current = allCategories.find((c) => c.id === a.mediaCategoryId);
                            return current ? (
                              <option value={current.id}>{current.name} (inactive)</option>
                            ) : null;
                          })()}
                      {activeCategoriesForAssignment.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs text-accent underline">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted">
                  No assets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <div className="flex items-center gap-3 mt-4 text-sm">
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            {page > 1 && (
              <a href={buildHref({ page: String(page - 1) })} className="text-accent underline">
                Previous
              </a>
            )}
            {page < pageCount && (
              <a href={buildHref({ page: String(page + 1) })} className="text-accent underline">
                Next
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
