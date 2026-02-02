export type TransitionType =
	| "none"
	| "fade"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "zoom-in"
	| "zoom-out"
	| "dissolve"
	| "wipe-left"
	| "wipe-right"
	| "wipe-up"
	| "wipe-down"
	| "blur"
	| "rotate"
	| "flip";

export type EasingType =
	| "linear"
	| "ease-in"
	| "ease-out"
	| "ease-in-out";

export interface TransitionConfig {
	type: TransitionType;
	duration: number; // in seconds
	easing: EasingType;
}

export interface ImageSlide {
	/** Image source: URL or base64 data URI */
	src: string;
	/** How long this image is displayed (in seconds, excluding transition time) */
	duration: number;
	/** Transition to apply AFTER this slide (into the next one) */
	transition?: TransitionConfig;
	/** Optional Ken Burns effect */
	kenBurns?: {
		startScale: number;
		endScale: number;
		startPosition: { x: number; y: number };
		endPosition: { x: number; y: number };
	};
}

export interface ImageToVideoRequest {
	slides: ImageSlide[];
	output: {
		width: number;
		height: number;
		fps: number;
		format: "mp4" | "webm";
		quality: "low" | "medium" | "high" | "very_high";
	};
	/** Optional background color (CSS color string) */
	backgroundColor?: string;
}

export interface ImageToVideoProgress {
	phase: "loading" | "rendering" | "encoding";
	progress: number; // 0-1
	currentFrame?: number;
	totalFrames?: number;
}

export interface ImageToVideoResult {
	success: boolean;
	data?: ArrayBuffer;
	mimeType?: string;
	duration?: number;
	error?: string;
}
