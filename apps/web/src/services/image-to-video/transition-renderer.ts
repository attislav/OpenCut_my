import type { TransitionType } from "@/types/transitions";

type RenderCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type ImgSource = HTMLImageElement | ImageBitmap;

/**
 * Renders a single transition frame between two images.
 *
 * @param ctx - Canvas 2D rendering context (target)
 * @param from - The outgoing image
 * @param to - The incoming image
 * @param progress - Transition progress from 0 (fully "from") to 1 (fully "to")
 * @param type - The transition effect type
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function renderTransitionFrame(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	type: TransitionType,
	width: number,
	height: number,
): void {
	ctx.clearRect(0, 0, width, height);

	switch (type) {
		case "none":
			drawImage(ctx, progress < 0.5 ? from : to, width, height);
			break;

		case "fade":
			renderFade(ctx, from, to, progress, width, height);
			break;

		case "dissolve":
			renderDissolve(ctx, from, to, progress, width, height);
			break;

		case "slide-left":
			renderSlide(ctx, from, to, progress, width, height, "left");
			break;

		case "slide-right":
			renderSlide(ctx, from, to, progress, width, height, "right");
			break;

		case "slide-up":
			renderSlide(ctx, from, to, progress, width, height, "up");
			break;

		case "slide-down":
			renderSlide(ctx, from, to, progress, width, height, "down");
			break;

		case "wipe-left":
			renderWipe(ctx, from, to, progress, width, height, "left");
			break;

		case "wipe-right":
			renderWipe(ctx, from, to, progress, width, height, "right");
			break;

		case "wipe-up":
			renderWipe(ctx, from, to, progress, width, height, "up");
			break;

		case "wipe-down":
			renderWipe(ctx, from, to, progress, width, height, "down");
			break;

		case "zoom-in":
			renderZoom(ctx, from, to, progress, width, height, "in");
			break;

		case "zoom-out":
			renderZoom(ctx, from, to, progress, width, height, "out");
			break;

		case "blur":
			renderBlur(ctx, from, to, progress, width, height);
			break;

		case "rotate":
			renderRotate(ctx, from, to, progress, width, height);
			break;

		case "flip":
			renderFlip(ctx, from, to, progress, width, height);
			break;

		default:
			drawImage(ctx, progress < 0.5 ? from : to, width, height);
	}
}

/** Draw an image scaled to cover the canvas (object-fit: cover) */
function drawImage(
	ctx: RenderCtx,
	img: ImgSource | null,
	width: number,
	height: number,
	opacity = 1,
): void {
	if (!img) return;

	ctx.save();
	ctx.globalAlpha = opacity;

	const imgW = img.width;
	const imgH = img.height;
	const scale = Math.max(width / imgW, height / imgH);
	const scaledW = imgW * scale;
	const scaledH = imgH * scale;
	const x = (width - scaledW) / 2;
	const y = (height - scaledH) / 2;

	ctx.drawImage(img, x, y, scaledW, scaledH);
	ctx.restore();
}

// --- Transition implementations ---

function renderFade(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
): void {
	drawImage(ctx, from, w, h, 1 - progress);
	drawImage(ctx, to, w, h, progress);
}

function renderDissolve(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
): void {
	// Dissolve uses a cross-fade with non-linear opacity for a softer blend
	const fromAlpha = Math.cos(progress * Math.PI * 0.5);
	const toAlpha = Math.sin(progress * Math.PI * 0.5);
	drawImage(ctx, from, w, h, fromAlpha);
	drawImage(ctx, to, w, h, toAlpha);
}

function renderSlide(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
	direction: "left" | "right" | "up" | "down",
): void {
	let fromX = 0;
	let fromY = 0;
	let toX = 0;
	let toY = 0;

	switch (direction) {
		case "left":
			fromX = -progress * w;
			toX = (1 - progress) * w;
			break;
		case "right":
			fromX = progress * w;
			toX = -(1 - progress) * w;
			break;
		case "up":
			fromY = -progress * h;
			toY = (1 - progress) * h;
			break;
		case "down":
			fromY = progress * h;
			toY = -(1 - progress) * h;
			break;
	}

	ctx.save();
	ctx.translate(fromX, fromY);
	drawImage(ctx, from, w, h);
	ctx.restore();

	ctx.save();
	ctx.translate(toX, toY);
	drawImage(ctx, to, w, h);
	ctx.restore();
}

