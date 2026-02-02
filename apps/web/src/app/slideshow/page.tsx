"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ImageToVideoService } from "@/services/image-to-video";
import type {
	EasingType,
	ImageSlide,
	ImageToVideoProgress,
	TransitionType,
} from "@/types/transitions";
import { cn } from "@/utils/ui";
import {
	ArrowDown,
	ArrowUp,
	Download,
	GripVertical,
	Loader2,
	Play,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import Link from "next/link";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

// --- Constants ---

const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
	{ value: "none", label: "Kein Übergang" },
	{ value: "fade", label: "Fade" },
	{ value: "dissolve", label: "Dissolve" },
	{ value: "slide-left", label: "Slide Links" },
	{ value: "slide-right", label: "Slide Rechts" },
	{ value: "slide-up", label: "Slide Hoch" },
	{ value: "slide-down", label: "Slide Runter" },
	{ value: "wipe-left", label: "Wipe Links" },
	{ value: "wipe-right", label: "Wipe Rechts" },
	{ value: "wipe-up", label: "Wipe Hoch" },
	{ value: "wipe-down", label: "Wipe Runter" },
	{ value: "zoom-in", label: "Zoom In" },
	{ value: "zoom-out", label: "Zoom Out" },
	{ value: "blur", label: "Blur" },
	{ value: "rotate", label: "Rotate" },
	{ value: "flip", label: "Flip" },
];

const EASING_OPTIONS: { value: EasingType; label: string }[] = [
	{ value: "linear", label: "Linear" },
	{ value: "ease-in", label: "Ease In" },
	{ value: "ease-out", label: "Ease Out" },
	{ value: "ease-in-out", label: "Ease In-Out" },
];

interface SlideItem {
	id: string;
	file: File;
	previewUrl: string;
	duration: number;
	transitionType: TransitionType;
	transitionDuration: number;
	transitionEasing: EasingType;
}

// --- Main Page Component ---

