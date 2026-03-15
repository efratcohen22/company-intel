require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static('public'));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let cachedDB  = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

const ALLOWED_TAGS = ["3D","Accessibility","Adtech","Agriculture","Automations","AI","AIOPS","API","AR VR","Automotive","Beauty","BI","Big Data","Biotech","Blockchain","Capital Market","Casino","Cloud","Comparison","Construction","Content","Cyber","CRM","Crypto","Delivery (Logistics)","Devops","Drones","Ecology","Ecommerce","Editor","Education","E-Learning","Emergency","ERP","Event-Tech","Exhibition","Fashion","FemTech","Fintech","Finops","Foodtech","Forex","Gambling","Gaming","Goverment","HR tech","Healthcare","Identity","Insuretech","Investments","IOT","IT","Kubernetes","Legaltech","Lifestyle","LLM","Marketing","Marketplace","Market Research","Medical","Mental Health","ML","Mobility","Multidisciplinary","Music","Network","NFT","Observability","PaaS","Payments","Pharma","PLG","Politics","Property","Retail","Robotics","SaaS","Sales","Security","Social","Solar energy","Sport","Telecomunications","Transportation","Travel","Troubleshooting","TV","Video","WEB3","8200","81","9900","Talpiot","AppSec","Operations","Voice","Manufacturing","Sound / Audio","Gen AI"];

const ROLES = ["Account Manager","Accountant","Animator","Art Director","BizDev","Bookeeper","Brand Design Team Lead","Brand Designer","Brand Manager","CDO","CEO","Cloud Sales Engineer","CMO","Community Manager","Community Manger","Content Writer","Copywriter","Creative Director","Creative Manager","Curator","Customer Success Manager","Data Analyst","Data Product Manager","Demand Generation","Design Director","Design OPS","Design System Expert","Digital Manager","Director of Product","Product Design - Director","Drafter","Event Manager","Exhibition Designer","Finance Manager","Fullstack Designer","Graphic Designer","Growth Senior Product Manager","Head of Design","Head of Growth","Head of Product","Product Design - Head of","Head of UX","HR","Product Design - IC","Illustrator","Industrial Designer","Interior Designer","Lawyer","Product Design - Lead","Licensed Architect","Marketing Designer","Marketing Design Manager","Marketing Director","Marketing Manager","Motion Designer","Not Licensed Architect","Office Manager","Operation Manager","Packaging Designer","Performance Marketing Designer","PPC manager","Product Design - Principal","Principal Product Manager","Producer","Product Design - Team Lead","Product Design","Product Management Lead","Product Manager","Product Manager & Designer","Product Marketing","Product Marketing Lead","Project Manager","R&D","SDR","Senior Account Manager","Senior Accountant","Product Design - Senior","Senior Product Manager","SEO","Social Media Manager","Solutions Architect","Studio Manager","Talent Acquisition Specialist","Technical Content Writer","Product Design - Technical","Technical Product Manager","UI Designer","UI Team Lead","UX Architect","UX Designer","UX Researcher","UX UI Designer","UX Writer","Video Editor","Visual Designer","VP Design","VP Marketing","VP Product","Web Designer","User Acquisition Team Lead","Head of User Acquisition","Marketing Specialist","Marketing Operations","VP Product & Design","Product Design - AI","AI Product Manager","Growth Marketing Manager","Information specialist","Senior Motion Designer","Senior Marketing Designer","Personal Assistant","Fashion Designer","Game Designer"];

// ── Basic Auth ──
const AUTH_USER = process.env.AUTH_USER || 'recruitment';
const AUTH_PASS = process.env.AUTH_PASS || 'intel2024';

app.use((req, res, next) => {
  if (req.path === '/api/health') return next(); // skip health check
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Recruitment Intel"');
    return res.status(401).send('Authentication required');
  }
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (user === AUTH_USER && pass === AUTH_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Recruitment Intel"');
  return res.status(401).send('Invalid credentials');
});


function parseCSV(text) {
  return text.split('\n').map(line => {
    const cells = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  });
}

