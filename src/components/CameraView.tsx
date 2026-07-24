"use client";

import React, { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { 
  Camera, CameraOff, Loader2, Sliders, Eye, EyeOff, 
  Image as ImageIcon, Video, Layout, StopCircle, Download, X, Check,
  FlipHorizontal, Timer, Palette, Type, Zap
} from "lucide-react";

// Hand connections for drawing skeleton
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],// Ring
  [13, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [0, 17]                               // Palm base
];

export type PoseType = "peace" | "palm" | "thumbs_up" | "fist" | "ok" | "any";

interface PoseOption {
  id: PoseType;
  name: string;
  emoji: string;
  desc: string;
}

const POSE_OPTIONS: PoseOption[] = [
  { id: "peace", name: "2 Jari (Peace)", emoji: "✌️", desc: "Telunjuk & tengah terangkat" },
  { id: "palm", name: "Telapak Tangan", emoji: "🖐️", desc: "Semua jari terbuka" },
  { id: "thumbs_up", name: "Jempol Up", emoji: "👍", desc: "Jempol ke atas" },
  { id: "fist", name: "Kepalan Tangan", emoji: "✊", desc: "Semua jari mengepal" },
  { id: "ok", name: "Gestur OK", emoji: "👌", desc: "Telunjuk & jempol bersentuhan" },
  { id: "any", name: "Setiap Tangan", emoji: "✋", desc: "Blur saat ada tangan" },
];

export type ColorFilterType = "none" | "bw" | "sepia" | "cyber" | "warm";

interface ColorFilterOption {
  id: ColorFilterType;
  name: string;
  css: string;
}

const COLOR_FILTERS: ColorFilterOption[] = [
  { id: "none", name: "Normal Color", css: "none" },
  { id: "bw", name: "Hitam Putih (B&W)", css: "grayscale(100%) contrast(120%)" },
  { id: "sepia", name: "Warm Sepia", css: "sepia(80%) contrast(110%)" },
  { id: "cyber", name: "Cyber Pink", css: "hue-rotate(280deg) saturate(160%)" },
  { id: "warm", name: "Sunwarm Vintage", css: "saturate(135%) sepia(20%)" },
];

