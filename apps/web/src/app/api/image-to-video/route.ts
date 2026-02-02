import { checkRateLimit } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// --- Validation schemas ---

const transitionTypeSchema = z.enum([
	"none",
	"fade",
	"slide-left",
	"slide-right",
	"slide-up",
	"slide-down",
	"zoom-in",
	"zoom-out",
	"dissolve",
	"wipe-left",
	"wipe-right",
	"wipe-up",
	"wipe-down",
	"blur",
	"rotate",
	"flip",
]);

const easingTypeSchema = z.enum([
	"linear",
	"ease-in",
	"ease-out",
	"ease-in-out",
]);

const transitionConfigSchema = z.object({
	type: transitionTypeSchema,
	duration: z
		.number()
		.min(0.1, "Transition duration must be at least 0.1s")
		.max(5, "Transition duration must be at most 5s"),
	easing: easingTypeSchema.default("ease-in-out"),
});

const kenBurnsSchema = z.object({
	startScale: z.number().min(0.5).max(3).default(1),
	endScale: z.number().min(0.5).max(3).default(1.2),
	startPosition: z
		.object({ x: z.number(), y: z.number() })
		.default({ x: 0, y: 0 }),
	endPosition: z
		.object({ x: z.number(), y: z.number() })
		.default({ x: 0, y: 0 }),
});

const imageSlideSchema = z.object({
	src: z
		.string()
		.min(1, "Image source is required")
		.refine(
			(val: string) =>
				val.startsWith("http://") ||
				val.startsWith("https://") ||
				val.startsWith("data:image/"),
			"Image source must be a URL or base64 data URI",
		),
	duration: z
		.number()
		.min(0.1, "Slide duration must be at least 0.1s")
		.max(60, "Slide duration must be at most 60s"),
	transition: transitionConfigSchema.optional(),
	kenBurns: kenBurnsSchema.optional(),
});

const imageToVideoRequestSchema = z.object({
	slides: z
		.array(imageSlideSchema)
		.min(1, "At least one slide is required")
		.max(100, "Maximum 100 slides allowed"),
	output: z.object({
		width: z.number().int().min(64).max(3840).default(1920),
		height: z.number().int().min(64).max(2160).default(1080),
		fps: z.number().int().min(1).max(60).default(30),
		format: z.enum(["mp4", "webm"]).default("mp4"),
		quality: z.enum(["low", "medium", "high", "very_high"]).default("high"),
	}),
	backgroundColor: z.string().optional().default("#000000"),
});

// --- Types for the response ---

interface TimelineSlide {
	src: string;
	duration: number;
	startTime: number;
	endTime: number;
	transition?: {
		type: string;
		duration: number;
		easing: string;
		startTime: number;
		endTime: number;
	};
	kenBurns?: {
		startScale: number;
		endScale: number;
		startPosition: { x: number; y: number };
		endPosition: { x: number; y: number };
	};
}

/**
 * POST /api/image-to-video
 *
 * This endpoint validates the image-to-video configuration and returns
 * a rendering plan. The actual video rendering happens client-side using
 * the Canvas API and mediabunny encoder.
 *
 * For server-side rendering, a Web Worker or edge function with
 * OffscreenCanvas support can be used.
 *
 * Request body: ImageToVideoRequest (JSON)
 * Response: Validated configuration with computed timeline
 */
