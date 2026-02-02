import type { EasingType } from "@/types/transitions";

export function applyEasing(t: number, easing: EasingType): number {
	const clamped = Math.max(0, Math.min(1, t));

	switch (easing) {
		case "linear":
			return clamped;
		case "ease-in":
			return clamped * clamped * clamped;
		case "ease-out":
			return 1 - (1 - clamped) ** 3;
		case "ease-in-out":
			return clamped < 0.5
				? 4 * clamped * clamped * clamped
				: 1 - (-2 * clamped + 2) ** 3 / 2;
		default:
			return clamped;
	}
}
