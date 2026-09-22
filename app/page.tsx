"use client";

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { Brush, Crown, Eraser, LogIn, Play, RotateCcw, Send, Sparkles, Trophy, Users } from "lucide-react";
import { toast, Toaster } from "sonner";

function Button({ className = "", variant: _variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return <button className={`button ${className}`} {...props} />;
}

function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

function Progress({ value = 0 }: { value?: number }) {
  return <div data-slot="progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };
type Player = { id: string; name: string; score: number; correct: boolean; firsts: number; totalGuessMs: number; correctCount: number };
type Guess = { id: string; playerId: string; playerName: string; text: string; correct: boolean; at: number };
type Room = {
  code: string; hostId: string; phase: "lobby" | "choosing" | "drawing" | "round-end" | "finished";
  players: Player[]; artistIndex: number; round: number; totalRounds: number; choices?: string[]; secret?: string;
  strokes: Stroke[]; guesses: Guess[]; roundStartedAt: number; roundEndsAt: number; roundMessage?: string; winnerIds?: string[];
};

const palette = ["#191724", "#6C4CFF", "#FF4D8D", "#16A085", "#FF9F1C", "#FFFFFF"];

async function api(payload: Record<string, unknown>) {
  const response = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data as Room;
}

function Canvas({ strokes, canDraw, onChange }: { strokes: Stroke[]; canDraw: boolean; onChange: (s: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(palette[0]);
  const [width, setWidth] = useState(7);
  const drawing = useRef(false);
  const local = useRef<Stroke[]>(strokes);
  const redraw = useCallback((all: Stroke[]) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    all.forEach(s => { if (!s.points.length) return; ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y); s.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); });
  }, []);
  useEffect(() => { if (!drawing.current) { local.current = strokes; redraw(strokes); } }, [strokes, redraw]);
  useEffect(() => {
    const resize = () => { const c = canvasRef.current; if (!c) return; const rect = c.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; c.width = rect.width * ratio; c.height = rect.height * ratio; const ctx = c.getContext("2d"); ctx?.scale(ratio, ratio); redraw(local.current); };
    resize(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize);
  }, [redraw]);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!canDraw) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; local.current = [...local.current, { color, width, points: [point(e)] }]; redraw(local.current); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current || !canDraw) return; const last = local.current[local.current.length - 1]; last.points.push(point(e)); redraw(local.current); };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange([...local.current]); };
  return <div className="canvas-wrap">
    <canvas ref={canvasRef} aria-label={canDraw ? "Drawing canvas" : "Live drawing"} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
    {canDraw && <div className="tools" aria-label="Drawing tools">
      <div className="colors">{palette.map(c => <button key={c} aria-label={`Use ${c}`} className={color === c ? "selected" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
      <button className={width === 7 ? "tool active" : "tool"} onClick={() => setWidth(7)}><Brush size={18} /> Thin</button>
      <button className={width === 18 ? "tool active" : "tool"} onClick={() => setWidth(18)}><Brush size={21} /> Thick</button>
      <button className="tool" onClick={() => setColor("#FFFFFF")}><Eraser size={20} /> Erase</button>
      <button className="tool" onClick={() => { local.current = []; redraw([]); onChange([]); }}><RotateCcw size={18} /> Clear</button>
    </div>}
  </div>;
}

export default function Home() {
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [name, setName] = useState(""); const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null); const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false); const [now, setNow] = useState(Date.now());
  const playerId = useRef("");

  useEffect(() => { playerId.current = sessionStorage.getItem("sketch-player") || `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; sessionStorage.setItem("sketch-player", playerId.current); }, []);
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: "create_sketch_rush_room", title: "Create Sketch Rush room", description: "Create a new private Sketch Rush game room for the named player.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 18 } }, required: ["name"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { name?: string }; if (!value.name?.trim()) throw new Error("A player name is required"); const next = await api({ action: "create", name: value.name.trim(), playerId: playerId.current }); setName(value.name.trim()); setRoom(next); setScreen("game"); return { roomCode: next.code, status: "lobby" }; } });
    register({ name: "join_sketch_rush_room", title: "Join Sketch Rush room", description: "Join an existing Sketch Rush room with a four-letter code.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 18 }, code: { type: "string", pattern: "^[A-Za-z]{4}$" } }, required: ["name", "code"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { name?: string; code?: string }; if (!value.name?.trim() || !value.code?.match(/^[A-Za-z]{4}$/)) throw new Error("A name and four-letter room code are required"); const next = await api({ action: "join", name: value.name.trim(), code: value.code.toUpperCase(), playerId: playerId.current }); setName(value.name.trim()); setRoom(next); setScreen("game"); return { roomCode: next.code, status: next.phase }; } });
    return () => lifecycle.abort();
  }, []);
  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => { try { const next = await api({ action, code: room?.code, playerId: playerId.current, ...extra }); setRoom(next); return next; } catch (e) { toast.error(e instanceof Error ? e.message : "Try again"); } }, [room?.code]);

  useEffect(() => { if (!room?.code) return; const timer = setInterval(async () => { try { const r = await fetch(`/api/room?code=${room.code}&playerId=${playerId.current}`, { cache: "no-store" }); if (r.ok) setRoom(await r.json()); } catch {} }, 700); return () => clearInterval(timer); }, [room?.code]);
  useEffect(() => { const t = setInterval(() => { setNow(Date.now()); if (room?.phase === "drawing" && Date.now() >= room.roundEndsAt) void act("tick"); }, 500); return () => clearInterval(t); }, [room?.phase, room?.roundEndsAt, act]);

  const enter = async (mode: "create" | "join") => { if (!name.trim()) return toast.error("Add your name first"); setBusy(true); try { const next = await api({ action: mode, name: name.trim(), code: joinCode.trim().toUpperCase(), playerId: playerId.current }); setRoom(next); setScreen("game"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not enter room"); } finally { setBusy(false); } };
  const me = room?.players.find(p => p.id === playerId.current); const artist = room?.players[room.artistIndex];
  const isHost = room?.hostId === playerId.current; const isArtist = artist?.id === playerId.current;
  const secs = room?.phase === "drawing" ? Math.max(0, Math.ceil((room.roundEndsAt - now) / 1000)) : 60;
  const submitGuess = async (e: React.FormEvent) => { e.preventDefault(); if (!guess.trim()) return; const text = guess; setGuess(""); await act("guess", { guess: text }); };

  if (screen === "home") return <main className="home-shell"><Toaster position="top-center" richColors />
    <section className="home-card">
      <div className="brand"><span className="logo-mark"><Brush size={25} /></span><span>Sketch Rush</span></div>
      <div className="doodle doodle-one">✦</div><div className="doodle doodle-two">〰</div>
      <div className="intro"><span className="eyebrow"><Sparkles size={16} /> Draw fast. Guess faster.</span><h1>Bad drawings.<br/><em>Great parties.</em></h1><p>Grab 2–8 friends and turn questionable sketches into unforgettable guesses.</p></div>
      <div className="entry-panel">
        <label>Your name</label><Input maxLength={18} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Doodle Dan" />
        <Button className="create-btn" disabled={busy} onClick={() => enter("create")}><Play fill="currentColor" size={18} /> Create a room</Button>
        <div className="or"><span />or join friends<span /></div>
        <div className="join-row"><Input aria-label="Room code" maxLength={4} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="ROOM CODE" /><Button variant="outline" disabled={busy || joinCode.length !== 4} onClick={() => enter("join")}><LogIn size={18} /> Join</Button></div>
      </div>
      <div className="quick-rules"><span><b>1</b> Join</span><i>→</i><span><b>2</b> Draw</span><i>→</i><span><b>3</b> Guess</span><i>→</i><span><b>4</b> Win</span></div>
    </section>
  </main>;

  if (!room) return null;
  if (room.phase === "lobby") return <main className="lobby-shell"><Toaster position="top-center" richColors /><header className="game-header"><div className="brand"><span className="logo-mark"><Brush size={22}/></span>Sketch Rush</div><div className="room-pill">Room <b>{room.code}</b><button onClick={() => { navigator.clipboard.writeText(room.code); toast.success("Room code copied!"); }}>Copy</button></div></header>
    <section className="lobby"><div className="lobby-title"><span className="eyebrow"><Users size={16}/> {room.players.length}/8 players</span><h1>Gather the doodlers</h1><p>Share room code <strong>{room.code}</strong>. The game begins when everyone is in.</p></div>
      <div className="player-grid">{room.players.map((p, i) => <div className="player-card" key={p.id}><span className={`avatar a${i % 6}`}>{p.name[0].toUpperCase()}</span><strong>{p.name}</strong>{p.id === room.hostId && <small><Crown size={14}/> Host</small>}{p.id === playerId.current && <span className="you">You</span>}</div>)}{Array.from({length: Math.max(0, 2-room.players.length)}).map((_,i)=><div className="player-card empty" key={i}><span className="avatar">?</span><span>Waiting…</span></div>)}</div>
      <div className="lobby-action">{isHost ? <Button className="create-btn" disabled={room.players.length < 2} onClick={() => act("start")}><Play fill="currentColor" size={18}/> Start game</Button> : <p>The host will start the game.</p>}<small>{room.players.length < 2 ? "At least 2 players are needed" : `${room.players.length <= 3 ? 2 : 1} drawing turns per player`}</small></div>
    </section>
  </main>;

  if (room.phase === "finished") return <main className="finish-shell"><Toaster position="top-center" richColors /><section className="finish-card"><span className="trophy"><Trophy size={48}/></span><span className="eyebrow">Final scores</span><h1>{room.winnerIds?.includes(playerId.current) ? "You won!" : `${room.players.find(p=>room.winnerIds?.includes(p.id))?.name} wins!`}</h1><p>Masterpieces were optional. Glory was not.</p><div className="final-list">{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><div key={p.id} className={i===0?"champ":""}><b>#{i+1}</b><span className={`avatar a${i%6}`}>{p.name[0]}</span><strong>{p.name}</strong><em>{p.score.toLocaleString()} pts</em></div>)}</div>{isHost?<Button className="create-btn" onClick={()=>act("restart")}><RotateCcw size={18}/> Play again</Button>:<p>Waiting for the host…</p>}</section></main>;

  return <main className="game-shell"><Toaster position="top-center" richColors />
    <header className="game-header"><div className="brand"><span className="logo-mark"><Brush size={22}/></span>Sketch Rush</div><div className="round-label">Round <b>{room.round + 1}</b> of {room.totalRounds}</div><div className={`timer ${secs <= 10 ? "danger" : ""}`}>{secs}<small>sec</small></div></header>
    <div className="game-grid"><aside className="scoreboard"><h2><Trophy size={19}/> Scoreboard</h2>{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><div className={`score-row ${p.id===artist?.id?"artist":""}`} key={p.id}><span className={`avatar a${i%6}`}>{p.name[0]}</span><div><strong>{p.name}{p.id===playerId.current?" (you)":""}</strong><small>{p.id===artist?.id?"Drawing now":p.correct?"Guessed it!":"Guessing…"}</small></div><b>{p.score}</b></div>)}</aside>
      <section className="play-area"><div className="prompt-bar">{room.phase === "choosing" ? <><strong>{isArtist ? "Choose a word" : `${artist?.name} is choosing a word…`}</strong>{isArtist && <div className="word-choices">{room.choices?.map(w=><Button key={w} onClick={()=>act("choose",{word:w})}>{w}</Button>)}</div>}</> : room.phase === "round-end" ? <><strong>{room.roundMessage}</strong>{isHost && <Button onClick={()=>act("next")}>Next round</Button>}</> : <><span>{isArtist ? "Your word" : `${artist?.name} is drawing`}</span><strong>{room.secret}</strong><Progress value={(secs/60)*100}/></>}</div>
        <Canvas strokes={room.strokes} canDraw={!!isArtist && room.phase === "drawing"} onChange={s=>void act("draw",{strokes:s})}/>
      </section>
      <aside className="guess-panel"><h2>Guesses</h2><div className="guess-feed">{room.guesses.length===0?<div className="guess-empty"><span>?</span><p>Guesses will appear here</p></div>:room.guesses.slice(-30).map(g=><div key={g.id} className={g.correct?"guess correct":"guess"}><strong>{g.playerName}</strong><span>{g.correct?"guessed it!":g.text}</span></div>)}</div>{!isArtist && room.phase==="drawing" && !me?.correct && <form onSubmit={submitGuess}><Input value={guess} onChange={e=>setGuess(e.target.value)} placeholder="Type your guess…" maxLength={40}/><Button type="submit" aria-label="Send guess"><Send size={18}/></Button></form>} {me?.correct && <div className="correct-note">✓ You got it!</div>}</aside>
    </div>
  </main>;
}