export default function SlideshowPage() {
	const [slides, setSlides] = useState<SlideItem[]>([]);
	const [isRendering, setIsRendering] = useState(false);
	const [progress, setProgress] = useState<ImageToVideoProgress | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const [defaultTransition, setDefaultTransition] =
		useState<TransitionType>("fade");
	const [defaultDuration, setDefaultDuration] = useState(3);
	const [defaultTransitionDuration, setDefaultTransitionDuration] =
		useState(1);
	const [outputWidth, setOutputWidth] = useState(1920);
	const [outputHeight, setOutputHeight] = useState(1080);
	const [outputFps, setOutputFps] = useState(30);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cancelRef = useRef(false);

	// Cleanup preview URLs on unmount
	useEffect(() => {
		return () => {
			for (const slide of slides) {
				URL.revokeObjectURL(slide.previewUrl);
			}
			if (videoUrl) URL.revokeObjectURL(videoUrl);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const handleFilesSelected = useCallback(
		(files: FileList | File[]) => {
			const imageFiles = Array.from(files).filter((f) =>
				f.type.startsWith("image/"),
			);

			if (imageFiles.length === 0) {
				toast.error("Bitte nur Bilddateien auswählen");
				return;
			}

			const newSlides: SlideItem[] = imageFiles.map((file) => ({
				id: crypto.randomUUID(),
				file,
				previewUrl: URL.createObjectURL(file),
				duration: defaultDuration,
				transitionType: defaultTransition,
				transitionDuration: defaultTransitionDuration,
				transitionEasing: "ease-in-out" as EasingType,
			}));

			setSlides((prev) => [...prev, ...newSlides]);
			setVideoUrl(null);
			toast.success(`${imageFiles.length} Bild(er) hinzugefügt`);
		},
		[defaultDuration, defaultTransition, defaultTransitionDuration],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			handleFilesSelected(e.dataTransfer.files);
		},
		[handleFilesSelected],
	);

	const removeSlide = useCallback((id: string) => {
		setSlides((prev) => {
			const slide = prev.find((s) => s.id === id);
			if (slide) URL.revokeObjectURL(slide.previewUrl);
			return prev.filter((s) => s.id !== id);
		});
		setVideoUrl(null);
	}, []);

	const moveSlide = useCallback((index: number, direction: -1 | 1) => {
		setSlides((prev) => {
			const newSlides = [...prev];
			const newIndex = index + direction;
			if (newIndex < 0 || newIndex >= newSlides.length) return prev;
			[newSlides[index], newSlides[newIndex]] = [
				newSlides[newIndex],
				newSlides[index],
			];
			return newSlides;
		});
		setVideoUrl(null);
	}, []);

	const updateSlide = useCallback(
		(id: string, updates: Partial<SlideItem>) => {
			setSlides((prev) =>
				prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
			);
			setVideoUrl(null);
		},
		[],
	);

	const applyDefaultsToAll = useCallback(() => {
		setSlides((prev) =>
			prev.map((s) => ({
				...s,
				duration: defaultDuration,
				transitionType: defaultTransition,
				transitionDuration: defaultTransitionDuration,
			})),
		);
		toast.success("Einstellungen auf alle Slides angewendet");
	}, [defaultDuration, defaultTransition, defaultTransitionDuration]);

	// --- Rendering ---

	const handleRender = useCallback(async () => {
		if (slides.length === 0) {
			toast.error("Füge zuerst Bilder hinzu");
			return;
		}

		setIsRendering(true);
		setProgress({ phase: "loading", progress: 0 });
		cancelRef.current = false;

		try {
			// Build request from slides - convert files to data URIs
			const slideConfigs: ImageSlide[] = await Promise.all(
				slides.map(async (slide, i) => {
					const dataUri = await fileToDataUri(slide.file);
					const isLast = i === slides.length - 1;
					return {
						src: dataUri,
						duration: slide.duration,
						transition:
							!isLast && slide.transitionType !== "none"
								? {
										type: slide.transitionType,
										duration: slide.transitionDuration,
										easing: slide.transitionEasing,
									}
								: undefined,
					};
				}),
			);

			const request = {
				slides: slideConfigs,
				output: {
					width: outputWidth,
					height: outputHeight,
					fps: outputFps,
					format: "mp4" as const,
					quality: "high" as const,
				},
				backgroundColor: "#000000",
			};

			const service = new ImageToVideoService(request);
			const renderLoop = await service.createRenderLoop(request, (p) =>
				setProgress(p),
			);

			setProgress({
				phase: "rendering",
				progress: 0,
				currentFrame: 0,
				totalFrames: renderLoop.totalFrames,
			});

			// Render frames to collect as blob
			const canvas = renderLoop.canvas as OffscreenCanvas;

			// Use VideoEncoder + muxer approach, or fall back to MediaRecorder
			const blob = await renderWithMediaRecorder(
				canvas,
				renderLoop.renderFrame,
				renderLoop.totalFrames,
				outputFps,
				(frame, total) => {
					if (cancelRef.current) throw new Error("Cancelled");
					setProgress({
						phase: "rendering",
						progress: frame / total,
						currentFrame: frame,
						totalFrames: total,
					});
				},
			);

			setProgress({ phase: "encoding", progress: 1 });

			if (videoUrl) URL.revokeObjectURL(videoUrl);
			const url = URL.createObjectURL(blob);
			setVideoUrl(url);
			toast.success("Video erfolgreich erstellt!");
		} catch (err) {
			if (err instanceof Error && err.message === "Cancelled") {
				toast.info("Rendering abgebrochen");
			} else {
				console.error("Rendering error:", err);
				toast.error(
					`Fehler beim Rendering: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
				);
			}
		} finally {
			setIsRendering(false);
			setProgress(null);
		}
	}, [slides, outputWidth, outputHeight, outputFps, videoUrl]);

	const handleCancel = useCallback(() => {
		cancelRef.current = true;
	}, []);

	const progressPercent = progress
		? Math.round(progress.progress * 100)
		: 0;

	return (
		<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
			{/* Header */}
			<header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-4">
					<Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
						&larr; Zurück
					</Link>
					<h1 className="text-lg font-semibold">Slideshow erstellen</h1>
				</div>
				<div className="flex items-center gap-2">
					{videoUrl && (
						<a href={videoUrl} download="slideshow.webm">
							<Button variant="outline" size="sm">
								<Download className="mr-2 size-4" />
								Download
							</Button>
						</a>
					)}
					{isRendering ? (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleCancel}
						>
							<X className="mr-2 size-4" />
							Abbrechen
						</Button>
					) : (
						<Button
							size="sm"
							onClick={handleRender}
							disabled={slides.length === 0}
						>
							<Play className="mr-2 size-4" />
							Video erstellen
						</Button>
					)}
				</div>
			</header>

			{/* Progress bar */}
			{isRendering && progress && (
				<div className="px-6 py-2 border-b bg-muted/30 shrink-0">
					<div className="flex items-center gap-3">
						<Loader2 className="size-4 animate-spin" />
						<span className="text-sm text-muted-foreground">
							{progress.phase === "loading" && "Bilder laden..."}
							{progress.phase === "rendering" &&
								`Rendering Frame ${progress.currentFrame || 0}/${progress.totalFrames || 0}`}
							{progress.phase === "encoding" && "Video wird encodiert..."}
						</span>
						<Progress value={progressPercent} className="flex-1" />
						<span className="text-sm font-mono text-muted-foreground">
							{progressPercent}%
						</span>
					</div>
				</div>
			)}

			{/* Main content */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Left: Slide list */}
				<div className="w-80 border-r flex flex-col shrink-0 overflow-hidden">
					{/* Default settings */}
					<div className="p-4 border-b space-y-3 shrink-0">
						<h3 className="text-sm font-medium">Standard-Einstellungen</h3>
						<div className="grid grid-cols-2 gap-2">
							<div>
								<label className="text-xs text-muted-foreground">
									Dauer (s)
								</label>
								<input
									type="number"
									min={0.5}
									max={30}
									step={0.5}
									value={defaultDuration}
									onChange={(e) =>
										setDefaultDuration(Number(e.target.value))
									}
									className="w-full rounded border bg-background px-2 py-1 text-sm"
								/>
							</div>
							<div>
								<label className="text-xs text-muted-foreground">
									Trans. Dauer (s)
								</label>
								<input
									type="number"
									min={0.1}
									max={5}
									step={0.1}
									value={defaultTransitionDuration}
									onChange={(e) =>
										setDefaultTransitionDuration(Number(e.target.value))
									}
									className="w-full rounded border bg-background px-2 py-1 text-sm"
								/>
							</div>
						</div>
						<div>
							<label className="text-xs text-muted-foreground">
								Transition
							</label>
							<Select
								value={defaultTransition}
								onValueChange={(v) =>
									setDefaultTransition(v as TransitionType)
								}
							>
								<SelectTrigger className="w-full h-8 text-sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TRANSITION_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="w-full"
							onClick={applyDefaultsToAll}
							disabled={slides.length === 0}
						>
							Auf alle anwenden
						</Button>
					</div>

					{/* Slide list */}
					<div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
						{slides.map((slide, index) => (
							<SlideCard
								key={slide.id}
								slide={slide}
								index={index}
								total={slides.length}
								onRemove={removeSlide}
								onMove={moveSlide}
								onUpdate={updateSlide}
							/>
						))}

						{slides.length === 0 && (
							<div className="text-center text-muted-foreground py-8 text-sm">
								Noch keine Bilder hinzugefügt
							</div>
						)}
					</div>

					{/* Add button */}
					<div className="p-3 border-t shrink-0">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							className="hidden"
							onChange={(e) => {
								if (e.target.files) handleFilesSelected(e.target.files);
								e.target.value = "";
							}}
						/>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => fileInputRef.current?.click()}
						>
							<Plus className="mr-2 size-4" />
							Bilder hinzufügen
						</Button>
					</div>
				</div>

				{/* Right: Preview / Upload area */}
				<div className="flex-1 flex items-center justify-center p-6 min-w-0">
					{videoUrl ? (
						<div className="w-full max-w-4xl">
							<video
								src={videoUrl}
								controls
								autoPlay
								className="w-full rounded-lg border shadow-lg"
							/>
						</div>
					) : slides.length > 0 ? (
						<div className="w-full max-w-4xl text-center space-y-4">
							<div
								className="aspect-video bg-muted rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden"
								onDragOver={(e) => e.preventDefault()}
								onDrop={handleDrop}
							>
								<div className="grid grid-cols-3 gap-2 p-4 max-h-full overflow-hidden">
									{slides.slice(0, 9).map((slide) => (
										<img
											key={slide.id}
											src={slide.previewUrl}
											alt=""
											className="rounded object-cover aspect-video"
										/>
									))}
									{slides.length > 9 && (
										<div className="rounded bg-muted-foreground/10 aspect-video flex items-center justify-center text-muted-foreground text-sm">
											+{slides.length - 9} mehr
										</div>
									)}
								</div>
							</div>
							<p className="text-sm text-muted-foreground">
								{slides.length} Slide{slides.length !== 1 ? "s" : ""} &middot;
								Klicke &quot;Video erstellen&quot; zum Rendern
							</p>
						</div>
					) : (
						<div
							className="w-full max-w-2xl aspect-video rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/50 transition-colors"
							onDragOver={(e) => e.preventDefault()}
							onDrop={handleDrop}
							onClick={() => fileInputRef.current?.click()}
						>
							<Upload className="size-12 text-muted-foreground" />
							<div className="text-center">
								<p className="text-lg font-medium">
									Bilder hierher ziehen
								</p>
								<p className="text-sm text-muted-foreground mt-1">
									oder klicken zum Auswählen
								</p>
							</div>
							<p className="text-xs text-muted-foreground">
								JPG, PNG, WebP, GIF &middot; Bis zu 100 Bilder
							</p>
						</div>
					)}
				</div>
			</div>

			{/* Hidden canvas for rendering */}
			<canvas ref={canvasRef} className="hidden" />
		</div>
	);
}

// --- Slide Card Component ---

function SlideCard({
	slide,
	index,
	total,
	onRemove,
	onMove,
	onUpdate,
}: {
	slide: SlideItem;
	index: number;
	total: number;
	onRemove: (id: string) => void;
	onMove: (index: number, direction: -1 | 1) => void;
	onUpdate: (id: string, updates: Partial<SlideItem>) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const isLast = index === total - 1;

	return (
		<div className="rounded-lg border bg-card overflow-hidden">
			{/* Preview row */}
			<div className="flex items-center gap-2 p-2">
				<GripVertical className="size-4 text-muted-foreground shrink-0" />
				<img
					src={slide.previewUrl}
					alt={`Slide ${index + 1}`}
					className="size-10 rounded object-cover shrink-0"
				/>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium truncate">
						Slide {index + 1}
					</p>
					<p className="text-xs text-muted-foreground truncate">
						{slide.duration}s
						{!isLast && slide.transitionType !== "none"
							? ` + ${slide.transitionType}`
							: ""}
					</p>
				</div>
				<div className="flex items-center gap-0.5 shrink-0">
					<button
						type="button"
						className="p-1 rounded hover:bg-muted"
						onClick={() => onMove(index, -1)}
						disabled={index === 0}
					>
						<ArrowUp className="size-3.5" />
					</button>
					<button
						type="button"
						className="p-1 rounded hover:bg-muted"
						onClick={() => onMove(index, 1)}
						disabled={isLast}
					>
						<ArrowDown className="size-3.5" />
					</button>
					<button
						type="button"
						className="p-1 rounded hover:bg-muted text-destructive"
						onClick={() => onRemove(slide.id)}
					>
						<Trash2 className="size-3.5" />
					</button>
				</div>
			</div>

			{/* Expand toggle */}
			<button
				type="button"
				className="w-full text-xs text-muted-foreground hover:text-foreground py-1 border-t bg-muted/30"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? "Weniger" : "Mehr Optionen"}
			</button>

			{/* Expanded options */}
			{expanded && (
				<div className="p-2 pt-0 space-y-2 border-t">
					<div>
						<label className="text-xs text-muted-foreground">
							Dauer (Sekunden)
						</label>
						<input
							type="number"
							min={0.5}
							max={60}
							step={0.5}
							value={slide.duration}
							onChange={(e) =>
								onUpdate(slide.id, {
									duration: Number(e.target.value),
								})
							}
							className="w-full rounded border bg-background px-2 py-1 text-sm"
						/>
					</div>
					{!isLast && (
						<>
							<div>
								<label className="text-xs text-muted-foreground">
									Transition
								</label>
								<Select
									value={slide.transitionType}
									onValueChange={(v) =>
										onUpdate(slide.id, {
											transitionType: v as TransitionType,
										})
									}
								>
									<SelectTrigger className="w-full h-8 text-sm">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{TRANSITION_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{slide.transitionType !== "none" && (
								<>
									<div>
										<label className="text-xs text-muted-foreground">
											Transition Dauer (s)
										</label>
										<input
											type="number"
											min={0.1}
											max={5}
											step={0.1}
											value={slide.transitionDuration}
											onChange={(e) =>
												onUpdate(slide.id, {
													transitionDuration: Number(e.target.value),
												})
											}
											className="w-full rounded border bg-background px-2 py-1 text-sm"
										/>
									</div>
									<div>
										<label className="text-xs text-muted-foreground">
											Easing
										</label>
										<Select
											value={slide.transitionEasing}
											onValueChange={(v) =>
												onUpdate(slide.id, {
													transitionEasing: v as EasingType,
												})
											}
										>
											<SelectTrigger className="w-full h-8 text-sm">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{EASING_OPTIONS.map((opt) => (
													<SelectItem
														key={opt.value}
														value={opt.value}
													>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}

// --- Utility functions ---

function fileToDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Render frames using the ImageToVideoService and capture via MediaRecorder.
 * This approach works in all modern browsers without needing mediabunny.
 */
async function renderWithMediaRecorder(
	sourceCanvas: OffscreenCanvas | HTMLCanvasElement,
	renderFrame: (frameIndex: number) => void,
	totalFrames: number,
	fps: number,
	onProgress: (frame: number, total: number) => void,
): Promise<Blob> {
	// We need a visible canvas for MediaRecorder (it needs captureStream)
	const canvas = document.createElement("canvas");
	canvas.width = sourceCanvas.width;
	canvas.height = sourceCanvas.height;
	const ctx = canvas.getContext("2d")!;

	const stream = canvas.captureStream(0); // 0 = manual frame control
	const mediaRecorder = new MediaRecorder(stream, {
		mimeType: getSupportedMimeType(),
		videoBitsPerSecond: 8_000_000,
	});

	const chunks: Blob[] = [];
	mediaRecorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};

	const recordingDone = new Promise<Blob>((resolve) => {
		mediaRecorder.onstop = () => {
			const mimeType = mediaRecorder.mimeType || "video/webm";
			resolve(new Blob(chunks, { type: mimeType }));
		};
	});

	mediaRecorder.start();

	const frameDuration = 1000 / fps;

	for (let i = 0; i < totalFrames; i++) {
		onProgress(i + 1, totalFrames);

		// Render the frame on the offscreen canvas
		renderFrame(i);

		// Copy to the recording canvas
		if (sourceCanvas instanceof OffscreenCanvas) {
			const bitmap = sourceCanvas.transferToImageBitmap();
			ctx.drawImage(bitmap, 0, 0);
			bitmap.close();
		} else {
			ctx.drawImage(sourceCanvas, 0, 0);
		}

		// Request a frame on the stream
		const track = stream.getVideoTracks()[0];
		if (track && "requestFrame" in track) {
			(track as MediaStreamVideoTrack & { requestFrame: () => void }).requestFrame();
		}

		// Wait for frame duration to maintain timing
		await sleep(frameDuration);
	}

	mediaRecorder.stop();
	return recordingDone;
}

function getSupportedMimeType(): string {
	const types = [
		"video/webm;codecs=vp9",
		"video/webm;codecs=vp8",
		"video/webm",
		"video/mp4",
	];
	for (const type of types) {
		if (MediaRecorder.isTypeSupported(type)) return type;
	}
	return "video/webm";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
