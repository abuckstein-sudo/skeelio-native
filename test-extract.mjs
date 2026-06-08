import { readFileSync } from "node:fs";

const arg = process.argv[2];
if (!arg) { console.error("Usage: node test-extract.mjs <image>"); process.exit(1); }

const buf = readFileSync(arg);

let mimeType;
if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) mimeType = "image/jpeg";
else if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) mimeType = "image/png";
else if (buf.subarray(0,4).toString() === "RIFF" && buf.subarray(8,12).toString() === "WEBP") mimeType = "image/webp";
else if (buf.subarray(4,8).toString() === "ftyp") { console.error("HEIC/HEIF photo (iPhone default) — OpenAI needs JPG/PNG. Convert it first."); process.exit(1); }
else { console.error("Unrecognized image type. First bytes:", buf.subarray(0,12).toString("hex")); process.exit(1); }

const env = readFileSync(".env", "utf8");
const anonKey = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!anonKey) { console.error("EXPO_PUBLIC_SUPABASE_ANON_KEY not found in .env"); process.exit(1); }

const imageBase64 = buf.toString("base64");
console.log("Detected:", mimeType, "| size:", (buf.length/1024).toFixed(0), "KB");

const res = await fetch("https://aalqeqjlspxqhxohubfi.supabase.co/functions/v1/extract-method", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
  body: JSON.stringify({ imageBase64, mimeType }),
});

console.log("HTTP", res.status);
console.log(await res.text());
