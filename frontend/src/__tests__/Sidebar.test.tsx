/**
 * Sidebar 组件单元测试
 * 验证导航项渲染、Tab 切换回调、统计数字徽章、收起/展开功能。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "@/components/Sidebar";
import { createStats } from "./fixtures";

describe("Sidebar", () => {
  const defaultProps = {
    activeTab: "feed",
    onTabChange: vi.fn(),
    stats: createStats({ selected: 42 }),
  };

  it("渲染所有 6 个导航项", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("精选资讯")).toBeInTheDocument();
    expect(screen.getByText("全部文章")).toBeInTheDocument();
    expect(screen.getByText("收藏")).toBeInTheDocument();
    expect(screen.getByText("数据面板")).toBeInTheDocument();
    expect(screen.getByText("信源管理")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("当前 Tab 高亮", () => {
    render(<Sidebar {...defaultProps} activeTab="stats" />);
    const statsBtn = screen.getByText("数据面板").closest("button")!;
    expect(statsBtn.className).toContain("text-dark-accent");
  });

  it("点击导航项触发 onTabChange 回调", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<Sidebar {...defaultProps} onTabChange={onTabChange} />);

    await user.click(screen.getByText("全部文章"));
    expect(onTabChange).toHaveBeenCalledWith("all");

    await user.click(screen.getByText("收藏"));
    expect(onTabChange).toHaveBeenCalledWith("starred");

    await user.click(screen.getByText("设置"));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("精选资讯 Tab 显示 selected 数字徽章", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("stats 为 null 时不显示数字徽章", () => {
    render(<Sidebar {...defaultProps} stats={null} />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("显示 AgentNews logo 文字", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("AgentNews")).toBeInTheDocument();
    expect(screen.getByText("AN")).toBeInTheDocument();
  });

  it("点击收起按钮后隐藏文字标签", async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    // 初始展开状态，能看到 "AgentNews" 文字
    expect(screen.getByText("AgentNews")).toBeInTheDocument();

    // 找到收起按钮（aside 的最后一个直接子元素 <button>）
    const sidebar = screen.getByText("AgentNews").closest("aside")!;
    const collapseBtn = sidebar.children[sidebar.children.length - 1] as HTMLElement;
    await user.click(collapseBtn);

    // 收起后 "AgentNews" 文字不再显示
    expect(screen.queryByText("AgentNews")).not.toBeInTheDocument();
  });

  it("收起再展开恢复完整显示", async () => {
    const user = userEvent.setup();
    render(<Sidebar {...defaultProps} />);

    const sidebar = screen.getByText("AgentNews").closest("aside")!;
    const collapseBtn = sidebar.children[sidebar.children.length - 1] as HTMLElement;

    // 收起
    await user.click(collapseBtn);
    expect(screen.queryByText("精选资讯")).not.toBeInTheDocument();

    // 展开
    await user.click(collapseBtn);
    expect(screen.getByText("精选资讯")).toBeInTheDocument();
  });
});
