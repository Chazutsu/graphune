import { t } from "@/i18n";
import { sanitizeFilename } from "@/utils/sanitize-filename";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface ArticleHeaderProps {
	title: string;
	path: string;
	frontmatter: Record<string, unknown>;
	onRename: (newTitle: string) => void;
	onPropertyChange: (key: string, value: unknown) => void;
	onPropertyDelete: (key: string) => void;
	onPropertyAdd: (key: string, value: unknown) => void;
	autoFocusTitle?: boolean;
	onTitleFocused?: () => void;
}

function TagPills({
	tags,
	onRemove,
}: {
	tags: string[];
	onRemove: (index: number) => void;
}): React.ReactElement {
	return (
		<div className="multi-select-container">
			{tags.map((tag, index) => (
				<span key={tag} className="multi-select-pill">
					<span className="multi-select-pill-content">{tag}</span>
					<button
						type="button"
						aria-label={t("article.removeTag", { tag })}
						className="multi-select-pill-remove-button"
						onClick={() => onRemove(index)}
					>
						×
					</button>
				</span>
			))}
		</div>
	);
}

function PropertyRow({
	propKey,
	value,
	onPropertyChange,
	onPropertyDelete,
}: {
	propKey: string;
	value: unknown;
	onPropertyChange: (key: string, value: unknown) => void;
	onPropertyDelete: (key: string) => void;
}): React.ReactElement {
	const [editValue, setEditValue] = useState(String(value));

	const [prevValue, setPrevValue] = useState(value);
	if (value !== prevValue) {
		setPrevValue(value);
		setEditValue(String(value));
	}

	const handleBlur = () => {
		if (editValue !== String(value)) {
			onPropertyChange(propKey, editValue);
		}
	};

	return (
		<div className="metadata-property" data-property-key={propKey}>
			<span className="metadata-property-key">
				<span className="metadata-property-key-text">{propKey}</span>
			</span>
			<div className="metadata-property-value">
				<input
					className="metadata-input-longtext"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={handleBlur}
				/>
			</div>
			<button
				type="button"
				aria-label={t("article.delete", { key: propKey })}
				className="metadata-property-delete clickable-icon"
				onClick={() => onPropertyDelete(propKey)}
			>
				×
			</button>
		</div>
	);
}

function AddPropertyForm({
	onAdd,
	onCancel,
}: {
	onAdd: (key: string, value: string) => void;
	onCancel: () => void;
}): React.ReactElement {
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");

	const handleSubmit = () => {
		if (!key.trim()) {
			return;
		}
		onAdd(key.trim(), value);
		setKey("");
		setValue("");
	};

	return (
		<div className="metadata-property metadata-property--add">
			<input
				className="metadata-input-longtext"
				placeholder={t("article.key")}
				value={key}
				onChange={(e) => setKey(e.target.value)}
			/>
			<input
				className="metadata-input-longtext"
				placeholder={t("article.value")}
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
			<button type="button" className="clickable-icon" onClick={handleSubmit}>
				{t("article.add")}
			</button>
			<button type="button" className="clickable-icon" onClick={onCancel}>
				{t("article.cancel")}
			</button>
		</div>
	);
}

export function ArticleHeader({
	title,
	path,
	frontmatter,
	onRename,
	onPropertyChange,
	onPropertyDelete,
	onPropertyAdd,
	autoFocusTitle = false,
	onTitleFocused,
}: ArticleHeaderProps): React.ReactElement {
	const [editTitle, setEditTitle] = useState(title);
	const [showAddForm, setShowAddForm] = useState(false);
	const committedTitleRef = useRef<string | null>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!autoFocusTitle) return;
		titleInputRef.current?.focus();
		titleInputRef.current?.select();
		onTitleFocused?.();
	}, [autoFocusTitle, onTitleFocused]);

	const commitTitle = () => {
		const sanitizedTitle = sanitizeFilename(editTitle);
		setEditTitle(sanitizedTitle);
		if (sanitizedTitle !== title && sanitizedTitle !== committedTitleRef.current) {
			committedTitleRef.current = sanitizedTitle;
			onRename(sanitizedTitle);
		}
	};

	const handleTitleBlur = () => {
		commitTitle();
	};

	const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			commitTitle();
			e.currentTarget.blur();
		} else if (e.key === "Escape") {
			setEditTitle(title);
			e.currentTarget.blur();
		}
	};

	const entries = Object.entries(frontmatter);
	const hasProperties = entries.length > 0;

	return (
		<div className="article-header">
			<input
				ref={titleInputRef}
				className="article-header-title"
				aria-label={t("article.title")}
				value={editTitle}
				onChange={(e) => {
					committedTitleRef.current = null;
					setEditTitle(e.target.value);
				}}
				onBlur={handleTitleBlur}
				onKeyDown={handleTitleKeyDown}
			/>
			<details className="article-header-details">
				<summary className="article-header-details__summary">
					{t("article.properties", { count: entries.length })}
				</summary>
				<div className="article-header-path">{path}</div>
				{hasProperties && (
					<div className="metadata-container">
						<div className="metadata-content">
							<div className="metadata-properties">
								{entries.map(([key, value]) => {
									if (key === "tags" && Array.isArray(value)) {
										return (
											<div
												key={key}
												className="metadata-property"
												data-property-key={key}
												data-property-type="tags"
											>
												<span className="metadata-property-key">
													<span className="metadata-property-key-text">{key}</span>
												</span>
												<div className="metadata-property-value">
													<TagPills
														tags={value as string[]}
														onRemove={(index) => {
															const newTags = (value as string[]).filter((_, i) => i !== index);
															onPropertyChange("tags", newTags);
														}}
													/>
												</div>
												<button
													type="button"
													aria-label={t("article.delete", { key })}
													className="metadata-property-delete clickable-icon"
													onClick={() => onPropertyDelete(key)}
												>
													×
												</button>
											</div>
										);
									}
									return (
										<PropertyRow
											key={key}
											propKey={key}
											value={value}
											onPropertyChange={onPropertyChange}
											onPropertyDelete={onPropertyDelete}
										/>
									);
								})}
							</div>
						</div>
					</div>
				)}
				{showAddForm ? (
					<AddPropertyForm
						onAdd={(key, value) => {
							onPropertyAdd(key, value);
							setShowAddForm(false);
						}}
						onCancel={() => setShowAddForm(false)}
					/>
				) : (
					<button
						type="button"
						className="metadata-add-button"
						onClick={() => setShowAddForm(true)}
					>
						{t("article.addProperty")}
					</button>
				)}
			</details>
		</div>
	);
}
