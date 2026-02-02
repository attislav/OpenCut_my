"use client";

import { ImageToVideoService } from "@/services/image-to-video";
import type {
	ImageToVideoProgress,
	ImageToVideoRequest,
	ImageToVideoResult,
} from "@/types/transitions";
import { useCallback, useRef, useState } from "react";

export function useImageToVideo() {
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState<ImageToVideoProgress | null>(null);
	const cancelRef = useRef(false);

	/**
	 * Validate the configuration via the API, then render client-side
	 * using OffscreenCanvas + mediabunny.
	 */
	const generate = useCallback(
		async (request: ImageToVideoRequest): Promise<ImageToVideoResult> => {
			setIsProcessing(true);
			setProgress({ phase: "loading", progress: 0 });
			cancelRef.current = false;

			try {
				// Step 1: Validate configuration via API
				const apiResponse = await fetch("/api/image-to-video", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request),
				});

				if (!apiResponse.ok) {
					const errorData = await apiResponse.json();
					return {
						success: false,
						error: errorData.error || "API validation failed",
					};
				}

				const { metadata } = await apiResponse.json();

				// Step 2: Render frames client-side
				const service = new ImageToVideoService(request);
				const renderLoop = await service.createRenderLoop(
					request,
					(p) => setProgress(p),
				);

				setProgress({
					phase: "rendering",
					progress: 0,
					currentFrame: 0,
					totalFrames: renderLoop.totalFrames,
				});

				// Step 3: Encode using mediabunny
				// Import dynamically to avoid SSR issues
				const mediabunny = await import("mediabunny");
				const { Output, CanvasSource } = mediabunny;

				const format =
					request.output.format === "webm"
						? new mediabunny.WebMOutputFormat()
						: new mediabunny.Mp4OutputFormat();

				const output = new Output(format);

				const canvasSource = new CanvasSource(
					renderLoop.canvas as OffscreenCanvas,
					{
						codec:
							request.output.format === "webm"
								? mediabunny.VideoCodec.VP9
								: mediabunny.VideoCodec.AVC,
						fps: request.output.fps,
					},
				);

				output.addVideoTrack(canvasSource);

				for (let frame = 0; frame < renderLoop.totalFrames; frame++) {
					if (cancelRef.current) {
						return { success: false, error: "Cancelled" };
					}

					renderLoop.renderFrame(frame);
					await canvasSource.addFrame();

					setProgress({
						phase: "rendering",
						progress: (frame + 1) / renderLoop.totalFrames,
						currentFrame: frame + 1,
						totalFrames: renderLoop.totalFrames,
					});
				}

				setProgress({ phase: "encoding", progress: 0.9 });
				const result = await output.finalize();

				setProgress({ phase: "encoding", progress: 1 });

				return {
					success: true,
					data: result,
					mimeType:
						request.output.format === "webm" ? "video/webm" : "video/mp4",
					duration: metadata.totalDuration,
				};
			} catch (error) {
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Unknown error during generation",
				};
			} finally {
				setIsProcessing(false);
			}
		},
		[],
	);

	const cancel = useCallback(() => {
		cancelRef.current = true;
	}, []);

	return {
		generate,
		cancel,
		isProcessing,
		progress,
	};
}
