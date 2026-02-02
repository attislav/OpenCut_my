import type {
	ImageSlide,
	ImageToVideoProgress,
	ImageToVideoRequest,
	ImageToVideoResult,
	TransitionConfig,
} from "@/types/transitions";
import { applyEasing } from "./easing";
import { renderTransitionFrame } from "./transition-renderer";

type ImgSource = HTMLImageElement | ImageBitmap;

interface SlideTimeline {
	slide: ImageSlide;
	image: ImgSource;
	/** Absolute start time of this slide's visible portion (seconds) */
	startTime: number;
	/** Absolute end time of this slide's visible portion (seconds) */
	endTime: number;
	/** Transition into the NEXT slide (if any) */
	transitionOut?: TransitionConfig & {
		/** Absolute start time of the transition */
		startTime: number;
		/** Absolute end time of the transition */
		endTime: number;
	};
}

export class ImageToVideoService {
	private canvas: OffscreenCanvas | HTMLCanvasElement;
	private ctx:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private fps: number;
	private backgroundColor: string;

	constructor(config: ImageToVideoRequest) {
		this.width = config.output.width;
		this.height = config.output.height;
		this.fps = config.output.fps;
		this.backgroundColor = config.backgroundColor || "#000000";

		if (typeof OffscreenCanvas !== "undefined") {
			this.canvas = new OffscreenCanvas(this.width, this.height);
		} else {
			const canvas = document.createElement("canvas");
			canvas.width = this.width;
			canvas.height = this.height;
			this.canvas = canvas;
		}

		const ctx = this.canvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to create canvas 2D context");
		}
		this.ctx = ctx as
			| OffscreenCanvasRenderingContext2D
			| CanvasRenderingContext2D;
	}

	/**
	 * Load an image from a URL or base64 data URI.
	 */
	private async loadImage(src: string): Promise<ImgSource> {
		// Try fetch + createImageBitmap (works in workers and modern browsers)
		if (typeof createImageBitmap !== "undefined") {
			const response = await fetch(src);
			if (!response.ok) {
				throw new Error(`Failed to load image: ${src} (${response.status})`);
			}
			const blob = await response.blob();
			return createImageBitmap(blob);
		}

		// Fallback to HTMLImageElement
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
			img.src = src;
		});
	}

	/**
	 * Build the timeline: calculate absolute start/end times for each slide
	 * and transition periods.
	 */
	private buildTimeline(
		slides: ImageSlide[],
		images: ImgSource[],
	): { timeline: SlideTimeline[]; totalDuration: number } {
		const timeline: SlideTimeline[] = [];
		let currentTime = 0;

		for (let i = 0; i < slides.length; i++) {
			const slide = slides[i];
			const image = images[i];
			const startTime = currentTime;
			const endTime = startTime + slide.duration;

			const entry: SlideTimeline = {
				slide,
				image,
				startTime,
				endTime,
			};

			// Add transition if this isn't the last slide and has a transition config
			if (
				i < slides.length - 1 &&
				slide.transition &&
				slide.transition.type !== "none"
			) {
				const transDuration = slide.transition.duration;
				entry.transitionOut = {
					...slide.transition,
					startTime: endTime,
					endTime: endTime + transDuration,
				};
				currentTime = endTime + transDuration;
			} else {
				currentTime = endTime;
			}

			timeline.push(entry);
		}

		return { timeline, totalDuration: currentTime };
	}

	/**
	 * Determine what to render at a given time and render it onto the canvas.
	 */
	private renderFrame(time: number, timeline: SlideTimeline[]): void {
		this.ctx.fillStyle = this.backgroundColor;
		this.ctx.fillRect(0, 0, this.width, this.height);

		// Find which slide or transition we're in
		for (let i = 0; i < timeline.length; i++) {
			const entry = timeline[i];

			// During the slide's display time (no transition)
			if (time >= entry.startTime && time < entry.endTime) {
				this.renderSlideWithKenBurns(entry, time);
				return;
			}

			// During the transition out of this slide
			if (
				entry.transitionOut &&
				time >= entry.transitionOut.startTime &&
				time < entry.transitionOut.endTime
			) {
				const nextEntry = timeline[i + 1];
				if (!nextEntry) {
					// No next slide, just show current
					this.renderSlideWithKenBurns(entry, time);
					return;
				}

				const rawProgress =
					(time - entry.transitionOut.startTime) /
					(entry.transitionOut.endTime - entry.transitionOut.startTime);
				const progress = applyEasing(
					rawProgress,
					entry.transitionOut.easing,
				);

				renderTransitionFrame(
					this.ctx,
					entry.image,
					nextEntry.image,
					progress,
					entry.transitionOut.type,
					this.width,
					this.height,
				);
				return;
			}
		}

		// If we're past all slides, show the last one
		const last = timeline[timeline.length - 1];
		if (last) {
			this.drawImageCover(last.image);
		}
	}

	private renderSlideWithKenBurns(
		entry: SlideTimeline,
		time: number,
	): void {
		const { slide, image } = entry;

		if (!slide.kenBurns) {
			this.drawImageCover(image);
			return;
		}

		const kb = slide.kenBurns;
		const slideProgress = (time - entry.startTime) / slide.duration;
		const t = Math.max(0, Math.min(1, slideProgress));

		const scale = kb.startScale + (kb.endScale - kb.startScale) * t;
		const posX =
			kb.startPosition.x + (kb.endPosition.x - kb.startPosition.x) * t;
		const posY =
			kb.startPosition.y + (kb.endPosition.y - kb.startPosition.y) * t;

		this.ctx.save();
		this.ctx.translate(
			this.width / 2 + posX,
			this.height / 2 + posY,
		);
		this.ctx.scale(scale, scale);
		this.ctx.translate(-this.width / 2, -this.height / 2);
		this.drawImageCover(image);
		this.ctx.restore();
	}

	private drawImageCover(img: ImgSource): void {
		const imgW = img.width;
		const imgH = img.height;
		const scale = Math.max(this.width / imgW, this.height / imgH);
		const scaledW = imgW * scale;
		const scaledH = imgH * scale;
		const x = (this.width - scaledW) / 2;
		const y = (this.height - scaledH) / 2;
		this.ctx.drawImage(img, x, y, scaledW, scaledH);
	}

	/**
	 * Generate all frames and return them as an array of ImageData.
	 * This is the core rendering loop, suitable for feeding into an encoder.
	 */
	async generateFrames(
		request: ImageToVideoRequest,
		onProgress?: (progress: ImageToVideoProgress) => void,
	): Promise<{
		frames: (() => ImageData)[];
		totalDuration: number;
		totalFrames: number;
	}> {
		// Phase 1: Load images
		onProgress?.({
			phase: "loading",
			progress: 0,
		});

		const images: ImgSource[] = [];
		for (let i = 0; i < request.slides.length; i++) {
			const img = await this.loadImage(request.slides[i].src);
			images.push(img);
			onProgress?.({
				phase: "loading",
				progress: (i + 1) / request.slides.length,
			});
		}

		// Phase 2: Build timeline
		const { timeline, totalDuration } = this.buildTimeline(
			request.slides,
			images,
		);
		const totalFrames = Math.ceil(totalDuration * this.fps);

		// Return lazy frame generators to avoid holding all frames in memory
		const frameGenerators: (() => ImageData)[] = [];
		for (let frame = 0; frame < totalFrames; frame++) {
			const frameIndex = frame;
			frameGenerators.push(() => {
				const time = frameIndex / this.fps;
				this.renderFrame(time, timeline);
				return this.ctx.getImageData(0, 0, this.width, this.height);
			});
		}

		return { frames: frameGenerators, totalDuration, totalFrames };
	}

	/**
	 * Get the canvas for direct frame-by-frame rendering.
	 * Useful when integrating with an external encoder (e.g., mediabunny).
	 */
	async createRenderLoop(
		request: ImageToVideoRequest,
		onProgress?: (progress: ImageToVideoProgress) => void,
	): Promise<{
		renderFrame: (frameIndex: number) => void;
		totalDuration: number;
		totalFrames: number;
		canvas: OffscreenCanvas | HTMLCanvasElement;
	}> {
		onProgress?.({ phase: "loading", progress: 0 });

		const images: ImgSource[] = [];
		for (let i = 0; i < request.slides.length; i++) {
			const img = await this.loadImage(request.slides[i].src);
			images.push(img);
			onProgress?.({
				phase: "loading",
				progress: (i + 1) / request.slides.length,
			});
		}

		const { timeline, totalDuration } = this.buildTimeline(
			request.slides,
			images,
		);
		const totalFrames = Math.ceil(totalDuration * this.fps);

		return {
			renderFrame: (frameIndex: number) => {
				const time = frameIndex / this.fps;
				this.renderFrame(time, timeline);
			},
			totalDuration,
			totalFrames,
			canvas: this.canvas,
		};
	}
}
