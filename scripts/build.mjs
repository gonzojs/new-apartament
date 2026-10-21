import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("public", { recursive: true });
await copyFile("index.html", "public/index.html");
await cp("web", "public/web", { recursive: true });
console.log("Built public/index.html + web modules");
