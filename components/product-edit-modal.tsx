"use client";

import { ChangeEvent, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productSchema } from "@/lib/validations";
import { useToastStore } from "@/store/toast-store";

type FormValues = z.infer<typeof productSchema>;

type Props = {
  product: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    imageUrl: string | null;
    categoryId: string | null;
    brandId: string | null;
    costPrice: number;
    sellingPrice: number;
    lowStockAlert: number;
    status: "ACTIVE" | "INACTIVE";
    description: string | null;
  };
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
};

export function ProductEditModal({ product, categories, brands }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [imagePreview, setImagePreview] = useState(product.imageUrl || "");
  const pushToast = useToastStore((state) => state.push);

  const defaultValues = useMemo<FormValues>(
    () => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || "",
      imageUrl: product.imageUrl || "",
      categoryId: product.categoryId || "",
      brandId: product.brandId || "",
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      lowStockAlert: product.lowStockAlert,
      status: product.status,
      description: product.description || ""
    }),
    [product]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues
  });

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      form.setValue("imageUrl", result, { shouldDirty: true });
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = await response.json();

      if (!response.ok) {
        pushToast({ title: "Không thể cập nhật sản phẩm", description: payload.error, variant: "error" });
        return;
      }

      pushToast({ title: "Đã cập nhật sản phẩm", description: payload.name });
      setOpen(false);
      window.location.reload();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-base font-semibold text-slate-700 shadow-sm"
      >
        Sửa
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 sm:flex sm:items-center sm:justify-center sm:p-4">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-7 sm:py-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 sm:text-4xl">Sửa sản phẩm</h3>
                <p className="mt-1 text-sm text-slate-500 sm:text-base">{product.sku}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-4xl leading-none text-slate-500 sm:text-5xl">
                ×
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 sm:py-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4">
              <Input placeholder="Tên sản phẩm" {...form.register("name")} className="h-14 text-xl" />
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="SKU" {...form.register("sku")} className="h-14 text-xl" />
                <Input placeholder="Barcode" {...form.register("barcode")} className="h-14 text-xl" />
              </div>
              <Input placeholder="Ảnh sản phẩm URL" {...form.register("imageUrl")} className="h-14 text-xl" />
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="rounded-2xl border border-slate-300 px-4 py-4 text-base"
              />
              {imagePreview || form.watch("imageUrl") ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview || form.watch("imageUrl")}
                    alt={form.watch("name")}
                    className="h-28 w-28 rounded-xl object-cover"
                  />
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("categoryId")}>
                  <option value="">Chọn danh mục</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("brandId")}>
                  <option value="">Chọn thương hiệu</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Input type="number" placeholder="Giá vốn" {...form.register("costPrice", { valueAsNumber: true })} className="h-14 text-xl" />
                <Input
                  type="number"
                  placeholder="Giá bán"
                  {...form.register("sellingPrice", { valueAsNumber: true })}
                  className="h-14 text-xl"
                />
                <Input
                  type="number"
                  placeholder="Ngưỡng cảnh báo"
                  {...form.register("lowStockAlert", { valueAsNumber: true })}
                  className="h-14 text-xl"
                />
              </div>
              <select className="h-14 rounded-2xl border border-slate-300 px-4 text-xl" {...form.register("status")}>
                <option value="ACTIVE">Đang bán</option>
                <option value="INACTIVE">Ngưng bán</option>
              </select>
              <textarea
                rows={4}
                placeholder="Mô tả sản phẩm"
                className="rounded-2xl border border-slate-300 px-4 py-4 text-xl"
                {...form.register("description")}
              />
              <div className="sticky bottom-0 border-t border-slate-100 bg-white pt-4">
              <Button className="h-14 w-full text-2xl" disabled={isPending}>
                {isPending ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
              </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