// ── Load Google Sheets DB ──
async function loadDB() {
  if (cachedDB && Date.now() - cacheTime < CACHE_TTL) return cachedDB;
  const url = process.env.GOOGLE_SHEETS_URL;
  if (!url || url.includes('YOUR_SHEET_ID')) throw new Error('GOOGLE_SHEETS_URL not configured in .env');

  const res  = await fetch(url);
  const text = await res.text();
  const lines = parseCSV(text);

  const HEADER_ROW = 2, DATA_START = 3;
  const headerRow  = lines[HEADER_ROW] || [];
  const skipTags   = new Set(['','#IsE, Trnd','FndY, AE/IE Tr GrR','AE IsE Tr Gr exTr','AE IsE Tr Gr','TE IsE Tr Grw','Fnd TE IsE Tr Grw','#IE,Gr','Fnd  AE IsE Tr Gr',"מס' עובדים"]);

  const colToIndustry = {}, db = {};
  headerRow.forEach((tag, i) => {
    if (tag && !skipTags.has(tag) && !tag.startsWith('#') && !tag.startsWith('Fnd')) {
      colToIndustry[i] = tag; db[tag] = [];
    }
  });

  for (let r = DATA_START; r < lines.length; r++) {
    const row = lines[r];
    for (const [col, industry] of Object.entries(colToIndustry)) {
      const company = (row[col] || '').trim();
      if (company && company.length > 1 && !/^[\d\s↗↘➡%]+$/.test(company)) db[industry].push(company);
    }
  }

  for (const k of Object.keys(db)) { db[k] = [...new Set(db[k])]; if (!db[k].length) delete db[k]; }
  cachedDB = db; cacheTime = Date.now();
  console.log(`DB loaded: ${Object.keys(db).length} industries`);
  return db;
}