function renderWipe(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
	direction: "left" | "right" | "up" | "down",
): void {
	// Draw the "from" image as background
	drawImage(ctx, from, w, h);

	// Clip region for the "to" image
	ctx.save();
	ctx.beginPath();

	switch (direction) {
		case "left":
			ctx.rect(0, 0, w * progress, h);
			break;
		case "right":
			ctx.rect(w * (1 - progress), 0, w * progress, h);
			break;
		case "up":
			ctx.rect(0, 0, w, h * progress);
			break;
		case "down":
			ctx.rect(0, h * (1 - progress), w, h * progress);
			break;
	}

	ctx.clip();
	drawImage(ctx, to, w, h);
	ctx.restore();
}

function renderZoom(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
	direction: "in" | "out",
): void {
	if (direction === "in") {
		// "from" stays, "to" zooms in from center
		drawImage(ctx, from, w, h, 1 - progress);

		const scale = progress;
		ctx.save();
		ctx.globalAlpha = progress;
		ctx.translate(w / 2, h / 2);
		ctx.scale(scale, scale);
		ctx.translate(-w / 2, -h / 2);
		drawImage(ctx, to, w, h);
		ctx.restore();
	} else {
		// "from" zooms out, "to" is revealed behind
		drawImage(ctx, to, w, h, progress);

		const scale = 1 + progress;
		ctx.save();
		ctx.globalAlpha = 1 - progress;
		ctx.translate(w / 2, h / 2);
		ctx.scale(scale, scale);
		ctx.translate(-w / 2, -h / 2);
		drawImage(ctx, from, w, h);
		ctx.restore();
	}
}

function renderBlur(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
): void {
	const maxBlur = 20;

	if (progress < 0.5) {
		// First half: blur out the "from" image
		const blurAmount = (progress / 0.5) * maxBlur;
		ctx.save();
		ctx.filter = `blur(${blurAmount}px)`;
		drawImage(ctx, from, w, h, 1);
		ctx.filter = "none";
		ctx.restore();
	} else {
		// Second half: unblur the "to" image
		const blurAmount = ((1 - progress) / 0.5) * maxBlur;
		ctx.save();
		ctx.filter = `blur(${blurAmount}px)`;
		drawImage(ctx, to, w, h, 1);
		ctx.filter = "none";
		ctx.restore();
	}
}

function renderRotate(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
): void {
	if (progress < 0.5) {
		const angle = progress * Math.PI;
		const scale = Math.cos(angle);
		ctx.save();
		ctx.translate(w / 2, h / 2);
		ctx.scale(Math.abs(scale), 1);
		ctx.translate(-w / 2, -h / 2);
		drawImage(ctx, from, w, h, 1 - progress);
		ctx.restore();
	} else {
		const angle = (1 - progress) * Math.PI;
		const scale = Math.cos(angle);
		ctx.save();
		ctx.translate(w / 2, h / 2);
		ctx.scale(Math.abs(scale), 1);
		ctx.translate(-w / 2, -h / 2);
		drawImage(ctx, to, w, h, progress);
		ctx.restore();
	}
}

function renderFlip(
	ctx: RenderCtx,
	from: ImgSource | null,
	to: ImgSource | null,
	progress: number,
	w: number,
	h: number,
): void {
	if (progress < 0.5) {
		// First half: flip "from" image vertically
		const scaleY = 1 - progress * 2;
		ctx.save();
		ctx.translate(0, h / 2);
		ctx.scale(1, Math.abs(scaleY) || 0.001);
		ctx.translate(0, -h / 2);
		drawImage(ctx, from, w, h);
		ctx.restore();
	} else {
		// Second half: flip "to" image in
		const scaleY = (progress - 0.5) * 2;
		ctx.save();
		ctx.translate(0, h / 2);
		ctx.scale(1, scaleY || 0.001);
		ctx.translate(0, -h / 2);
		drawImage(ctx, to, w, h);
		ctx.restore();
	}
}
