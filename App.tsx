
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, SkipBack, Upload, Download, Settings, Activity, Layers, Database, Shield, ChevronRight, Video, FileText, Target, Zap } from 'lucide-react';
import { TrackingParams, ProcessingStats, Trajectory, TimeSeriesData } from './types';
import { BlobTracker } from './services/blobTracker';
import { CVEngine, FeaturePoint } from './services/cvEngine';
import { TrackingChart } from './components/TrackingChart';
import { GoogleGenAI } from '@google/genai';

const ANALYSIS_WIDTH = 480; 
const ANALYSIS_HEIGHT = 270;

const App: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFeatures, setShowFeatures] = useState(true);
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [currentFeatures, setCurrentFeatures] = useState<FeaturePoint[]>([]);
  const [stats, setStats] = useState<ProcessingStats>({
    frameCount: 0,
    processedCount: 0,
    fps: 0,
    blobsCount: 0,
    elapsedTime: 0
  });
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
  const [params, setParams] = useState<TrackingParams & { sensitivity: number }>({
    threshold: 40, 
    minArea: 50,
    maxArea: 20000,
    persistence: 10, 
    blur: 3,
    showBoxes: true,
    showCentroids: true,
    showTrajectories: true,
    sensitivity: 30
  });
  const [report, setReport] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const procCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  
  const trackerRef = useRef<BlobTracker>(new BlobTracker());
  const cvEngineRef = useRef<CVEngine>(new CVEngine(ANALYSIS_WIDTH, ANALYSIS_HEIGHT));
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoUrl(URL.createObjectURL(file));
      setIsPlaying(false);
      setTrajectories([]);
      setTimeSeries([]);
      trackerRef.current.reset();
      cvEngineRef.current.reset();
    }
  };

  const processFrame = useCallback((time: number) => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.paused || videoRef.current.ended) {
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    const currentFps = Math.round(1000 / deltaTime);

    const video = videoRef.current;
    const displayCanvas = canvasRef.current;
    const displayCtx = displayCanvas.getContext('2d', { alpha: false });
    const procCanvas = procCanvasRef.current;
    
    if (procCanvas.width !== ANALYSIS_WIDTH) {
      procCanvas.width = ANALYSIS_WIDTH;
      procCanvas.height = ANALYSIS_HEIGHT;
    }
    const procCtx = procCanvas.getContext('2d', { willReadFrequently: true });
    
    if (!displayCtx || !procCtx) return;

    displayCtx.drawImage(video, 0, 0, displayCanvas.width, displayCanvas.height);
    procCtx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);

    const frameData = procCtx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const { blobs: rawBlobs, features } = cvEngineRef.current.process(frameData.data, params.sensitivity);

    setCurrentFeatures(features);

    const scaleX = 1920 / ANALYSIS_WIDTH;
    const scaleY = 1080 / ANALYSIS_HEIGHT;
    const currentBlobs = rawBlobs.map(b => ({
      x: (b.x + b.w / 2) * scaleX,
      y: (b.y + b.h / 2) * scaleY,
      width: b.w * scaleX,
      height: b.h * scaleY
    }));

    const updatedTrajectories = trackerRef.current.update(currentBlobs, video.currentTime, params);
    setTrajectories(updatedTrajectories);

    setStats(prev => ({
      ...prev,
      processedCount: prev.processedCount + 1,
      blobsCount: updatedTrajectories.filter(t => t.active).length,
      fps: currentFps || 60
    }));

    if (video.currentTime % 0.5 < 0.02) {
      setTimeSeries(prev => [...prev.slice(-100), {
        timestamp: video.currentTime,
        count: updatedTrajectories.filter(t => t.active).length
      }]);
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, [params]);

  useEffect(() => {
    if (isPlaying) requestRef.current = requestAnimationFrame(processFrame);
    else if (requestRef.current) cancelAnimationFrame(requestRef.current);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, processFrame]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const generateAIReport = async () => {
    setReport('Running feature geometry analysis...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Forensic Vision Report:
        - Points of Interest (POIs): ${currentFeatures.length}
        - Current Tracked Clusters: ${stats.blobsCount}
        - Feature Sensitivity: ${params.sensitivity}
        - Algorithm: Sparse Optical Flow with SAD Matching.
        
        Analyze the tracking fidelity and potential noise levels based on these metrics.`,
      });
      setReport(response.text || 'Analysis ready.');
    } catch (err) { setReport('AI Analysis Offline.'); }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">VisionFlow <span className="text-indigo-400">PRO</span></h1>
            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-[0.2em]">KLT-Style Sparse Feature Tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 px-4 py-1 bg-neutral-900/50 rounded-full border border-white/5 text-xs font-medium">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-indigo-500 animate-pulse' : 'bg-neutral-600'}`}></span>
              <span className="text-neutral-400">STATUS: {isPlaying ? 'LOCKING' : 'IDLE'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-yellow-500" />
              <span className="text-neutral-400">POINTS: {currentFeatures.length}</span>
            </div>
          </div>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-600/20">
            <Download className="w-4 h-4 inline mr-2" /> Export CSV
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-white/5 bg-neutral-900/20 flex flex-col overflow-y-auto">
          <div className="p-6 space-y-8">
            <section>
              <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Video className="w-3 h-3" /> Input Source
              </h2>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-neutral-800 rounded-xl cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                <Upload className="w-8 h-8 text-neutral-600 group-hover:text-indigo-400 mb-2" />
                <p className="text-xs text-neutral-400 font-medium">Load 4K Source</p>
                <input type="file" className="hidden" accept="video/*" onChange={handleFileUpload} />
              </label>
            </section>

            <section className="space-y-6">
              <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <Settings className="w-3 h-3" /> Tracker Config
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <span className="text-neutral-400">Point Sensitivity</span>
                    <span className="mono text-indigo-400">{params.sensitivity}</span>
                  </div>
                  <input type="range" min="10" max="100" value={params.sensitivity} onChange={e => setParams({...params, sensitivity: parseInt(e.target.value)})} className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-medium">
                    <span className="text-neutral-400">ID Persistence</span>
                    <span className="mono text-indigo-400">{params.persistence}f</span>
                  </div>
                  <input type="range" min="1" max="60" value={params.persistence} onChange={e => setParams({...params, persistence: parseInt(e.target.value)})} className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer" />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                <Layers className="w-3 h-3" /> Visualization
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setShowFeatures(!showFeatures)} className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-all ${showFeatures ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-neutral-800/30 border-neutral-800 text-neutral-500'}`}>
                  FEATURES
                </button>
                <button onClick={() => setParams({...params, showTrajectories: !params.showTrajectories})} className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-all ${params.showTrajectories ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-400' : 'bg-neutral-800/30 border-neutral-800 text-neutral-500'}`}>
                  TRAILS
                </button>
              </div>
            </section>

            <button onClick={generateAIReport} className="w-full py-3 bg-neutral-200 hover:bg-white text-black rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" /> Structural Audit
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-neutral-950 p-6 gap-6 relative overflow-hidden">
          <div className="flex-1 bg-black rounded-3xl border border-white/5 overflow-hidden relative shadow-2xl">
            <video ref={videoRef} src={videoUrl} className="hidden" muted loop />
            <canvas ref={canvasRef} className="w-full h-full object-contain" width={1920} height={1080} />
            
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 1920 1080">
                {/* Feature Points & Velocity Vectors */}
                {showFeatures && currentFeatures.map((f) => (
                  <g key={f.id} transform={`translate(${f.x * (1920/ANALYSIS_WIDTH)}, ${f.y * (1080/ANALYSIS_HEIGHT)})`}>
                    <circle r="1.5" fill={f.age > 5 ? "#818cf8" : "#fcd34d"} />
                    <line x1="0" y1="0" x2={f.vx * 20} y2={f.vy * 20} stroke="#4f46e5" strokeWidth="1" opacity="0.6" />
                  </g>
                ))}

                {/* Object Clusters */}
                {trajectories.map((traj) => (
                  <g key={traj.id} opacity={traj.active ? 1 : 0.4}>
                    {params.showTrajectories && traj.points.length > 1 && (
                      <polyline points={traj.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={traj.color} strokeWidth="3" opacity="0.6" />
                    )}
                    {traj.active && (
                      <>
                        <rect x={traj.points[traj.points.length - 1].x - 40} y={traj.points[traj.points.length - 1].y - 40} width="80" height="80" fill="none" stroke={traj.color} strokeWidth="2" strokeDasharray="5 5" />
                        <text x={traj.points[traj.points.length - 1].x - 40} y={traj.points[traj.points.length - 1].y - 50} fill={traj.color} fontSize="16" className="mono font-bold">LOCK_{traj.id}</text>
                      </>
                    )}
                  </g>
                ))}
              </svg>
            </div>
            
            {/* Status Badges */}
            <div className="absolute bottom-6 left-6 flex gap-3">
              <div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-[10px] font-bold text-white uppercase flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Tracking {currentFeatures.length} Geometric Anchors
              </div>
            </div>
          </div>

          {report && (
            <div className="absolute bottom-32 left-12 right-12 p-6 bg-indigo-950/80 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl animate-in slide-in-from-bottom-4 shadow-2xl">
              <h3 className="text-xs font-black text-indigo-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Shield className="w-3 h-3" /> Forensic Geometry Audit
              </h3>
              <p className="text-[11px] leading-relaxed text-indigo-100 font-medium italic">"{report}"</p>
            </div>
          )}

          <div className="flex items-center gap-6 px-8 py-5 bg-neutral-900/90 border border-white/5 rounded-2xl backdrop-blur-lg">
            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-600/30">
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
              </button>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em] mb-2">
                <span>Buffer Progress</span>
                <span className="mono text-neutral-300">{(videoRef.current?.currentTime || 0).toFixed(3)}s</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${((videoRef.current?.currentTime || 0) / (videoRef.current?.duration || 1)) * 100}%` }} />
              </div>
            </div>
            <div className="w-48 hidden xl:block">
              <TrackingChart data={timeSeries} />
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-2 bg-black border-t border-white/5 flex items-center justify-between text-[9px] font-bold text-neutral-700 uppercase tracking-[0.5em]">
        <p>VisionFlow Forensic Engine v4.0.2</p>
        <p>Authorized Personnel Only - Structural Analysis Mode</p>
      </footer>
    </div>
  );
};

export default App;