// ── Find company in DB ──
function findInDB(db, companyName) {
  const name = companyName.toLowerCase().trim();
  const scores = {};
  for (const [industry, companies] of Object.entries(db)) {
    for (const c of companies) {
      const cn = c.toLowerCase().trim();
      if (cn === name || cn.includes(name) || name.includes(cn))
        scores[industry] = (scores[industry] || 0) + (cn === name ? 5 : 1);
    }
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
}

// ── Map DB tags to ALLOWED_TAGS ──
function mapToAllowed(tags) {
  return tags.map(tag => {
    const exact = ALLOWED_TAGS.find(t => t.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    return ALLOWED_TAGS.find(t => t.toLowerCase().includes(tag.toLowerCase()) || tag.toLowerCase().includes(t.toLowerCase())) || null;
  }).filter(Boolean);
}

// ── Company analysis ──
app.post('/api/analyze', async (req, res) => {
  const { company } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });
  try {
    const db           = await loadDB();
    const dbIndustries = findInDB(db, company);
    const dbStrong     = dbIndustries.length >= 2;
    const mappedDB     = mapToAllowed(dbIndustries);

    const industryInstruction = dbStrong && mappedDB.length >= 2
      ? `IMPORTANT: Database found these tags for "${company}": [${mappedDB.join(', ')}]. Use as base. Return ONLY tags from: ${ALLOWED_TAGS.join(', ')}`
      : `No DB match. Pick up to 5 tags from ONLY this list: ${ALLOWED_TAGS.join(', ')}`;

    const prompt = `Company intelligence analyst. Analyze: "${company}"
${industryInstruction}
Also determine:
- business_models: all that apply [b2b, b2c, b2b2c, b2g, b2d, d2c]
- platforms: all that apply [web, app, complex]
- role: best match from: ${ROLES.join(', ')}
- description: one sentence about what this company does
Return ONLY valid JSON: {"industries":[...],"business_models":[...],"platforms":[...],"role":"...","description":"..."}`;

    const message = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] });
    const result  = JSON.parse(message.content[0].text.trim().replace(/```json|```/g, '').trim());
    res.json({ ...result, source: dbStrong ? 'database' : 'ai' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── CV analysis ──
app.post('/api/cv', async (req, res) => {
  const { cv } = req.body;
  if (!cv) return res.status(400).json({ error: 'CV text required' });
  try {
    const db = await loadDB();

    // STEP 1: Extract companies + meta from CV
    const extractPrompt = `Extract structured data from this CV. Return ONLY valid JSON, no markdown.

CV:
"""
${cv}
"""

Return:
{
  "companies": [...],
  "current_company": "...",
  "current_title": "...",
  "employment_type": "...",
  "has_technical_background": true/false,
  "ai_tools": [...],
  "data_tools": [...]
}

Rules:
- companies: all company names, most recent first
- current_title: exact title as written in CV
- employment_type: "Full-time", "Part-time", or "" — from most recent job only
- has_technical_background: true ONLY if person held roles like Developer, Engineer, R&D, Backend, Frontend, Full-stack, DevOps, Programmer, QA, Data Scientist, ML Engineer. NOT for designers, PMs, or marketers at tech companies.
- ai_tools: ONLY tools explicitly named (Claude, ChatGPT, Gemini, Midjourney, Copilot, Cursor, DALL-E, Stable Diffusion, Perplexity, Notion AI, etc.) — empty array if none mentioned
- data_tools: ONLY tools explicitly named from: Amplitude, Appcues, Ballpark, Clarity, Confluence, Crowdsourced testing, Data Dog, Dovetail, FigJam, FullStory, Glassbox, Gong, Google Analytics, Heap, HOTJAR, Log Rocket, Maze, Miro, MixPanel, Notably, Otter, Pendo, Posthog, Power BI, Smartlook, SQL, Tableau, UsabilityHub, Uservoice, Usertesting.com, Walkme — return ["None"] if none mentioned`;

    const extractMsg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: extractPrompt }] });
    const extracted  = JSON.parse(extractMsg.content[0].text.trim().replace(/```json|```/g, '').trim());

    const companies   = extracted.companies || [];
    const tagScores   = {};
    const notInDB     = [];
    const dbTagsPerCo = {};

    // STEP 2: Check DB for each company
    for (const company of companies) {
      const dbTags = mapToAllowed(findInDB(db, company));
      if (dbTags.length >= 1) {
        dbTagsPerCo[company] = dbTags;
        dbTags.forEach(t => { tagScores[t] = (tagScores[t] || 0) + 2; });
      } else {
        notInDB.push(company);
      }
    }

    // STEP 3: AI for companies not in DB
    let aiTagsPerCo = {};
    if (notInDB.length > 0) {
      const aiPrompt = `For each company below, return their industry tags from this allowed list ONLY: ${ALLOWED_TAGS.join(', ')}
Companies: ${notInDB.join(', ')}
Return ONLY valid JSON: { "CompanyName": ["tag1","tag2",...], ... }
Up to 5 tags per company.`;
      const aiMsg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: aiPrompt }] });
      try { aiTagsPerCo = JSON.parse(aiMsg.content[0].text.trim().replace(/```json|```/g, '').trim()); }
      catch(e) { aiTagsPerCo = {}; }
      for (const [, tags] of Object.entries(aiTagsPerCo)) {
        (tags || []).forEach(t => {
          const valid = ALLOWED_TAGS.find(a => a.toLowerCase() === t.toLowerCase());
          if (valid) tagScores[valid] = (tagScores[valid] || 0) + 1;
        });
      }
    }

    // STEP 4: Build company_tags (up to 5 per company)
    const company_tags = {};
    for (const company of companies) {
      const dbTags = mapToAllowed(findInDB(db, company));
      if (dbTags.length >= 1) {
        company_tags[company] = dbTags.slice(0, 5);
      } else {
        const aiEntry = Object.entries(aiTagsPerCo).find(([k]) => k.toLowerCase() === company.toLowerCase());
        if (aiEntry) {
          company_tags[company] = (aiEntry[1] || []).map(t => ALLOWED_TAGS.find(a => a.toLowerCase() === t.toLowerCase())).filter(Boolean).slice(0, 5);
        } else {
          company_tags[company] = [];
        }
      }
      (company_tags[company] || []).forEach(t => { tagScores[t] = (tagScores[t] || 0) + 1; });
    }

    const top10Tags = Object.entries(tagScores).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);

    // STEP 5: Roles + business models + platforms
    const rolesPrompt = `Based on this person's most recent role: "${extracted.current_title}" at "${extracted.current_company}".
${extracted.has_technical_background ? 'This person has a technical background (engineering/dev/R&D).' : ''}

1. roles: Up to 3 from this list ONLY: ${ROLES.join(', ')}
   - Add "Technical " prefix ONLY if person has engineering/dev/R&D background
   - Based on most recent job only

2. business_models: Union across all companies: ${companies.join(', ')}
   From: [b2b, b2c, b2b2c, b2g, b2d, d2c]

3. platforms: Union across all companies: ${companies.join(', ')}
   From: [web, app, complex]

Return ONLY valid JSON: {"roles":[...],"business_models":[...],"platforms":[...]}`;

    const rolesMsg  = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: rolesPrompt }] });
    const rolesData = JSON.parse(rolesMsg.content[0].text.trim().replace(/```json|```/g, '').trim());

    res.json({
      current_company: extracted.current_company || '',
      current_title:   extracted.current_title || '',
      employment_type: extracted.employment_type || '',
      companies,
      company_tags,
      ai_tools:        extracted.ai_tools || [],
      data_tools:      extracted.data_tools || ['None'],
      tags:            top10Tags,
      roles:           rolesData.roles || [],
      business_models: rolesData.business_models || [],
      platforms:       rolesData.platforms || [],
    });

  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));