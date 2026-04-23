import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { AutocompleteSearchInput } from "@/components/autocomplete-search-input";
import { CustomerCreateForm } from "@/components/customer-create-form";
import { CustomerEditModal } from "@/components/customer-edit-modal";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

type DebtHistoryItem = {
  id: string;
  code: string;
  createdAt: Date;
  grandTotal: number;
  paidAmount: number;
  debtAmount: number;
  note: string | null;
};

export default async function CustomersPage({
  searchParams
}: {
  searchParams?: { q?: string; debt?: string };
}) {
  const session = await requireSession(["ADMIN", "MANAGER", "CASHIER"]);
  const canManageCustomers = session.role !== "CASHIER";
  const canSeeCustomerPrivateFields = session.role !== "CASHIER";
  const q = searchParams?.q ?? "";
  const debtFilter = searchParams?.debt ?? "default";

  const customerWhere = {
    NOT: { code: "KH000000" },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [customers, customerCount, groups] = await Promise.all([
    prisma.customer.findMany({
      where: customerWhere,
      orderBy: { code: "desc" },
      take: 1000
    }),
    prisma.customer.count({ where: customerWhere }),
    prisma.customerGroup.findMany({ orderBy: { name: "asc" } })
  ]);

  const customerIds = customers.map((customer) => customer.id);

  const [orderDebtByCustomer, debtOrders] = customerIds.length
    ? await Promise.all([
        prisma.order.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            status: { in: ["COMPLETED", "PARTIAL"] }
          },
          _sum: { debtAmount: true }
        }),
        prisma.order.findMany({
          where: {
            customerId: { in: customerIds },
            status: { in: ["COMPLETED", "PARTIAL"] }
          },
          select: {
            id: true,
            code: true,
            createdAt: true,
            grandTotal: true,
            paidAmount: true,
            debtAmount: true,
            note: true,
            customerId: true
          },
          orderBy: [{ createdAt: "desc" }]
        })
      ])
    : [[], []];

  const orderDebtMap = new Map(
    orderDebtByCustomer.map((item) => [item.customerId, Number(item._sum.debtAmount ?? 0)])
  );

  const debtHistoryMap = debtOrders.reduce<Map<string, DebtHistoryItem[]>>((map, order) => {
    const debtAmount = Number(order.debtAmount ?? 0);
    if (debtAmount <= 0) return map;

    const currentEntries = map.get(order.customerId) ?? [];
    currentEntries.push({
      id: order.id,
      code: order.code,
      createdAt: order.createdAt,
      grandTotal: Number(order.grandTotal),
      paidAmount: Number(order.paidAmount),
      debtAmount,
      note: order.note
    });
    map.set(order.customerId, currentEntries);
    return map;
  }, new Map());

  const filteredCustomers = customers
    .map((customer) => ({
      ...customer,
      totalDebt: Number(customer.openingDebt) + (orderDebtMap.get(customer.id) ?? 0),
      debtHistory: debtHistoryMap.get(customer.id) ?? []
    }))
    .filter((customer) => (debtFilter === "has_debt" ? customer.totalDebt > 0 : true))
    .sort((a, b) => {
      if (debtFilter === "debt_desc") return b.totalDebt - a.totalDebt;
      if (debtFilter === "debt_asc") return a.totalDebt - b.totalDebt;
      return 0;
    });

  const groupOptions = groups.map((group) => ({ id: group.id, name: group.name }));
  const customerSuggestions = customers.map((customer) => ({
    label: customer.name,
    value: customer.name,
    meta: [customer.code, customer.phone].filter(Boolean).join(" • ")
  }));

  const renderDebtHistory = (customerId: string, totalDebt: number, compact = false) => {
    const entries = debtHistoryMap.get(customerId) ?? [];

    if (!entries.length) {
      return (
        <div className={`rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 ${compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm sm:text-base"}`}>
          Không có công nợ từ hóa đơn.
        </div>
      );
    }

    return (
      <details className="rounded-2xl border border-red-100 bg-red-50/60">
        <summary className={`cursor-pointer list-none font-semibold text-red-700 ${compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm sm:text-base"}`}>
          Chi tiết công nợ ({entries.length} hóa đơn)
        </summary>
        <div className={`space-y-2 border-t border-red-100 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
          <div className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 sm:text-sm">
            Tổng công nợ hiện tại: <span className="font-bold text-red-600">{formatCurrency(totalDebt)}</span>
          </div>
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/orders/${entry.id}`} className="text-sm font-bold text-emerald-700 underline-offset-2 hover:underline sm:text-base">
                    {entry.code}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500 sm:text-sm">Ngày tạo: {formatDate(entry.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 sm:text-sm">Còn nợ</p>
                  <p className="text-sm font-bold text-red-600 sm:text-base">{formatCurrency(entry.debtAmount)}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 sm:text-sm">
                <div>
                  <span className="font-medium text-slate-500">Tổng hóa đơn:</span> {formatCurrency(entry.grandTotal)}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Đã trả:</span> {formatCurrency(entry.paidAmount)}
                </div>
              </div>
              {entry.note ? (
                <p className="mt-2 text-xs leading-relaxed text-slate-500 sm:text-sm">
                  <span className="font-medium">Ghi chú:</span> {entry.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </details>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppHeader title="Khách hàng" description={`${customerCount} khách hàng`} session={session} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <form className="flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <AutocompleteSearchInput
            name="q"
            defaultValue={q}
            placeholder="Tìm theo tên, mã, SĐT..."
            suggestions={customerSuggestions}
            className="sm:min-w-[280px]"
          />
          <select
            name="debt"
            defaultValue={debtFilter}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm shadow-soft outline-none sm:h-14 sm:text-lg"
          >
            <option value="default">Mặc định</option>
            <option value="debt_desc">Nợ cao đến thấp</option>
            <option value="debt_asc">Nợ thấp đến cao</option>
            <option value="has_debt">Chỉ khách còn nợ</option>
          </select>
          <button className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft sm:h-14 sm:px-5 sm:text-lg">
            Lọc
          </button>
        </form>
        {canManageCustomers ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-2xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-soft sm:px-6 sm:py-4 sm:text-2xl">
                + Thêm KH
              </summary>
              <div className="absolute right-0 top-16 z-20 w-[92vw] max-w-[460px] sm:top-20">
                <CustomerCreateForm groups={groupOptions} />
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:hidden">
        {filteredCustomers.map((customer) => (
          <div key={customer.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9rem] font-semibold uppercase tracking-wide text-slate-400">{customer.code}</p>
                <p className="mt-1 text-[1.2rem] font-bold leading-snug text-slate-900">{customer.name}</p>
              </div>
              {canManageCustomers ? (
                <CustomerEditModal
                  customer={{
                    id: customer.id,
                    code: customer.code,
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    address: customer.address,
                    note: customer.note,
                    groupId: customer.groupId,
                    openingDebt: Number(customer.openingDebt),
                    currentDebt: Number(customer.openingDebt) + (orderDebtMap.get(customer.id) ?? 0)
                  }}
                  groups={groupOptions}
                />
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">{canSeeCustomerPrivateFields ? "Số điện thoại" : "Thông tin"}</p>
                <p className="mt-1 text-[1rem] font-semibold text-slate-800">{canSeeCustomerPrivateFields ? customer.phone || "-" : "Đã ẩn với nhân viên"}</p>
              </div>
              <div>
                <p className="text-[0.85rem] font-medium text-slate-400">Công nợ</p>
                <p className="mt-1 text-[1.15rem] font-bold text-red-600">{formatCurrency(customer.totalDebt)}</p>
              </div>
            </div>

            {canSeeCustomerPrivateFields ? (
              <div className="mt-3">
                <p className="text-[0.85rem] font-medium text-slate-400">Địa chỉ</p>
                <p className="mt-1 text-[1rem] leading-relaxed text-slate-700">{customer.address || "-"}</p>
              </div>
            ) : null}

            <div className="mt-3">{renderDebtHistory(customer.id, customer.totalDebt, true)}</div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft sm:block">
        <table className={`text-left ${canSeeCustomerPrivateFields ? "min-w-[980px]" : "min-w-[840px]"}`}>
          <thead className="bg-slate-50 text-[15px] font-semibold text-slate-500 sm:text-xl">
            <tr>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Mã KH</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Tên</th>
              {canSeeCustomerPrivateFields ? <th className="px-3 py-3 sm:px-6 sm:py-4">SĐT</th> : null}
              {canSeeCustomerPrivateFields ? <th className="px-3 py-3 sm:px-6 sm:py-4">Địa chỉ</th> : null}
              <th className="px-3 py-3 text-right text-red-600 sm:px-6 sm:py-4">Công nợ</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">Chi tiết công nợ</th>
              {canManageCustomers ? <th className="px-3 py-3 text-right sm:px-6 sm:py-4">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-100 align-top text-[15px] text-slate-700 sm:text-2xl">
                <td className="px-3 py-3 sm:px-6 sm:py-4">{customer.code}</td>
                <td className="px-3 py-3 font-semibold text-slate-900 sm:px-6 sm:py-4">{customer.name}</td>
                {canSeeCustomerPrivateFields ? <td className="px-3 py-3 sm:px-6 sm:py-4">{customer.phone}</td> : null}
                {canSeeCustomerPrivateFields ? <td className="px-3 py-3 sm:px-6 sm:py-4">{customer.address || "-"}</td> : null}
                <td className="px-3 py-3 text-right font-semibold text-red-600 sm:px-6 sm:py-4">
                  {formatCurrency(customer.totalDebt)}
                </td>
                <td className="px-3 py-3 sm:px-6 sm:py-4">
                  {renderDebtHistory(customer.id, customer.totalDebt)}
                </td>
                {canManageCustomers ? (
                  <td className="px-3 py-3 text-right sm:px-6 sm:py-4">
                    <CustomerEditModal
                      customer={{
                        id: customer.id,
                        code: customer.code,
                        name: customer.name,
                        phone: customer.phone,
                        email: customer.email,
                        address: customer.address,
                        note: customer.note,
                        groupId: customer.groupId,
                        openingDebt: Number(customer.openingDebt),
                        currentDebt: Number(customer.openingDebt) + (orderDebtMap.get(customer.id) ?? 0)
                      }}
                      groups={groupOptions}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
