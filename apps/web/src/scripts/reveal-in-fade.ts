// Scrolls a list whose edges fade so that one of its items is fully visible.

export function revealInFade(list: Element, item: Element, behavior: ScrollBehavior = "smooth") {
	if (list.clientHeight === 0) return;

	const style = getComputedStyle(list);
	const fadeStart = parseFloat(style.scrollPaddingBlockStart) || 0;
	const fadeEnd = parseFloat(style.scrollPaddingBlockEnd) || 0;
	const view = list.getBoundingClientRect();
	const box = item.getBoundingClientRect();
	if (box.top >= view.top + fadeStart && box.bottom <= view.bottom - fadeEnd) return;

	const offset = box.top - view.top + list.scrollTop;
	const max = list.scrollHeight - list.clientHeight;
	const centered = offset + box.height / 2 - list.clientHeight / 2;
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
	list.scrollTo({ top: Math.min(Math.max(centered, 0), max), behavior: reduce ? "instant" : behavior });
}
