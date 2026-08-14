"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { PlatformSelect } from "@/components/platform-select";

function pageItems(page: number, pageCount: number) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const values: Array<number | "ellipsis"> = [1];
  if (page > 4) values.push("ellipsis");
  for (let value = Math.max(2, page - 1); value <= Math.min(pageCount - 1, page + 1); value += 1) {
    values.push(value);
  }
  if (page < pageCount - 3) values.push("ellipsis");
  values.push(pageCount);
  return values;
}

export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const jumpInput = useRef<HTMLInputElement>(null);

  function jumpToPage() {
    const target = Math.min(pageCount, Math.max(1, Number.parseInt(jumpInput.current?.value ?? "", 10) || page));
    if (jumpInput.current) jumpInput.current.value = String(target);
    onPageChange(target);
  }

  return (
    <footer className="data-pagination" aria-label="分页">
      <span className="data-pagination-total">共 {total} 条</span>
      <PlatformSelect
        className="data-pagination-size"
        placement="top"
        value={String(pageSize)}
        onChange={(value) => onPageSizeChange(Number(value))}
        options={pageSizeOptions.map((value) => ({ value: String(value), label: `${value} 条/页` }))}
      />
      <div className="data-pagination-pages">
        <button type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button>
        {pageItems(page, pageCount).map((item, index) => item === "ellipsis"
          ? <span className="data-pagination-ellipsis" key={`ellipsis-${index}`}>...</span>
          : <button className={item === page ? "is-active" : ""} type="button" key={item} onClick={() => onPageChange(item)}>{item}</button>)}
        <button type="button" aria-label="下一页" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button>
      </div>
      <label className="data-pagination-jump">前往<input key={page} ref={jumpInput} defaultValue={page} inputMode="numeric" aria-label="跳转页码" onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, ""); }} onBlur={jumpToPage} onKeyDown={(event) => event.key === "Enter" && jumpToPage()} />页</label>
    </footer>
  );
}
