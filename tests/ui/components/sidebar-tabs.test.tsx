import { SidebarTabs } from "@/ui/components/sidebar-tabs";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("SidebarTabs", () => {
	it("distinguishes the active Canvas workspace from the vault-wide library", () => {
		render(<SidebarTabs activeTab="card-library" onTabChange={vi.fn()} />);
		expect(screen.getByText("Sources")).toBeDefined();
		expect(screen.getByText("Note")).toBeDefined();
		expect(screen.getByText("Workspace")).toBeDefined();
	});

	it("marks the active tab with accent border", () => {
		const { container } = render(<SidebarTabs activeTab="card-library" onTabChange={vi.fn()} />);
		const tabs = container.querySelectorAll("button");
		expect(tabs[0].classList.contains("border-b-hb-accent")).toBe(true);
		expect(tabs[1].classList.contains("border-b-transparent")).toBe(true);
	});

	it("marks article-viewer tab as active when activeTab is article-viewer", () => {
		const { container } = render(<SidebarTabs activeTab="article-viewer" onTabChange={vi.fn()} />);
		const tabs = container.querySelectorAll("button");
		expect(tabs[0].classList.contains("border-b-transparent")).toBe(true);
		expect(tabs[1].classList.contains("border-b-hb-accent")).toBe(true);
	});

	it("calls onTabChange when Article tab is clicked", () => {
		const onTabChange = vi.fn();
		render(<SidebarTabs activeTab="card-library" onTabChange={onTabChange} />);

		fireEvent.click(screen.getByText("Note"));
		expect(onTabChange).toHaveBeenCalledWith("article-viewer");
	});

	it("calls onTabChange with card-library when Card Library tab is clicked", () => {
		const onTabChange = vi.fn();
		render(<SidebarTabs activeTab="article-viewer" onTabChange={onTabChange} />);

		fireEvent.click(screen.getByText("Sources"));
		expect(onTabChange).toHaveBeenCalledWith("card-library");
	});

	it("calls onTabChange when Current Canvas tab is clicked", () => {
		const onTabChange = vi.fn();
		render(<SidebarTabs activeTab="card-library" onTabChange={onTabChange} />);

		fireEvent.click(screen.getByText("Workspace"));
		expect(onTabChange).toHaveBeenCalledWith("canvas-search");
	});

	it("applies flex layout to container", () => {
		const { container } = render(<SidebarTabs activeTab="card-library" onTabChange={vi.fn()} />);
		expect(container.querySelector(".flex.border-b")).not.toBeNull();
	});

	it("uses the supplied instance prefix for tab and panel relationships", () => {
		render(<SidebarTabs idPrefix="sidebar-a" activeTab="card-library" onTabChange={vi.fn()} />);
		const tab = screen.getByRole("tab", { name: "Sources" });
		expect(tab.id).toBe("sidebar-a-tab-card-library");
		expect(tab.getAttribute("aria-controls")).toBe("sidebar-a-panel-card-library");
	});
});
