/**
 * ScoreBadge 组件单元测试
 * 验证各分数区间的颜色映射、尺寸、标签显示。
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ScoreBadge from "@/components/ScoreBadge";

describe("ScoreBadge", () => {
  it("渲染分数值", () => {
    render(<ScoreBadge score={85} />);
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("显示标签前缀", () => {
    render(<ScoreBadge score={90} label="IMP" />);
    expect(screen.getByText("IMP")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("分数 >= 88 显示高亮绿色（emerald-500）", () => {
    const { container } = render(<ScoreBadge score={92} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-emerald-500/20");
    expect(badge.className).toContain("score-glow-high");
  });

  it("分数 >= 80 且 < 88 显示标准绿色（emerald-600）", () => {
    const { container } = render(<ScoreBadge score={82} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-emerald-600/15");
    expect(badge.className).toContain("score-glow-mid");
  });

  it("分数 >= 70 且 < 80 显示黄色（yellow-600）", () => {
    const { container } = render(<ScoreBadge score={75} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-yellow-600/15");
    expect(badge.className).toContain("text-yellow-500");
  });

  it("分数 < 70 显示灰色", () => {
    const { container } = render(<ScoreBadge score={50} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-gray-600/15");
    expect(badge.className).toContain("text-gray-400");
  });

  it("sm 尺寸使用 text-xs", () => {
    const { container } = render(<ScoreBadge score={80} size="sm" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("text-xs");
  });

  it("默认 md 尺寸使用 text-sm", () => {
    const { container } = render(<ScoreBadge score={80} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("text-sm");
  });

  // 边界值测试
  it("临界值 88 属于高亮区间", () => {
    const { container } = render(<ScoreBadge score={88} />);
    expect((container.firstChild as HTMLElement).className).toContain("score-glow-high");
  });

  it("临界值 80 属于标准绿色区间", () => {
    const { container } = render(<ScoreBadge score={80} />);
    expect((container.firstChild as HTMLElement).className).toContain("score-glow-mid");
  });

  it("临界值 70 属于黄色区间", () => {
    const { container } = render(<ScoreBadge score={70} />);
    expect((container.firstChild as HTMLElement).className).toContain("text-yellow-500");
  });

  it("临界值 69 属于灰色区间", () => {
    const { container } = render(<ScoreBadge score={69} />);
    expect((container.firstChild as HTMLElement).className).toContain("text-gray-400");
  });

  it("0 分正常渲染", () => {
    render(<ScoreBadge score={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("100 分正常渲染在高亮区间", () => {
    const { container } = render(<ScoreBadge score={100} />);
    expect((container.firstChild as HTMLElement).className).toContain("score-glow-high");
  });
});
