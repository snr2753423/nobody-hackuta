"use client";
import { useEffect, useRef, useState } from "react";
import { getPoseLandmarker, UPPER_BODY_EDGES } from "@/lib/pose/landmarker";
import { poseHub } from "@/lib/poseHub";
import { bus, inputState } from "@/lib/bus";
import type { EngineOutput } from "@/lib/gesture/engine";

export type CamStatus = "starting" | "loading-model" | "ready" | "no-camera" | "error";

export default function CameraPanel({ onStatus }: { onStatus?: (s: CamStatus, msg?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<CamStatus>("starting");
  const [msg, setMsg] = useState("");
  const [fps, setFps] = useState(0);
  const [bodyVisible, setBodyVisible] = useState(false);
  const [metrics, setMetrics] = useState<string>("");
  const [debug, setDebug] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "d" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setDebug((d) => !d); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const statusCb = useRef(onStatus);
  useEffect(() => { statusCb.current = onStatus; }, [onStatus]);

  useEffect(() => {
    let raf = 0, stopped = false, stream: MediaStream | null = null;
    const set = (s: CamStatus, m = "") => { setStatus(s); setMsg(m); statusCb.current?.(s, m); };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
      } catch (e) {
        set("no-camera", e instanceof Error ? e.message : "Camera permission denied");
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      set("loading-model");
      let landmarker;
      try { landmarker = await getPoseLandmarker(); } catch (e) {
        set("error", "Pose model failed to load: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
      if (stopped) return;
      set("ready");
      let lastVideoTime = -1, lastTs = 0, frames = 0, fpsT = performance.now(), visT = 0;
      const loop = () => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        let now = performance.now();
        if (now <= lastTs) now = lastTs + 1;
        lastTs = now;
        let out: EngineOutput;
        try {
          const res = landmarker.detectForVideo(video, now);
          const lms = res.landmarks?.[0] ?? null;
          out = poseHub.engine.process(lms, video.videoWidth / video.videoHeight, now);
        } catch (e) {
          console.warn("pose frame failed", e);
          return;
        }
        route(out);
        draw(canvasRef.current, video, out);
        poseHub.publish(out, now);
        frames++;
        if (now - fpsT > 1000) { setFps(Math.round((frames * 1000) / (now - fpsT))); frames = 0; fpsT = now; }
        if (now - visT > 250) {
          visT = now; setBodyVisible(!!out.body);
          const m = out.presets?.metrics;
          setMetrics(m ? `lean ${m.leanScore.toFixed(2)} (tilt ${m.tiltDeg.toFixed(1)}° head ${m.head.toFixed(2)}) | lift L${m.liftL.toFixed(2)} R${m.liftR.toFixed(2)} | reach L${m.reachL.toFixed(2)} R${m.reachR.toFixed(2)}` : "no body");
        }
      };
      loop();
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-md border-2 border-[#16100c] bg-black aspect-[4/3]">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover -scale-x-100 opacity-80" playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[11px] text-[#f4e4c6]">
        {status === "ready" ? `${bodyVisible ? "● tracking" : "○ step into view"} · ${fps} fps` : status === "loading-model" ? "loading pose model…" : status === "starting" ? "starting camera…" : "camera unavailable"}
      </div>
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[#f4e4c6]">
          {status === "no-camera" || status === "error" ? (
            <div>
              <p className="font-bold">Camera unavailable</p>
              <p className="mt-1 opacity-80">{msg}</p>
              <p className="mt-2 opacity-80">Allow camera access and reload. Keyboard controls still work.</p>
            </div>
          ) : (
            <p className="animate-pulse">Waking the oracle of the body…</p>
          )}
        </div>
      )}
      {debug && (
        <div className="absolute inset-x-0 bottom-0 bg-black/80 px-2 py-1 font-mono text-[10px] text-[#9ee8ff]">
          {metrics} · lean: + = left, ±1.0 to dodge, lift 0.55, reach 0.75
        </div>
      )}
      {status === "ready" && !bodyVisible && (
        <div className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded bg-black/70 px-3 py-1 text-xs text-[#f4e4c6]">
          Sit back so your head, shoulders and hands are in view
        </div>
      )}
    </div>
  );
}

function route(out: EngineOutput) {
  inputState.tracking = !!out.body;
  if (poseHub.mode !== "fight") { inputState.shield = false; inputState.lean = 0; return; }
  inputState.shield = !!out.presets?.shield;
  inputState.lean = out.presets?.lean ?? 0;
  if (out.firedPower) bus.emit({ type: "power", id: out.firedPower.power.id, config: out.firedPower.power.config, conf: out.firedPower.conf });
  else if (out.fireBlast) bus.emit({ type: "blast" });
}

function draw(cv: HTMLCanvasElement | null, video: HTMLVideoElement | null, out: EngineOutput) {
  if (!cv || !video) return;
  const w = (cv.width = video.videoWidth || 640), h = (cv.height = video.videoHeight || 480);
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const lms = out.smoothed;
  if (!lms) return;
  const P = (i: number) => ({ x: (1 - lms[i].x) * w, y: lms[i].y * h, v: lms[i].visibility ?? 1 });
  const p = out.presets;
  const color = p?.shield ? "#fff27a" : p?.blast ? "#ffb36b" : p?.lean ? "#9ee8ff" : "#f4e4c6";
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  for (const [pass, width, alpha] of [[0, 14, 0.25], [1, 5, 1]] as const) {
    ctx.shadowBlur = pass === 0 ? 24 : 10;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    for (const [a, b] of UPPER_BODY_EDGES) {
      const A = P(a), B = P(b);
      if (A.v < 0.3 || B.v < 0.3) continue;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
    const A = P(i);
    if (A.v < 0.3) continue;
    ctx.beginPath(); ctx.arc(A.x, A.y, i === 15 || i === 16 ? 9 : 6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
}
