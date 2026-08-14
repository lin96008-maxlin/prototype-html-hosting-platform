"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Eye, FileCode2, LoaderCircle, Search } from "lucide-react";
import type { BusinessCategory, PrototypeProject } from "@/lib/types";
import { Pagination } from "@/components/pagination";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PublicSquare({ projects, categories, demoUrl }: {
  projects: PrototypeProject[];
  categories: BusinessCategory[];
  demoUrl: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"updated" | "visits">("updated");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const visible = useMemo(() => projects
    .filter((project) => category === "all" || project.categoryId === category)
    .filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === "visits"
      ? b.visitCount - a.visitCount
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [category, projects, search, sort]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedProjects = visible.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    const refreshVisits = () => router.refresh();
    window.addEventListener("focus", refreshVisits);
    return () => window.removeEventListener("focus", refreshVisits);
  }, [router]);

  return (
    <section className="square-page">
      <header className="square-head">
        <div><h1>公开广场</h1></div>
        <label className="search-box"><input className="ui-input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索公开原型" /><Search size={15} /></label>
      </header>
      <div className="category-tabs">
        <button className={category === "all" ? "is-active" : ""} type="button" onClick={() => { setCategory("all"); setPage(1); }}>全部</button>
        {categories.filter((item) => item.enabled).map((item) => <button className={category === item.id ? "is-active" : ""} type="button" key={item.id} onClick={() => { setCategory(item.id); setPage(1); }}>{item.name}</button>)}
      </div>
      <div className="square-toolbar"><span>共 {visible.length} 个公开原型</span><span className="sort-segment"><button className={sort === "updated" ? "is-active" : ""} type="button" onClick={() => { setSort("updated"); setPage(1); }}><CalendarClock size={14} />最近更新</button><button className={sort === "visits" ? "is-active" : ""} type="button" onClick={() => { setSort("visits"); setPage(1); }}><Eye size={14} />访问最多</button></span></div>
      <div className="square-results">
      {visible.length ? <div className="prototype-grid square-grid">{pagedProjects.map((project, index) => (
        <a className="prototype-card square-card" href={`${demoUrl}/project/${project.publicCode}/`} target="_blank" rel="noreferrer" key={project.id}>
          <span className="prototype-preview">
            {project.previewUrl ? <Image src={project.previewUrl} alt={`${project.name}首页预览`} fill sizes="(max-width:900px) 100vw, 360px" loading={index < 12 ? "eager" : "lazy"} unoptimized /> : <span className={`preview-loading${project.previewStatus === "failed" ? " is-failed" : ""}`}><LoaderCircle size={28} />{project.previewStatus === "failed" ? "预览图生成失败" : "预览图生成中"}</span>}
            <i><Eye size={14} />{project.visitCount}</i>
          </span>
          <span className="prototype-card-body">
            <span className="prototype-title-row">
              <b className="prototype-name" title={project.name}>{project.name}</b>
              <span className="prototype-title-tags"><span className="status-tag status-tag-success">{project.categoryName}</span></span>
            </span>
            <span className="prototype-meta"><span>{project.ownerName} · {project.departmentName}</span><span>{formatDate(project.updatedAt)} 更新</span></span>
          </span>
        </a>
      ))}</div> : <div className="empty-state"><FileCode2 size={42} /><b>暂无符合条件的公开原型</b></div>}
      </div>
      {visible.length ? <Pagination total={visible.length} page={safePage} pageSize={pageSize} pageSizeOptions={[12, 24, 48]} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} /> : null}
    </section>
  );
}
