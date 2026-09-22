import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

type Player={id:string;name:string;score:number;correct:boolean;firsts:number;totalGuessMs:number;correctCount:number};
type Stroke={color:string;width:number;points:{x:number;y:number}[]};
type Guess={id:string;playerId:string;playerName:string;text:string;correct:boolean;at:number};
type Room={code:string;hostId:string;phase:"lobby"|"choosing"|"drawing"|"round-end"|"finished";players:Player[];artistIndex:number;round:number;totalRounds:number;choices:string[];secret:string;strokes:Stroke[];guesses:Guess[];roundStartedAt:number;roundEndsAt:number;roundMessage?:string;winnerIds?:string[]};

const WORDS=["pizza","rocket","penguin","bicycle","rainbow","guitar","castle","popcorn","octopus","camera","volcano","toothbrush","butterfly","snowman","hamburger","dinosaur","lighthouse","helicopter","watermelon","skateboard","robot","mermaid","campfire","umbrella","elephant","sunglasses","cupcake","treasure","tornado","backpack","jellyfish","cactus","spaceship","dragon","pineapple","microscope"];
const clean=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9]/g,"");
const makeCode=()=>Array.from({length:4},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random()*24)]).join("");
const makeChoices=()=>[...WORDS].sort(()=>Math.random()-.5).slice(0,3);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || "",
});
const key=(code:string)=>`sketch-rush:${code}`;
async function readRoom(code:string):Promise<Room|null>{return await redis.get<Room>(key(code))}
async function save(room:Room){await redis.set(key(room.code),room,{ex:86400})}
function publicRoom(room:Room,playerId:string){const copy=structuredClone(room);if(copy.phase==="choosing"&&copy.players[copy.artistIndex]?.id!==playerId)copy.choices=[];if(copy.phase==="drawing"&&copy.players[copy.artistIndex]?.id!==playerId)copy.secret=copy.secret.split("").map(x=>x===" "?" ":"_").join(" ");return copy}
function resetRound(room:Room){room.players.forEach(p=>p.correct=false);room.artistIndex=room.round%room.players.length;room.phase="choosing";room.choices=makeChoices();room.secret="";room.strokes=[];room.guesses=[];room.roundStartedAt=0;room.roundEndsAt=0;room.roundMessage=undefined}
function endRound(room:Room){if(room.phase!=="drawing")return;room.phase="round-end";room.roundMessage=`The word was “${room.secret}”`}
function nextRound(room:Room){room.round++;if(room.round>=room.totalRounds){room.phase="finished";const max=Math.max(...room.players.map(p=>p.score));let winners=room.players.filter(p=>p.score===max);if(winners.length>1){const f=Math.max(...winners.map(p=>p.firsts));winners=winners.filter(p=>p.firsts===f)}if(winners.length>1){const best=Math.min(...winners.map(p=>p.correctCount?p.totalGuessMs/p.correctCount:Infinity));winners=winners.filter(p=>(p.correctCount?p.totalGuessMs/p.correctCount:Infinity)===best)}room.winnerIds=winners.map(p=>p.id)}else resetRound(room)}

export async function GET(req:NextRequest){try{const code=(req.nextUrl.searchParams.get("code")||"").toUpperCase();const playerId=req.nextUrl.searchParams.get("playerId")||"";const room=await readRoom(code);if(!room)return NextResponse.json({error:"Room not found"},{status:404});if(room.phase==="drawing"&&Date.now()>=room.roundEndsAt){endRound(room);await save(room)}return NextResponse.json(publicRoom(room,playerId),{headers:{"Cache-Control":"no-store"}})}catch(e){console.error(e);return NextResponse.json({error:"Game service is unavailable"},{status:500})}}

