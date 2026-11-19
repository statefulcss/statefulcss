// Shows each code block's copy button and copies the block's code when it's clicked.
//
// One click listener on the document keeps working across <ClientRouter /> page swaps; the
// buttons are shown again after every navigation. Without the Clipboard API (an insecure
// origin), they stay hidden.

const BUTTON = '.code-block > [data-part="copy"]';
const COPIED_FOR = 2000;

/** The code as written: every line except the ones a diff marks as removed. */
export function codeText(block: Element): string {
	const lines = block.querySelectorAll('[data-part="code"] .line:not(.remove)');
	if (lines.length === 0) return block.querySelector('[data-part="code"]')?.textContent ?? "";
	return Array.from(lines, (line) => line.textContent ?? "").join("\n");
}

function showButtons() {
	if (!navigator.clipboard) return;
	for (const button of document.querySelectorAll<HTMLButtonElement>(BUTTON)) button.hidden = false;
}

async function copy(event: MouseEvent) {
	const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(BUTTON) : null;
	const block = button?.closest(".code-block");
	if (!button || !block) return;

	try {
		await navigator.clipboard.writeText(codeText(block));
	} catch {
		return;
	}

	button.textContent = "Copied";
	button.toggleAttribute("data-copied", true);
	setTimeout(() => {
		button.textContent = "Copy";
		button.toggleAttribute("data-copied", false);
	}, COPIED_FOR);
}

document.addEventListener("astro:page-load", showButtons);
document.addEventListener("click", (event) => void copy(event));
