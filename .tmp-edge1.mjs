import { chromium } from "@playwright/test";
const BASE="http://localhost:3000";
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1280,height:800}});
ctx.setDefaultTimeout(20000);
await ctx.addInitScript(()=>{const s=document.createElement("style");s.textContent="nextjs-portal{display:none !important}";if(document.head)document.head.append(s);document.addEventListener("DOMContentLoaded",()=>document.head.append(s));});
const p=await ctx.newPage();
const pageErrors=[];p.on("pageerror",e=>pageErrors.push(String(e).slice(0,140)));
await p.goto(BASE+"/signin",{waitUntil:"domcontentloaded"});await p.waitForTimeout(1500);
await p.getByRole("button",{name:/^Sign in$/}).click();
await p.waitForURL(/\/homes/,{timeout:40000});await p.waitForTimeout(1500);
await p.getByRole("button",{name:/^Enter Anna Nagar/}).click();
await p.waitForURL(/\/home$/,{timeout:30000});await p.waitForTimeout(1500);

const BAD=[
 "/chores?week_start=not-a-date",
 "/chores?week_start=2026-13-45",
 "/chores?week_start=<script>alert(1)</script>",
 "/expenses?period=nonsense",
 "/expenses?period=9999-99",
 "/expenses?category=00000000-0000-0000-0000-000000000000",
 "/expenses?member=not-a-uuid",
 "/expenses?from=2026-01-01&to=2020-01-01",
 "/expenses?add=yes",
 "/house/rooms?add=0",
 "/today?add=nope",
 "/more/approvals/00000000-0000-0000-0000-000000000000",
 "/more/approvals/not-a-uuid",
 "/more/rules/00000000-0000-0000-0000-000000000000/edit",
 "/more/rules/not-a-uuid/history",
 "/insights?range=999M",
 "/insights?tab=nonsense",
 "/more/calendar?view=nope",
 "/more/calendar?month=2026-99",
 "/join/tooshort",
 "/join/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "/offline",
];
for(const u of BAD){
  const before=pageErrors.length;
  let status="?",text="";
  try{
    const r=await p.goto(BASE+u,{waitUntil:"domcontentloaded",timeout:30000});
    status=r?.status();
    await p.waitForTimeout(1200);
    text=(await p.locator("body").innerText()).replace(/\s+/g," ").slice(0,80);
  }catch(e){status="ERR";text=String(e).slice(0,70)}
  const crashed=/Something went wrong|Application error|Unhandled/i.test(text);
  console.log(String(status).padEnd(4), (crashed?"CRASH ":"      "), u.padEnd(52), "|", text);
  if(pageErrors.length>before) console.log("      pageerror:",pageErrors.slice(before).join(" ; "));
}
await b.close();
