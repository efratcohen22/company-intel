require('dotenv').config();
const fetch = (...a) => import('node-fetch').then(({default:f})=>f(...a));

function parseCSV(text) {
  return text.split('\n').map(line => {
    const cells = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim()); cur = '';
      } else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  });
}

async function test() {
  const res = await fetch(process.env.GOOGLE_SHEETS_URL);
  const text = await res.text();
  const lines = parseCSV(text);
  const headers = lines[2];
  const found = [];
  for (let i = 3; i < lines.length; i++) {
    for (let j = 0; j < lines[i].length; j++) {
      if (lines[i][j].toLowerCase() === 'wix') {
        found.push(headers[j]);
      }
    }
  }
  console.log('WIX industries:', found);
}

test();