export async function POST(req:NextRequest){try{const body=await req.json() as Record<string,unknown>;const action=String(body.action||"");const playerId=String(body.playerId||"");if(!playerId)return NextResponse.json({error:"Player session missing"},{status:400});
  if(action==="create"){let code=makeCode();while(await readRoom(code))code=makeCode();const player:Player={id:playerId,name:String(body.name).slice(0,18),score:0,correct:false,firsts:0,totalGuessMs:0,correctCount:0};const room:Room={code,hostId:playerId,phase:"lobby",players:[player],artistIndex:0,round:0,totalRounds:0,choices:[],secret:"",strokes:[],guesses:[],roundStartedAt:0,roundEndsAt:0};await save(room);return NextResponse.json(publicRoom(room,playerId))}
  const code=String(body.code||"").toUpperCase();const room=await readRoom(code);if(!room)return NextResponse.json({error:"Room not found. Check the code."},{status:404});
  if(action==="join"){if(room.phase!=="lobby")return NextResponse.json({error:"That game has already started"},{status:409});if(room.players.length>=8)return NextResponse.json({error:"That room is full"},{status:409});if(!room.players.some(p=>p.id===playerId))room.players.push({id:playerId,name:String(body.name).slice(0,18),score:0,correct:false,firsts:0,totalGuessMs:0,correctCount:0});await save(room);return NextResponse.json(publicRoom(room,playerId))}
  const me=room.players.find(p=>p.id===playerId);if(!me)return NextResponse.json({error:"You are not in this room"},{status:403});const host=room.hostId===playerId;const artist=room.players[room.artistIndex]?.id===playerId;
  if(action==="start"){if(!host||room.phase!=="lobby"||room.players.length<2)throw new Error("Cannot start");room.totalRounds=room.players.length*(room.players.length<=3?2:1);room.round=0;resetRound(room)}
  else if(action==="choose"){const word=String(body.word);if(!artist||room.phase!=="choosing"||!room.choices.includes(word))throw new Error("Invalid word");room.secret=word;room.phase="drawing";room.roundStartedAt=Date.now();room.roundEndsAt=room.roundStartedAt+60000}
  else if(action==="draw"){if(artist&&room.phase==="drawing"){const strokes=body.strokes as Stroke[];room.strokes=strokes.slice(-120).map(x=>({...x,points:x.points.slice(-700)}))}}
  else if(action==="guess"){if(!artist&&room.phase==="drawing"&&!me.correct){const text=String(body.guess||"").slice(0,40);const correct=clean(text)===clean(room.secret);room.guesses.push({id:crypto.randomUUID(),playerId,playerName:me.name,text,correct,at:Date.now()});if(correct){const elapsed=Date.now()-room.roundStartedAt;const correctBefore=room.players.filter(p=>p.correct).length;me.correct=true;me.correctCount++;me.totalGuessMs+=elapsed;me.score+=Math.max(300,Math.round(1000-(elapsed/60000)*700));if(correctBefore===0)me.firsts++;room.players[room.artistIndex].score+=room.players.length===2?500:200;const guessers=room.players.filter(p=>p.id!==room.players[room.artistIndex].id);if(guessers.every(p=>p.correct))endRound(room)}}}
  else if(action==="tick"){if(room.phase==="drawing"&&Date.now()>=room.roundEndsAt)endRound(room)}
  else if(action==="next"){if(!host||room.phase!=="round-end")throw new Error("Only the host can continue");nextRound(room)}
  else if(action==="restart"){if(!host||room.phase!=="finished")throw new Error("Only the host can restart");room.players.forEach(p=>{p.score=0;p.correct=false;p.firsts=0;p.totalGuessMs=0;p.correctCount=0});room.round=0;room.totalRounds=room.players.length*(room.players.length<=3?2:1);resetRound(room)}
  await save(room);return NextResponse.json(publicRoom(room,playerId));
}catch(e){console.error(e);return NextResponse.json({error:e instanceof Error&&["Cannot start","Invalid word","Only the host can continue","Only the host can restart"].includes(e.message)?e.message:"Could not update the game"},{status:400})}}