export default function CameraView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  
  // Customization controls
  const [selectedPose, setSelectedPose] = useState<PoseType>("peace");
  const [blurAmount, setBlurAmount] = useState<number>(24);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [isBlurEnabled, setIsBlurEnabled] = useState<boolean>(true);
  const [detectedPoseName, setDetectedPoseName] = useState<string | null>(null);

  // New Studio Features
  const [colorFilter, setColorFilter] = useState<ColorFilterType>("none");
  const [photoTimer, setPhotoTimer] = useState<number>(0); // 0, 3, 5, 10 seconds
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [singleTimerCount, setSingleTimerCount] = useState<number>(0);
  const [watermarkText, setWatermarkText] = useState<string>("POTRETKU STUDIO FOTO");

  // Recording & Photobooth States
  const [isRecording, setIsRecording] = useState(false);
  const [photoboothCount, setPhotoboothCount] = useState(0); 
  const [isPhotoboothActive, setIsPhotoboothActive] = useState(false);

  // Result Modal States
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedFrameTheme, setSelectedFrameTheme] = useState<"white" | "dark" | "pastel" | "neon">("white");

  const FRAME_THEMES = {
    white: { bg: "#ffffff", text: "#000000", name: "Classic White" },
    dark: { bg: "#09090b", text: "#ffffff", name: "Midnight Dark" },
    pastel: { bg: "#fce7f3", text: "#db2777", name: "Cute Pastel" },
    neon: { bg: "#111111", text: "#39ff14", name: "Neon Cyberpunk" }
  };

  // Refs for recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs to avoid stale closures
  const selectedPoseRef = useRef<PoseType>(selectedPose);
  const showSkeletonRef = useRef<boolean>(showSkeleton);
  const isRecordingRef = useRef<boolean>(isRecording);
  const blurAmountRef = useRef<number>(blurAmount);
  const colorFilterRef = useRef<ColorFilterType>(colorFilter);
  const isMirroredRef = useRef<boolean>(isMirrored);
  const isBlurEnabledRef = useRef<boolean>(isBlurEnabled);

  useEffect(() => { selectedPoseRef.current = selectedPose; }, [selectedPose]);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { blurAmountRef.current = blurAmount; }, [blurAmount]);
  useEffect(() => { colorFilterRef.current = colorFilter; }, [colorFilter]);
  useEffect(() => { isMirroredRef.current = isMirrored; }, [isMirrored]);
  useEffect(() => { isBlurEnabledRef.current = isBlurEnabled; }, [isBlurEnabled]);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastVideoTimeRef = useRef(-1);

  // Initialize MediaPipe HandLandmarker
  useEffect(() => {
    async function initModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        handLandmarkerRef.current = handLandmarker;
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Error loading MediaPipe model:", error);
      }
    }
    initModel();

    return () => {
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Camera start/stop
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsCameraActive(true);
          detectHands();
        };
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      if (err.name === "NotReadableError") {
        alert("Kamera sedang digunakan oleh aplikasi lain. Mohon tutup aplikasi tersebut dan coba lagi.");
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        alert("Mohon berikan izin akses kamera pada browser Anda.");
      } else {
        alert("Terjadi kesalahan saat mengakses kamera: " + err.message);
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      setIsBlurred(false);
      setDetectedPoseName(null);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      
      stopRecording();
    }
  };

  const triggerFlash = () => {
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);
  };

  // Capture current frame (video + skeleton + color filter)
  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const overlayCanvas = canvasRef.current;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Apply color filter
    const activeFilterCss = COLOR_FILTERS.find(f => f.id === colorFilter)?.css || "none";
    let combinedFilter = activeFilterCss;
    if (isBlurred) {
      const blurPart = `blur(${blurAmount}px) brightness(0.8)`;
      combinedFilter = activeFilterCss !== "none" ? `${activeFilterCss} ${blurPart}` : blurPart;
    }
    ctx.filter = combinedFilter;

    // Draw video (handle mirroring)
    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'none';

    // Draw overlay (skeleton)
    ctx.drawImage(overlayCanvas, 0, 0);

    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const executeCapture = () => {
    triggerFlash();
    const dataUrl = captureFrame();
    if (dataUrl) {
      setCapturedImages([dataUrl]);
      setShowResultModal(true);
    }
  };

  const takePhoto = () => {
    if (photoTimer === 0) {
      executeCapture();
    } else {
      let count = photoTimer;
      setSingleTimerCount(count);
      const timer = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setSingleTimerCount(count);
        } else {
          clearInterval(timer);
          setSingleTimerCount(0);
          executeCapture();
        }
      }, 1000);
    }
  };

  // Video Recording Logic
  const startRecording = () => {
    if (!videoRef.current) return;
    
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
      offscreenCanvasRef.current.width = videoRef.current.videoWidth || 1280;
      offscreenCanvasRef.current.height = videoRef.current.videoHeight || 720;
    }

    const stream = offscreenCanvasRef.current.captureStream(30);
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = mediaRecorder;
    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `valora-video-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Photobooth Logic
  const startPhotobooth = () => {
    setIsPhotoboothActive(true);
    runPhotoboothSequence(3, []);
  };

  const runPhotoboothSequence = (photosLeft: number, capturedImages: string[]) => {
    if (photosLeft === 0) {
      setIsPhotoboothActive(false);
      setPhotoboothCount(0);
      setCapturedImages(capturedImages);
      setShowResultModal(true);
      return;
    }

    let count = 3;
    setPhotoboothCount(count);
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setPhotoboothCount(count);
      } else {
        clearInterval(timer);
        setPhotoboothCount(0);
        
        triggerFlash();
        const dataUrl = captureFrame();
        const newImages = dataUrl ? [...capturedImages, dataUrl] : capturedImages;
        
        setTimeout(() => {
          runPhotoboothSequence(photosLeft - 1, newImages);
        }, 1000);
      }
    }, 1000);
  };

  const downloadFramedPhoto = () => {
    if (capturedImages.length === 0) return;
    
    const loadedImages = capturedImages.map(src => {
      const img = new Image();
      img.src = src;
      return new Promise<HTMLImageElement>(resolve => {
        img.onload = () => resolve(img);
      });
    });

    Promise.all(loadedImages).then(imgs => {
      const padding = 40;
      const spacing = 20;
      const imgWidth = imgs[0].width;
      const imgHeight = imgs[0].height;
      
      const theme = FRAME_THEMES[selectedFrameTheme];
      
      const textPadding = watermarkText ? 60 : 20;
      const stripWidth = imgWidth + padding * 2;
      const stripHeight = (imgHeight * imgs.length) + (spacing * (imgs.length - 1)) + padding * 2 + textPadding;
      
      const canvas = document.createElement("canvas");
      canvas.width = stripWidth;
      canvas.height = stripHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      // Solid Background
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, stripWidth, stripHeight);
      
      // Draw images
      imgs.forEach((img, i) => {
        const y = padding + i * (imgHeight + spacing);
        ctx.drawImage(img, padding, y, imgWidth, imgHeight);
      });
      
      // Draw text if watermark present
      if (watermarkText) {
        ctx.fillStyle = theme.text;
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(watermarkText, stripWidth / 2, stripHeight - 24);
      }
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `valora-${Date.now()}.jpg`;
      link.click();
    });
  };

  const isExtended = (landmarks: any[], tipIdx: number, pipIdx: number) => {
    const distTipWrist = Math.hypot(landmarks[tipIdx].x - landmarks[0].x, landmarks[tipIdx].y - landmarks[0].y);
    const distPipWrist = Math.hypot(landmarks[pipIdx].x - landmarks[0].x, landmarks[pipIdx].y - landmarks[0].y);
    return distTipWrist > distPipWrist * 1.1;
  };

  const checkGesture = (landmarks: any[], poseTarget: PoseType): { match: boolean; label: string } => {
    const indexOpen = isExtended(landmarks, 8, 6);
    const middleOpen = isExtended(landmarks, 12, 10);
    const ringOpen = isExtended(landmarks, 16, 14);
    const pinkyOpen = isExtended(landmarks, 20, 18);
    const thumbOpen = isExtended(landmarks, 4, 2);

    const distThumbIndex = Math.hypot(
      landmarks[8].x - landmarks[4].x,
      landmarks[8].y - landmarks[4].y
    );
    const isOkGesture = distThumbIndex < 0.08 && middleOpen && ringOpen;

    if (poseTarget === "any") return { match: true, label: "Tangan Terdeteksi" };
    if (poseTarget === "peace" && indexOpen && middleOpen && !ringOpen && !pinkyOpen) return { match: true, label: "2 Jari (Peace ✌️)" };
    if (poseTarget === "palm" && indexOpen && middleOpen && ringOpen && pinkyOpen) return { match: true, label: "Telapak Tangan 🖐️" };
    if (poseTarget === "thumbs_up" && thumbOpen && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return { match: true, label: "Jempol Up 👍" };
    if (poseTarget === "fist" && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return { match: true, label: "Kepalan Tangan ✊" };
    if (poseTarget === "ok" && isOkGesture) return { match: true, label: "Gestur OK 👌" };

    return { match: false, label: "" };
  };

  const drawLandmarks = (ctx: CanvasRenderingContext2D, width: number, height: number, landmarksList: any[][]) => {
    ctx.clearRect(0, 0, width, height);
    if (!showSkeletonRef.current) return;

    for (const landmarks of landmarksList) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(251, 113, 133, 0.85)"; // Rose line
      ctx.shadowColor = "#fb7185";
      ctx.shadowBlur = 8;

      for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];

        const x1 = isMirroredRef.current ? (1 - start.x) * width : start.x * width;
        const y1 = start.y * height;
        const x2 = isMirroredRef.current ? (1 - end.x) * width : end.x * width;
        const y2 = end.y * height;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      for (let i = 0; i < landmarks.length; i++) {
        const point = landmarks[i];
        const x = isMirroredRef.current ? (1 - point.x) * width : point.x * width;
        const y = point.y * height;

        ctx.beginPath();
        ctx.arc(x, y, i === 8 || i === 12 || i === 4 ? 6 : 4, 0, 2 * Math.PI);
        
        if ([4, 8, 12, 16, 20].includes(i)) {
          ctx.fillStyle = "#f43f5e";
          ctx.shadowColor = "#f43f5e";
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = "#fef08a";
          ctx.shadowBlur = 0;
        }
        ctx.fill();
      }
    }
  };

  const detectHands = () => {
    if (!videoRef.current || !handLandmarkerRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (canvas && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    let startTimeMs = performance.now();
    if (lastVideoTimeRef.current !== video.currentTime) {
      lastVideoTimeRef.current = video.currentTime;
      const detections = handLandmarkerRef.current.detectForVideo(video, startTimeMs);

      let blurTriggered = false;
      let matchedLabel = "";

      if (detections.landmarks && detections.landmarks.length > 0) {
        for (const landmarks of detections.landmarks) {
          const res = checkGesture(landmarks, selectedPoseRef.current);
          if (res.match && isBlurEnabledRef.current) {
            blurTriggered = true;
            matchedLabel = res.label;
            break;
          }
        }

        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            drawLandmarks(ctx, canvas.width, canvas.height, detections.landmarks);
          }
        }
      } else {
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (isRecordingRef.current && offscreenCanvasRef.current) {
        const offCtx = offscreenCanvasRef.current.getContext("2d");
        if (offCtx) {
          if (isMirroredRef.current) {
            offCtx.translate(offscreenCanvasRef.current.width, 0);
            offCtx.scale(-1, 1);
          }
          
          const filterCss = COLOR_FILTERS.find(f => f.id === colorFilterRef.current)?.css || "none";
          let combined = filterCss;
          if (blurTriggered) {
             const b = `blur(${blurAmountRef.current}px) brightness(0.8)`;
             combined = filterCss !== "none" ? `${filterCss} ${b}` : b;
          }
          offCtx.filter = combined;
          
          offCtx.drawImage(video, 0, 0, offscreenCanvasRef.current.width, offscreenCanvasRef.current.height);
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          offCtx.filter = 'none';
          
          if (canvas) {
            offCtx.drawImage(canvas, 0, 0);
          }
        }
      }

      setIsBlurred(blurTriggered);
      setDetectedPoseName(blurTriggered ? matchedLabel : null);
    }

    if (video.srcObject) {
      requestRef.current = requestAnimationFrame(detectHands);
    }
  };

  const activeFilterStyle = COLOR_FILTERS.find(f => f.id === colorFilter)?.css || "none";

  return (
    <div className="w-full h-full flex flex-col justify-between gap-2.5 max-w-7xl mx-auto">
      
      {/* Top Toolbar: Horizontal Scrolling Pill Bar on Mobile, Clean Flex on Desktop */}
      <div className="w-full bg-slate-900/95 border border-slate-800/80 rounded-2xl p-2 z-20 shrink-0 shadow-lg overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-[11px] sm:text-xs w-full pl-0.5 pr-6">
          
          {/* Dropdown: Gesture Pose Selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl shrink-0">
            <span className="text-slate-400 font-medium">Gestur:</span>
            <select
              value={selectedPose}
              onChange={(e) => setSelectedPose(e.target.value as PoseType)}
              className="bg-transparent text-slate-100 font-bold outline-none cursor-pointer"
            >
              {POSE_OPTIONS.map((pose) => (
                <option key={pose.id} value={pose.id} className="bg-slate-900 text-slate-100">
                  {pose.emoji} {pose.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown: Color Filters */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl shrink-0">
            <Palette className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value as ColorFilterType)}
              className="bg-transparent text-slate-100 font-bold outline-none cursor-pointer"
            >
              {COLOR_FILTERS.map((f) => (
                <option key={f.id} value={f.id} className="bg-slate-900 text-slate-100">
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown: Timer */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl shrink-0">
            <Timer className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={photoTimer}
              onChange={(e) => setPhotoTimer(Number(e.target.value))}
              className="bg-transparent text-slate-100 font-bold outline-none cursor-pointer"
            >
              <option value={0} className="bg-slate-900 text-slate-100">Timer: 0s</option>
              <option value={3} className="bg-slate-900 text-slate-100">Timer: 3s</option>
              <option value={5} className="bg-slate-900 text-slate-100">Timer: 5s</option>
              <option value={10} className="bg-slate-900 text-slate-100">Timer: 10s</option>
            </select>
          </div>

          {/* Blur Feature ON/OFF Toggle */}
          <button
            onClick={() => setIsBlurEnabled(!isBlurEnabled)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-semibold transition-all shrink-0 ${
              isBlurEnabled 
                ? "bg-indigo-600/25 border-indigo-500/80 text-indigo-200" 
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{isBlurEnabled ? "Blur ON" : "Blur OFF"}</span>
          </button>

          {/* Mirror Camera Toggle */}
          <button
            onClick={() => setIsMirrored(!isMirrored)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-semibold transition-all shrink-0 ${
              isMirrored 
                ? "bg-indigo-600/25 border-indigo-500/80 text-indigo-200" 
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{isMirrored ? "Mirror ON" : "Mirror OFF"}</span>
          </button>

          {/* Watermark Selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1.5 rounded-xl shrink-0">
            <Type className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="bg-transparent text-slate-100 font-bold outline-none cursor-pointer"
            >
              <option value="POTRETKU STUDIO FOTO" className="bg-slate-900 text-slate-100">WM: Potretku Studio Foto</option>
              <option value="POTRETKU" className="bg-slate-900 text-slate-100">WM: Potretku</option>
              <option value="" className="bg-slate-900 text-slate-100">WM: Tanpa Teks</option>
            </select>
          </div>

          {/* Skeleton Overlay Switch */}
          <button
            onClick={() => setShowSkeleton(!showSkeleton)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border font-semibold transition-all shrink-0 ${
              showSkeleton 
                ? "bg-indigo-600/25 border-indigo-500/80 text-indigo-200" 
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {showSkeleton ? <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
            <span>Skeleton</span>
          </button>

        </div>
      </div>

      {/* Main Fullscreen Camera View Area */}
      <div className="relative flex-1 w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/80 shadow-2xl flex items-center justify-center min-h-[300px]">
        
        {/* Flash Effect Overlay */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-40 animate-pulse pointer-events-none" />
        )}

        {/* Camera Off Placeholder */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950/95 z-20">
            {!isModelLoaded ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-9 h-9 animate-spin text-indigo-500" />
                <p className="text-sm font-semibold text-slate-200">Menyiapkan Potretku Studio...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 mb-1 shadow-md">
                  <Camera className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-100">Kamera Belum Aktif</h3>
                <p className="text-xs sm:text-sm max-w-xs text-slate-400">
                  Klik <span className="text-indigo-400 font-bold">Nyalakan Kamera</span> di bawah untuk mulai berfoto & merekam.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Video Stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            filter: isBlurred 
              ? `${activeFilterStyle !== "none" ? activeFilterStyle : ""} blur(${blurAmount}px) brightness(0.8)` 
              : activeFilterStyle,
          }}
          className={`w-full h-full object-cover transition-[filter] duration-300 ease-out ${
            isMirrored ? "-scale-x-100" : ""
          }`}
        />

        {/* Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        />

        {/* Status Badge */}
        {isBlurred && (
          <div className="absolute top-4 right-4 z-20 bg-indigo-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            Blur Aktif: {detectedPoseName || "Gestur Terdeteksi"}
          </div>
        )}

        {/* Recording Badge */}
        {isRecording && (
          <div className="absolute top-4 left-4 z-20 bg-rose-600 text-white px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            REC
          </div>
        )}
        
        {/* Photobooth Countdown */}
        {photoboothCount > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/40 backdrop-blur-xs">
            <span className="text-8xl sm:text-9xl font-black text-white drop-shadow-2xl">
              {photoboothCount}
            </span>
          </div>
        )}

        {/* Single Timer Countdown */}
        {singleTimerCount > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-30 bg-black/40 backdrop-blur-xs">
            <span className="text-8xl sm:text-9xl font-black text-indigo-400 drop-shadow-2xl animate-pulse">
              {singleTimerCount}
            </span>
          </div>
        )}

        {/* Ready Indicator */}
        {isCameraActive && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-xs text-slate-300 shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Potretku Studio Ready</span>
          </div>
        )}

      </div>

      {/* Bottom Action Controls Bar: Responsive 2x2 Grid on Mobile, Flex on Desktop */}
      <div className="w-full bg-slate-900/95 border border-slate-800/80 rounded-2xl p-2.5 shrink-0 z-20 shadow-lg">
        
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-3 text-xs sm:text-sm">
          
          <button
            onClick={isCameraActive ? stopCamera : startCamera}
            disabled={!isModelLoaded || isRecording || isPhotoboothActive}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${
              isCameraActive
                ? "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
                : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20"
            }`}
          >
            {isCameraActive ? (
              <>
                <CameraOff className="w-4 h-4" />
                Matikan Kamera
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                Nyalakan Kamera
              </>
            )}
          </button>
          
          {isCameraActive && (
            <>
              <button
                onClick={takePhoto}
                disabled={isRecording || isPhotoboothActive || singleTimerCount > 0}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-amber-400 text-slate-950 font-extrabold hover:bg-amber-300 transition-all shadow-md shadow-amber-400/20 disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
                {photoTimer > 0 ? `Foto (${photoTimer}s)` : "Foto"}
              </button>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isPhotoboothActive || singleTimerCount > 0}
                className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${
                  isRecording 
                  ? "bg-rose-600 text-white animate-pulse" 
                  : "bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700"
                }`}
              >
                {isRecording ? <StopCircle className="w-4 h-4 text-white" /> : <Video className="w-4 h-4 text-indigo-400" />}
                {isRecording ? "Stop Record" : "Rekam Video"}
              </button>
              
              <button
                onClick={startPhotobooth}
                disabled={isRecording || isPhotoboothActive || singleTimerCount > 0}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-all shadow-md shadow-violet-600/20 disabled:opacity-50"
              >
                <Layout className="w-4 h-4" />
                Photobooth (3x)
              </button>
            </>
          )}

        </div>

      </div>

      {/* Result Modal Overlay */}
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-6 shadow-2xl">
            
            {/* Left: Preview */}
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 rounded-xl p-4 sm:p-6 border border-slate-800">
              <div 
                className="shadow-2xl flex flex-col items-center transition-all"
                style={{ 
                  backgroundColor: FRAME_THEMES[selectedFrameTheme].bg,
                  padding: '24px 24px 40px 24px',
                  gap: '12px',
                  borderRadius: '8px'
                }}
              >
                {capturedImages.map((img, i) => (
                  <img key={i} src={img} alt={`Frame ${i}`} className="w-full max-w-[280px] h-auto rounded shadow-sm" />
                ))}
                {watermarkText && (
                  <div 
                    className="font-bold tracking-widest uppercase mt-4 text-lg"
                    style={{ color: FRAME_THEMES[selectedFrameTheme].text }}
                  >
                    {watermarkText}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="w-full md:w-80 flex flex-col gap-5">
              <div>
                <h3 className="text-xl font-bold text-slate-100 mb-1">Pilih Bingkai Frame</h3>
                <p className="text-xs text-slate-400">Pilih tema warna bingkai yang Anda sukai.</p>
              </div>

              <div className="flex flex-col gap-2.5 flex-1">
                {(Object.keys(FRAME_THEMES) as Array<keyof typeof FRAME_THEMES>).map((key) => {
                  const theme = FRAME_THEMES[key];
                  const isSelected = selectedFrameTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedFrameTheme(key)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-500 font-bold shadow-md shadow-indigo-600/20"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      }`}
                    >
                      <span className="text-sm">{theme.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2.5 pt-4 border-t border-slate-800">
                <button
                  onClick={downloadFramedPhoto}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/20"
                >
                  <Download className="w-4 h-4" />
                  Download Foto
                </button>
                <button
                  onClick={() => setShowResultModal(false)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 transition-all"
                >
                  <X className="w-4 h-4" />
                  Tutup / Buang
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