export async function POST(request: NextRequest) {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return NextResponse.json(
				{ error: "Too many requests" },
				{ status: 429 },
			);
		}

		const body = await request.json();

		const validation = imageToVideoRequestSchema.safeParse(body);
		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid request",
					details: validation.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const config = validation.data;

		// Build the timeline with computed absolute times
		const timeline: TimelineSlide[] = [];
		let currentTime = 0;

		for (let i = 0; i < config.slides.length; i++) {
			const slide = config.slides[i];
			const startTime = currentTime;
			const endTime = startTime + slide.duration;

			const entry: TimelineSlide = {
				src: slide.src,
				duration: slide.duration,
				startTime,
				endTime,
				kenBurns: slide.kenBurns,
			};

			if (
				i < config.slides.length - 1 &&
				slide.transition &&
				slide.transition.type !== "none"
			) {
				entry.transition = {
					type: slide.transition.type,
					duration: slide.transition.duration,
					easing: slide.transition.easing,
					startTime: endTime,
					endTime: endTime + slide.transition.duration,
				};
				currentTime = endTime + slide.transition.duration;
			} else {
				currentTime = endTime;
			}

			timeline.push(entry);
		}

		const totalDuration = currentTime;
		const totalFrames = Math.ceil(totalDuration * config.output.fps);

		return NextResponse.json({
			success: true,
			config: {
				output: config.output,
				backgroundColor: config.backgroundColor,
			},
			timeline,
			metadata: {
				totalDuration,
				totalFrames,
				slideCount: config.slides.length,
				transitionCount: config.slides.filter(
					(s) => s.transition && s.transition.type !== "none",
				).length,
			},
			// Available transition types for reference
			availableTransitions: [
				"none",
				"fade",
				"slide-left",
				"slide-right",
				"slide-up",
				"slide-down",
				"zoom-in",
				"zoom-out",
				"dissolve",
				"wipe-left",
				"wipe-right",
				"wipe-up",
				"wipe-down",
				"blur",
				"rotate",
				"flip",
			],
			availableEasings: ["linear", "ease-in", "ease-out", "ease-in-out"],
		});
	} catch (error) {
		console.error("Error in image-to-video API:", error);

		if (error instanceof SyntaxError) {
			return NextResponse.json(
				{ error: "Invalid JSON in request body" },
				{ status: 400 },
			);
		}

		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * GET /api/image-to-video
 *
 * Returns API documentation and available options.
 */
export async function GET() {
	return NextResponse.json({
		name: "Image to Video API",
		version: "1.0.0",
		description:
			"Convert a sequence of images into a video with dynamic transitions. " +
			"Submit a POST request with your slides configuration to get a validated " +
			"rendering plan. Use the client-side ImageToVideoService to render the video.",
		endpoints: {
			"POST /api/image-to-video": {
				description:
					"Validate configuration and get a computed rendering timeline",
				body: {
					slides: {
						type: "ImageSlide[]",
						description: "Array of image slides",
						properties: {
							src: "string - Image URL or base64 data URI",
							duration: "number - Display duration in seconds (0.1-60)",
							transition: {
								type: "TransitionType - Transition effect to next slide",
								duration: "number - Transition duration in seconds (0.1-5)",
								easing: "EasingType - Easing function (default: ease-in-out)",
							},
							kenBurns: {
								startScale: "number - Initial zoom (0.5-3, default: 1)",
								endScale: "number - Final zoom (0.5-3, default: 1.2)",
								startPosition: "{ x, y } - Start pan offset",
								endPosition: "{ x, y } - End pan offset",
							},
						},
					},
					output: {
						width: "number - Video width in px (64-3840, default: 1920)",
						height: "number - Video height in px (64-2160, default: 1080)",
						fps: "number - Frames per second (1-60, default: 30)",
						format: "string - 'mp4' or 'webm' (default: mp4)",
						quality: "string - low|medium|high|very_high (default: high)",
					},
					backgroundColor: "string - CSS color (default: #000000)",
				},
			},
		},
		transitions: [
			{ type: "none", description: "Hard cut, no transition" },
			{ type: "fade", description: "Cross-fade between images" },
			{ type: "dissolve", description: "Smooth sinusoidal dissolve" },
			{ type: "slide-left", description: "Slide from right to left" },
			{ type: "slide-right", description: "Slide from left to right" },
			{ type: "slide-up", description: "Slide from bottom to top" },
			{ type: "slide-down", description: "Slide from top to bottom" },
			{ type: "wipe-left", description: "Wipe reveal from left" },
			{ type: "wipe-right", description: "Wipe reveal from right" },
			{ type: "wipe-up", description: "Wipe reveal from top" },
			{ type: "wipe-down", description: "Wipe reveal from bottom" },
			{ type: "zoom-in", description: "New image zooms in from center" },
			{ type: "zoom-out", description: "Current image zooms out, revealing next" },
			{ type: "blur", description: "Blur out current, blur in next" },
			{ type: "rotate", description: "3D-style horizontal rotation" },
			{ type: "flip", description: "3D-style vertical flip" },
		],
		easings: [
			{ type: "linear", description: "Constant speed" },
			{ type: "ease-in", description: "Start slow, end fast" },
			{ type: "ease-out", description: "Start fast, end slow" },
			{ type: "ease-in-out", description: "Start slow, fast in middle, end slow" },
		],
		example: {
			slides: [
				{
					src: "https://example.com/image1.jpg",
					duration: 3,
					transition: {
						type: "fade",
						duration: 1,
						easing: "ease-in-out",
					},
				},
				{
					src: "https://example.com/image2.jpg",
					duration: 3,
					transition: {
						type: "slide-left",
						duration: 0.8,
						easing: "ease-out",
					},
				},
				{
					src: "https://example.com/image3.jpg",
					duration: 3,
				},
			],
			output: {
				width: 1920,
				height: 1080,
				fps: 30,
				format: "mp4",
				quality: "high",
			},
			backgroundColor: "#000000",
		},
	});
}
