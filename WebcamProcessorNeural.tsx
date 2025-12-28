"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef } from "react";
import { useStore, GestureType } from "@/store/useStore";
import {
  playSelectSound,
  playHoverSound,
  playEngageSound,
  // playErrorSound,
} from "@/utils/audio";
import type { Results as HandsResults } from "@mediapipe/hands";
import type { Results as FaceMeshResults } from "@mediapipe/face_mesh";
import { motion } from "framer-motion"; // for draggable HUD

export default React.memo(function WebcamProcessorNeural() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Gesture state tracking
  const prevHandPos = useRef<{ x: number; y: number } | null>(null);
  const prevPinchDist = useRef<number | null>(null);
  const prevGestureLeft = useRef<GestureType>("IDLE");
  const prevGestureRight = useRef<GestureType>("IDLE");
  const swipeCooldown = useRef<number>(0);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    let camera: any = null;
    let hands: any = null;
    let faceMesh: any = null;

    const initMediaPipe = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;
      const canvasCtx = canvasElement.getContext("2d");

      if (!canvasCtx) return;

      // Dynamic imports
      const { Camera } = await import("@mediapipe/camera_utils");
      const { Hands, HAND_CONNECTIONS } = await import("@mediapipe/hands");
      const { FaceMesh } = await import("@mediapipe/face_mesh");
      const { drawConnectors, drawLandmarks } = await import(
        "@mediapipe/drawing_utils"
      );

      // Initialize Hands
      hands = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
        },
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      hands.onResults(onHandsResults);

      // Initialize FaceMesh
      faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
        },
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(onFaceResults);

      // Camera setup
      camera = new Camera(videoElement, {
        onFrame: async () => {
          if (!isMounted.current) return;
          if (faceMesh) await faceMesh.send({ image: videoElement });
          if (hands) await hands.send({ image: videoElement });
        },
        width: 1280,
        height: 720,
      });

      camera.start();

      function onFaceResults(results: FaceMeshResults) {
        if (!isMounted.current) return;
        const { setFaceLandmarks } = useStore.getState();
        if (
          results.multiFaceLandmarks &&
          results.multiFaceLandmarks.length > 0
        ) {
          setFaceLandmarks(results.multiFaceLandmarks[0]);
        } else {
          setFaceLandmarks(null);
        }
      }

      function onHandsResults(results: HandsResults) {
        if (!isMounted.current || !canvasCtx) return;
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Draw only the video feed (clean look)
        canvasCtx.drawImage(
          results.image,
          0,
          0,
          canvasElement.width,
          canvasElement.height
        );

        // Draw Face HUD if available
        const faceLandmarks = useStore.getState().faceLandmarks;
        if (faceLandmarks) {
          drawFaceHUD(canvasCtx, faceLandmarks);
        }

        let leftHand: any = null;
        let rightHand: any = null;
        let leftGesture: GestureType = "IDLE";
        let rightGesture: GestureType = "IDLE";

        const {
          setHands,
          setGestures,
          updateHandUI,
          setGlobeRotation,
          setGlobeScale,
          nextScene,
          prevScene,
          cycleTheme,
          triggerPulse,
          setNeuronPosition, // ball control
        } = useStore.getState() as any;

        if (results.multiHandLandmarks) {
          for (const [
            index,
            landmarks,
          ] of results.multiHandLandmarks.entries()) {
            // Draw Sci-Fi Skeleton
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
              color: "rgba(0, 243, 255, 0.6)",
              lineWidth: 2,
            });
            drawLandmarks(canvasCtx, landmarks, {
              color: "rgba(255, 255, 255, 0.8)",
              fillColor: "rgba(0, 243, 255, 0.8)",
              radius: 2,
              lineWidth: 1,
            });

            const label = results.multiHandedness[index]?.label;
            const gesture = detectGesture(landmarks);

            // Palm center (landmark 9)
            const palmX = landmarks[9].x;
            const palmY = landmarks[9].y;

            if (label === "Left") {
              leftHand = landmarks;
              leftGesture = gesture;
              updateHandUI("left", {
                visible: true,
                x: palmX,
                y: palmY,
                gesture: gesture,
              });
            }
            if (label === "Right") {
              rightHand = landmarks;
              rightGesture = gesture;
              updateHandUI("right", {
                visible: true,
                x: palmX,
                y: palmY,
                gesture: gesture,
              });
            }
          }
        }

        // Hide UI if hand lost
        if (!leftHand) updateHandUI("left", { visible: false });
        if (!rightHand) updateHandUI("right", { visible: false });

        // Sound Effects on Gesture Change
        if (leftGesture !== prevGestureLeft.current && leftGesture !== "IDLE") {
          if (leftGesture === "GRAB") playEngageSound();
          else playSelectSound();
        }
        if (
          rightGesture !== prevGestureRight.current &&
          rightGesture !== "IDLE"
        ) {
          if (rightGesture === "GRAB") playEngageSound();
          else playSelectSound();
        }

        setHands(leftHand, rightHand);
        setGestures(leftGesture, rightGesture);

        const now = Date.now();

        // 1. Scaling with two hands (PINCH) – make ball able to get smaller & scale smoother
        if (leftHand && rightHand) {
          const leftIndex = leftHand[8];
          const rightIndex = rightHand[8];
          const dist = Math.hypot(
            leftIndex.x - rightIndex.x,
            leftIndex.y - rightIndex.y
          );

          if (prevPinchDist.current !== null) {
            const delta = dist - prevPinchDist.current;

            // small deadzone to avoid jitter
            if (Math.abs(delta) > 0.01) {
              const currentScale = useStore.getState().globeScale;

              // smaller, smoother scaling: delta * 0.8
              let newScale = currentScale + delta * 0.8;

              // allow much smaller ball (down to 0.2) and limit huge growth (up to 2)
              newScale = Math.max(0.2, Math.min(2, newScale));

              setGlobeScale(newScale);
            }
          }
          prevPinchDist.current = dist;
        } else {
          prevPinchDist.current = null;
        }

        // 2. Swipe Detection (PALM_OPEN) – use right hand if available
        const swipeHand = rightHand || leftHand;
        const swipeGesture = rightHand ? rightGesture : leftGesture;

        if (swipeHand && swipeGesture === "PALM_OPEN") {
          const centroid = { x: swipeHand[9].x, y: swipeHand[9].y };

          if (prevHandPos.current) {
            const deltaX = centroid.x - prevHandPos.current.x;

            if (Math.abs(deltaX) > 0.15 && now - swipeCooldown.current > 1000) {
              if (deltaX > 0) {
                prevScene();
                playHoverSound();
              } else {
                nextScene();
                playHoverSound();
              }
              swipeCooldown.current = now;
            }
          }
          prevHandPos.current = centroid;
        }

        // 3. Rotation + BALL LEFT/RIGHT with GRAB (one or two hands)
        const grabbingHands: any[] = [];
        if (rightHand && rightGesture === "GRAB") grabbingHands.push(rightHand);
        if (leftHand && leftGesture === "GRAB") grabbingHands.push(leftHand);

        if (grabbingHands.length > 0) {
          // average of all grabbing hands (supports 1 or 2)
          const avg = grabbingHands.reduce(
            (acc, hand) => {
              acc.x += hand[9].x;
              acc.y += hand[9].y;
              return acc;
            },
            { x: 0, y: 0 }
          );
          const centroid = {
            x: avg.x / grabbingHands.length,
            y: avg.y / grabbingHands.length,
          };

          // Rotate globe same as before
          if (prevHandPos.current) {
            const deltaX = centroid.x - prevHandPos.current.x;
            const deltaY = centroid.y - prevHandPos.current.y;

            const currentRot = useStore.getState().globeRotation;
            setGlobeRotation({
              x: currentRot.x + deltaY * 8,
              y: currentRot.y + deltaX * 8,
            });

            // Move ball only LEFT–RIGHT using deltaX (already "small" movement with factor=0.4)
            try {
              if (setNeuronPosition) {
                const currentNeuron =
                  useStore.getState().neuronPosition ?? {
                    x: 0.5,
                    y: 0.5,
                    z: 0,
                  };

                const factor = 0.4; // horizontal sensitivity
                let newX = currentNeuron.x + deltaX * factor;

                // clamp between 0 and 1 (screen-normalized)
                newX = Math.max(0, Math.min(1, newX));

                setNeuronPosition({
                  ...currentNeuron,
                  x: newX,
                });
              }
            } catch {
              // ignore if store not wired yet
            }
          }

          prevHandPos.current = centroid;
        } else {
          if (!swipeHand || swipeGesture !== "PALM_OPEN") {
            prevHandPos.current = null;
          }
        }

        // 4. Theme Shifter (VICTORY) using left hand
        if (
          leftGesture === "VICTORY" &&
          prevGestureLeft.current !== "VICTORY"
        ) {
          cycleTheme();
          playSelectSound();
        }

        // 5. Neural Pulse (PALM_OPEN) when not swiping
        if (
          (leftGesture === "PALM_OPEN" || rightGesture === "PALM_OPEN") &&
          now - swipeCooldown.current > 500
        ) {
          if (Math.random() < 0.1) {
            triggerPulse();
          }
        }

        prevGestureLeft.current = leftGesture;
        prevGestureRight.current = rightGesture;

        canvasCtx.restore();
      }

      function drawFaceHUD(ctx: CanvasRenderingContext2D, landmarks: any[]) {
        const connect = (i1: number, i2: number) => {
          const p1 = landmarks[i1];
          const p2 = landmarks[i2];
          ctx.beginPath();
          ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
          ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
          ctx.stroke();
        };

        ctx.strokeStyle = "rgba(0, 243, 255, 0.4)";
        ctx.lineWidth = 1;

        // Center Line
        connect(10, 152);

        // Bounding Box / Target Lock
        const x = landmarks[234].x * ctx.canvas.width; // Left cheek
        const y = landmarks[10].y * ctx.canvas.height; // Top head
        const w = (landmarks[454].x - landmarks[234].x) * ctx.canvas.width; // Width
        const h = (landmarks[152].y - landmarks[10].y) * ctx.canvas.height; // Height

        ctx.strokeStyle = "rgba(0, 243, 255, 0.8)";
        ctx.lineWidth = 2;
        const pad = 20;

        const bx = x - pad;
        const by = y - pad;
        const bw = w + pad * 2;
        const bh = h + pad * 2;
        const len = 20;

        ctx.beginPath();
        // TL
        ctx.moveTo(bx, by + len);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + len, by);
        // TR
        ctx.moveTo(bx + bw - len, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + len);
        // BL
        ctx.moveTo(bx, by + bh - len);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + len, by + bh);
        // BR
        ctx.moveTo(bx + bw - len, by + bh);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw, by + bh - len);
        ctx.stroke();

        // Label
        ctx.font = "12px 'Share Tech Mono'";
        ctx.fillStyle = "rgba(0, 243, 255, 0.9)";
        ctx.fillText("TARGET LOCKED", bx, by - 5);
      }

      function detectGesture(landmarks: any[]): GestureType {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];

        const wrist = landmarks[0];

        const isExtended = (tip: any, pip: number) => {
          const pipMark = landmarks[pip];
          return (
            Math.hypot(tip.x - wrist.x, tip.y - wrist.y) >
            Math.hypot(pipMark.x - wrist.x, pipMark.y - wrist.y)
          );
        };

        const indexExt = isExtended(indexTip, 6);
        const middleExt = isExtended(middleTip, 10);
        const ringExt = isExtended(ringTip, 14);
        const pinkyExt = isExtended(pinkyTip, 18);

        const pinchDist = Math.hypot(
          thumbTip.x - indexTip.x,
          thumbTip.y - indexTip.y
        );

        if (pinchDist < 0.05) return "PINCH";
        if (indexExt && middleExt && ringExt && pinkyExt) return "PALM_OPEN";
        if (!indexExt && !middleExt && !ringExt && !pinkyExt) return "GRAB";
        if (indexExt && !middleExt && !ringExt && !pinkyExt) return "POINT";
        if (indexExt && middleExt && !ringExt && !pinkyExt) return "VICTORY";

        return "IDLE";
      }
    };

    initMediaPipe();

    return () => {
      isMounted.current = false;
      if (camera) (camera as any).stop();
      if (hands) (hands as any).close();
      if (faceMesh) (faceMesh as any).close();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        width={1280}
        height={720}
      />

      {/* GESTURE GUIDE UI - draggable */}
      <motion.div
        className="absolute bottom-10 left-10 z-50 pointer-events-auto cursor-move"
        drag
        dragMomentum={false}
        dragElastic={0.2}
      >
        <div className="bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-xl p-4 text-cyan-100 font-mono text-xs tracking-wider shadow-[0_0_20px_rgba(0,243,255,0.1)]">
          <h3 className="text-cyan-400 font-bold mb-3 border-b border-cyan-500/30 pb-1">
            NEURAL COMMANDS
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center gap-3">
              <span className="text-xl">🖐️</span>
              <div>
                <span className="text-cyan-300 font-bold">OPEN PALM</span>
                <p className="text-[10px] opacity-70">
                  SWIPE (Motion) / PULSE (Hold)
                </p>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-xl">🤏</span>
              <div>
                <span className="text-cyan-300 font-bold">
                  PINCH (2 Hands)
                </span>
                <p className="text-[10px] opacity-70">
                  SCALE GLOBE / BALL (SMALLER)
                </p>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-xl">✊</span>
              <div>
                <span className="text-cyan-300 font-bold">GRAB</span>
                <p className="text-[10px] opacity-70">
                  ROTATE GLOBE / MOVE BALL LEFT–RIGHT
                </p>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span className="text-xl">✌️</span>
              <div>
                <span className="text-cyan-300 font-bold">VICTORY</span>
                <p className="text-[10px] opacity-70">CYCLE THEME</p>
              </div>
            </li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
});
